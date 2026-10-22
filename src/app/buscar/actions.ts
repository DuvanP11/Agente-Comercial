"use server";
import { logError } from "@/lib/log";
import { onlyMine } from "@/lib/guard";
import { requireUser } from "@/lib/session";
import { viewerOf } from "@/lib/services/scope";
import { track } from "@/lib/track";
import { eq } from "drizzle-orm";
import { getConnectors } from "@/lib/connectors/registry";
import { parseLinkedinCompanyUrl } from "@/lib/linkedin";
import { ATTRIBUTION } from "@/lib/connectors/business-directory";
import { hasContact, searchCriteria } from "@/lib/connectors/types";
import { fewResultsNote } from "@/lib/search-form";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { searches } from "@/lib/db/schema";
import { ingestProspects, type IngestOutcome } from "@/lib/services/prospects";
import { saveSnapshot } from "@/lib/services/searches";
import { providerFromEnv } from "@/lib/ai/provider";
import { analyzeBatch, interpretSearch, type BatchResult } from "@/lib/services/agents";
import type { InterpretedSearch } from "@/lib/agents/searchInterpreter";

export interface SearchState {
  status: "idle" | "ok" | "error";
  message?: string; errors?: string[]; notes?: string[]; outcomes?: IngestOutcome[]; searchId?: string;
}

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

export async function runSearch(_: SearchState, fd: FormData): Promise<SearchState> {
  const parsed = searchCriteria.safeParse({
    city: String(fd.get("city") ?? "").trim(),
    zones: list(fd.get("zones")),
    categories: list(fd.get("categories")),
    maxResults: Number(fd.get("maxResults") ?? 20),
    excludeTerms: list(fd.get("excludeTerms")),
    requireContact: fd.get("requireContact") === "on",
  });
  if (!parsed.success) return { status: "error", message: "Revisa los criterios: se requiere ciudad y al menos una categoría." };

  const connector = getConnectors().find((c) => c.id === String(fd.get("connector")));
  if (!connector) return { status: "error", message: "Fuente no disponible." };
  const st = connector.status();
  if (st.state !== "connected") {
    return { status: "error", message: st.state === "not_configured" ? `${connector.label} no está configurada (falta ${st.missing.join(", ")}). ${st.howTo}` : st.message };
  }

  let searchId: string | undefined;
  try {
    const db = await getDb();
    const org = await ensureDefaultOrg(db);
    const [s] = await db.insert(searches).values({
      orgId: org, naturalLanguage: String(fd.get("brief") ?? "") || null, criteria: parsed.data, connector: connector.id, status: "running",
    }).returning();
    searchId = s.id;
    const found = await connector.search(parsed.data);
    // Barrera común a todas las fuentes: con «solo con contacto» nada sin contacto llega a la base.
    const result = parsed.data.requireContact ? { ...found, prospects: found.prospects.filter(hasContact) } : found;
    const me = await requireUser();
    const outcomes = await ingestProspects(db, org, result.prospects, s.id, viewerOf(me));
    const stored = outcomes.filter((o) => o.status !== "already_stored").length;
    const already = outcomes.length - stored;
    await db.update(searches).set({ status: "completed", resultCount: stored, finishedAt: new Date(), error: result.errors.join(" | ") || null }).where(eq(searches.id, s.id));
    const message = `${result.prospects.length} resultados de ${connector.label}${parsed.data.requireContact ? " con teléfono, correo o web" : ""}: ${stored} nuevos guardados${already ? `, ${already} ya estaban guardados de antes` : ""}.${connector.id === "openstreetmap" ? " Datos © colaboradores de OpenStreetMap (ODbL)." : connector.id === "business_directory" ? ` ${ATTRIBUTION}` : ""}`;
    const notes = [...(found.notes ?? []), ...[fewResultsNote(parsed.data.zones, outcomes.length)].filter((x): x is string => !!x)];
    await saveSnapshot(db, s.id, { message, errors: result.errors, notes, items: outcomes }); // para poder volver desde una ficha
    await track("search", `Buscó en ${connector.label}`, { ciudad: parsed.data.city, categorias: parsed.data.categories, resultados: result.prospects.length, nuevos: stored }, "/buscar");
    return { status: "ok", outcomes, errors: result.errors, notes, message, searchId: s.id };
  } catch (e) {
    // Nunca dejar que una excepción llegue como "Application error": se muestra la causa (sin cadenas de conexión).
    const msg = (e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/\S+/gi, "[conexión oculta]").slice(0, 400);
    logError("runSearch falló:", e);
    if (searchId) {
      try { const db = await getDb(); await db.update(searches).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(searches.id, searchId)); } catch { /* ya se informa abajo */ }
    }
    return { status: "error", message: `La búsqueda falló: ${msg}` };
  }
}


