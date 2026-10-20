import { z } from "zod";

/** `hasSource` = existe un dato real del que calcular el avance. Sin fuente, el avance NO se inventa. */
export const GOAL_METRICS = {
  leads: { label: "Prospectos nuevos (sin duplicados ni demo)", hasSource: true },
  qualified: { label: "Prospectos calificados", hasSource: true },
  contacts: { label: "Contactos iniciados (WhatsApp abierto / correo enviado)", hasSource: true },
  meetings: { label: "Reuniones agendadas (desde campañas)", hasSource: true },
  proposals: { label: "Propuestas enviadas (desde campañas)", hasSource: true },
  new_clients: { label: "Clientes nuevos (ganados en campañas)", hasSource: true },
  revenue: { label: "Facturación", hasSource: false },
  margin: { label: "Margen", hasSource: false },
} as const;
export type GoalMetric = keyof typeof GOAL_METRICS;

const metricKeys = Object.keys(GOAL_METRICS) as [GoalMetric, ...GoalMetric[]];

export const goalInput = z.object({
  metric: z.enum(metricKeys),
  target: z.coerce.number().positive("La meta debe ser mayor que 0."),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de inicio inválida."),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de fin inválida."),
}).refine((g) => g.periodEnd >= g.periodStart, { message: "El fin del periodo no puede ser anterior al inicio.", path: ["periodEnd"] });

/** Límites del periodo en hora de Colombia (UTC-5, sin horario de verano). */
export function periodBounds(start: string, end: string) {
  return { from: new Date(`${start}T00:00:00-05:00`), to: new Date(`${end}T23:59:59.999-05:00`) };
}

export interface Progress { actual: number | null; pct: number | null; note?: string }

export function computeProgress(target: number, actual: number | null): Progress {
  if (actual === null) return { actual: null, pct: null, note: "No disponible: este dato aún no se registra en el sistema." };
  return { actual, pct: target > 0 ? Math.round((actual / target) * 100) : null };
}
