import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { bixAgent, BIX_NAME, type BixOutput } from "../agents/bix";
import { runAgent } from "../agents/core";
import type { AiProvider } from "../ai/provider";
import type { Db } from "../db/client";
import { activities, auditLog, bixConversations, bixMessages, orgSettings, prospects, trainingLessons, users } from "../db/schema";
import { normalizePhone } from "../dedup/normalize";
import { buildLeadMessage, postToChat, validateChatWebhook } from "../google-chat";
import { open, seal } from "../secret-box";
import { sendTemplate, sendText, waConfig, waMissing, WaError, type WaConfig } from "../whatsapp-cloud";
import { assertCanContact, registerAttempt } from "./contact-tracking";
import type { Viewer } from "./scope";
import { getGuidance, getTraining } from "./settings";
import { guidanceText } from "../training";

export interface BixDeps { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => Date; wa?: WaConfig | null }
const wa = (d: BixDeps) => (d.wa !== undefined ? d.wa : waConfig());
const f = (d: BixDeps) => d.fetchImpl ?? fetch;
const nowOf = (d: BixDeps) => d.now?.() ?? new Date();

/** Tope diario de conversaciones nuevas (cuida el número de WhatsApp: Meta lo limita y lo penaliza si los clientes lo reportan). */
export const bixDailyCap = () => Math.min(1000, Math.max(1, Number(process.env.BIX_DAILY_CAP) || 100));
export const MAX_CLIENT_TURNS = 12;
export const STATUS_LABEL: Record<string, string> = { queued: "En cola", sent: "Sin respuesta aún", talking: "En conversación", interested: "Interesado", not_interested: "No interesado", not_found: "No encontrado", failed: "Falló el envío" };

// ---------------------------------------------------------------------------------------------
// Ajustes: «Bix listo» y webhook de Google Chat
// ---------------------------------------------------------------------------------------------
async function ensureRow(db: Db, orgId: string) { await db.insert(orgSettings).values({ orgId }).onConflictDoNothing(); }

export async function getChatWebhook(db: Db, orgId: string): Promise<string | null> {
  const [s] = await db.select({ enc: orgSettings.chatWebhookEnc }).from(orgSettings).where(eq(orgSettings.orgId, orgId));
  const stored = s?.enc ? open(s.enc) : null;
  return stored ?? (process.env.GOOGLE_CHAT_WEBHOOK_URL?.trim() || null);
}
export async function saveChatWebhook(db: Db, orgId: string, actor: string, url: string) {
  await ensureRow(db, orgId);
  const clean = url.trim();
  await db.update(orgSettings).set({ chatWebhookEnc: clean ? seal(validateChatWebhook(clean)) : null, updatedAt: new Date() }).where(eq(orgSettings.orgId, orgId));
  await db.insert(auditLog).values({ orgId, actor, action: clean ? "bix.chat_webhook_set" : "bix.chat_webhook_removed", entity: orgId });
}
export async function testChatWebhook(db: Db, orgId: string, deps: BixDeps = {}) {
  const url = await getChatWebhook(db, orgId); if (!url) throw new Error("Primero guarda el webhook de Google Chat.");
  await postToChat(url, "✅ Prueba de Bix: este espacio recibirá los leads interesados con su rango de interés y el Hunter asignado.", f(deps));
}

export interface HunterRow { id: string; name: string; email: string; phone: string | null; chatUserId: string | null; receivesLeads: boolean; lastLeadAt: Date | null }
/** Quienes están en la rotación: activos, con la marca «recibe leads» y un WhatsApp válido al que redirigir al cliente. */
export async function eligibleHunters(db: Db, orgId: string): Promise<HunterRow[]> {
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, chatUserId: users.chatUserId, receivesLeads: users.receivesLeads, lastLeadAt: users.lastLeadAt })
    .from(users).where(and(eq(users.orgId, orgId), eq(users.active, true), eq(users.receivesLeads, true))).orderBy(asc(users.createdAt));
  return rows.filter((r) => !!normalizePhone(r.phone)).sort((a, b) => (a.lastLeadAt?.getTime() ?? 0) - (b.lastLeadAt?.getTime() ?? 0));
}
/** Rotación equitativa: le toca a quien lleva más tiempo sin recibir un lead (quien nunca ha recibido, primero). */
export const nextHunter = async (db: Db, orgId: string) => (await eligibleHunters(db, orgId))[0] ?? null;

