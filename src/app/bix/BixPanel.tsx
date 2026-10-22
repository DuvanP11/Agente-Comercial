"use client";
import { useState, useTransition } from "react";
import { saveWebhookAction, setReadyAction, testWebhookAction, type BixResult } from "./actions";

export interface Item { key: string; label: string; ok: boolean; detail: string; needed: "ready" | "send" }

/** Lista de verificación de Bix, el interruptor «listo» y el webhook de Google Chat (estos dos solo los maneja un administrador). */
export function BixPanel({ items, ready, readyBy, canMarkReady, canManage, hasWebhook }: { items: Item[]; ready: boolean; readyBy: string | null; canMarkReady: boolean; canManage: boolean; hasWebhook: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<BixResult | null>(null);
  const [url, setUrl] = useState("");
  const run = (fn: () => Promise<BixResult>) => start(async () => setRes(await fn()));
  return (
    <section className="card space-y-3" aria-label="Lista de verificación de Bix">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">¿Bix está listo?</h2>
        <span className={`badge ${ready ? "badge-ok" : "badge-warn"}`}>{ready ? `Listo${readyBy ? ` · lo marcó ${readyBy}` : ""}` : "Apagado"}</span>
        {canManage && (
          <label className="ml-auto flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={ready} disabled={pending || (!ready && !canMarkReady)} onChange={(e) => run(() => setReadyAction(e.target.checked))} />
            Bix está listo para hablar con leads
          </label>)}
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((i) => (
          <li key={i.key} className="flex gap-2"><span aria-hidden>{i.ok ? "✅" : "⬜"}</span>
            <span><b>{i.label}</b>{i.needed === "send" && <span className="text-xs text-muted"> (necesario para enviar)</span>} <span className="text-muted">— {i.detail}</span></span></li>))}
      </ul>
      {!canManage && <p className="text-xs text-muted">Solo Admin, Gerencia y Head marcan a Bix como listo y configuran el espacio de Google Chat.</p>}
      {canManage && (
        <div className="space-y-2 rounded border p-3" style={{ borderColor: "var(--color-border)" }}>
          <label className="label" htmlFor="bx-hook">Webhook del espacio de Google Chat {hasWebhook && <span className="badge badge-ok">guardado</span>}</label>
          <div className="flex flex-wrap gap-2">
            <input id="bx-hook" type="password" autoComplete="off" className="input min-w-72 flex-1" placeholder={hasWebhook ? "•••••• (pega uno nuevo para reemplazarlo)" : "https://chat.googleapis.com/v1/spaces/…"} value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn" disabled={pending || !url.trim()} onClick={() => run(async () => { const r = await saveWebhookAction(url); if (r.ok) setUrl(""); return r; })}>Guardar</button>
            {hasWebhook && <button className="btn" disabled={pending} onClick={() => run(testWebhookAction)}>Enviar mensaje de prueba</button>}
            {hasWebhook && <button className="btn" disabled={pending} onClick={() => { if (confirm("¿Quitar el webhook? Bix dejará de avisar leads.")) run(() => saveWebhookAction("")); }}>Quitar</button>}
          </div>
          <p className="text-xs text-muted">En Google Chat: abre el espacio → nombre del espacio → Apps e integraciones → Webhooks → crear. La URL se guarda cifrada y no se vuelve a mostrar.</p>
        </div>)}
      <div role="status" aria-live="polite">{res?.ok && <p className="text-sm badge-ok">{res.ok}</p>}{res?.error && <p role="alert" className="text-sm badge-bad">{res.error}</p>}</div>
    </section>
  );
}
