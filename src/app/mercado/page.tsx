import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { viewerOf } from "@/lib/services/scope";
import { byCategory, byCity, bySector, bySource, quality, rate, searchHealth, sinceDate, SMALL_SAMPLE, type GroupStats } from "@/lib/market";
import { ChartCard, Donut, Funnel, HBars, SERIES } from "@/components/charts";
import { Insight } from "@/components/Insight";
import { funnel } from "@/lib/dashboard";
import { funnelInsight, rankInsight, sourceInsight } from "@/lib/dashboard-insights";
import { loadMarket } from "@/lib/services/market";

export const dynamic = "force-dynamic";

const pct = (n: number, d: number) => { const r = rate(n, d); return r === null ? "—" : `${r} %`; };
const Q = ({ v }: { v: number | null }) => (v === null ? "—" : `${v} %`);

function Table({ title, rows, note }: { title: string; rows: GroupStats[]; note?: string }) {
  return (
    <section className="card overflow-x-auto" aria-label={title}>
      <h2 className="mb-1 font-semibold">{title}</h2>
      {note && <p className="mb-2 text-xs text-muted">{note}</p>}
      {rows.length === 0 ? <p className="text-sm text-muted">Sin datos en este periodo.</p> : (
        <table className="table">
          <thead><tr><th>{title.replace(/^Por /, "")}</th><th>Total</th><th>Calificados</th><th>Con teléfono</th><th>Con web</th><th>Con correo</th><th>En campaña</th><th>Contactados</th><th>Reuniones</th><th>Ganados</th><th>Prioridad prom.</th></tr></thead>
          <tbody>{rows.slice(0, 25).map((g) => (
            <tr key={g.key}>
              <td><b>{g.label}</b>{g.smallSample && <span className="badge badge-warn ml-2" title={`Menos de ${SMALL_SAMPLE} prospectos: los porcentajes dicen poco`}>muestra pequeña</span>}</td>
              <td>{g.total}</td><td>{g.qualified}</td>
              <td>{pct(g.withPhone, g.total)}</td><td>{pct(g.withWeb, g.total)}</td><td>{pct(g.withEmail, g.total)}</td>
              <td>{g.inCampaign}</td><td>{g.contacted}</td><td>{g.meetings}</td><td>{g.won}</td>
              <td>{g.avgPriority ?? "—"}</td>
            </tr>))}</tbody>
        </table>)}
    </section>
  );
}

