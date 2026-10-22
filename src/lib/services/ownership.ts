import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditLog, prospects, users } from "../db/schema";

/** Cambia el responsable de un prospecto (null = sin asignar). Solo para quienes ven todo; la regla de rol se valida en la acción. */
export async function assignOwner(db: Db, orgId: string, actor: string, prospectId: string, ownerId: string | null) {
  if (ownerId) {
    const [u] = await db.select({ id: users.id, active: users.active }).from(users).where(and(eq(users.id, ownerId), eq(users.orgId, orgId)));
    if (!u || !u.active) throw new Error("Esa persona no existe o está desactivada.");
  }
  const changed = await db.update(prospects).set({ ownerId }).where(and(eq(prospects.id, prospectId), eq(prospects.orgId, orgId))).returning({ id: prospects.id });
  if (!changed.length) throw new Error("Prospecto no encontrado.");
  await db.insert(auditLog).values({ orgId, actor, action: "prospect.assign_owner", entity: prospectId, detail: { ownerId } });
}

/** Asigna a una persona todos los prospectos que no tienen responsable (los que existían antes de separar por usuario). */
export async function assignUnowned(db: Db, orgId: string, actor: string, ownerId: string): Promise<number> {
  const [u] = await db.select({ id: users.id, active: users.active }).from(users).where(and(eq(users.id, ownerId), eq(users.orgId, orgId)));
  if (!u || !u.active) throw new Error("Esa persona no existe o está desactivada.");
  const rows = await db.update(prospects).set({ ownerId }).where(and(eq(prospects.orgId, orgId), isNull(prospects.ownerId))).returning({ id: prospects.id });
  await db.insert(auditLog).values({ orgId, actor, action: "prospect.assign_unowned", entity: orgId, detail: { ownerId, count: rows.length } });
  return rows.length;
}
