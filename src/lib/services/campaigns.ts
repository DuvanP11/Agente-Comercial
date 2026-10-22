import { and, desc, eq, getTableColumns, gte, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizePhone } from "../dedup/normalize";
import { whatsappLink } from "../contact-links";
import {
  approvalBlockers, CLOSED_STATUSES, CP_STATUS_KEYS, followUpFromDate, followUpState, funnel, renderTemplate,
  type CpStatus,
} from "../campaigns";
import type { Db } from "../db/client";
import { assertCampaignAccess, campaignVisible, prospectVisible, type Viewer } from "./scope";
import { assertCanContact, registerAttempt, syncOutcomeFromCampaign } from "./contact-tracking";
import { activities, auditLog, campaignProspects, campaigns, messages, prospects } from "../db/schema";

const campaignInput = z.object({
  name: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres.").max(80),
  objective: z.string().trim().max(500).optional(),
  valueProposition: z.string().trim().max(1000).optional(),
  template: z.string().trim().min(10, "La plantilla del mensaje es muy corta.").max(1500),
});

export async function createCampaign(db: Db, orgId: string, raw: unknown, actor: string, ownerId?: string) {
  const parsed = campaignInput.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const v = parsed.data;
  const [c] = await db.insert(campaigns).values({
    orgId, name: v.name, objective: v.objective || null, valueProposition: v.valueProposition || null, template: v.template, ownerId: ownerId ?? null,
  }).returning();
  await db.insert(auditLog).values({ orgId, actor, action: "campaign.create", entity: c.id });
  return c;
}

/** Sin la portada (base64 pesado): para saber si hay se usa `hasCover`. */
const { coverData: _cd, coverMime: _cm, ...LIST_COLS } = getTableColumns(campaigns);

const updateInput = campaignInput.partial();

/** Edita los textos de la campaña. Los mensajes ya generados no cambian solos: se vuelven a generar desde la plantilla. */
export async function updateCampaign(db: Db, orgId: string, id: string, raw: unknown, actor: string) {
  const c = await loadCampaign(db, orgId, id);
  if (c.status === "closed") throw new Error("La campaña está cerrada.");
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const v = parsed.data;
  await db.update(campaigns).set({
    ...(v.name !== undefined ? { name: v.name } : {}), ...(v.template !== undefined ? { template: v.template } : {}),
    ...(v.objective !== undefined ? { objective: v.objective || null } : {}), ...(v.valueProposition !== undefined ? { valueProposition: v.valueProposition || null } : {}),
  }).where(eq(campaigns.id, id));
  await db.insert(auditLog).values({ orgId, actor, action: "campaign.update", entity: id });
}

export async function listCampaigns(db: Db, orgId: string, viewer?: Viewer) {
  const rows = await db.select({ ...LIST_COLS, coverLen: sql<number>`coalesce(length(${campaigns.coverData}), 0)::int` }).from(campaigns).where(and(eq(campaigns.orgId, orgId), campaignVisible(viewer))).orderBy(desc(campaigns.createdAt));
  const cps = rows.length
    ? await db.select({ campaignId: campaignProspects.campaignId, status: campaignProspects.status }).from(campaignProspects).where(eq(campaignProspects.orgId, orgId))
    : [];
  return rows.map((c) => ({ ...c, funnel: funnel(cps.filter((x) => x.campaignId === c.id).map((x) => x.status as CpStatus)), total: cps.filter((x) => x.campaignId === c.id).length }));
}

async function loadCampaign(db: Db, orgId: string, id: string) {
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId)));
  if (!c) throw new Error("Campaña no encontrada.");
  return c;
}

/** Prospectos que se pueden sumar: sin duplicado pendiente, no archivados, sin "no contactar" y que no estén ya en la campaña. */
export async function eligibleProspects(db: Db, orgId: string, campaignId: string, viewer?: Viewer) {
  const inCampaign = (await db.select({ id: campaignProspects.prospectId }).from(campaignProspects).where(eq(campaignProspects.campaignId, campaignId))).map((r) => r.id);
  const rows = await db.select().from(prospects).where(and(
    eq(prospects.orgId, orgId), eq(prospects.doNotContact, false), prospectVisible(viewer),
    notInArray(prospects.status, ["excluded_duplicate", "needs_review", "archived"]),
  )).orderBy(desc(prospects.createdAt)).limit(500);
  return rows.filter((p) => !inCampaign.includes(p.id));
}