export default async function Mercado({ searchParams }: { searchParams: Promise<{ dias?: string; demo?: string }> }) {
  const { dias, demo } = await searchParams;
  const viewer = viewerOf(await requireUser());
  const db = await getDb();
  const { rows, searches: sRows, demoCount, excludedDuplicates } = await loadMarket(db, await ensureDefaultOrg(db), { since: sinceDate(dias), includeDemo: demo === "1", viewer });
  const q = quality(rows);
  const health = searchHealth(sRows);
  const sectors = bySector(rows), cities = byCity(rows), sources = bySource(rows);
  const phoneBySector = sectors.filter((g) => g.total >= SMALL_SAMPLE).map((g) => ({ label: g.label, value: rate(g.withPhone, g.total) ?? 0, note: `${g.withPhone} de ${g.total} con teléfono` })).sort((a, b) => b.value - a.value);
  const completed = health.reduce((a, h) => a + h.completed - h.withWarnings, 0), warned = health.reduce((a, h) => a + h.withWarnings, 0), failed = health.reduce((a, h) => a + h.failed, 0);
  const bestPhone = phoneBySector[0], worstPhone = phoneBySector[phoneBySector.length - 1];
  const sel = dias && ["30", "90", "365"].includes(dias) ? dias : "all";
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Inteligencia de mercado</h1>
        <p className="text-sm text-muted">Conteos y porcentajes sobre los prospectos que ya descubriste o importaste. No son predicciones ni probabilidades de cierre. “En campaña”, “contactados”, “reuniones” y “ganados” se toman del estado actual de cada prospecto.</p>
      </header>

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="dias">Periodo (por fecha en que se guardó el prospecto)</label>
          <select id="dias" name="dias" className="input" defaultValue={sel}>
            <option value="all">Todo el histórico</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="365">Último año</option></select></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="demo" value="1" defaultChecked={demo === "1"} /> Incluir datos de demostración ({demoCount})</label>
        <button className="btn btn-primary">Aplicar</button>
      </form>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Resumen">
        <div className="card"><div className="text-xs text-muted">Prospectos analizados</div><div className="mt-1 text-2xl font-bold">{q.total}</div></div>
        <div className="card"><div className="text-xs text-muted">Con teléfono</div><div className="mt-1 text-2xl font-bold"><Q v={q.phone} /></div></div>
        <div className="card"><div className="text-xs text-muted">Con web</div><div className="mt-1 text-2xl font-bold"><Q v={q.web} /></div></div>
        <div className="card"><div className="text-xs text-muted">Con correo</div><div className="mt-1 text-2xl font-bold"><Q v={q.email} /></div></div>
        <div className="card"><div className="text-xs text-muted">Con dirección</div><div className="mt-1 text-2xl font-bold"><Q v={q.address} /></div></div>
      </section>
      {excludedDuplicates > 0 && <p className="text-xs text-muted">No se cuentan {excludedDuplicates} registros excluidos por duplicado.</p>}
      {q.total === 0 && <p role="status" className="card text-sm">No hay prospectos en este periodo. Haz una búsqueda o importa una lista para ver datos aquí.</p>}

      {q.total > 0 && (
        <section aria-label="Gráficos" className="grid gap-3 lg:grid-cols-2">
          <ChartCard title="Prospectos por familia de rubro" note="Cuántos prospectos hay en cada familia.">
            <HBars color="var(--s1)" data={sectors.slice(0, 8).map((g) => ({ label: g.label, value: g.total, note: `${g.qualified} calificados · prioridad prom. ${g.avgPriority ?? "—"}` }))} />
            <Insight>{rankInsight(sectors, "rubros")}</Insight>
          </ChartCard>
          <ChartCard title="Cobertura de teléfono por rubro" note={`Solo rubros con ${SMALL_SAMPLE} prospectos o más (con menos, el % dice poco).`}>
            <HBars unit=" %" max={100} color="var(--s3)" data={phoneBySector} />
            <Insight>{phoneBySector.length >= 2 ? `${bestPhone.label} es el rubro más fácil de contactar (${bestPhone.value} % con teléfono) y ${worstPhone.label} el más difícil (${worstPhone.value} %). Para campañas por WhatsApp conviene empezar por los primeros.` : "Aún no hay rubros con suficientes prospectos para comparar."}</Insight>
          </ChartCard>
          <ChartCard title="Embudo del periodo" note="Cada etapa cuenta a quien llegó a ella o más lejos; el % es frente a la etapa anterior.">
            <Funnel steps={funnel(rows)} />
            <Insight>{funnelInsight(funnel(rows))}</Insight>
          </ChartCard>
          <ChartCard title="Ciudades" note="Top 6 por cantidad de prospectos.">
            <HBars color="var(--s4)" data={cities.slice(0, 6).map((g) => ({ label: g.label, value: g.total, note: `${g.withPhone} con teléfono` }))} />
            <Insight>{rankInsight(cities, "ciudades")}</Insight>
          </ChartCard>
          <ChartCard title="Fuentes" note="De dónde salieron los prospectos.">
            <HBars data={sources.map((g, i) => ({ label: g.label, value: g.total, color: SERIES[i % 3], note: `${g.withPhone} con teléfono` }))} />
            <Insight>{sourceInsight(sources)}</Insight>
          </ChartCard>
          <ChartCard title="Salud de las búsquedas" note="Cómo terminaron las búsquedas del periodo.">
            <Donut center={String(completed + warned + failed)} data={[
              { label: "Completas", value: completed, color: SERIES[2] }, { label: "Con avisos (parte de la fuente falló)", value: warned, color: SERIES[1] }, { label: "Fallidas", value: failed, color: SERIES[4] },
            ]} />
            <Insight>{completed + warned + failed === 0 ? "Aún no hay búsquedas registradas." : failed + warned === 0 ? "Todas las búsquedas terminaron sin problemas." : `${Math.round(((failed + warned) / (completed + warned + failed)) * 100)} % de las búsquedas tuvo avisos o falló: suele ser el servidor público de OpenStreetMap saturado.`}</Insight>
          </ChartCard>
        </section>
      )}

      <Table title="Por rubro (familias)" rows={bySector(rows)} note="Agrupa los rubros escritos a mano en familias (p. ej. cosmética + perfumería = Belleza). “General” es lo que no se pudo clasificar." />
      <Table title="Por rubro original" rows={byCategory(rows)} />
      <Table title="Por ciudad" rows={byCity(rows)} />
      <Table title="Por fuente" rows={bySource(rows)} note="Compara qué tan completos llegan los datos según de dónde vengan." />

      <section className="card overflow-x-auto" aria-label="Salud de las búsquedas">
        <h2 className="mb-1 font-semibold">Salud de las búsquedas por fuente</h2>
        <p className="mb-2 text-xs text-muted">“Con avisos” = terminó pero una parte de la fuente falló (p. ej. Overpass saturado y se usó el respaldo). El costo solo aparece si la fuente lo informa.</p>
        {health.length === 0 ? <p className="text-sm text-muted">Aún no hay búsquedas registradas en este periodo.</p> : (
          <table className="table"><thead><tr><th>Fuente</th><th>Búsquedas</th><th>Completadas</th><th>Con avisos</th><th>Fallidas</th><th>Nuevos guardados (promedio)</th><th>Costo</th></tr></thead>
            <tbody>{health.map((h) => (
              <tr key={h.connector}><td><b>{h.connector}</b></td><td>{h.total}</td><td>{h.completed}</td><td>{h.withWarnings} ({pct(h.withWarnings, h.completed)})</td><td className={h.failed ? "badge-bad" : ""}>{h.failed}</td>
                <td>{h.avgStored ?? "—"}</td><td>{h.costUsd === null ? <span className="text-muted">No disponible</span> : `US$ ${h.costUsd.toFixed(2)}`}</td></tr>))}</tbody></table>)}
      </section>
    </div>
  );
}
