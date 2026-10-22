import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, auditLog, campaignProspects, campaignAttachments, campaigns, gmailConnections, messages, prospects } from "../db/schema";
import { CLOSED_STATUSES, renderTemplate, type CpStatus } from "../campaigns";
import { exchangeCode, gmailAddress, oauthConfig, refreshAccess, SEND_URL, toGoogleError } from "../google-oauth";
import { buildMime, textToHtml, toBase64Url, type MailAttachment, type MailInput } from "../mime";
import { open, seal } from "../secret-box";
import { normalizeEmail } from "../dedup/normalize";
import { assertCanContact, registerAttempt } from "./contact-tracking";
import { loadCp } from "./campaigns";

export interface GmailDeps { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => Date }
const f = (d?: GmailDeps) => d?.fetchImpl ?? fetch;

/** Tope diario por persona (Gmail corta a ~500 al día con cuentas gratuitas y ~2.000 con Workspace; se deja margen). Configurable con GMAIL_DAILY_CAP. */
export const dailyCap = () => Math.min(1500, Math.max(1, Number(process.env.GMAIL_DAILY_CAP) || 150));
export const OPT_OUT_TEXT = "Si no desea recibir más mensajes de nuestra parte, responda a este correo con la palabra NO y no volveremos a escribirle.";

export async function getConnection(db: Db, userId: string) {
  const [c] = await db.select({ email: gmailConnections.email, connectedAt: gmailConnections.connectedAt, lastUsedAt: gmailConnections.lastUsedAt }).from(gmailConnections).where(eq(gmailConnections.userId, userId));
  return c ?? null;
}
export async function disconnectGmail(db: Db, orgId: string, userId: string) {
  await db.delete(gmailConnections).where(eq(gmailConnections.userId, userId));
  await db.insert(auditLog).values({ orgId, actor: userId, action: "gmail.disconnect", entity: userId });
}

/** Termina la conexión: canjea el código de Google, comprueba que la cuenta sea la de la persona y guarda el token cifrado. */
export async function connectGmail(db: Db, orgId: string, user: { id: string; email: string; role: string }, code: string, redirect: string, deps: GmailDeps = {}) {
  const cfg = oauthConfig(); if (!cfg) throw new Error("La conexión con Gmail no está configurada en el servidor.");
  const t = await exchangeCode(cfg, code, redirect, f(deps));
  if (!t.refreshToken) throw new Error("Google no entregó permiso permanente. Quita el acceso de esta app en tu cuenta de Google (myaccount.google.com/permissions) y vuelve a conectar.");
  if (!t.scope.includes("gmail.send")) throw new Error("No diste el permiso de enviar correos. Vuelve a conectar y acéptalo.");
  const email = await gmailAddress(t.accessToken, f(deps));
  // Cada persona envía desde SU correo corporativo (el administrador de arranque puede conectar cualquiera).
  if (user.role !== "admin" && normalizeEmail(user.email) !== email) throw new Error(`Conectaste ${email}, pero tu usuario es ${user.email}. Conecta la cuenta de Google de tu correo corporativo.`);
  const now = deps.now?.() ?? new Date();
  await db.insert(gmailConnections).values({ userId: user.id, orgId, email, refreshTokenEnc: seal(t.refreshToken), scope: t.scope, connectedAt: now })
    .onConflictDoUpdate({ target: gmailConnections.userId, set: { email, refreshTokenEnc: seal(t.refreshToken), scope: t.scope, connectedAt: now, lastUsedAt: null } });
  await db.insert(auditLog).values({ orgId, actor: user.id, action: "gmail.connect", entity: user.id, detail: { email } });
  return email;
}

async function accessTokenFor(db: Db, orgId: string, userId: string, deps: GmailDeps): Promise<{ token: string; email: string }> {
  const [c] = await db.select().from(gmailConnections).where(eq(gmailConnections.userId, userId));
  if (!c) throw new Error("Primero conecta tu Gmail (botón «Conectar mi Gmail»).");
  const cfg = oauthConfig(); if (!cfg) throw new Error("La conexión con Gmail no está configurada en el servidor.");
  const refresh = open(c.refreshTokenEnc);
  if (!refresh) { await db.delete(gmailConnections).where(eq(gmailConnections.userId, userId)); throw new Error("No se pudo leer tu conexión de Gmail (cambió la clave de cifrado). Vuelve a conectarla."); }
  try { return { token: (await refreshAccess(cfg, refresh, f(deps))).accessToken, email: c.email }; }
  catch (e) {
    if (e instanceof Error && e.message === "invalid_grant") { await db.delete(gmailConnections).where(eq(gmailConnections.userId, userId)); throw new Error("Tu conexión con Gmail venció o fue revocada. Vuelve a conectarla."); }
    throw toGoogleError(e);
  }
}