export async function addProspects(db: Db, orgId: string, campaignId: string, prospectIds: string[], actor: string, viewer?: Viewer) {
  if (viewer) await assertCampaignAccess(db, orgId, viewer, campaignId);
  const c = await loadCampaign(db, orgId, campaignId);
  if (c.status === "closed") throw new Error("La campaña está cerrada.");
  const eligible = new Map((await eligibleProspects(db, orgId, campaignId, viewer)).map((p) => [p.id, p]));
  const added: string[] = [], skipped: { id: string; reason: string }[] = [];
  for (const pid of [...new Set(prospectIds)]) {
    if (eligible.has(pid)) added.push(pid);
    else skipped.push({ id: pid, reason: "No elegible: ya está en la campaña, tiene un duplicado sin resolver, está archivado o pidió no ser contactado." });
  }
  if (added.length) await db.insert(campaignProspects).values(added.map((prospectId) => ({ orgId, campaignId, prospectId }))).onConflictDoNothing();
  await db.insert(auditLog).values({ orgId, actor, action: "campaign.add_prospects", entity: campaignId, detail: { added: added.length, skipped: skipped.length } });
  return { added: added.length, skipped };
}

export async function campaignDetail(db: Db, orgId: string, campaignId: string, viewer?: Viewer) {
  if (viewer) await assertCampaignAccess(db, orgId, viewer, campaignId);
  const c = await loadCampaign(db, orgId, campaignId);
  const rows = await db.select({ cp: campaignProspects, p: prospects }).from(campaignProspects)
    .innerJoin(prospects, eq(prospects.id, campaignProspects.prospectId))
    .where(and(eq(campaignProspects.campaignId, campaignId), eq(campaignProspects.orgId, orgId))).orderBy(campaignProspects.createdAt);
  const msgs = rows.length ? await db.select().from(messages).where(and(eq(messages.campaignId, campaignId), inArray(messages.status, ["draft", "approved"]))) : [];
  const opens = rows.length ? await db.select({ pid: activities.prospectId, at: activities.createdAt }).from(activities)
    .where(and(eq(activities.orgId, orgId), eq(activities.type, "whatsapp_opened"), sql`${activities.detail}->>'campaignId' = ${campaignId}`)) : [];
  const now = new Date();
  const items = rows.map(({ cp, p }) => ({
    cp, p,
    message: msgs.find((m) => m.prospectId === p.id) ?? null,
    opens: opens.filter((o) => o.pid === p.id).length,
    followUp: followUpState(cp.status as CpStatus, cp.nextFollowUpAt, now),
  }));
  return { campaign: c, items, funnel: funnel(items.map((i) => i.cp.status as CpStatus)) };
}

export async function loadCp(db: Db, orgId: string, cpId: string) {
  const [row] = await db.select({ cp: campaignProspects, p: prospects, c: campaigns }).from(campaignProspects)
    .innerJoin(prospects, eq(prospects.id, campaignProspects.prospectId))
    .innerJoin(campaigns, eq(campaigns.id, campaignProspects.campaignId))
    .where(and(eq(campaignProspects.id, cpId), eq(campaignProspects.orgId, orgId)));
  if (!row) throw new Error("Registro de campaña no encontrado.");
  return row;
}

/** Quien pide no ser contactado queda bloqueado en TODAS las campañas y en WhatsApp. */
export async function setDoNotContact(db: Db, orgId: string, prospectId: string, flag: boolean, reason: string | null, actor: string) {
  const [p] = await db.select({ id: prospects.id }).from(prospects).where(and(eq(prospects.id, prospectId), eq(prospects.orgId, orgId)));
  if (!p) throw new Error("Prospecto no encontrado.");
  await db.update(prospects).set({
    doNotContact: flag, doNotContactReason: flag ? (reason?.trim() || "Solicitó no ser contactado") : null, doNotContactAt: flag ? new Date() : null,
  }).where(eq(prospects.id, prospectId));
  await db.insert(auditLog).values({ orgId, actor, action: flag ? "prospect.do_not_contact" : "prospect.do_not_contact_removed", entity: prospectId, detail: { reason } });
}

