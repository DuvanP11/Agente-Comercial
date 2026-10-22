import type { GroupStats, Quality } from "./market";

/** Lecturas en lenguaje claro de cada gráfico. Reglas fijas sobre los mismos datos del gráfico: nada predictivo ni escrito por IA. */
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const n = (x: number) => new Intl.NumberFormat("es-CO").format(x);

export function trendInsight(prospects: number[], touches: number[]): string {
  const total = prospects.reduce((s, x) => s + x, 0), tt = touches.reduce((s, x) => s + x, 0);
  if (total === 0 && tt === 0) return "No hay actividad en las últimas 12 semanas.";
  const parts: string[] = [];
  const max = Math.max(...prospects);
  if (total > 0 && max / total >= 0.7) parts.push(`${pct(max, total)} % de los prospectos de este periodo (${n(max)} de ${n(total)}) entró en una sola semana: la línea refleja cuándo se cargaron, no un ritmo constante de captación.`);
  else if (total > 0) {
    const last4 = prospects.slice(-4).reduce((s, x) => s + x, 0), prev4 = prospects.slice(-8, -4).reduce((s, x) => s + x, 0);
    parts.push(`Entraron ${n(total)} prospectos en 12 semanas. Las últimas 4 semanas aportaron ${n(last4)}${prev4 > 0 ? ` frente a ${n(prev4)} en las 4 anteriores (${last4 >= prev4 ? "+" : "−"}${Math.abs(pct(last4 - prev4, prev4))} %)` : ""}.`);
  }
  parts.push(tt === 0 ? "Aún no se abre ningún chat de WhatsApp: hay prospectos sin contactar." : `Se abrieron ${n(tt)} chats (no implica que se hayan enviado mensajes).`);
  return parts.join(" ");
}

export function funnelInsight(steps: { label: string; value: number }[]): string {
  if (!steps.length || steps[0].value === 0) return "Sin prospectos todavía.";
  const [first, contact] = steps;
  const parts = [`De ${n(first.value)} prospectos, ${n(contact.value)} (${pct(contact.value, first.value)} %) tienen algún dato de contacto.`];
  const empty = steps.findIndex((s, i) => i > 0 && s.value === 0);
  if (empty > 0) parts.push(`Nadie ha llegado todavía a «${steps[empty].label}»: ahí está el cuello de botella actual.`);
  else {
    let worst = { i: -1, drop: -1 };
    for (let i = 1; i < steps.length; i++) { const d = steps[i - 1].value - steps[i].value; const rel = steps[i - 1].value ? d / steps[i - 1].value : 0; if (rel > worst.drop) worst = { i, drop: rel }; }
    if (worst.i > 0) parts.push(`La mayor caída es de «${steps[worst.i - 1].label}» a «${steps[worst.i].label}» (${Math.round(worst.drop * 100)} % se queda en el camino).`);
  }
  return parts.join(" ");
}

export function statusInsight(counts: { label: string; value: number }[]): string {
  const total = counts.reduce((s, c) => s + c.value, 0);
  if (!total) return "Sin prospectos todavía.";
  const top = [...counts].sort((a, b) => b.value - a.value)[0];
  const q = counts.find((c) => c.label === "Calificados")?.value ?? 0;
  return `${pct(top.value, total)} % está en «${top.label}». ${q === 0 ? "Todavía no hay calificados: faltan valorar prospectos en Analizar clientes." : `${n(q)} calificados (${pct(q, total)} %) listos para llevar a una campaña.`}`;
}

export function priorityInsight(bands: number[], none: number): string {
  const rated = bands.reduce((s, x) => s + x, 0), total = rated + none;
  if (!total) return "Sin prospectos todavía.";
  if (rated === 0) return `Ninguno de los ${n(total)} prospectos tiene prioridad: falta información para valorarlos (se valoran en Analizar clientes).`;
  const high = bands[3] + bands[4];
  return `${n(none)} de ${n(total)} (${pct(none, total)} %) aún no tiene prioridad por falta de información. De los ${n(rated)} valorados, ${n(high)} están en 60 o más: son los primeros para contactar.`;
}

export function qualityInsight(q: Quality): string {
  const items = [["teléfono", q.phone], ["sitio web", q.web], ["correo", q.email], ["dirección", q.address]] as [string, number | null][];
  if (!q.total) return "Sin prospectos todavía.";
  const s = [...items].sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
  const low = s[0], high = s[s.length - 1];
  return `Lo más completo es ${high[0]} (${high[1] ?? 0} %) y lo más escaso es ${low[0]} (${low[1] ?? 0} %). ${(q.phone ?? 0) < 50 ? "Con menos de la mitad con teléfono, conviene completar contactos antes de lanzar campañas." : "Más de la mitad tiene teléfono: se puede contactar por WhatsApp."}`;
}

export function sourceInsight(g: GroupStats[]): string {
  const total = g.reduce((s, x) => s + x.total, 0);
  if (!total) return "Sin prospectos todavía.";
  const top = g[0];
  return g.length === 1 ? `Todos los prospectos vienen de «${top.label}».` : `«${top.label}» aporta ${pct(top.total, total)} % de los prospectos; hay ${g.length} fuentes en total.`;
}

export function rankInsight(g: GroupStats[], what: string): string {
  const total = g.reduce((s, x) => s + x.total, 0);
  if (!total) return "Sin prospectos todavía.";
  const top3 = g.slice(0, 3).reduce((s, x) => s + x.total, 0);
  const parts = [`${g[0].label} lidera con ${n(g[0].total)} (${pct(g[0].total, total)} %); los 3 primeros ${what} suman ${pct(top3, total)} %.`];
  const sin = g.find((x) => /^sin /i.test(x.label));
  if (sin && pct(sin.total, total) >= 10) parts.push(`Ojo: ${pct(sin.total, total)} % no tiene ${what === "rubros" ? "rubro" : "ciudad"} registrado.`);
  const best = [...g].filter((x) => x.total >= 10).sort((a, b) => b.withPhone / b.total - a.withPhone / a.total)[0];
  if (best) parts.push(`Con mejor cobertura de teléfono: ${best.label} (${pct(best.withPhone, best.total)} %).`);
  return parts.join(" ");
}
