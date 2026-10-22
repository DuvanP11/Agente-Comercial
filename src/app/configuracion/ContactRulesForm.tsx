"use client";
import { useState, useTransition } from "react";
import { MAX_ATTEMPTS, MIN_ATTEMPTS } from "@/lib/contact-tracking";
import { saveContactRulesAction, type ConfigState } from "./actions";

export function ContactRulesForm({ maxAttempts }: { maxAttempts: number }) {
  const [n, setN] = useState(String(maxAttempts));
  const [msg, setMsg] = useState<ConfigState | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-3" aria-label="Reglas de contacto">
      <div>
        <h2 className="font-semibold">Reglas de contacto</h2>
        <p className="text-sm text-muted">Cuántas veces se puede intentar contactar a un mismo prospecto. Cada WhatsApp abierto o intento registrado (llamada, correo, visita) cuenta como uno. Al llegar al máximo sin una respuesta clara, el prospecto queda <b>Agotado</b> y la app no deja contactarlo más.</p>
      </div>
      <div>
        <label className="label" htmlFor="maxatt">Máximo de intentos por prospecto ({MIN_ATTEMPTS}–{MAX_ATTEMPTS})</label>
        <input id="maxatt" className="input w-24" type="number" min={MIN_ATTEMPTS} max={MAX_ATTEMPTS} step={1} value={n} onChange={(e) => setN(e.target.value)} />
        <p className="text-xs text-muted">Valor de arranque: 3. Si lo subes, los prospectos agotados vuelven a poder contactarse; si lo bajas, algunos pueden quedar agotados de inmediato.</p>
      </div>
      <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { try { setMsg(await saveContactRulesAction(Number(n))); } catch { setMsg({ error: "No se pudo guardar. Recarga la página e inténtalo de nuevo." }); } })}>{pending ? "Guardando…" : "Guardar regla"}</button>
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad">{msg.error}</p>}</div>
    </section>
  );
}
