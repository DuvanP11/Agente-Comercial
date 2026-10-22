import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { campaigns, prospects } from "../db/schema";
import { seesAllData } from "../permissions";

/** Quién mira. El Hunter solo ve lo que es suyo; los demás roles ven todo. */
export interface Viewer { id: string; seesAll: boolean }
export const viewerOf = (u: { id: string; role: string }): Viewer => ({ id: u.id, seesAll: seesAllData(u.role) });

/** Condición para listas de prospectos (undefined = sin restricción). */
export const prospectVisible = (v?: Viewer) => (v && !v.seesAll ? eq(prospects.ownerId, v.id) : undefined);
export const campaignVisible = (v?: Viewer) => (v && !v.seesAll ? eq(campaigns.ownerId, v.id) : undefined);

/** Lanza «no encontrado» (sin revelar que existe) si el prospecto es de otra persona y quien mira es Hunter. */
export async function assertProspectAccess(db: Db, orgId: string, v: Viewer, prospectId: string) {
  if (v.seesAll) return;
  const [p] = await db.select({ id: prospects.id }).from(prospects).where(and(eq(prospects.id, prospectId), eq(prospects.orgId, orgId), eq(prospects.ownerId, v.id)));
  if (!p) throw new Error("Prospecto no encontrado.");
}

export async function assertCampaignAccess(db: Db, orgId: string, v: Viewer, campaignId: string) {
  if (v.seesAll) return;
  const [c] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId), eq(campaigns.ownerId, v.id)));
  if (!c) throw new Error("Campaña no encontrada.");
}

/** De una lista de ids, solo los que esa persona puede ver. */
export async function visibleProspectIds(db: Db, orgId: string, v: Viewer, ids: string[]): Promise<string[]> {
  if (v.seesAll || !ids.length) return ids;
  const rows = await db.select({ id: prospects.id }).from(prospects).where(and(eq(prospects.orgId, orgId), eq(prospects.ownerId, v.id), inArray(prospects.id, ids)));
  return rows.map((r) => r.id);
}
