"use client";
import { useActionState } from "react";
import { GOAL_METRICS } from "@/lib/goals";
import { addGoal } from "./actions";

export function GoalForm() {
  const [s, action, pending] = useActionState(addGoal, {} as { error?: string; ok?: boolean });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="card grid gap-3 md:grid-cols-5">
      <div className="md:col-span-2"><label className="label" htmlFor="metric">Indicador</label>
        <select id="metric" name="metric" className="input">{Object.entries(GOAL_METRICS).map(([k, m]) =>
          <option key={k} value={k}>{m.label}{m.hasSource ? "" : " — sin datos aún"}</option>)}</select></div>
      <div><label className="label" htmlFor="target">Meta</label><input id="target" name="target" type="number" step="any" min="0" required className="input" /></div>
      <div><label className="label" htmlFor="periodStart">Desde</label><input id="periodStart" name="periodStart" type="date" required defaultValue={today.slice(0, 8) + "01"} className="input" /></div>
      <div><label className="label" htmlFor="periodEnd">Hasta</label><input id="periodEnd" name="periodEnd" type="date" required defaultValue={today} className="input" /></div>
      <div className="md:col-span-5 flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>Guardar meta</button>
        {s.error && <span role="alert" className="text-sm badge-bad">{s.error}</span>}
        {s.ok && <span role="status" className="text-sm badge-ok">Meta guardada.</span>}
      </div>
    </form>
  );
}