/** Envía un correo con el Gmail de la persona. Devuelve el id del mensaje en Gmail. */
export async function sendRaw(db: Db, orgId: string, userId: string, mail: Omit<MailInput, "from">, deps: GmailDeps = {}): Promise<{ id: string; from: string }> {
  const { token, email } = await accessTokenFor(db, orgId, userId, deps);
  const raw = toBase64Url(buildMime({ ...mail, from: email }));
  const res = await f(deps)(SEND_URL, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ raw }), signal: AbortSignal.timeout(40_000) });
  const j = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string; status?: string } };
  if (!res.ok || !j.id) {
    if (res.status === 401) throw new Error("Gmail rechazó la sesión. Vuelve a conectar tu Gmail.");
    if (res.status === 403) throw new Error("Gmail no permitió el envío: revisa que la Gmail API esté habilitada y que hayas dado el permiso de enviar.");
    if (res.status === 429) throw new Error("Gmail pidió esperar (límite de envíos). Intenta más tarde.");
    throw new Error(`Gmail no pudo enviar el correo (${res.status}${j.error?.status ? ` · ${j.error.status}` : ""}).`);
  }
  await db.update(gmailConnections).set({ lastUsedAt: new Date() }).where(eq(gmailConnections.userId, userId));
  return { id: j.id, from: email };
}

const bogotaMidnightUtc = (now: Date) => { const b = new Date(now.getTime() - 5 * 3600_000); b.setUTCHours(0, 0, 0, 0); return new Date(b.getTime() + 5 * 3600_000); };
/** Cuántos correos ya envió hoy esta persona desde la plataforma. */
export async function sentToday(db: Db, actor: string, now = new Date()): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(activities).where(and(eq(activities.type, "email_sent"), eq(activities.actor, actor), gte(activities.createdAt, bogotaMidnightUtc(now))));
  return r?.n ?? 0;
}

export interface SendOptions { attachmentIds?: string[]; inlineImages?: boolean; optOut?: boolean; allowRepeat?: boolean }
export interface SendResult { cpId: string; ok: boolean; error?: string; skipped?: boolean }
const REPEAT_MS = 24 * 3600_000;