export interface CheckItem { key: string; label: string; ok: boolean; detail: string; needed: "ready" | "send" }
export async function readiness(db: Db, orgId: string, provider: AiProvider | null) {
  const [lessons] = await db.select({ n: sql<number>`count(*)::int` }).from(trainingLessons).where(and(eq(trainingLessons.orgId, orgId), eq(trainingLessons.active, true)));
  const guidance = guidanceText(await getTraining(db, orgId));
  const hunters = await eligibleHunters(db, orgId);
  const missing = waMissing();
  const chat = await getChatWebhook(db, orgId);
  const items: CheckItem[] = [
    { key: "ai", label: "La IA está conectada", ok: !!provider, detail: provider ? "Proveedor de IA configurado." : "Falta configurar la IA (ver Integraciones).", needed: "ready" },
    { key: "training", label: "Bix está entrenado", ok: (lessons?.n ?? 0) > 0 || !!guidance, detail: `${lessons?.n ?? 0} lección(es) activa(s) del laboratorio${guidance ? " y guía escrita" : ""}. Entrénalo en el Laboratorio de conversación hasta que converse como quieres.`, needed: "ready" },
    { key: "chat", label: "El espacio de Google Chat está conectado", ok: !!chat, detail: chat ? "Webhook guardado." : "Pega el webhook del espacio donde se avisarán los leads.", needed: "ready" },
    { key: "hunters", label: "Hay Hunters en la rotación", ok: hunters.length > 0, detail: hunters.length ? `${hunters.length} Hunter(s): ${hunters.map((h) => h.name).join(", ")}.` : "En Usuarios, marca «Recibe leads de Bix» y registra el WhatsApp de al menos un Hunter (se le arroba con su correo corporativo).", needed: "ready" },
    { key: "whatsapp", label: "WhatsApp Business está conectado", ok: missing.length === 0, detail: missing.length ? `Faltan variables en Vercel: ${missing.join(", ")}. Sin esto Bix no puede escribirle a nadie.` : "Credenciales presentes (no probadas con Meta hasta el primer envío).", needed: "send" },
  ];
  return { items, canMarkReady: items.filter((i) => i.needed === "ready").every((i) => i.ok), canSend: items.every((i) => i.ok), hunters };
}
export async function bixState(db: Db, orgId: string) {
  const [s] = await db.select({ ready: orgSettings.bixReady, by: orgSettings.bixReadyBy, at: orgSettings.bixReadyAt }).from(orgSettings).where(eq(orgSettings.orgId, orgId));
  return { ready: !!s?.ready, readyBy: s?.by ?? null, readyAt: s?.at ?? null };
}
export async function setBixReady(db: Db, orgId: string, actor: { id: string; name: string }, ready: boolean, provider: AiProvider | null) {
  if (ready) {
    const r = await readiness(db, orgId, provider);
    const bad = r.items.filter((i) => i.needed === "ready" && !i.ok).map((i) => i.label);
    if (bad.length) throw new Error(`Todavía no está listo: falta «${bad.join("», «")}».`);
  }
  await ensureRow(db, orgId);
  await db.update(orgSettings).set({ bixReady: ready, bixReadyBy: ready ? actor.name : null, bixReadyAt: ready ? new Date() : null, updatedAt: new Date() }).where(eq(orgSettings.orgId, orgId));
  await db.insert(auditLog).values({ orgId, actor: actor.id, action: ready ? "bix.ready_on" : "bix.ready_off", entity: orgId });
}

// ---------------------------------------------------------------------------------------------
// Conversaciones
// ---------------------------------------------------------------------------------------------
type Conv = typeof bixConversations.$inferSelect;
const digits = (p: string | null | undefined) => normalizePhone(p).replace(/\D/g, "");

async function record(db: Db, convId: string, direction: "in" | "out", body: string, waId: string | null, stage: string | null, at: Date) {
  const r = await db.insert(bixMessages).values({ conversationId: convId, direction, body, waId, stage, createdAt: at }).onConflictDoNothing().returning({ id: bixMessages.id });
  return r.length > 0;
}
async function history(db: Db, convId: string) {
  const msgs = await db.select().from(bixMessages).where(eq(bixMessages.conversationId, convId)).orderBy(asc(bixMessages.createdAt), asc(bixMessages.id));
  return msgs.map((m) => ({ role: (m.direction === "out" ? "agent" : "prospect") as "agent" | "prospect", text: m.body }));
}

