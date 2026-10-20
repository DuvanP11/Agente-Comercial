import { and, eq, gte } from "drizzle-orm";
import type { CpStatus } from "../campaigns";
import type { Db } from "../db/client";
import { campaignProspects, prospects, searches } from "../db/schema";
import type { MarketRow, SearchRow } from "../market";
import type { StoredScore } from "./analysis";

/** Si un prospecto está en varias campañas se toma su etapa más avanzada. */
const RANK: Record<CpStatus, number> = {
  pending: 0, do_not_contact: 1, not_interested: 2, lost: 2, contacted: 2, replied: 3, meeting: 4, proposal: 5, won: 6,
};

export async function loadMarket(db: Db, orgId: string, opts: { since: Date | null; includeDemo: boolean }) {
  const pRows = await db.select().from(prospects).where(and(eq(prospects.orgId, orgId), ...(opts.since ? [gte(prospects.createdAt, opts.since)] : [])));
  const cps = await db.select({ pid: campaignProspects.prospectId, status: campaignProspects.status }).from(campaignProspects).where(eq(campaignProspects.orgId, orgId));
  const best = new Map<string, CpStatus>();
  for (const c of cps) {
    const s = c.status as CpStatus;
    const cur = best.get(c.pid);
    if (!cur || RANK[s] > RANK[cur]) best.set(c.pid, s);
  }
  const all = pRows.filter((p) => p.status !== "excluded_duplicate"); // un duplicado excluido no es un prospecto adicional
  const demoCount = all.filter((p) => p.isDemo).length;
  const rows: MarketRow[] = all.filter((p) => opts.includeDemo || !p.isDemo).map((p) => ({
    id: p.id, category: p.category, name: p.name, city: p.city, sourceName: p.sourceName, isDemo: p.isDemo, status: p.status,
    hasPhone: !!p.phoneKey, hasWeb: !!p.domainKey, hasEmail: !!p.emailKey, hasAddress: !!p.address?.trim(),
    priority: (p.scoreJson as StoredScore | null)?.priority ?? null,
    cpStatus: best.get(p.id) ?? null,
  }));
  const sRows = await db.select({ connector: searches.connector, status: searches.status, error: searches.error, resultCount: searches.resultCount, costUsd: searches.costUsd })
    .from(searches).where(and(eq(searches.orgId, orgId), ...(opts.since ? [gte(searches.createdAt, opts.since)] : [])));
  const excludedDuplicates = pRows.filter((p) => p.status === "excluded_duplicate").length;
  return { rows, searches: sRows as SearchRow[], demoCount, excludedDuplicates };
}
