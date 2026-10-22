import { ensureDefaultOrg, getDb } from "./db/client";
import { requireUser } from "./session";
import { assertCampaignAccess, assertProspectAccess, viewerOf, visibleProspectIds } from "./services/scope";

/** Para acciones del servidor: la persona de la sesión debe poder ver ese prospecto (el Hunter solo los suyos). Lanza «no encontrado» si no. */
export async function guardProspect(prospectId: string) {
  const me = await requireUser();
  const db = await getDb();
  await assertProspectAccess(db, await ensureDefaultOrg(db), viewerOf(me), prospectId);
  return me;
}

export async function guardCampaign(campaignId: string) {
  const me = await requireUser();
  const db = await getDb();
  await assertCampaignAccess(db, await ensureDefaultOrg(db), viewerOf(me), campaignId);
  return me;
}

/** De una lista de ids de prospectos, solo los que la persona puede ver. */
export async function onlyMine(ids: string[]) {
  const me = await requireUser();
  const db = await getDb();
  return visibleProspectIds(db, await ensureDefaultOrg(db), viewerOf(me), ids);
}

/** Para rutas de API: ¿la sesión actual puede ver esta campaña? (sin lanzar). */
export async function campaignAccessible(campaignId: string): Promise<boolean> {
  try { await guardCampaign(campaignId); return true; } catch { return false; }
}
