import { and, eq, isNotNull, sql } from "drizzle-orm";
import { normalizePhone } from "../dedup/normalize";
import type { Db } from "../db/client";
import { clients, prospects } from "../db/schema";

/**
 * Recalcula la clave de teléfono de registros que quedaron con la clave vacía aunque tienen teléfono
 * (p. ej. guardados cuando un campo con dos números separados por «;» se rechazaba).
 * Solo toca claves vacías; es idempotente y no cambia ningún otro dato.
 */
export async function backfillPhoneKeys(db: Db): Promise<{ prospects: number; clients: number }> {
  let p = 0, c = 0;
  for (const r of await db.select({ id: prospects.id, phone: prospects.phone }).from(prospects).where(and(isNotNull(prospects.phone), eq(prospects.phoneKey, "")))) {
    const key = normalizePhone(r.phone);
    if (key) { await db.update(prospects).set({ phoneKey: key }).where(eq(prospects.id, r.id)); p++; }
  }
  for (const r of await db.select({ id: clients.id, phone: clients.phone }).from(clients).where(and(isNotNull(clients.phone), eq(clients.phoneKey, sql`''`)))) {
    const key = normalizePhone(r.phone);
    if (key) { await db.update(clients).set({ phoneKey: key }).where(eq(clients.id, r.id)); c++; }
  }
  return { prospects: p, clients: c };
}
