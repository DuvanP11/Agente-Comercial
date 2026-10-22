import { lookup } from "node:dns/promises";
import { and, eq } from "drizzle-orm";
import { allPhonesValid, normalizeEmail, normalizePhone, splitPhones } from "../dedup/normalize";
import { safeWebUrl } from "../contact-links";
import type { Db } from "../db/client";
import { auditLog, evidence, prospects } from "../db/schema";
import { contactLinks, extractContacts, isBlockedHost, isPrivateIp, parseRobots, robotsAllows, type Found } from "../web-research";

export const AGENT = "PiboxCommercialBot";
const MAX_BYTES = 500_000, TIMEOUT_MS = 8000, MAX_PAGES = 4, MAX_REDIRECTS = 3;

export interface WebDeps { fetchImpl?: typeof fetch; resolve?: (host: string) => Promise<string[]> }
export interface WebFinding extends Found { sourceUrl: string }
export interface WebResult { pages: { url: string; ok: boolean; note?: string }[]; phones: WebFinding[]; emails: WebFinding[]; whatsapp: WebFinding[]; notes: string[] }

const defaultResolve = async (host: string) => (await lookup(host, { all: true })).map((r) => r.address);

/** Comprueba que el sitio sea público (no una IP interna, ni un nombre que resuelve a una). */
async function assertPublic(u: URL, resolve: NonNullable<WebDeps["resolve"]>) {
  if (!/^https?:$/.test(u.protocol) || isBlockedHost(u.hostname)) throw new Error("Dirección no permitida.");
  const ips = await resolve(u.hostname);
  if (!ips.length || ips.some(isPrivateIp)) throw new Error("La dirección apunta a una red interna: no se consulta.");
}

async function getText(url: URL, deps: Required<WebDeps>, origin: string): Promise<{ status: number; text: string; type: string }> {
  let cur = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublic(cur, deps.resolve);
    const res = await deps.fetchImpl(cur, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": `${AGENT}/1.0 (+lectura de la página pública de un negocio)`, accept: "text/html,text/plain" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = new URL(res.headers.get("location")!, cur);
      const sameSite = (a: string, b: string) => a.replace(/^www\./, "") === b.replace(/^www\./, "");
      if (!sameSite(next.hostname, new URL(origin).hostname)) throw new Error("Redirige a otro sitio: no se sigue.");
      cur = next; continue;
    }
    const type = res.headers.get("content-type") ?? "";
    const reader = res.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { await reader.cancel(); break; } chunks.push(value); }
    return { status: res.status, text: new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks)), type };
  }
  throw new Error("Demasiadas redirecciones.");
}

/**
 * Lee la página pública del propio negocio (inicio + hasta 3 páginas de contacto) buscando teléfono, correo y WhatsApp.
 * Respeta robots.txt, no entra a redes internas, limita tamaño, tiempo y páginas, y no guarda nada: devuelve candidatos con su fuente.
 */
