import { logError } from "../log";
import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activityLog } from "../db/schema";
import { cleanText, type Kind } from "../activity";

export interface ActivityEntry {
  kind: Kind; label: string; path?: string | null; detail?: Record<string, unknown> | null;
  user?: { id: string; name: string; email: string; role: string } | null; ip?: string | null; userAgent?: string | null;
}

/** Guarda una línea del registro. NUNCA lanza: si la base falla, la persona sigue trabajando. */
export async function logActivity(db: Db, orgId: string, e: ActivityEntry): Promise<void> {
  try {
    await db.insert(activityLog).values({
      orgId, userId: e.user?.id ?? null, userName: e.user?.name ?? null, userEmail: e.user?.email ?? null, role: e.user?.role ?? null,
      kind: e.kind, path: e.path ?? null, label: cleanText(e.label, 200) || e.kind, detail: e.detail ?? null,
      ip: cleanText(e.ip, 64) || null, userAgent: cleanText(e.userAgent, 160) || null,
    });
  } catch (err) { logError("logActivity falló:", err instanceof Error ? err.message : "error"); }
}

export interface ActivityFilter { userId?: string; kind?: string; q?: string; from?: Date; to?: Date; limit?: number }

export async function listActivity(db: Db, orgId: string, f: ActivityFilter = {}) {
  const conds = [eq(activityLog.orgId, orgId)];
  if (f.userId) conds.push(eq(activityLog.userId, f.userId));
  if (f.kind) conds.push(eq(activityLog.kind, f.kind));
  if (f.from) conds.push(gte(activityLog.createdAt, f.from));
  if (f.to) conds.push(lte(activityLog.createdAt, f.to));
  if (f.q?.trim()) { const q = `%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`; conds.push(sql`(${activityLog.label} ilike ${q} or ${activityLog.path} ilike ${q} or ${activityLog.userName} ilike ${q} or ${activityLog.userEmail} ilike ${q})`); }
  return db.select().from(activityLog).where(and(...conds)).orderBy(desc(activityLog.createdAt)).limit(Math.min(f.limit ?? 200, 5000));
}

/** Resumen de los últimos `days` días para el tablero. */
export async function activityStats(db: Db, orgId: string, days = 14, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.select({ at: activityLog.createdAt, kind: activityLog.kind, userId: activityLog.userId, userName: activityLog.userName, path: activityLog.path }).from(activityLog)
    .where(and(eq(activityLog.orgId, orgId), gte(activityLog.createdAt, since))).orderBy(desc(activityLog.createdAt)).limit(20000);
  return rows;
}