/** Envía el mensaje APROBADO de un prospecto de una campaña, desde el Gmail de la persona, con los archivos elegidos. */
export async function sendCampaignEmail(db: Db, orgId: string, user: { id: string; email: string; name: string }, cpId: string, opts: SendOptions = {}, deps: GmailDeps = {}): Promise<SendResult> {
  const now = deps.now?.() ?? new Date();
  try {
    const { cp, p, c } = await loadCp(db, orgId, cpId);
    if (c.status === "closed") throw new Error("La campaña está cerrada.");
    if (p.doNotContact) throw new Error("Pidió no ser contactado.");
    if (CLOSED_STATUSES.includes(cp.status as CpStatus)) throw new Error("Su gestión está cerrada.");
    await assertCanContact(db, orgId, p);
    const to = normalizeEmail(p.email ?? "");
    if (!to) throw new Error("No tiene un correo válido.");
    const [m] = await db.select().from(messages).where(and(eq(messages.campaignId, cp.campaignId), eq(messages.prospectId, p.id), eq(messages.status, "approved")));
    if (!m) throw new Error("El mensaje no está aprobado.");
    if ((await sentToday(db, user.email, now)) >= dailyCap()) throw new Error(`Llegaste al tope diario de ${dailyCap()} correos desde la plataforma. Continúa mañana.`);
    if (!opts.allowRepeat) {
      const [recent] = await db.select({ id: activities.id }).from(activities).where(and(eq(activities.orgId, orgId), eq(activities.prospectId, p.id), eq(activities.type, "email_sent"), gte(activities.createdAt, new Date(now.getTime() - REPEAT_MS)))).limit(1);
      if (recent) return { cpId, ok: false, skipped: true, error: "Ya se le envió un correo en las últimas 24 h." };
    }
    const atts: MailAttachment[] = [];
    if (opts.attachmentIds?.length) {
      const rows = await db.select().from(campaignAttachments).where(and(eq(campaignAttachments.campaignId, cp.campaignId), eq(campaignAttachments.orgId, orgId)));
      for (const id of opts.attachmentIds) { const a = rows.find((r) => r.id === id); if (!a) throw new Error("Un archivo elegido ya no existe en la campaña."); atts.push({ name: a.name, mime: a.mime, bytes: new Uint8Array(a.data), ...(opts.inlineImages && a.kind === "image" && a.mime !== "image/gif" ? { inlineCid: `img${atts.length}@pibox` } : {}) }); }
    }
    const subject = renderTemplate(c.emailSubject?.trim() || c.name, { empresa: p.name, ciudad: p.city, categoria: p.category }).text || c.name;
    const body = m.body.trim() + (opts.optOut === false ? "" : `\n\n${OPT_OUT_TEXT}`);
    const cids = atts.filter((a) => a.inlineCid);
    const html = textToHtml(body) + cids.map((a) => `<p><img src="cid:${a.inlineCid}" alt="" style="max-width:100%;height:auto"></p>`).join("");
    const sent = await sendRaw(db, orgId, user.id, { to, subject, text: body, html, attachments: atts, fromName: user.name }, deps);
    await db.insert(activities).values({ orgId, prospectId: p.id, type: "email_sent", actor: user.email, detail: { campaignId: cp.campaignId, cpId, gmailId: sent.id, from: sent.from, adjuntos: atts.length } });
    await registerAttempt(db, orgId, p.id, { channel: "email", activity: false }, user.email);
    await db.update(campaignProspects).set({ status: cp.status === "pending" ? "contacted" : cp.status, lastContactAt: now }).where(eq(campaignProspects.id, cpId));
    return { cpId, ok: true };
  } catch (e) { return { cpId, ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." }; }
}

/** Una tanda de envíos (máx. 8) con pausa entre correos para no parecer spam. El cliente repite la llamada hasta terminar. */
export async function sendCampaignBatch(db: Db, orgId: string, user: { id: string; email: string; name: string }, campaignId: string, cpIds: string[], opts: SendOptions, deps: GmailDeps = {}): Promise<SendResult[]> {
  const ids = [...new Set(cpIds)].slice(0, 8);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const out: SendResult[] = [];
  for (let i = 0; i < ids.length; i++) {
    const [row] = await db.select({ id: campaignProspects.id }).from(campaignProspects).where(and(eq(campaignProspects.id, ids[i]), eq(campaignProspects.campaignId, campaignId), eq(campaignProspects.orgId, orgId)));
    if (!row) { out.push({ cpId: ids[i], ok: false, error: "No pertenece a esta campaña." }); continue; }
    const r = await sendCampaignEmail(db, orgId, user, ids[i], opts, deps);
    out.push(r);
    if (!r.ok && /tope diario|pidió esperar|conectar|venció|revocada|no configurada/i.test(r.error ?? "")) { for (const rest of ids.slice(i + 1)) out.push({ cpId: rest, ok: false, error: "No se intentó: " + r.error }); break; }
    if (i < ids.length - 1) await sleep(1200);
  }
  return out;
}

/** Prospectos de una campaña que se pueden enviar ahora (mensaje aprobado, correo válido, sin bloqueos). */
export async function sendableRecipients(db: Db, orgId: string, campaignId: string) {
  const rows = await db.select({ cp: campaignProspects, p: prospects }).from(campaignProspects).innerJoin(prospects, eq(prospects.id, campaignProspects.prospectId))
    .where(and(eq(campaignProspects.campaignId, campaignId), eq(campaignProspects.orgId, orgId)));
  const approved = new Set((await db.select({ pid: messages.prospectId }).from(messages).where(and(eq(messages.campaignId, campaignId), eq(messages.status, "approved")))).map((r) => r.pid));
  return rows.filter(({ cp, p }) => approved.has(p.id) && !!p.emailKey && !p.doNotContact && !CLOSED_STATUSES.includes(cp.status as CpStatus)).map(({ cp, p }) => ({ cpId: cp.id, name: p.name, email: p.email!, status: cp.status }));
}
