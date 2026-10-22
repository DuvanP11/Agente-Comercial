import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { DEFAULT_TEMPLATE } from "../campaigns";
import type { Db } from "../db/client";
import { activities, campaignProspects, campaigns, evidence, prospects } from "../db/schema";
import { prepareApproach, type Approach } from "../skills/approach";
import type { StoredScore } from "./analysis";
import { addProspects, createCampaign } from "./campaigns";
import { assertProspectAccess, campaignVisible, prospectVisible, visibleProspectIds, type Viewer } from "./scope";

/**
 * Prospectos listos para abordar: sin "No contactar", sin duplicado pendiente y que no estén ya
 * en una campaña activa. Primero los calificados y los de mayor prioridad.
 */
export async function captarCandidates(db: Db, orgId: string, viewer?: Viewer) {
  const busy = new Set((await db.select({ pid: campaignProspects.prospectId }).from(campaignProspects)
    .innerJoin(campaigns, eq(campaigns.id, campaignProspects.campaignId))
    .where(and(eq(campaignProspects.orgId, orgId), eq(campaigns.status, "active")))).map((r) => r.pid));
  const rows = await db.select().from(prospects).where(and(
    eq(prospects.orgId, orgId), eq(prospects.doNotContact, false), inArray(prospects.status, ["new", "qualified"]), prospectVisible(viewer),
  )).orderBy(desc(prospects.createdAt)).limit(500);
  return rows
    .filter((p) => !busy.has(p.id))
    .map((p) => ({ p, score: p.scoreJson as StoredScore | null }))
    .sort((a, b) => {
      const q = Number(b.p.status === "qualified") - Number(a.p.status === "qualified");
      if (q) return q;
      const pr = (b.score?.priority ?? -1) - (a.score?.priority ?? -1);
      if (pr) return pr;
      return Number(!!b.p.phoneKey) - Number(!!a.p.phoneKey);
    });
}

export interface StartInput { prospectIds: string[]; campaignId?: string; newName?: string }

/** Lleva los prospectos elegidos a una campaña existente o a una nueva con el mensaje base. */
export async function startCaptation(db: Db, orgId: string, input: StartInput, actor: string, viewer?: Viewer) {
  if (!input.prospectIds.length) throw new Error("Marca al menos un prospecto.");
  if (viewer) input = { ...input, prospectIds: await visibleProspectIds(db, orgId, viewer, input.prospectIds) }; // el Hunter solo lleva prospectos suyos
  if (!input.prospectIds.length) throw new Error("Marca al menos un prospecto.");
  let campaignId = input.campaignId;
  if (campaignId) {
    const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId), campaignVisible(viewer)));
    if (!c || c.status === "closed") throw new Error("La campaña elegida no existe o está cerrada.");
  } else {
    const name = (input.newName ?? "").trim();
    if (name.length < 3) throw new Error("Ponle un nombre a la campaña nueva (mínimo 3 caracteres) o elige una existente.");
    campaignId = (await createCampaign(db, orgId, { name, objective: "Captación", template: DEFAULT_TEMPLATE }, actor, viewer?.id)).id;
  }
  const r = await addProspects(db, orgId, campaignId, input.prospectIds, actor, viewer);
  return { campaignId, added: r.added, skipped: r.skipped };
}

/** Plan de acercamiento: junta los datos reales del prospecto y aplica las reglas de las skills. */
export async function approachFor(db: Db, orgId: string, prospectId: string, viewer?: Viewer) {
  if (viewer) await assertProspectAccess(db, orgId, viewer, prospectId);
  const [p] = await db.select().from(prospects).where(and(eq(prospects.id, prospectId), eq(prospects.orgId, orgId)));
  if (!p) throw new Error("Prospecto no encontrado.");
  const [ev, acts] = await Promise.all([
    db.select().from(evidence).where(eq(evidence.entityId, prospectId)),
    db.select().from(activities).where(and(eq(activities.prospectId, prospectId), inArray(activities.type, ["campaign_status", "whatsapp_opened"]))).orderBy(asc(activities.createdAt)),
  ]);
  const s = p.scoreJson as StoredScore | null;
  const approach: Approach = prepareApproach({
    name: p.name, category: p.category, city: p.city, phone: p.phone, website: p.website, email: p.email, address: p.address,
    score: s ? { priority: s.priority, coverage: s.coverage, unknownCriteria: s.unknownCriteria } : null,
    evidence: ev.map((e) => ({ field: e.field, observedValue: e.observedValue, sourceName: e.sourceName, verification: e.verification })),
    history: acts.map((a) => ({ type: a.type, to: (a.detail as { to?: string } | null)?.to, at: a.createdAt })),
    doNotContact: p.doNotContact, status: p.status,
  });
  return { prospect: p, score: s, approach };
}
