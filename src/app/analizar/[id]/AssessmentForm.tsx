"use client";
import { useActionState, useState, useTransition } from "react";
import type { QualificationProposal } from "@/lib/agents/qualification";
import { CRITERION_HELP, CRITERION_LABELS, DEFAULT_WEIGHTS, type CriterionAssessment, type CriterionKey } from "@/lib/scoring/score";
import { proposeAction, qualifyAction, saveAction, type AnalysisState, type ProposeResult } from "./actions";

interface Ev { id: string; field: string; observedValue: string; sourceName: string }
const KINDS = [["unknown", "Desconocido (no suma)"], ["confirmed", "Confirmado (exige evidencia)"], ["inferred", "Inferencia"], ["hypothesis", "Hipótesis por validar"]] as const;
const VALUES = [0, 0.25, 0.5, 0.75, 1];
const KEYS = Object.keys(DEFAULT_WEIGHTS) as CriterionKey[];

interface Row { kind: string; value: string; note: string; ev: string[] }
const snap = (n: number) => String(VALUES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a)));

export function AssessmentForm({ weights = DEFAULT_WEIGHTS, prospectId, evidence, current, status, aiReady = false, saved }: {
  weights?: Record<CriterionKey, number>; prospectId: string; evidence: Ev[]; current: Partial<Record<CriterionKey, CriterionAssessment>>; status: string; aiReady?: boolean;
  saved?: { proposal: QualificationProposal; at: string };
}) {
  const [s, action, pending] = useActionState<AnalysisState, FormData>(saveAction.bind(null, prospectId), {});
  // Campos controlados: así se les puede cargar la propuesta de la IA y no se vacían al guardar.
  const [rows, setRows] = useState<Record<CriterionKey, Row>>(() => Object.fromEntries(KEYS.map((k) => {
    const c = current[k];
    return [k, c ? { kind: c.kind, value: String(c.value), note: c.note ?? "", ev: c.evidenceIds } : { kind: "unknown", value: "0.5", note: "", ev: [] }];
  })) as Record<CriterionKey, Row>);
  const [origin, setOrigin] = useState<Partial<Record<CriterionKey, "model" | "rule">>>({});
  const [ai, setAi] = useState<ProposeResult | null>(null);
  const [aiPending, startAi] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [qpending, start] = useTransition();
  const set = (k: CriterionKey, patch: Partial<Row>) => setRows((r) => ({ ...r, [k]: { ...r[k], ...patch } }));

  const apply = (proposal: QualificationProposal) => {
    const next: Partial<Record<CriterionKey, Row>> = {};
    const org: Partial<Record<CriterionKey, "model" | "rule">> = {};
    for (const a of proposal.assessments) {
      next[a.criterion] = { kind: a.kind, value: snap(a.value), note: a.note, ev: a.kind === "confirmed" ? a.evidenceIds : [] };
      org[a.criterion] = a.origin;
    }
    setRows((cur) => ({ ...cur, ...next } as Record<CriterionKey, Row>));
    setOrigin(org);
  };
  const propose = () => startAi(async () => {
    const r = await proposeAction(prospectId);
    setAi(r);
    if (r.ok && r.proposal) apply(r.proposal);
  });
  const loadSaved = () => { if (saved) { apply(saved.proposal); setAi({ ok: true, warnings: [], proposal: saved.proposal }); } };
  const minutes = saved ? Math.max(1, Math.round((Date.now() - new Date(saved.at).getTime()) / 60000)) : 0;

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" disabled={!aiReady || aiPending} onClick={propose}>{aiPending ? "Analizando…" : "Proponer con IA"}</button>
          {saved && <button type="button" className="btn" onClick={loadSaved}>Cargar propuesta ya hecha (hace {minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`})</button>}
          <span className="text-xs text-muted">{aiReady ? "Carga en el formulario una propuesta de valoración. No se guarda nada hasta que pulses «Guardar valoración»." : "IA no configurada: valora a mano (ver Agentes y skills)."}</span>
        </div>
        {ai && !ai.ok && <p role="alert" className="text-sm badge-bad">{ai.error}</p>}
        {ai?.ok && (
          <div role="status" className="space-y-1 text-sm">
            <p className="badge-ok">Propuesta cargada abajo (marcada «IA»). Revísala y corrige lo que haga falta: <b>aún no está guardada</b>.</p>
            {ai.proposal?.summary && <p className="text-muted">Resumen del modelo: {ai.proposal.summary}</p>}
            {ai.warnings.map((w) => <p key={w} className="badge-warn">⚠ {w}</p>)}
            <p className="text-xs text-muted">La IA nunca deja un criterio «confirmado»; eso lo decides tú con evidencia. El canal de contacto lo calcula el sistema (marcado «regla»).</p>
          </div>)}
      </div>

      <details className="card text-sm">
        <summary className="cursor-pointer font-semibold">Cómo llenar cada criterio</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Desconocido:</b> no sabes (o no hay datos). No suma ni resta. Es la opción correcta cuando dudas.</li>
          <li><b>Confirmado:</b> lo demuestra una evidencia de la ficha; hay que marcar cuál. Solo así queda «respaldado en evidencia».</li>
          <li><b>Inferencia:</b> lo deduces razonablemente de los datos (por ejemplo, una tienda online probablemente despacha).</li>
          <li><b>Hipótesis:</b> es una suposición que falta validar hablando con el negocio.</li>
          <li><b>Qué tan favorable es:</b> de 0 (nada favorable) a 1 (muy favorable). Solo se pide cuando no es «Desconocido».</li>
        </ul>
        <p className="mt-2 text-xs text-muted">Al guardar se calcula la prioridad. Si todavía falta información para calcularla, el sistema lo dice; guardar igual sirve para ir completando después.</p>
      </details>

      <form action={action} className="space-y-3">
        {KEYS.map((k) => {
          const r = rows[k];
          return (
            <fieldset key={k} className="card space-y-2">
              <legend className="px-1 font-semibold">{CRITERION_LABELS[k]} <span className="text-xs font-normal text-muted">(peso {weights[k]})</span>
                {origin[k] === "model" && <span className="badge ml-2">IA</span>}{origin[k] === "rule" && <span className="badge ml-2">regla</span>}</legend>
              <p className="text-xs text-muted">{CRITERION_HELP[k]}</p>
              <div className="grid gap-2 md:grid-cols-3">
                <div><label className="label" htmlFor={`${k}_kind`}>Naturaleza</label>
                  <select id={`${k}_kind`} name={`${k}_kind`} className="input" value={r.kind} onChange={(e) => set(k, { kind: e.target.value, ev: e.target.value === "confirmed" ? r.ev : [] })}>
                    {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                {r.kind !== "unknown" && (<>
                  <div><label className="label" htmlFor={`${k}_value`}>Qué tan favorable es (0 – 1)</label>
                    <select id={`${k}_value`} name={`${k}_value`} className="input" value={r.value} onChange={(e) => set(k, { value: e.target.value })}>{VALUES.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                  <div><label className="label" htmlFor={`${k}_note`}>Nota</label><input id={`${k}_note`} name={`${k}_note`} className="input" value={r.note} maxLength={500} onChange={(e) => set(k, { note: e.target.value })} /></div>
                </>)}
              </div>
              {r.kind === "confirmed" && (
                <div><span className="label">Evidencia que lo respalda</span>
                  {evidence.length === 0 ? <p className="text-sm badge-warn">Este prospecto no tiene evidencias; no puedes marcar nada como confirmado.</p> :
                    evidence.map((e) => (
                      <label key={e.id} className="mr-4 inline-flex items-center gap-1 text-sm">
                        <input type="checkbox" name={`${k}_ev`} value={e.id} checked={r.ev.includes(e.id)} onChange={(x) => set(k, { ev: x.target.checked ? [...r.ev, e.id] : r.ev.filter((i) => i !== e.id) })} /> {e.field}: {e.observedValue} <span className="text-muted">({e.sourceName})</span>
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
