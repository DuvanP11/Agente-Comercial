"use client";
import { useActionState, useState, useTransition } from "react";
import { CRITERION_LABELS, DEFAULT_WEIGHTS, type CriterionAssessment, type CriterionKey } from "@/lib/scoring/score";
import { qualifyAction, saveAction, type AnalysisState } from "./actions";

interface Ev { id: string; field: string; observedValue: string; sourceName: string }
const KINDS = [["unknown", "Desconocido (no suma)"], ["confirmed", "Confirmado (exige evidencia)"], ["inferred", "Inferencia"], ["hypothesis", "Hipótesis por validar"]] as const;
const VALUES = [0, 0.25, 0.5, 0.75, 1];

export function AssessmentForm({ prospectId, evidence, current, status }: {
  prospectId: string; evidence: Ev[]; current: Partial<Record<CriterionKey, CriterionAssessment>>; status: string;
}) {
  const [s, action, pending] = useActionState<AnalysisState, FormData>(saveAction.bind(null, prospectId), {});
  const [kinds, setKinds] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(current).map(([k, v]) => [k, v!.kind])));
  const [msg, setMsg] = useState<string | null>(null);
  const [qpending, start] = useTransition();
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        {(Object.keys(DEFAULT_WEIGHTS) as CriterionKey[]).map((k) => {
          const c = current[k]; const kind = kinds[k] ?? "unknown";
          return (
            <fieldset key={k} className="card space-y-2">
              <legend className="px-1 font-semibold">{CRITERION_LABELS[k]} <span className="text-xs font-normal text-muted">(peso {DEFAULT_WEIGHTS[k]})</span></legend>
              <div className="grid gap-2 md:grid-cols-3">
                <div><label className="label" htmlFor={`${k}_kind`}>Naturaleza</label>
                  <select id={`${k}_kind`} name={`${k}_kind`} className="input" value={kind} onChange={(e) => setKinds({ ...kinds, [k]: e.target.value })}>
                    {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                {kind !== "unknown" && (<>
                  <div><label className="label" htmlFor={`${k}_value`}>Qué tan favorable es (0 – 1)</label>
                    <select id={`${k}_value`} name={`${k}_value`} className="input" defaultValue={c?.value ?? 0.5}>{VALUES.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                  <div><label className="label" htmlFor={`${k}_note`}>Nota</label><input id={`${k}_note`} name={`${k}_note`} className="input" defaultValue={c?.note} maxLength={500} /></div>
                </>)}
              </div>
              {kind === "confirmed" && (
                <div><span className="label">Evidencia que lo respalda</span>
                  {evidence.length === 0 ? <p className="text-sm badge-warn">Este prospecto no tiene evidencias; no puedes marcar nada como confirmado.</p> :
                    evidence.map((e) => (
                      <label key={e.id} className="mr-4 inline-flex items-center gap-1 text-sm">
                        <input type="checkbox" name={`${k}_ev`} value={e.id} defaultChecked={c?.evidenceIds.includes(e.id)} /> {e.field}: {e.observedValue} <span className="text-muted">({e.sourceName})</span>
                      </label>))}
                </div>
              )}
            </fieldset>
          );
        })}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={pending}>{pending ? "Guardando…" : "Guardar valoración"}</button>
          {s.error && <span role="alert" className="text-sm badge-bad">{s.error}</span>}
          {s.ok && <span role="status" className="text-sm badge-ok">{s.ok}</span>}
        </div>
      </form>
      <div className="card flex flex-wrap items-center gap-3">
        <span className="text-sm">Estado actual: <b>{status}</b></span>
        <button className="btn" disabled={qpending || status === "qualified"} onClick={() => start(async () => setMsg(await qualifyAction(prospectId, true) ?? "Prospecto marcado como calificado."))}>Marcar como calificado</button>
        <button className="btn" disabled={qpending || status !== "qualified"} onClick={() => start(async () => setMsg(await qualifyAction(prospectId, false) ?? "Calificación retirada."))}>Retirar calificación</button>
        {msg && <span role="status" className="text-sm">{msg}</span>}
      </div>
    </div>
  );
}
