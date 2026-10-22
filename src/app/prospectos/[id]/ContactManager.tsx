"use client";
import { useState, useTransition } from "react";
import { CHANNELS, OUTCOMES, STATE_LABEL, type Channel, type ContactStateKey, type Outcome } from "@/lib/contact-tracking";
import { registerAttemptAction, setOutcomeAction } from "./actions";

export function Dots({ attempts, max }: { attempts: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${attempts} de ${max} intentos`} aria-label={`${attempts} de ${max} intentos`}>
      {Array.from({ length: Math.max(max, attempts) }, (_, i) => (
        <span key={i} className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: i < attempts ? (attempts >= max ? "var(--s5)" : "var(--s1)") : "var(--color-surface-2)", border: "1px solid var(--color-border)" }} />
      ))}
    </span>
  );
}

const tone = (k: ContactStateKey) => (k === "interested" ? "badge-ok" : k === "not_interested" || k === "exhausted" ? "badge-bad" : k === "no_info" || k === "no_answer" ? "badge-warn" : "");

/** Gestión de contacto en la ficha: estado, intentos usados y botones para registrar un intento o el resultado. */
export function ContactManager({ prospectId, stateKey, canContact, reason, attempts, max, outcome, note, lastAttempt }: {
  prospectId: string; stateKey: ContactStateKey; canContact: boolean; reason?: string; attempts: number; max: number; outcome: Outcome; note: string; lastAttempt: string | null;
}) {
  const [channel, setChannel] = useState<Channel>("call");
  const [text, setText] = useState("");
  const [resNote, setResNote] = useState(note);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (p: Promise<{ ok?: string; error?: string }>) => start(async () => { try { setMsg(await p); } catch { setMsg({ error: "No se pudo completar. Recarga la página e inténtalo de nuevo." }); } });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`badge ${tone(stateKey)}`}>{STATE_LABEL[stateKey]}</span>
        <span className="inline-flex items-center gap-2 text-sm"><Dots attempts={attempts} max={max} /> {attempts} de {max} intentos</span>
        {lastAttempt && <span className="text-xs text-muted">Último intento: {lastAttempt}</span>}
      </div>
      {!canContact && reason && <p role="status" className="text-sm badge-warn">{reason}</p>}

      <div className="grid gap-2 md:grid-cols-[10rem_1fr_auto] md:items-end">
        <div><label className="label" htmlFor="ch">Canal del intento</label>
          <select id="ch" className="input" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>{Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="an">Nota (opcional)</label><input id="an" className="input" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: no contestó, llamar mañana" /></div>
        <button className="btn btn-primary" disabled={pending || !canContact} onClick={() => run(registerAttemptAction(prospectId, channel, text).then((r) => { if (r.ok) setText(""); return r; }))}>Registrar intento</button>
      </div>
      <p className="text-xs text-muted">Abrir WhatsApp desde aquí o desde una campaña cuenta como un intento automáticamente. Llamadas, correos y visitas se registran con este botón.</p>

      <div>
        <label className="label" htmlFor="on">Resultado de la gestión (nota opcional)</label>
        <input id="on" className="input mb-2" maxLength={500} value={resNote} onChange={(e) => setResNote(e.target.value)} placeholder="Ej.: pidió cotización de 50 envíos al mes" />
        <div className="flex flex-wrap gap-2">
          {(["contacted", "no_answer", "interested", "not_interested"] as Outcome[]).map((o) => (
            <button key={o} className="btn" disabled={pending} style={outcome === o ? { background: "var(--color-primary)", color: "var(--color-on-primary)" } : undefined} onClick={() => run(setOutcomeAction(prospectId, o, resNote))}>{OUTCOMES[o]}</button>
          ))}
        </div>
      </div>
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad">{msg.error}</p>}</div>
    </div>
  );
}