export async function setCpStatus(db: Db, orgId: string, cpId: string, status: string, actor: string) {
  if (!(CP_STATUS_KEYS as string[]).includes(status)) throw new Error("Estado no válido.");
  const to = status as CpStatus;
  const { cp, p } = await loadCp(db, orgId, cpId);
  if (p.doNotContact && to !== "do_not_contact" && to !== "lost" && to !== "not_interested") throw new Error("Este prospecto pidió no ser contactado.");
  const from = cp.status as CpStatus;
  if (from === to) return;
  const now = new Date();
  await db.update(campaignProspects).set({
    status: to,
    lastContactAt: to === "contacted" || to === "replied" ? now : cp.lastContactAt,
    nextFollowUpAt: CLOSED_STATUSES.includes(to) ? null : cp.nextFollowUpAt, // cerrado = sin seguimiento
  }).where(eq(campaignProspects.id, cpId));
  await db.insert(activities).values({ orgId, prospectId: p.id, type: "campaign_status", actor, detail: { campaignId: cp.campaignId, cpId, from, to } });
  await syncOutcomeFromCampaign(db, orgId, p.id, to);
  if (to === "do_not_contact") await setDoNotContact(db, orgId, p.id, true, "Solicitó no ser contactado (campaña)", actor);
}

export async function setFollowUp(db: Db, orgId: string, cpId: string, date: string, notes: string | null) {
  const { cp } = await loadCp(db, orgId, cpId);
  if (CLOSED_STATUSES.includes(cp.status as CpStatus)) throw new Error("La gestión está cerrada; no admite seguimiento.");
  const next = date ? followUpFromDate(date) : null;
  if (date && !next) throw new Error("Fecha de seguimiento inválida.");
  await db.update(campaignProspects).set({ nextFollowUpAt: next, notes: notes?.trim().slice(0, 1000) || cp.notes }).where(eq(campaignProspects.id, cpId));
}

/** Un solo mensaje vigente por prospecto y campaña. Editarlo retira la aprobación. */
export async function saveDraft(db: Db, orgId: string, cpId: string, body: string) {
  const { cp, p, c } = await loadCp(db, orgId, cpId);
  const text = body.trim().slice(0, 1500);
  const [current] = await db.select().from(messages).where(and(eq(messages.campaignId, cp.campaignId), eq(messages.prospectId, p.id), inArray(messages.status, ["draft", "approved"])));
  if (current) {
    await db.update(messages).set({ body: text, status: "draft", approvedBy: null, approvedAt: null }).where(eq(messages.id, current.id));
    return current.id;
  }
  const [m] = await db.insert(messages).values({ orgId, prospectId: p.id, campaignId: cp.campaignId, channel: c.channel, body: text, status: "draft" }).returning();
  return m.id;
}

export async function generateDraft(db: Db, orgId: string, cpId: string) {
  const { p, c } = await loadCp(db, orgId, cpId);
  const r = renderTemplate(c.template, { empresa: p.name, ciudad: p.city, categoria: p.category });
  await saveDraft(db, orgId, cpId, r.text);
  return r;
}

export async function approveMessage(db: Db, orgId: string, cpId: string, actor: string) {
  const { cp, p } = await loadCp(db, orgId, cpId);
  if (p.doNotContact) throw new Error("Este prospecto pidió no ser contactado.");
  const [m] = await db.select().from(messages).where(and(eq(messages.campaignId, cp.campaignId), eq(messages.prospectId, p.id), eq(messages.status, "draft")));
  if (!m) throw new Error("No hay un borrador por aprobar.");
  const blockers = approvalBlockers(m.body);
  if (blockers.length) throw new Error(blockers.join(" "));
  await db.update(messages).set({ status: "approved", approvedBy: actor, approvedAt: new Date() }).where(eq(messages.id, m.id));
  await db.insert(auditLog).values({ orgId, actor, action: "message.approved", entity: m.id });
}

