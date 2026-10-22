import type { ReactNode } from "react";

/** Gráficos en SVG puro (sin librerías): se dibujan en el servidor, escalan al ancho y cada marca trae su tooltip nativo. */
export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
const nf = new Intl.NumberFormat("es-CO");
export const fmt = (n: number) => nf.format(n);

export function ChartCard({ title, note, children, legend }: { title: string; note?: string; children: ReactNode; legend?: { label: string; color: string }[] }) {
  return (
    <section className="card viz space-y-2" aria-label={title}>
      <div><h2 className="font-semibold">{title}</h2>{note && <p className="text-xs text-muted">{note}</p>}</div>
      {legend && legend.length > 1 && <div className="legend">{legend.map((l) => <span key={l.label}><i style={{ background: l.color }} />{l.label}</span>)}</div>}
      {children}
    </section>
  );
}

export function Empty({ children = "Aún no hay datos para este gráfico." }: { children?: ReactNode }) {
  return <p className="rounded border border-dashed p-6 text-center text-sm text-muted" style={{ borderColor: "var(--color-border)" }}>{children}</p>;
}

/** Barras horizontales con el valor al final (etiqueta directa). `colors`: un color por barra o uno solo. */
export function HBars({ data, color = "var(--s1)", unit = "", max }: { data: { label: string; value: number; note?: string; color?: string }[]; color?: string; unit?: string; max?: number }) {
  if (!data.length) return <Empty />;
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  const rowH = 26, labelW = 150, valW = 56, W = 560, plot = W - labelW - valW;
  return (
    <svg viewBox={`0 0 ${W} ${data.length * rowH + 4}`} className="w-full" role="img" aria-label={data.map((d) => `${d.label}: ${fmt(d.value)}${unit}`).join("; ")}>
      {data.map((d, i) => {
        const w = Math.max(d.value > 0 ? 3 : 0, (d.value / top) * plot), y = i * rowH + 2;
        return (
          <g key={d.label} className="viz-mark">
            <title>{`${d.label}: ${fmt(d.value)}${unit}${d.note ? ` · ${d.note}` : ""}`}</title>
            <text x={labelW - 8} y={y + 15} textAnchor="end">{d.label.length > 22 ? `${d.label.slice(0, 21)}…` : d.label}</text>
            <rect x={labelW} y={y + 3} width={w} height={rowH - 10} rx={4} fill={d.color ?? color} />
            <text x={labelW + w + 6} y={y + 15} className="val">{fmt(d.value)}{unit}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Columnas verticales (histograma). */
export function Columns({ data, color = "var(--s1)" }: { data: { label: string; value: number; color?: string }[]; color?: string }) {
  const top = Math.max(1, ...data.map((d) => d.value));
  if (data.every((d) => d.value === 0)) return <Empty />;
  const W = 560, H = 190, padB = 24, padT = 18, gap = 10, bw = (W - gap * (data.length + 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join("; ")}>
      <line x1={0} x2={W} y1={H - padB} y2={H - padB} stroke="var(--grid)" />
      {data.map((d, i) => {
        const h = Math.max(d.value > 0 ? 3 : 0, (d.value / top) * (H - padB - padT)), x = gap + i * (bw + gap);
        return (
          <g key={d.label} className="viz-mark">
            <title>{`${d.label}: ${fmt(d.value)}`}</title>
            <rect x={x} y={H - padB - h} width={bw} height={h} rx={4} fill={d.color ?? color} />
            <text x={x + bw / 2} y={H - padB - h - 5} textAnchor="middle" className="val">{fmt(d.value)}</text>
            <text x={x + bw / 2} y={H - 7} textAnchor="middle">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Área + línea por semana, con hasta 2 series sobre el mismo eje (nunca doble eje). */
export function TrendChart({ labels, series }: { labels: string[]; series: { name: string; color: string; values: number[] }[] }) {
  const n = labels.length, all = series.flatMap((s) => s.values);
  if (!all.some((v) => v > 0)) return <Empty>Aún no hay actividad en las últimas {n} semanas.</Empty>;
  const W = 560, H = 210, L = 34, R = 26, T = 12, B = 26;
  const top = niceMax(Math.max(...all)), x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1)), y = (v: number) => T + (1 - v / top) * (H - T - B);
  const ticks = [0, top / 2, top];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => `${s.name}: ${s.values.join(", ")}`).join(". ")}>
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" /><text x={L - 6} y={y(t) + 4} textAnchor="end">{fmt(Math.round(t))}</text></g>)}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
        return (
          <g key={s.name}>
            {si === 0 && <polygon points={`${x(0)},${y(0)} ${pts.join(" ")} ${x(n - 1)},${y(0)}`} fill={s.color} opacity={0.16} />}
            <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
      {labels.map((l, i) => (
        <g key={l} className="viz-mark">
          <title>{`${l}\n${series.map((s) => `${s.name}: ${fmt(s.values[i])}`).join("\n")}`}</title>
          <rect x={x(i) - (W - L - R) / (2 * Math.max(1, n - 1))} y={T} width={(W - L - R) / Math.max(1, n - 1)} height={H - T - B} fill="transparent" />
          {series.map((s) => <circle key={s.name} cx={x(i)} cy={y(s.values[i])} r={3} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />)}
          {(i % 2 === (n - 1) % 2) && <text x={x(i)} y={H - 8} textAnchor="middle">{l}</text>}
        </g>
      ))}
    </svg>
  );
}
function niceMax(v: number) { if (v <= 4) return 4; const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

/** Dona con el total al centro y leyenda con valores (la identidad no depende solo del color). */
export function Donut({ data, center }: { data: { label: string; value: number; color: string }[]; center: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <Empty />;
  const R = 62, r = 40, C = 80;
  let acc = 0;
  const arcs = data.filter((d) => d.value > 0).map((d) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2; acc += d.value; const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2 - (d.value === total ? 0.0001 : 0.025);
    const big = a1 - a0 > Math.PI ? 1 : 0, p = (a: number, rad: number) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`;
    return { d, path: `M ${p(a0, R)} A ${R} ${R} 0 ${big} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${big} 0 ${p(a0, r)} Z` };
  });
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 160 160" className="w-40 shrink-0" role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join("; ")}>
        {arcs.map(({ d, path }) => <path key={d.label} d={path} fill={d.color} className="viz-mark"><title>{`${d.label}: ${fmt(d.value)} (${Math.round((d.value / total) * 100)} %)`}</title></path>)}
        <text x={C} y={C - 2} textAnchor="middle" className="val" style={{ fontSize: 20 }}>{center}</text>
        <text x={C} y={C + 13} textAnchor="middle">total</text>
      </svg>
      <ul className="space-y-1 text-sm">
        {data.map((d) => <li key={d.label}><i className="mr-2 inline-block h-3 w-3 rounded-sm align-[-1px]" style={{ background: d.color }} />{d.label}: <b>{fmt(d.value)}</b> <span className="text-muted">({Math.round((d.value / total) * 100)} %)</span></li>)}
      </ul>
    </div>
  );
}

/** Embudo: barras centradas que se angostan; muestra el valor y el % respecto a la etapa anterior. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  if (!steps[0] || steps[0].value === 0) return <Empty />;
  const shades = ["#1d4ed8", "#2563eb", "#3b82f6", "#4f94f0", "#6aa6f2", "#86b8f4", "#a3c9f6", "#bfdaf8", "#d9e9fb"];
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        return (
          <li key={s.label} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-2 text-sm" title={`${s.label}: ${fmt(s.value)}`}>
            <span className="truncate text-muted">{s.label}</span>
            <div className="h-6 rounded" style={{ background: "var(--color-surface-2)" }}>
              <div className="h-6 rounded viz-mark" style={{ width: `${Math.max(s.value > 0 ? 1.5 : 0, (s.value / top) * 100)}%`, background: shades[Math.min(i, shades.length - 1)] }} />
            </div>
            <span className="w-28 text-right"><b>{fmt(s.value)}</b>{prev !== null && prev > 0 && <span className="text-xs text-muted"> · {Math.round((s.value / prev) * 100)} %</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Mini-línea para dentro de una tarjeta. */
export function Spark({ values, color }: { values: number[]; color: string }) {
  const top = Math.max(1, ...values), n = values.length;
  if (n < 2 || !values.some((v) => v > 0)) return null;
  const W = 110, H = 30, pts = values.map((v, i) => `${(i * W) / (n - 1)},${H - 3 - (v / top) * (H - 8)}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-28" aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
