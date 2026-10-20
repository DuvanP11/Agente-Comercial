"use client";
import { useState, useTransition } from "react";
import { openWhatsApp } from "./actions";

export function Composer({ prospectId, initial, canWhatsApp }: { prospectId: string; initial: string; canWhatsApp: boolean }) {
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <label className="label" htmlFor="body">Mensaje (edítalo antes de abrir WhatsApp)</label>
      <textarea id="body" rows={6} className="input" value={text} onChange={(e) => setText(e.target.value)} />
      <p className="text-xs text-muted">Borrador de plantilla fija. La redacción personalizada con IA está pendiente (fase 6).</p>
      <button className="btn btn-primary" disabled={!canWhatsApp || pending} onClick={() => start(async () => {
        const r = await openWhatsApp(prospectId, text);
        if (r.url) { window.open(r.url, "_blank", "noopener,noreferrer"); setMsg("WhatsApp abierto. Registrado como “conversación abierta”; el mensaje no se ha enviado hasta que lo envíes tú."); }
        else setMsg(r.error ?? "No se pudo abrir.");
      })}>Abrir WhatsApp</button>
      {!canWhatsApp && <p className="text-sm badge-warn">Sin teléfono válido: no se puede abrir WhatsApp.</p>}
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}
