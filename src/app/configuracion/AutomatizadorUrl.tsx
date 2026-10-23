"use client";
import { useState, useTransition } from "react";
import { saveAutomatizadorUrlAction } from "./actions";

export function AutomatizadorUrl({ url: initial, canManage }: { url: string; canManage: boolean }) {
  const [url, setUrl] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  return (
    <section className="card space-y-2" aria-label="Automatizador de mensajes">
      <div><h2 className="font-semibold">Automatizador de mensajes</h2>
        <p className="text-sm text-muted">Dirección de la web del Automatizador. La opción «Automatizador de mensajes» del menú abre esa web en otra pestaña, y la <b>apariencia</b> que elijas aquí también se aplica allá.</p></div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-72 flex-1" aria-label="Dirección del Automatizador" placeholder="https://…vercel.app" value={url} disabled={!canManage || pending} onChange={(e) => setUrl(e.target.value)} />
        {canManage && <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => setMsg(await saveAutomatizadorUrlAction(url)))}>{pending ? "Guardando…" : "Guardar"}</button>}
      </div>
      {!canManage && <p className="text-xs text-muted">Solo Admin, Gerencia y Head pueden cambiarla.</p>}
      <div role="status" aria-live="polite">{msg?.ok && <p className="text-sm badge-ok">{msg.ok}</p>}{msg?.error && <p role="alert" className="text-sm badge-bad">{msg.error}</p>}</div>
    </section>
  );
}