const REPEAT_WINDOW_MS = 24 * 3600_000;

/**
 * Abre WhatsApp con el mensaje APROBADO. Registra "abierto", nunca "enviado".
 * Si ya se abrió en las últimas 24 h exige confirmación (prevención de contactos repetidos).
 */
export async function openWhatsApp(db: Db, orgId: string, cpId: string, actor: string, confirmRepeat = false): Promise<{ url?: string; repeatWarning?: string }> {
  const { cp, p, c } = await loadCp(db, orgId, cpId);
  if (c.status === "closed") throw new Error("La campaña está cerrada.");
  if (p.doNotContact) throw new Error("Este prospecto pidió no ser contactado.");
  if (CLOSED_STATUSES.includes(cp.status as CpStatus)) throw new Error("La gestión de este prospecto está cerrada.");
  await assertCanContact(db, orgId, p); // no interesado o intentos agotados
  const e164 = normalizePhone(p.phone);
  if (!e164) throw new Error("El prospecto no tiene un teléfono válido. Complétalo en su ficha.");
  const [m] = await db.select().from(messages).where(and(eq(messages.campaignId, cp.campaignId), eq(messages.prospectId, p.id), eq(messages.status, "approved")));
  if (!m) throw new Error("Primero debes aprobar el mensaje.");

  const since = new Date(Date.now() - REPEAT_WINDOW_MS);
  const [recent] = await db.select({ at: activities.createdAt }).from(activities).where(and(
    eq(activities.orgId, orgId), eq(activities.prospectId, p.id), eq(activities.type, "whatsapp_opened"), gte(activities.createdAt, since),
  )).orderBy(desc(activities.createdAt)).limit(1);
  if (recent && !confirmRepeat) {
    const h = Math.max(1, Math.round((Date.now() - recent.at.getTime()) / 3600_000));
    return { repeatWarning: `Ya abriste WhatsApp para este prospecto hace ${h} h. Confirma si quieres contactarlo de nuevo.` };
  }
  const url = whatsappLink(e164, m.body);
  if (!url) throw new Error("Número inválido para WhatsApp.");
  await db.insert(activities).values({ orgId, prospectId: p.id, type: "whatsapp_opened", actor, detail: { campaignId: cp.campaignId, cpId, messageId: m.id, note: "Se abrió el chat; el envío lo hace el usuario." } });
  await registerAttempt(db, orgId, p.id, { channel: "whatsapp", activity: false }, actor);
  return { url };
}

/** Seguimientos pendientes de todas las campañas activas, vencidos primero. */
export async function followUps(db: Db, orgId: string, viewer?: Viewer) {
  const rows = await db.select({ cp: campaignProspects, p: prospects, c: campaigns }).from(campaignProspects)
    .innerJoin(prospects, eq(prospects.id, campaignProspects.prospectId))
    .innerJoin(campaigns, eq(campaigns.id, campaignProspects.campaignId))
    .where(and(eq(campaignProspects.orgId, orgId), eq(campaigns.status, "active"), campaignVisible(viewer), sql`${campaignProspects.nextFollowUpAt} is not null`));
  const now = new Date();
  return rows
    .map((r) => ({ ...r, state: followUpState(r.cp.status as CpStatus, r.cp.nextFollowUpAt, now) }))
    .filter((r) => r.state === "overdue" || r.state === "today" || r.state === "upcoming")
    .sort((a, b) => a.cp.nextFollowUpAt!.getTime() - b.cp.nextFollowUpAt!.getTime());
}

export async function closeCampaign(db: Db, orgId: string, id: string, actor: string) {
  await loadCampaign(db, orgId, id);
  await db.update(campaigns).set({ status: "closed" }).where(eq(campaigns.id, id));
  await db.insert(auditLog).values({ orgId, actor, action: "campaign.close", entity: id });
}


