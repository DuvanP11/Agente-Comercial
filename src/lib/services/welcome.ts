import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { campaignProspects, campaigns, prospects } from "../db/schema";
import { seesAllData } from "../permissions";
import { followUpState } from "../campaigns";
import type { CpStatus } from "../campaigns";

export interface WelcomeStats { scope: "all" | "own"; total: number; toContact: number; followToday: number; followOverdue: number; campaigns: number }

/** Cifras de la bienvenida. El Hunter ve solo lo suyo; los demás roles, todo. */
export async function welcomeStats(db: Db, orgId: string, user: { id: string; role: string }): Promise<WelcomeStats> {
  const all = seesAllData(user.role);
  const mineP = all ? undefined : eq(prospects.id, prospects.id); // se afina con el propietario (Fase de datos por usuario)
  void mineP;
  const rows = await db.select({ outcome: prospects.contactOutcome, attempts: prospects.contactAttempts, status: prospects.status, phone: prospects.phoneKey, email: prospects.emailKey, domain: prospects.domainKey })
    .from(prospects).where(and(eq(prospects.orgId, orgId), ne(prospects.status, "excluded_duplicate")));
  const total = rows.length;
  const toContact = rows.filter((r) => r.outcome === "pending" && r.attempts === 0 && (r.phone || r.email || r.domain)).length;
  const fus = await db.select({ status: campaignProspects.status, next: campaignProspects.nextFollowUpAt }).from(campaignProspects).where(and(eq(campaignProspects.orgId, orgId), isNotNull(campaignProspects.nextFollowUpAt)));
  const now = new Date();
  const states = fus.map((f) => followUpState(f.status as CpStatus, f.next, now));
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(campaigns).where(and(eq(campaigns.orgId, orgId), eq(campaigns.status, "active")));
  return { scope: all ? "all" : "own", total, toContact, followToday: states.filter((s) => s === "today" || s === "overdue").length, followOverdue: states.filter((s) => s === "overdue").length, campaigns: c?.n ?? 0 };
}