export async function researchWebsite(website: string, deps: WebDeps = {}): Promise<WebResult> {
  const d: Required<WebDeps> = { fetchImpl: deps.fetchImpl ?? fetch, resolve: deps.resolve ?? defaultResolve };
  const out: WebResult = { pages: [], phones: [], emails: [], whatsapp: [], notes: [] };
  const safe = safeWebUrl(website);
  if (!safe) { out.notes.push("La web del prospecto no es una dirección válida."); return out; }
  const start = new URL(safe);
  try { await assertPublic(start, d.resolve); } catch (e) { out.notes.push(e instanceof Error ? e.message : "Dirección no permitida."); return out; }
  let rules = { allow: [] as string[], disallow: [] as string[] };
  try { const r = await getText(new URL("/robots.txt", start.origin), d, start.origin); if (r.status === 200 && /text\/plain|^$/i.test(r.type.split(";")[0] || "")) rules = parseRobots(r.text, AGENT); } catch { /* sin robots.txt legible: se asume permitido */ }

  const queue = [start.toString()], seen = new Set<string>();
  const add = (kind: "phones" | "emails" | "whatsapp", f: Found, url: string) => { if (!out[kind].some((x) => x.display === f.display)) out[kind].push({ ...f, sourceUrl: url }); };
  while (queue.length && seen.size < MAX_PAGES) {
    const url = queue.shift()!; if (seen.has(url)) continue; seen.add(url);
    const u = new URL(url);
    if (!robotsAllows(rules, u.pathname + u.search)) { out.pages.push({ url, ok: false, note: "Su robots.txt no permite leer esta página" }); continue; }
    try {
      const r = await getText(u, d, start.origin);
      if (r.status !== 200 || !/html|text\/plain/i.test(r.type)) { out.pages.push({ url, ok: false, note: `Respondió ${r.status}` }); continue; }
      out.pages.push({ url, ok: true });
      const ex = extractContacts(r.text, url);
      ex.phones.forEach((f) => add("phones", f, url)); ex.emails.forEach((f) => add("emails", f, url)); ex.whatsapp.forEach((f) => add("whatsapp", f, url));
      if (seen.size === 1) for (const l of contactLinks(r.text, url)) if (!seen.has(l)) queue.push(l);
    } catch (e) { out.pages.push({ url, ok: false, note: e instanceof Error ? e.message.slice(0, 120) : "No se pudo leer" }); }
  }
  if (!out.phones.length && !out.emails.length && !out.whatsapp.length) out.notes.push("No se encontró un teléfono ni un correo en las páginas públicas revisadas (puede que el sitio los cargue con scripts o los muestre como imagen).");
  out.notes.push("Lo encontrado son candidatos: revísalos antes de usarlos. Cada uno queda con su página de origen como evidencia.");
  return out;
}

/** Guarda un dato encontrado en la web como evidencia («observado en la fuente»). Teléfono: se suma a los que ya hay. Correo: solo si no tiene uno. */
export async function applyWebFinding(db: Db, orgId: string, actor: string, prospectId: string, kind: "phone" | "email", value: string, sourceUrl: string) {
  const [p] = await db.select().from(prospects).where(and(eq(prospects.id, prospectId), eq(prospects.orgId, orgId)));
  if (!p) throw new Error("Prospecto no encontrado.");
  let url: string; try { const u = new URL(sourceUrl); if (!/^https?:$/.test(u.protocol)) throw new Error("x"); url = u.toString(); } catch { throw new Error("La página de origen no es válida."); }
  const set: Partial<typeof prospects.$inferInsert> = {};
  if (kind === "phone") {
    if (!allPhonesValid(value)) throw new Error("Teléfono no válido.");
    const have = splitPhones(p.phone), key = normalizePhone(value);
    if (have.some((h) => normalizePhone(h) === key)) throw new Error("Ese teléfono ya está en el prospecto.");
    const merged = [...have, value.trim()].join("; ");
    set.phone = merged; set.phoneKey = normalizePhone(merged);
  } else {
    const e = normalizeEmail(value);
    if (!e) throw new Error("Correo no válido.");
    if (p.emailKey) throw new Error("El prospecto ya tiene un correo; edítalo en «Completar contacto» si quieres cambiarlo.");
    set.email = e; set.emailKey = e;
  }
  await db.update(prospects).set(set).where(eq(prospects.id, prospectId));
  await db.insert(evidence).values({
    orgId, entityType: "prospect", entityId: prospectId, field: kind === "phone" ? "phone" : "email", observedValue: kind === "phone" ? value.trim() : normalizeEmail(value),
    sourceRef: url, sourceName: "sitio_web_del_negocio", method: "web", observedAt: new Date(), verification: "source_observed",
    limitations: "Leído de la página pública del propio negocio (respetando robots.txt); puede estar desactualizado.",
  });
  await db.insert(auditLog).values({ orgId, actor, action: "prospect.web_finding_applied", entity: prospectId, detail: { kind, sourceUrl: url } });
}
