"use client";
import { useMemo, useState, useTransition } from "react";
import { guidanceText, MAX_EXAMPLES, MAX_EXAMPLE_CHARS, parseTraining, TRAINING_FIELDS, type Training } from "@/lib/training";
import { saveTrainingAction } from "./actions";

export function TrainingForm({ initial }: { initial: Training }) {
  const [t, setT] = useState<Training>(initial);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const preview = useMemo(() => guidanceText(parseTraining(t)), [t]);
  const setEx = (i: number, v: string) => setT((x) => ({ ...x, examples: x.examples.map((e, j) => (j === i ? v : e)) }));

  return (
    <div className="space-y-4">
      <section className="card space-y-3" aria-label="Guía para la IA">
        {TRAINING_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={`t_${f.key}`}>{f.label}</label>
            <textarea id={`t_${f.key}`} className="input" rows={3} maxLength={f.max} value={t[f.key]} onChange={(e) => setT((x) => ({ ...x, [f.key]: e.target.value }))} />
            <p className="text-xs text-muted">{f.help} ({t[f.key].length}/{f.max})</p>
          </div>
        ))}
        <div className="space-y-2">
          <p className="label">Mensajes de ejemplo aprobados (opcional, hasta {MAX_EXAMPLES})</p>
          {t.examples.map((e, i) => (
            <div key={i} className="flex gap-2">
              <textarea aria-label={`Ejemplo ${i + 1}`} className="input flex-1" rows={3} maxLength={MAX_EXAMPLE_CHARS} value={e} onChange={(ev) => setEx(i, ev.target.value)} />
              <button type="button" className="btn" onClick={() => setT((x) => ({ ...x, examples: x.examples.filter((_, j) => j !== i) }))}>Quitar</button>
            </div>
          ))}
          {t.examples.length < MAX_EXAMPLES && <button type="button" className="btn" onClick={() => setT((x) => ({ ...x, examples: [...x.examples, ""] }))}>Agregar ejemplo</button>}
          <p className="text-xs text-muted">La IA los usa como referencia de estilo, no los copia tal cual.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { try { setMsg(await saveTrainingAction(t)); } catch { setMsg({ error: "No se pudo guardar. Recarga la página e inténtalo de nuevo." }); } })}>{pending ? "Guardando…" : "Guardar guía"}</button>
        </div>
        <div role="status" aria-live="polite">
          {msg?.ok && <p className="badge-ok">{msg.ok}</p>}
          {msg?.error && <p role="alert" className="badge-bad">{msg.error}</p>}
        </div>
      </section>
      <section className="card space-y-2" aria-label="Lo que ve la IA">
        <h2 className="font-semibold">Así se le entrega a la IA</h2>
        {preview ? <pre className="whitespace-pre-wrap text-sm">{preview}</pre> : <p className="text-sm text-muted">Todavía no has escrito nada: la IA trabaja solo con los datos del prospecto.</p>}
      </section>
    </div>
  );
}