async function bixTurn(db: Db, orgId: string, provider: AiProvider | null, conv: Conv, p: { category: string | null; city: string | null }, hist: { role: "agent" | "prospect"; text: string }[]): Promise<{ out?: BixOutput; error?: string }> {
  const guidance = await getGuidance(db, orgId);
  const call = (h: typeof hist) => runAgent(db, orgId, bixAgent, { scenario: { business: conv.businessName, category: p.category, city: p.city }, history: h.slice(-24), guidance, minAnswers: 2 }, provider, { actor: BIX_NAME, entityType: "bix_conversation", entityId: conv.id });
  let r = await call(hist);
  if (!r.ok && r.error?.startsWith("Respuesta rechazada")) r = await call(hist); // un segundo intento: el modelo es no determinista
  return r.ok && r.output ? { out: r.output } : { error: r.error ?? "La IA no pudo responder." };
}

async function sendAndRecord(db: Db, cfg: WaConfig, conv: Conv, text: string, stage: string | null, deps: BixDeps, template?: { name: string; param: string }) {
  const id = template ? await sendTemplate(cfg, conv.phone, template.name, template.param, f(deps)) : await sendText(cfg, conv.phone, text, f(deps));
  const at = nowOf(deps);
  await record(db, conv.id, "out", text, id, stage, at);
  await db.update(bixConversations).set({ lastOutboundAt: at }).where(eq(bixConversations.id, conv.id));
  return id;
}

export async function conversationsToday(db: Db, orgId: string, now = new Date()) {
  const b = new Date(now.getTime() - 5 * 3600_000); b.setUTCHours(0, 0, 0, 0);
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(bixConversations).where(and(eq(bixConversations.orgId, orgId), gte(bixConversations.createdAt, new Date(b.getTime() + 5 * 3600_000))));
  return r?.n ?? 0;
}

export interface LaunchResult { prospectId: string; ok: boolean; error?: string }
/** Pone a Bix a escribirle a cada lead (≤ 10 por llamada). Exige Bix «listo», todo conectado, y respeta No contactar y el máximo de intentos. */
export async function launchLeads(db: Db, orgId: string, user: { id: string; name: string }, prospectIds: string[], provider: AiProvider | null, deps: BixDeps = {}): Promise<LaunchResult[]> {
  const state = await bixState(db, orgId);
  if (!state.ready) throw new Error("Bix no está marcado como listo. Complétalo en la lista de verificación.");
  const cfg = wa(deps); if (!cfg) throw new Error(`WhatsApp Business no está conectado (faltan ${waMissing().join(", ")}).`);
  const ids = [...new Set(prospectIds)].slice(0, 10);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const out: LaunchResult[] = [];
  let today = await conversationsToday(db, orgId, nowOf(deps));
  for (let i = 0; i < ids.length; i++) {
    const pid = ids[i];
    const res = (ok: boolean, error?: string) => out.push({ prospectId: pid, ok, error });
    try {
      if (today >= bixDailyCap()) { res(false, `Llegaron al tope diario de ${bixDailyCap()} conversaciones nuevas. Continúa mañana.`); continue; }
      const [p] = await db.select().from(prospects).where(and(eq(prospects.id, pid), eq(prospects.orgId, orgId)));
      if (!p) { res(false, "Prospecto no encontrado."); continue; }
      await assertCanContact(db, orgId, p);
      const phone = digits(p.phone); if (!phone) { res(false, "No tiene un teléfono válido."); continue; }
      const [active] = await db.select({ id: bixConversations.id }).from(bixConversations).where(and(eq(bixConversations.prospectId, pid), eq(bixConversations.orgId, orgId), inArray(bixConversations.status, ["queued", "sent", "talking", "interested", "not_interested", "not_found"]))).limit(1);
      if (active) { res(false, "Bix ya tiene una conversación con este prospecto."); continue; }
      const [conv] = await db.insert(bixConversations).values({ orgId, prospectId: pid, ownerId: p.ownerId ?? user.id, phone, businessName: p.name }).returning();
      today++;
      try {
        if (cfg.template) await sendAndRecord(db, cfg, conv, `[Plantilla «${cfg.template}»] ${p.name}`, "saludo", deps, { name: cfg.template, param: p.name });
        else {
          const t = await bixTurn(db, orgId, provider, conv, p, []);
          if (!t.out) throw new Error(t.error);
          await sendAndRecord(db, cfg, conv, t.out.reply, "saludo", deps);
        }
        await db.update(bixConversations).set({ status: "sent" }).where(eq(bixConversations.id, conv.id));
        await registerAttempt(db, orgId, pid, { channel: "whatsapp", activity: false }, BIX_NAME);
        await db.insert(activities).values({ orgId, prospectId: pid, type: "bix_contacted", actor: user.name, detail: { conversationId: conv.id } });
        res(true);
      } catch (e) {
        const notFound = e instanceof WaError && e.kind === "not_found";
        const msg = e instanceof Error ? e.message : "No se pudo enviar.";
        await db.update(bixConversations).set({ status: notFound ? "not_found" : "failed", lastError: msg }).where(eq(bixConversations.id, conv.id));
        res(false, msg);
        if (e instanceof WaError && (e.kind === "auth" || e.kind === "rate")) { for (const rest of ids.slice(i + 1)) out.push({ prospectId: rest, ok: false, error: "No se intentó: " + msg }); break; }
      }
    } catch (e) { res(false, e instanceof Error ? e.message : "No se pudo."); }
    if (i < ids.length - 1) await sleep(1200);
  }
  return out;
}

