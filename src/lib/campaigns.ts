/** Lógica pura de campañas: estados, plantillas y seguimientos. Sin base de datos. */

export const CP_STATUSES = {
  pending: "Pendiente de contactar",
  contacted: "Contactado",
  replied: "Respondió",
  meeting: "Reunión agendada",
  proposal: "Propuesta enviada",
  won: "Cliente ganado",
  lost: "Perdido",
  not_interested: "No le interesa",
  do_not_contact: "No contactar",
} as const;
export type CpStatus = keyof typeof CP_STATUSES;
export const CP_STATUS_KEYS = Object.keys(CP_STATUSES) as CpStatus[];

/** Estados que cierran la gestión: ya no requieren seguimiento. */
export const CLOSED_STATUSES: CpStatus[] = ["won", "lost", "not_interested", "do_not_contact"];

export const TEMPLATE_VARS = ["empresa", "ciudad", "categoria"] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];

export const DEFAULT_TEMPLATE =
  "Hola, equipo de {empresa}. Somos PIBOX Mensajería y trabajamos con negocios de {ciudad}. Nos gustaría conocer cómo gestionan hoy sus entregas y ver si podemos ayudarles. ¿Con quién podríamos hablar?";

export interface RenderResult {
  text: string;
  /** Variables que el sistema no conoce ({foo}): quedan tal cual y bloquean la aprobación. */
  unknown: string[];
  /** Variables conocidas pero sin dato para este prospecto: se reemplazan por vacío y se avisa. */
  empty: TemplateVar[];
}

export function renderTemplate(template: string, vars: Partial<Record<TemplateVar, string | null | undefined>>): RenderResult {
  const unknown: string[] = [];
  const empty: TemplateVar[] = [];
  const text = template.replace(/\{([a-zA-Z_áéíóúñ]+)\}/g, (whole, name: string) => {
    if (!(TEMPLATE_VARS as readonly string[]).includes(name)) { if (!unknown.includes(name)) unknown.push(name); return whole; }
    const v = (vars[name as TemplateVar] ?? "").trim();
    if (!v) { if (!empty.includes(name as TemplateVar)) empty.push(name as TemplateVar); return ""; }
    return v;
  }).replace(/ {2,}/g, " ").replace(/\s+([,.;:?!])/g, "$1").trim();
  return { text, unknown, empty };
}

/** Un mensaje solo se puede aprobar si no quedan {variables} sin resolver ni está vacío. */
export function approvalBlockers(body: string): string[] {
  const b: string[] = [];
  if (!body.trim()) b.push("El mensaje está vacío.");
  const left = body.match(/\{[^}\s]+\}/g);
  if (left) b.push(`Quedan variables sin resolver: ${[...new Set(left)].join(", ")}.`);
  return b;
}

export type FollowUpState = "none" | "overdue" | "today" | "upcoming" | "closed";

/** Colombia = UTC-5 sin horario de verano: "hoy" se calcula en esa zona. */
function bogotaDay(d: Date): string {
  return new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

export function followUpState(status: CpStatus, next: Date | null, now = new Date()): FollowUpState {
  if (CLOSED_STATUSES.includes(status)) return "closed";
  if (!next) return "none";
  const n = bogotaDay(next), t = bogotaDay(now);
  return n < t ? "overdue" : n === t ? "today" : "upcoming";
}

/** "2026-10-25" → medianoche de Colombia de ese día (así el seguimiento vence ese día y no el anterior). */
export function followUpFromDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T12:00:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function funnel(statuses: CpStatus[]): Record<CpStatus, number> {
  const out = Object.fromEntries(CP_STATUS_KEYS.map((k) => [k, 0])) as Record<CpStatus, number>;
  for (const s of statuses) out[s] += 1;
  return out;
}