export interface InterpretResult { ok: boolean; error?: string; warnings: string[]; output?: InterpretedSearch }

/** La IA convierte tu descripción en criterios. Solo propone: los campos se llenan para que los revises antes de buscar. */
export async function interpretAction(text: string): Promise<InterpretResult> {
  try {
    const db = await getDb();
    const r = await interpretSearch(db, await ensureDefaultOrg(db), text, providerFromEnv(), "usuario");
    // "Respuesta rechazada:" suena a error del sistema; aquí es una indicación para quien escribe.
    return { ok: r.ok, error: r.error?.replace(/^Respuesta rechazada: /, ""), warnings: r.warnings, output: r.output };
  } catch (e) {
    logError("interpretAction falló:", e);
    return { ok: false, error: "No se pudo interpretar la búsqueda.", warnings: [] };
  }
}


export type AnalyzeResult = BatchResult & { error?: string };

/** La IA lee varios resultados a la vez (hasta 8 por clic). Es una vista previa: no guarda ninguna valoración. */
export async function analyzeResultsAction(prospectIds: string[]): Promise<AnalyzeResult> {
  try {
    const ids = await onlyMine(Array.isArray(prospectIds) ? prospectIds.filter((x) => typeof x === "string").slice(0, 60) : []);
    const db = await getDb();
    return await analyzeBatch(db, await ensureDefaultOrg(db), ids, providerFromEnv(), "usuario");
  } catch (e) {
    logError("analyzeResultsAction falló:", e);
    return { readings: [], analyzed: 0, cached: 0, pending: 0, error: "No se pudieron analizar los resultados." };
  }
}


export interface ManualState { ok?: string; error?: string; outcome?: IngestOutcome }

/** Guarda una empresa que la persona encontró y copió a mano de LinkedIn. La fuente es su enlace; no se extrae nada de LinkedIn. */
export async function addLinkedinProspectAction(_: ManualState, fd: FormData): Promise<ManualState> {
  try {
    const name = String(fd.get("name") ?? "").trim().slice(0, 160);
    if (name.length < 2) return { error: "Escribe el nombre de la empresa." };
    const url = parseLinkedinCompanyUrl(String(fd.get("url") ?? ""));
    if (!url) return { error: "El enlace debe ser de una página de empresa de LinkedIn (https://www.linkedin.com/company/…)." };
    const clean = (k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
    const db = await getDb();
    const org = await ensureDefaultOrg(db);
    const me = await requireUser();
    const [o] = await ingestProspects(db, org, [{
      name, category: clean("category", 80), website: clean("website", 200), phone: clean("phone", 60), email: clean("email", 120), address: null, city: clean("city", 80),
      sourceName: "linkedin_manual", sourceId: url.toLowerCase(), sourceUrl: url, consultedAt: new Date(), isDemo: false, method: "manual",
      limitations: "Empresa copiada a mano por el usuario desde su página de LinkedIn. No se extrajo nada automáticamente; los datos no están verificados.",
    }], undefined, viewerOf(me));
    if (!o) return { error: "No se pudo guardar." };
    await track("action", "Guardó una empresa copiada de LinkedIn", { nombre: name }, "/buscar");
    return o.status === "already_stored" ? { ok: "Esa página de LinkedIn ya estaba guardada.", outcome: o } : { ok: o.message ?? "Empresa guardada como prospecto.", outcome: o };
  } catch (e) {
    logError("addLinkedinProspectAction falló:", e);
    return { error: "No se pudo guardar la empresa." };
  }
}