const OPT_OUT = /\b(no me (escriban|escriba|contacten|contacte|llamen|molesten)|dejen de (escribir|molestar|contactar)|no quiero (recibir|m[aá]s mensajes)|elimin\w+ (mi|el) (n[uú]mero|contacto)|no m[aá]s mensajes|stop|baja|desuscrib\w+)\b/i;
export const isOptOut = (t: string) => OPT_OUT.test(t);
const GOODBYE = "Entendido, no le volveremos a escribir. Gracias por su tiempo y que tenga un excelente día.";

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
/** Mensaje final al cliente: lo escribe el CÓDIGO (no la IA) para que el número del Hunter nunca sea inventado. */
export const handoffText = (reply: string, hunterName: string, hunterPhone: string) =>
  `${reply.trim()}\n\n${firstName(hunterName)}, de nuestro equipo comercial, le dará todos los detalles. Escríbale directamente a su WhatsApp: https://wa.me/${hunterPhone.replace(/\D/g, "")}`;

/** Un mensaje del cliente: Bix lee, responde y, si hay interés, lo pasa al siguiente Hunter de la rotación y avisa en Google Chat. */
export async function handleInbound(db: Db, msg: { from: string; id: string; text: string }, provider: AiProvider | null, deps: BixDeps = {}): Promise<{ handled: boolean; note?: string }> {
  const cfg = wa(deps); if (!cfg) return { handled: false, note: "WhatsApp sin configurar" };
  const from = msg.from.replace(/\D/g, "");
  const [conv] = await db.select().from(bixConversations).where(and(eq(bixConversations.phone, from), inArray(bixConversations.status, ["sent", "talking", "interested", "not_interested"]))).orderBy(desc(bixConversations.createdAt)).limit(1);
  if (!conv) return { handled: false, note: "sin conversación" };
  const orgId = conv.orgId;
  const at = nowOf(deps);
  if (!(await record(db, conv.id, "in", msg.text, msg.id, null, at))) return { handled: false, note: "reenvío ignorado" };
  await db.update(bixConversations).set({ lastInboundAt: at }).where(eq(bixConversations.id, conv.id));
  // Ya pasó a un Hunter, o ya dijo que no: Bix no sigue conversando (el Hunter retoma el chat por su cuenta).
  if (conv.status === "interested" || conv.status === "not_interested") return { handled: true, note: "conversación cerrada" };

  const [p] = await db.select().from(prospects).where(eq(prospects.id, conv.prospectId));
  if (isOptOut(msg.text)) {
    await db.update(prospects).set({ doNotContact: true, doNotContactReason: "Pidió no ser contactado por WhatsApp (Bix)", doNotContactAt: at }).where(eq(prospects.id, conv.prospectId));
    await db.update(bixConversations).set({ status: "not_interested", interest: 0 }).where(eq(bixConversations.id, conv.id));
    await safeSend(db, cfg, conv, GOODBYE, "cierre", deps);
    return { handled: true, note: "baja" };
  }
  const hist = await history(db, conv.id);
  if (hist.filter((h) => h.role === "prospect").length > MAX_CLIENT_TURNS) {
    await db.update(bixConversations).set({ status: "talking", lastError: "La conversación pasó de 12 respuestas: Bix dejó de responder; requiere a una persona." }).where(eq(bixConversations.id, conv.id));
    return { handled: true, note: "demasiado larga" };
  }
  const t = await bixTurn(db, orgId, provider, conv, p ?? { category: null, city: null }, hist);
  if (!t.out) { await db.update(bixConversations).set({ status: "talking", lastError: t.error ?? "La IA no pudo responder." }).where(eq(bixConversations.id, conv.id)); return { handled: true, note: "sin respuesta de la IA" }; }
  const o = t.out;
  const patch = { interest: o.interest, answers: o.answers.length ? o.answers : (conv.answers ?? null), lastError: null as string | null };

  if (o.outcome === "not_interested") {
    await db.update(bixConversations).set({ ...patch, status: "not_interested" }).where(eq(bixConversations.id, conv.id));
    await safeSend(db, cfg, conv, o.reply, o.stage, deps);
    return { handled: true, note: "no interesado" };
  }
  if (o.outcome === "interested") {
    const hunter = await nextHunter(db, orgId);
    if (!hunter) {
      await db.update(bixConversations).set({ ...patch, status: "talking", lastError: "Hay un lead interesado pero no hay Hunters en la rotación." }).where(eq(bixConversations.id, conv.id));
      await safeSend(db, cfg, conv, o.reply, o.stage, deps);
      return { handled: true, note: "sin hunters" };
    }
    const hunterPhone = digits(hunter.phone);
    if (!(await safeSend(db, cfg, conv, handoffText(o.reply, hunter.name, hunterPhone), "cierre", deps))) return { handled: true, note: "falló el envío" };
    await db.update(users).set({ lastLeadAt: at }).where(eq(users.id, hunter.id));
    await db.update(bixConversations).set({ ...patch, status: "interested", assignedUserId: hunter.id, assignedName: hunter.name, handedOffAt: at }).where(eq(bixConversations.id, conv.id));
    await db.insert(activities).values({ orgId, prospectId: conv.prospectId, type: "bix_handoff", actor: BIX_NAME, detail: { conversationId: conv.id, hunter: hunter.name, interest: o.interest } });
    await notifyChat(db, conv.id, deps);
    return { handled: true, note: "traspaso" };
  }
  await db.update(bixConversations).set({ ...patch, status: "talking" }).where(eq(bixConversations.id, conv.id));
  await safeSend(db, cfg, conv, o.reply, o.stage, deps);
  return { handled: true, note: "continúa" };
}

