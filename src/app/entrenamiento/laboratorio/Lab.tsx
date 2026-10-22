"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { STAGE_LABEL, SCENARIOS, type Stage } from "@/lib/agents/conversation";
import { correctAction, markOkAction, sendMessageAction, startSimulationAction, type LabMessage, type LabResult } from "./actions";

const BEHAVIOR_LABEL: Record<string, string> = { "": "Neutral (responde normal)", interesado: "Interesado", desconfiado: "Desconfiado", ocupado: "Ocupado", operador: "Ya tiene otra mensajería", precio: "Pregunta el precio", no: "No le interesa" };

/** Laboratorio: tú haces de cliente potencial, el agente conduce el primer contacto y tú lo corriges. Nada se envía a nadie. */
export function Lab({ aiReady, initialId, initialMessages, initialScenario }: { aiReady: boolean; initialId: string | null; initialMessages: LabMessage[]; initialScenario: { business: string; category: string; city: string; behavior: string } }) {
  const [sc, setSc] = useState(initialScenario);
  const [convId, setConvId] = useState<string | null>(initialId);
  const [msgs, setMsgs] = useState<LabMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [fixing, setFixing] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [rewrite, setRewrite] = useState(true), [lesson, setLesson] = useState(true);
  const [note, setNote] = useState<{ ok?: string; error?: string; warn?: string[] } | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);

  const apply = (r: LabResult) => { if (r.messages) setMsgs(r.messages); if (r.conversationId) setConvId(r.conversationId); setHandoff(!!r.handoff); setNote(r.error ? { error: r.error } : { ok: r.ok, warn: r.warnings?.length ? r.warnings : undefined }); };
  const run = (p: Promise<LabResult>, after?: (r: LabResult) => void) => start(async () => { try { const r = await p; apply(r); after?.(r); } catch { setNote({ error: "No se pudo completar. Recarga la página e inténtalo de nuevo." }); } });
  const lastAgent = [...msgs].reverse().find((m) => m.role === "agent");

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="card space-y-3 self-start" aria-label="Escenario">
        <h2 className="font-semibold">1. Elige a quién va a escribirle el agente</h2>
        <div><label className="label" htmlFor="l-b">Nombre del negocio de prueba *</label><input id="l-b" className="input" value={sc.business} onChange={(e) => setSc({ ...sc, business: e.target.value })} placeholder="Panadería La Espiga" /></div>
        <div><label className="label" htmlFor="l-c">Rubro</label><input id="l-c" className="input" value={sc.category} onChange={(e) => setSc({ ...sc, category: e.target.value })} placeholder="panadería" /></div>
        <div><label className="label" htmlFor="l-ci">Ciudad</label><input id="l-ci" className="input" value={sc.city} onChange={(e) => setSc({ ...sc, city: e.target.value })} placeholder="Bogotá" /></div>
        <div><label className="label" htmlFor="l-p">Cómo te vas a comportar tú (cliente potencial)</label>
          <select id="l-p" className="input" value={sc.behavior} onChange={(e) => setSc({ ...sc, behavior: e.target.value })}>{Object.entries(BEHAVIOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {sc.behavior && <p className="mt-1 text-xs text-muted">{SCENARIOS[sc.behavior as keyof typeof SCENARIOS]}</p>}</div>
        <button className="btn btn-primary w-full" disabled={pending || !aiReady || sc.business.trim().length < 2} onClick={() => { setHandoff(false); run(startSimulationAction(sc)); }}>{convId ? "Empezar otra conversación" : "Empezar conversación"}</button>
        {!aiReady && <p role="alert" className="text-xs badge-warn">La IA no está configurada: sin ella el agente no puede conversar (ver Agentes y skills).</p>}
        <p className="text-xs text-muted">Es una prueba interna: el agente le «escribe» a quien tú representas aquí; no se envía nada por WhatsApp ni a ningún cliente real.</p>
      </section>

      <section className="card flex min-h-[28rem] flex-col gap-3" aria-label="Conversación">
        <h2 className="font-semibold">2. Conversa y corrige</h2>
        {msgs.length === 0 ? <p className="text-sm text-muted">Pulsa «Empezar conversación»: el agente escribirá el primer mensaje. Respóndele como lo haría ese cliente y, cuando el agente se equivoque, pulsa <b>Corregir</b> y dile qué debió hacer.</p> : (
          <div className="flex max-h-[34rem] flex-1 flex-col gap-3 overflow-y-auto pr-1" role="log" aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={m.role === "agent" ? "max-w-[85%]" : "ml-auto max-w-[85%]"}>
                <div className="rounded-2xl px-3 py-2 text-sm" style={m.role === "agent" ? { background: "var(--color-surface-2)" } : { background: "color-mix(in srgb, var(--color-primary) 22%, transparent)" }}>
                  <div className="mb-0.5 text-[11px] font-semibold text-muted">{m.role === "agent" ? `Agente${m.stage && m.stage in STAGE_LABEL ? ` · ${STAGE_LABEL[m.stage as Stage]}` : ""}` : "Cliente potencial (tú)"}</div>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  {m.originalText && <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer underline">Ver lo que había dicho antes</summary><p className="mt-1 whitespace-pre-wrap">{m.originalText}</p></details>}
                </div>
                {m.role === "agent" && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {m.status === "ok" && <span className="badge badge-ok">✓ Marcado como bien</span>}
                    {m.status === "corrected" && <span className="badge badge-warn">✎ Corregido</span>}
                    {m.status === "pending" && <button className="btn" disabled={pending} onClick={() => run(markOkAction(convId!, m.id))}>👍 Está bien</button>}
                    <button className="btn" disabled={pending} onClick={() => { setFixing(fixing === m.id ? null : m.id); setInstruction(""); setRewrite(true); setLesson(true); }}>✎ Corregir</button>
                  </div>)}
                {fixing === m.id && (
                  <div className="mt-2 space-y-2 rounded border p-3 text-sm" style={{ borderColor: "var(--color-primary)" }}>
                    <label className="label" htmlFor={`fx-${m.id}`}>¿Qué debió hacer distinto?</label>
                    <textarea id={`fx-${m.id}`} className="input" rows={3} maxLength={300} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ej.: Antes de presentarte, pregunta cuántos pedidos envían al día. Sé más breve." />
                    <p className="text-xs text-muted">{instruction.length}/300 · Escribe una regla clara y general (no solo para este caso): así sirve para todas las conversaciones futuras.</p>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={rewrite} onChange={(e) => setRewrite(e.target.checked)} /> Reescribir este mensaje aplicando la corrección</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={lesson} onChange={(e) => setLesson(e.target.checked)} /> Guardar como lección: el agente la aplicará siempre</label>
                    <div className="flex gap-2"><button className="btn btn-primary" disabled={pending || instruction.trim().length < 8 || (!rewrite && !lesson)} onClick={() => run(correctAction(convId!, m.id, instruction, rewrite, lesson), (r) => { if (!r.error) setFixing(null); })}>{pending ? "Aplicando…" : "Aplicar corrección"}</button><button className="btn" onClick={() => setFixing(null)}>Cancelar</button></div>
                  </div>)}
              </div>
            ))}
            {pending && <p className="text-xs text-muted">El agente está escribiendo…</p>}
            <div ref={end} />
          </div>)}
        {handoff && <p role="status" className="badge-ok text-sm">El agente indicó que ahora corresponde que lo siga una persona (o que la conversación terminó). Puedes empezar otra para seguir probando.</p>}
        {msgs.length > 0 && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim() || !convId) return; const t = text; setText(""); run(sendMessageAction(convId, t)); }}>
            <input aria-label="Tu respuesta como cliente potencial" className="input flex-1" maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder={lastAgent ? "Responde como lo haría el cliente potencial…" : ""} disabled={pending} />
            <button className="btn btn-primary" disabled={pending || !text.trim()}>Enviar</button>
          </form>)}
        <div role="status" aria-live="polite">{note?.ok && <p className="badge-ok text-sm">{note.ok}</p>}{note?.error && <p role="alert" className="badge-bad text-sm">{note.error}</p>}{note?.warn?.map((w) => <p key={w} className="badge-warn text-xs">⚠ {w}</p>)}</div>
      </section>
    </div>
  );
}
