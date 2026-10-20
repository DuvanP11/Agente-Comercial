import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { GOAL_METRICS, type GoalMetric } from "@/lib/goals";
import { listGoalsWithProgress } from "@/lib/services/goals";
import { GoalForm } from "./GoalForm";
import { removeGoal } from "./actions";

export const dynamic = "force-dynamic";
const fmt = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: "America/Bogota" });

export default async function Metas() {
  const db = await getDb();
  const rows = await listGoalsWithProgress(db, await ensureDefaultOrg(db));
  return (
    <div className="space-y-5">
      <header><h1 className="text-2xl font-bold">Metas y rendimiento</h1>
        <p className="text-sm text-muted">El avance se calcula desde la base de datos. Los indicadores marcados “sin datos aún” no tienen fuente: la meta se guarda, pero el avance no se inventa.</p></header>
      <section aria-labelledby="nueva"><h2 id="nueva" className="mb-2 font-semibold">Nueva meta</h2><GoalForm /></section>
      <section className="card overflow-x-auto" aria-labelledby="lista">
        <h2 id="lista" className="mb-2 font-semibold">Metas definidas</h2>
        {rows.length === 0 ? <p className="text-sm text-muted">Aún no hay metas. Crea la primera arriba.</p> : (
          <table className="table">
            <thead><tr><th>Indicador</th><th>Periodo</th><th>Meta</th><th>Avance</th><th></th></tr></thead>
            <tbody>{rows.map((g) => (
              <tr key={g.id}>
                <td>{GOAL_METRICS[g.metric as GoalMetric].label}</td>
                <td>{fmt(g.periodStart)} – {fmt(g.periodEnd)}</td>
                <td>{Number(g.target)}</td>
                <td>{g.progress.pct === null ? <span className="text-muted text-sm">{g.progress.note}</span> : (
                  <div><b>{g.progress.actual}</b> de {Number(g.target)} ({g.progress.pct} %)
                    <div className="mt-1 h-2 w-40 rounded bg-surface-2" role="progressbar" aria-valuenow={Math.min(g.progress.pct, 100)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-2 rounded" style={{ width: `${Math.min(g.progress.pct, 100)}%`, background: "var(--color-primary)" }} /></div></div>)}</td>
                <td><form action={removeGoal.bind(null, g.id)}><button className="btn" aria-label="Eliminar meta">Eliminar</button></form></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}
