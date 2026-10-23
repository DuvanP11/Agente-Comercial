"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NAV, PROTECTED_MODULES } from "@/lib/nav";
import { saveModulesAction } from "./actions";

/** Interruptores para encender o apagar módulos del menú. Apagar un módulo lo quita del menú y muestra un aviso si alguien abre su dirección. */
export function ModuleSwitches({ hidden: initial, canManage }: { hidden: string[]; canManage: boolean }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const flip = (slug: string, on: boolean) => {
    const next = on ? hidden.filter((h) => h !== slug) : [...hidden, slug];
    const prev = hidden;
    setHidden(next); setMsg(null);
    start(async () => {
      const r = await saveModulesAction(next);
      if (r.error) { setHidden(prev); setMsg({ error: r.error }); } else { setMsg({ ok: "Guardado." }); router.refresh(); }
    });
  };
  return (
    <section className="card space-y-3" aria-label="Módulos del menú">
      <div><h2 className="font-semibold">Módulos del menú</h2>
        <p className="text-sm text-muted">Enciende o apaga lo que necesites. Un módulo apagado <b>desaparece del menú para todos</b> y, si alguien abre su dirección, ve un aviso. No borra datos: al volver a encenderlo todo sigue ahí. {!canManage && <b>Solo Admin, Gerencia y Head pueden cambiarlo.</b>}</p></div>
      <ul className="divide-y divide-[var(--color-border)]">
        {NAV.map((n) => {
          const locked = PROTECTED_MODULES.includes(n.slug), on = !hidden.includes(n.slug);
          return (
            <li key={n.slug} className="flex items-center gap-3 py-2">
              <button type="button" role="switch" aria-checked={on} aria-label={`${n.label}: ${on ? "encendido" : "apagado"}`} disabled={!canManage || locked || pending} onClick={() => flip(n.slug, !on)}
                className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50" style={{ background: on ? "var(--color-primary)" : "var(--color-border)" }}>
                <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
              </button>
              <div className="min-w-0 flex-1"><span className="font-medium">{n.label}</span>{n.group && <span className="ml-2 text-xs text-muted">{n.group}</span>}</div>
              {locked ? <span className="badge">Siempre encendido</span> : <span className={`text-xs ${on ? "text-muted" : "badge-warn"}`}>{on ? "Visible" : "Oculto"}</span>}
            </li>);
        })}
      </ul>
      <div role="status" aria-live="polite">{msg?.ok && <p className="text-sm badge-ok">{msg.ok}</p>}{msg?.error && <p role="alert" className="text-sm badge-bad">{msg.error}</p>}</div>
    </section>
  );
}