/** Envía y, si falla, deja el motivo en la conversación en vez de romper el webhook. */
async function safeSend(db: Db, cfg: WaConfig, conv: Conv, text: string, stage: string | null, deps: BixDeps): Promise<boolean> {
  try { await sendAndRecord(db, cfg, conv, text, stage, deps); return true; }
  catch (e) { await db.update(bixConversations).set({ lastError: e instanceof Error ? e.message : "No se pudo enviar." }).where(eq(bixConversations.id, conv.id)); return false; }
}

/** Estados de entrega de WhatsApp: un «failed» por número sin WhatsApp convierte la conversación en «No encontrado». */
export async function handleStatus(db: Db, s: { id: string; status: string; code?: number }) {
  if (s.status !== "failed") return;
  const [m] = await db.select({ convId: bixMessages.conversationId }).from(bixMessages).where(eq(bixMessages.waId, s.id));
  if (!m) return;
  const notFound = s.code === 131026 || s.code === 131030 || s.code === 1006;
  await db.update(bixConversations).set(notFound ? { status: "not_found", lastError: "Ese número no tiene WhatsApp." } : { lastError: `WhatsApp no entregó el mensaje (código ${s.code ?? "?"}).` })
    .where(and(eq(bixConversations.id, m.convId), inArray(bixConversations.status, ["sent", "queued"])));
}

