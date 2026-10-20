import { and, count, eq, gte, lte, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, auditLog, goals, prospects } from "../db/schema";
import { computeProgress, goalInput, GOAL_METRICS, periodBounds, type GoalMetric } from "../goals";

export async function createGoal(db: Db, orgId: string, raw: unknown, actor: string) {
  const parsed = goalInput.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const g = parsed.data;
  const { from, to } = periodBounds(g.periodStart, g.periodEnd);
  const [row] = await db.insert(goals).values({
    orgId, metric: g.metric, target: String(g.target), periodStart: from, periodEnd: to,
  }).returning();
  await db.insert(auditLog).values({ orgId, actor, action: "goal.create", entity: row.id, detail: g });
  return row;
}

export async function deleteGoal(db: Db, orgId: string, id: string, actor: string) {
  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.orgId, orgId)));
  await db.insert(auditLog).values({ orgId, actor, action: "goal.delete", entity: id });
}

/** Valor real de una métrica en un periodo; null si no existe fuente de datos. */
export async function actualFor(db: Db, orgId: string, metric: GoalMetric, from: Date, to: Date): Promise<number | null> {
  if (!GOAL_METRICS[metric].hasSource) return null;
  const n = async (q: Promise<{ c: number }[]>) => (await q)[0]?.c ?? 0;
  if (metric === "leads") {
    return n(db.select({ c: count() }).from(prospects).where(and(
      eq(prospects.orgId, orgId), eq(prospects.isDemo, false), ne(prospects.status, "excluded_duplicate"),
      gte(prospects.createdAt, from), lte(prospects.createdAt, to))));
  }
  if (metric === "qualified") {
    return n(db.select({ c: sql<number>`count(distinct ${auditLog.entity})`.mapWith(Number) }).from(auditLog).where(and(
      eq(auditLog.orgId, orgId), eq(auditLog.action, "prospect.qualified"),
      gte(auditLog.createdAt, from), lte(auditLog.createdAt, to))));
  }
  return n(db.select({ c: sql<number>`count(distinct ${activities.prospectId})`.mapWith(Number) }).from(activities).where(and(
    eq(activities.orgId, orgId), sql`${activities.type} in ('whatsapp_opened','email_sent')`,
    gte(activities.createdAt, from), lte(activities.createdAt, to))));
}

export async function listGoalsWithProgress(db: Db, orgId: string) {
  const rows = await db.select().from(goals).where(eq(goals.orgId, orgId)).orderBy(goals.periodStart);
  return Promise.all(rows.map(async (g) => {
    const metric = g.metric as GoalMetric;
    const actual = await actualFor(db, orgId, metric, g.periodStart, g.periodEnd);
    return { ...g, progress: computeProgress(Number(g.target), actual) };
  }));
}
