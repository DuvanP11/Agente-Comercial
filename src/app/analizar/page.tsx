import Link from "next/link";
import { desc, eq, ne, and } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { ChartCard, Columns, Donut, SERIES } from "@/components/charts";
import { HelpPanel, Insight } from "@/components/Insight";
import { priorityHistogram, PRIORITY_BANDS } from "@/lib/dashboard";
import { priorityInsight } from "@/lib/dashboard-insights";
import { CRITERION_HELP as WHAT, CRITERION_LABELS, DEFAULT_WEIGHTS, type CriterionKey } from "@/lib/scoring/score";
import { getScoringConfig } from "@/lib/services/settings";
import type { StoredScore } from "@/lib/services/analysis";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { new: "Nuevo", needs_review: "Revisar duplicado", qualified: "Calificado", contacted: "Contactado", archived: "Archivado" };
const FILTERS = { todos: "Todos", sin: "Sin valorar", prioridad: "Con prioridad", insuf: "Sin prioridad (falta información)" } as const;
type Filter = keyof typeof FILTERS;

function PriorityBadge({ s }: { s: StoredScore | null }) {
  if (!s) return <span className="badge">Sin valorar</span>;
  if (s.priority === null) return <span className="badge badge-warn" title="Falta información para calcular una prioridad: no significa que sea un mal prospecto.">Falta información</span>;
  const color = s.priority >= 60 ? "var(--s3)" : s.priority >= 40 ? "var(--s2)" : "var(--s5)";
  return (
    <span className="inline-flex items-center gap-2" title={`Prioridad ${s.priority} de 100`}>
      <span className="inline-block h-2 w-20 overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }}><span className="block h-2 rounded-full" style={{ width: `${s.priority}%`, background: color }} /></span>
      <b>{s.priority}</b>
    </span>
  );
}