/** Aviso al espacio de Google Chat con el lead y su Hunter. Si falla se guarda el error y se puede reintentar. */
export async function notifyChat(db: Db, convId: string, deps: BixDeps = {}): Promise<{ ok: boolean; error?: string }> {
  const [c] = await db.select().from(bixConversations).where(eq(bixConversations.id, convId));
  if (!c || !c.assignedUserId) return { ok: false, error: "La conversación no tiene Hunter asignado." };
  try {
    const url = await getChatWebhook(db, c.orgId); if (!url) throw new Error("Falta el webhook de Google Chat.");
    const [p] = await db.select().from(prospects).where(eq(prospects.id, c.prospectId));
    const [h] = await db.select({ name: users.name, email: users.email, chatUserId: users.chatUserId }).from(users).where(eq(users.id, c.assignedUserId));
    const text = buildLeadMessage({ interest: c.interest ?? 0, name: p?.name ?? c.businessName, business: c.businessName, phone: c.phone, email: p?.email ?? null, city: p?.city ?? null, category: p?.category ?? null,
      answers: (c.answers as { q: string; a: string }[] | null) ?? [], hunter: { name: h?.name ?? c.assignedName ?? "Hunter", email: h?.email ?? "", chatUserId: h?.chatUserId ?? null } });
    await postToChat(url, text, f(deps));
    await db.update(bixConversations).set({ chatNotifiedAt: nowOf(deps), chatError: null }).where(eq(bixConversations.id, convId));
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "No se pudo avisar a Google Chat.";
    await db.update(bixConversations).set({ chatError: error }).where(eq(bixConversations.id, convId));
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------------------------
// Lectura: estadísticas y listas
// ---------------------------------------------------------------------------------------------
const scope = (orgId: string, v?: Viewer) => and(eq(bixConversations.orgId, orgId), v && !v.seesAll ? eq(bixConversations.ownerId, v.id) : undefined);

export interface BixStats { contacted: number; interested: number; noResponse: number; notInterested: number; notFound: number; talking: number; failed: number; byRange: { Alto: number; Medio: number; Bajo: number } }
/** Contactado = a quienes Bix sí les escribió (llegó el mensaje); los demás estados son una partición de ese total, salvo «No encontrado» y «Falló», que no llegaron. */
export async function bixStats(db: Db, orgId: string, v?: Viewer): Promise<BixStats> {
  const rows = await db.select({ status: bixConversations.status, interest: bixConversations.interest, n: sql<number>`count(*)::int` }).from(bixConversations).where(scope(orgId, v)).groupBy(bixConversations.status, bixConversations.interest);
  const s: BixStats = { contacted: 0, interested: 0, noResponse: 0, notInterested: 0, notFound: 0, talking: 0, failed: 0, byRange: { Alto: 0, Medio: 0, Bajo: 0 } };
  for (const r of rows) {
    if (r.status === "interested") { s.interested += r.n; const k = (r.interest ?? 0) >= 70 ? "Alto" : (r.interest ?? 0) >= 40 ? "Medio" : "Bajo"; s.byRange[k] += r.n; }
    else if (r.status === "sent") s.noResponse += r.n;
    else if (r.status === "not_interested") s.notInterested += r.n;
    else if (r.status === "not_found") s.notFound += r.n;
    else if (r.status === "talking") s.talking += r.n;
    else if (r.status === "failed") s.failed += r.n;
  }
  s.contacted = s.interested + s.noResponse + s.notInterested + s.talking;
  return s;
}

export async function listConversations(db: Db, orgId: string, v?: Viewer, status?: string) {
  const rows = await db.select().from(bixConversations).where(and(scope(orgId, v), status ? eq(bixConversations.status, status) : undefined)).orderBy(desc(bixConversations.createdAt)).limit(200);
  const counts = rows.length ? await db.select({ id: bixMessages.conversationId, n: sql<number>`count(*)::int` }).from(bixMessages).where(inArray(bixMessages.conversationId, rows.map((r) => r.id))).groupBy(bixMessages.conversationId) : [];
  const n = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map((r) => ({ ...r, messages: n.get(r.id) ?? 0 }));
}
export async function conversationDetail(db: Db, orgId: string, v: Viewer | undefined, id: string) {
  const [c] = await db.select().from(bixConversations).where(and(eq(bixConversations.id, id), scope(orgId, v)));
  if (!c) throw new Error("Conversación no encontrada.");
  const msgs = await db.select().from(bixMessages).where(eq(bixMessages.conversationId, id)).orderBy(asc(bixMessages.createdAt), asc(bixMessages.id));
  return { c, msgs };
}
/** Prospectos que se pueden entregar a Bix: con WhatsApp válido, sin bloqueos y sin conversación previa. */
export async function launchable(db: Db, orgId: string, v?: Viewer, q = "") {
  const rows = await db.select({ id: prospects.id, name: prospects.name, city: prospects.city, category: prospects.category, phone: prospects.phone, phoneKey: prospects.phoneKey })
    .from(prospects).where(and(eq(prospects.orgId, orgId), eq(prospects.doNotContact, false), sql`${prospects.phoneKey} <> ''`, v && !v.seesAll ? eq(prospects.ownerId, v.id) : undefined,
      sql`not exists (select 1 from bix_conversations b where b.prospect_id = ${prospects.id} and b.status in ('queued','sent','talking','interested','not_interested','not_found'))`)).orderBy(desc(prospects.createdAt)).limit(300);
  const t = q.trim().toLowerCase();
  return rows.filter((r) => !t || `${r.name} ${r.city} ${r.category}`.toLowerCase().includes(t));
}
