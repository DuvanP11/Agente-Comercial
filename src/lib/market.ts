import type { CpStatus } from "./campaigns";
import { detectSector, SECTOR_LABEL } from "./skills/approach";

/** Agregados de investigación de mercado. Todo es conteo y porcentaje sobre datos persistidos: nada predictivo. */
export interface MarketRow {
  id: string; category: string | null; name: string; city: string | null; sourceName: string; isDemo: boolean; status: string;
  hasPhone: boolean; hasWeb: boolean; hasEmail: boolean; hasAddress: boolean;
  priority: number | null;
  /** Estado actual en la campaña donde está (null si no está en ninguna). */
  cpStatus: CpStatus | null;
}

const CONTACTED: CpStatus[] = ["contacted", "replied", "meeting", "proposal", "won", "lost", "not_interested"];
const MEETING: CpStatus[] = ["meeting", "proposal", "won"];

/** Por debajo de este tamaño, un porcentaje dice muy poco. */
export const SMALL_SAMPLE = 10;

export interface GroupStats {
  key: string; label: string; total: number; qualified: number;
  withPhone: number; withWeb: number; withEmail: number;
  inCampaign: number; contacted: number; meetings: number; won: number;
  avgPriority: number | null; smallSample: boolean;
}

export function rate(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

export function groupRows(rows: MarketRow[], keyOf: (r: MarketRow) => { key: string; label: string }): GroupStats[] {
  const map = new Map<string, { label: string; rows: MarketRow[] }>();
  for (const r of rows) {
    const { key, label } = keyOf(r);
    const g = map.get(key) ?? { label, rows: [] };
    g.rows.push(r); map.set(key, g);
  }
  return [...map.entries()].map(([key, { label, rows: rs }]) => {
    const pr = rs.map((r) => r.priority).filter((x): x is number => x !== null);
    return {
      key, label, total: rs.length,
      qualified: rs.filter((r) => r.status === "qualified").length,
      withPhone: rs.filter((r) => r.hasPhone).length, withWeb: rs.filter((r) => r.hasWeb).length, withEmail: rs.filter((r) => r.hasEmail).length,
      inCampaign: rs.filter((r) => r.cpStatus !== null).length,
      contacted: rs.filter((r) => r.cpStatus && CONTACTED.includes(r.cpStatus)).length,
      meetings: rs.filter((r) => r.cpStatus && MEETING.includes(r.cpStatus)).length,
      won: rs.filter((r) => r.cpStatus === "won").length,
      avgPriority: pr.length ? Math.round(pr.reduce((a, b) => a + b, 0) / pr.length) : null,
      smallSample: rs.length < SMALL_SAMPLE,
    };
  }).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export const bySector = (rows: MarketRow[]) => groupRows(rows, (r) => { const s = detectSector(r.category, r.name); return { key: s, label: SECTOR_LABEL[s] }; });
export const byCity = (rows: MarketRow[]) => groupRows(rows, (r) => { const c = (r.city ?? "").trim(); return { key: c.toLowerCase() || "—", label: c || "Sin ciudad" }; });
export const bySource = (rows: MarketRow[]) => groupRows(rows, (r) => ({ key: r.sourceName, label: r.sourceName }));
export const byCategory = (rows: MarketRow[]) => groupRows(rows, (r) => { const c = (r.category ?? "").trim(); return { key: c.toLowerCase() || "—", label: c || "Sin rubro" }; });

export interface Quality { total: number; phone: number | null; web: number | null; email: number | null; address: number | null }
export function quality(rows: MarketRow[]): Quality {
  const t = rows.length;
  return {
    total: t, phone: rate(rows.filter((r) => r.hasPhone).length, t), web: rate(rows.filter((r) => r.hasWeb).length, t),
    email: rate(rows.filter((r) => r.hasEmail).length, t), address: rate(rows.filter((r) => r.hasAddress).length, t),
  };
}

export interface SearchRow { connector: string; status: string; error: string | null; resultCount: number; costUsd: string | null }
export interface SearchHealth { connector: string; total: number; completed: number; failed: number; withWarnings: number; avgStored: number | null; costUsd: number | null }

/** Salud de las búsquedas por fuente. El costo solo se suma si hay datos; si no, queda null (no disponible), no 0. */
export function searchHealth(rows: SearchRow[]): SearchHealth[] {
  const by = new Map<string, SearchRow[]>();
  for (const r of rows) by.set(r.connector, [...(by.get(r.connector) ?? []), r]);
  return [...by.entries()].map(([connector, rs]) => {
    const done = rs.filter((r) => r.status === "completed");
    const costs = rs.map((r) => r.costUsd).filter((c): c is string => c !== null).map(Number).filter((n) => !Number.isNaN(n));
    return {
      connector, total: rs.length, completed: done.length, failed: rs.filter((r) => r.status === "failed").length,
      withWarnings: done.filter((r) => !!r.error).length,
      avgStored: done.length ? Math.round((done.reduce((a, r) => a + r.resultCount, 0) / done.length) * 10) / 10 : null,
      costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    };
  }).sort((a, b) => b.total - a.total);
}

export function sinceDate(days: string | undefined, now = new Date()): Date | null {
  const n = Number(days);
  if (!days || days === "all" || !Number.isFinite(n) || n <= 0 || n > 3650) return null;
  return new Date(now.getTime() - n * 86_400_000);
}