export default async function Analizar({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const filter: Filter = f && f in FILTERS ? (f as Filter) : "todos";
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const cfg = await getScoringConfig(db, org);
  const all = await db.select().from(prospects).where(and(eq(prospects.orgId, org), ne(prospects.status, "excluded_duplicate"))).orderBy(desc(prospects.createdAt)).limit(300);
  const withScore = all.map((p) => ({ p, s: p.scoreJson as StoredScore | null }));
  const unrated = withScore.filter((x) => !x.s), noPriority = withScore.filter((x) => x.s && x.s.priority === null), ranked = withScore.filter((x) => x.s && x.s.priority !== null);
  const hist = priorityHistogram(withScore.map((x) => (x.s ? x.s.priority : null)).filter((_, i) => withScore[i].s));
  const rows = (filter === "sin" ? unrated : filter === "prioridad" ? ranked : filter === "insuf" ? noPriority : withScore)
    .slice().sort((a, b) => (b.s?.priority ?? -1) - (a.s?.priority ?? -1));
  const count: Record<Filter, number> = { todos: withScore.length, sin: unrated.length, prioridad: ranked.length, insuf: noPriority.length };
  const avgCov = withScore.filter((x) => x.s).length ? Math.round((withScore.reduce((a, x) => a + (x.s?.coverage ?? 0), 0) / withScore.filter((x) => x.s).length) * 100) : null;
  const pill = (active: boolean) => (active ? { background: "var(--color-primary)", color: "var(--color-on-primary)" } : undefined);
  const keys = Object.keys(DEFAULT_WEIGHTS) as CriterionKey[];
  const kpi = (label: string, value: string | number, note: string, color: string) => (
    <div className="card kpi" style={{ ["--kpi" as string]: color }}><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted">{note}</div></div>
  );
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Analizar clientes</h1>
        <p className="text-sm text-muted">Aquí decides qué prospectos valen la pena: cada uno se valora con criterios y evidencia, y el resultado es una <b>prioridad de 0 a 100</b> para saber a quién contactar primero.</p>
      </header>

      <HelpPanel title="Cómo funciona (qué se valora, qué significa la prioridad y cómo usarla)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Entra a un prospecto con <b>Analizar</b>. Puedes pulsar <b>Proponer con IA</b> (carga una propuesta, no guarda nada) o llenar los criterios tú.</li>
          <li>Para cada criterio eliges la <b>naturaleza</b>: «Confirmado» (exige evidencia), «Inferencia», «Hipótesis» o «Desconocido». Lo desconocido <b>no suma ni resta</b>.</li>
          <li>Pulsa <b>Guardar valoración</b>: se calcula la prioridad. Si la prioridad existe, puedes marcarlo <b>Calificado</b> y llevarlo a una campaña desde Captar clientes.</li>
        </ol>
        <p><b>La prioridad solo aparece</b> si lo que sabes pesa al menos el <b>{Math.round(cfg.minCoverage * 100)} %</b> del total (cobertura). Con menos, dice «Falta información»: no es una mala nota, es que aún no se puede juzgar. Tener teléfono o web solo cuenta en el criterio de contacto. Los pesos y esa cobertura se cambian en <Link className="underline" href="/configuracion">Configuración</Link>.</p>
        <div className="overflow-x-auto">
          <table className="table"><thead><tr><th>Criterio</th><th>Peso</th><th>Qué mide</th></tr></thead>
            <tbody>{keys.map((k) => <tr key={k}><td><b>{CRITERION_LABELS[k]}</b></td><td>{cfg.weights[k]}</td><td className="text-muted">{WHAT[k]}</td></tr>)}</tbody></table>
        </div>
        <p className="text-xs text-muted">La prioridad no es una probabilidad de que el prospecto contrate: ordena a quién mirar primero con la información disponible.</p>
      </HelpPanel>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen">
        {kpi("Prospectos por analizar", all.length, "Sin los duplicados excluidos", "var(--s1)")}
        {kpi("Sin valorar", unrated.length, "Aún no se les ha hecho análisis", "var(--s2)")}
        {kpi("Con prioridad", ranked.length, "Listos para decidir si se califican", "var(--s3)")}
        {kpi("Cobertura promedio", avgCov === null ? "—" : `${avgCov} %`, `Se necesita ${Math.round(cfg.minCoverage * 100)} % para dar prioridad`, "var(--s4)")}
      </section>

      {all.length > 0 && (
        <section className="grid gap-3 lg:grid-cols-2" aria-label="Gráficos">
          <ChartCard title="Avance del análisis" note="En qué punto está cada prospecto.">
            <Donut center={String(all.length)} data={[
              { label: "Sin valorar", value: unrated.length, color: SERIES[1] },
              { label: "Falta información", value: noPriority.length, color: SERIES[4] },
              { label: "Con prioridad", value: ranked.length, color: SERIES[2] },
            ]} />
            <Insight>{unrated.length === all.length ? "Todavía no has analizado ningún prospecto: empieza por los que tengan teléfono para poder contactarlos pronto." : `${Math.round((ranked.length / all.length) * 100)} % ya tiene prioridad. ${noPriority.length ? `${noPriority.length} se valoraron pero aún les falta información para tener prioridad.` : ""}`}</Insight>
          </ChartCard>
          <ChartCard title="Prioridad de los valorados" note="Cuántos prospectos caen en cada franja de prioridad.">
            <Columns data={PRIORITY_BANDS.map((l, i) => ({ label: l, value: hist.bands[i] }))} color="var(--s4)" />
            <Insight>{ranked.length === 0 ? "Aún no hay prospectos con prioridad." : priorityInsight(hist.bands, 0)}</Insight>
          </ChartCard>
        </section>
      )}

      <nav aria-label="Filtrar" className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Ver:</span>
        {(Object.keys(FILTERS) as Filter[]).map((k) => <Link key={k} className="btn" style={pill(filter === k)} href={k === "todos" ? "/analizar" : `/analizar?f=${k}`}>{FILTERS[k]} ({count[k]})</Link>)}
      </nav>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? <p className="text-sm text-muted">{all.length === 0 ? "No hay prospectos por analizar. Ejecuta una búsqueda primero." : "No hay prospectos con este filtro."}</p> : (
          <table className="table">
            <thead><tr><th>Empresa</th><th>Rubro</th><th>Estado</th><th>Prioridad</th><th>Cobertura</th><th></th></tr></thead>
            <tbody>{rows.map(({ p, s }) => (
              <tr key={p.id}>
                <td><Link className="font-semibold underline" href={`/prospectos/${p.id}`}>{p.name}</Link>{p.isDemo && <span className="badge badge-warn ml-2">Demo</span>}<div className="text-xs text-muted">{p.city}</div></td>
                <td>{p.category ?? <span className="text-muted">—</span>}</td>
                <td><span className="badge">{STATUS[p.status] ?? p.status}</span></td>
                <td><PriorityBadge s={s} /></td>
                <td>{s ? <span className="inline-flex items-center gap-2"><span className="inline-block h-2 w-16 overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }}><span className="block h-2 rounded-full" style={{ width: `${Math.round(s.coverage * 100)}%`, background: "var(--s1)" }} /></span>{Math.round(s.coverage * 100)} %</span> : <span className="text-muted">—</span>}</td>
                <td><Link className="btn" href={`/analizar/${p.id}`}>{s ? "Revisar" : "Analizar"}</Link></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {all.length >= 300 && <p className="mt-2 text-xs text-muted">Se muestran los 300 más recientes.</p>}
      </div>
    </div>
  );
}
