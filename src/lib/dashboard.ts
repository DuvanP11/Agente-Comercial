import type { CpStatus } from "./campaigns";
import type { MarketRow } from "./market";

const DAY = 86_400_000;

/** Cuenta fechas por semana: la última semana termina en `now`. Devuelve de la más antigua a la más reciente. */
export function weekBuckets(dates: Date[], now: Date, weeks = 12): { start: Date; count: number }[] {
  const out = Array.from({ length: weeks }, (_, i) => ({ start: new Date(now.getTime() - (weeks - i) * 7 * DAY + DAY), count: 0 }));
  for (const d of dates) {
    const age = Math.floor((now.getTime() - d.getTime()) / (7 * DAY));
    if (age >= 0 && age < weeks) out[weeks - 1 - age].count++;
  }
  return out;
}

export const PRIORITY_BANDS = ["0–19", "20–39", "40–59", "60–79", "80–100"] as const;
/** Histograma de prioridad; «sin prioridad» = información insuficiente (no es una prioridad baja). */
export function priorityHistogram(priorities: (number | null)[]) {
  const bands = [0, 0, 0, 0, 0]; let none = 0;
  for (const p of priorities) { if (p === null) none++; else bands[Math.min(4, Math.floor(Math.max(0, p) / 20))]++; }
  return { bands, none };
}

const AT_LEAST: Record<string, CpStatus[]> = {
  contacted: ["contacted", "replied", "meeting", "proposal", "won", "lost", "not_interested"],
  replied: ["replied", "meeting", "proposal", "won"],
  meeting: ["meeting", "proposal", "won"],
  proposal: ["proposal", "won"],
  won: ["won"],
};

/** Embudo acumulado: cada etapa cuenta a quien llegó a ella o más lejos. Todo sale de datos persistidos. */
export function funnel(rows: MarketRow[]): { label: string; value: number }[] {
  const inStage = (k: keyof typeof AT_LEAST) => rows.filter((r) => r.cpStatus && AT_LEAST[k].includes(r.cpStatus)).length;
  return [
    { label: "Prospectos descubiertos", value: rows.length },
    { label: "Con algún dato de contacto", value: rows.filter((r) => r.hasPhone || r.hasEmail || r.hasWeb).length },
    { label: "Calificados", value: rows.filter((r) => r.status === "qualified").length },
    { label: "En una campaña", value: rows.filter((r) => r.cpStatus !== null).length },
    { label: "Contactados", value: inStage("contacted") },
    { label: "Respondieron", value: inStage("replied") },
    { label: "Reunión agendada", value: inStage("meeting") },
    { label: "Propuesta enviada", value: inStage("proposal") },
    { label: "Ganados", value: inStage("won") },
  ];
}
