"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WebResult } from "@/lib/services/web-research";
import { applyWebFindingAction, researchWebsiteAction } from "./web-actions";

/** Busca teléfono y correo en la página pública del propio negocio. Muestra candidatos con su página de origen; tú eliges cuáles guardar. */
export function WebResearch({ prospectId, website }: { prospectId: string; website: string }) {
  const router = useRouter();
  const [res, setRes] = useState<WebResult | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const use = (kind: "phone" | "email", value: string, url: string) => start(async () => { try { const r = await applyWebFindingAction(prospectId, kind, value, url); setMsg(r); if (r.ok) router.refresh(); } catch { setMsg({ error: "No se pudo guardar." }); } });
  const row = (kind: "phone" | "email", f: { display: string; value: string; where: string; sourceUrl: string }) => (
    <li key={`${kind}${f.display}`} className="flex flex-wrap items-center gap-2 text-sm">
      <b>{f.display}</b><span className="text-xs text-muted">({f.where})</span>
      <a className="text-xs underline" href={f.sourceUrl} target="_blank" rel="noopener noreferrer">ver página de origen</a>
      <button className="btn" disabled={pending} onClick={() => use(kind, kind === "phone" ? f.value : f.display, f.sourceUrl)}>Usar</button>
    </li>
  );
  return (
    <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" disabled={pending} onClick={() => start(async () => { setMsg(null); try { const r = await researchWebsiteAction(prospectId); if (r.error) setMsg({ error: r.error }); else setRes(r.result ?? null); } catch { setMsg({ error: "No se pudo leer el sitio web." }); } })}>{pending ? "Leyendo…" : "Buscar contacto en su sitio web"}</button>
        <span className="text-xs text-muted">Lee la página pública de {website.replace(/^https?:\/\//, "")} (respeta su robots.txt). Tarda unos segundos.</span>
      </div>
      {res && (
        <div className="space-y-2">
          {(res.phones.length + res.whatsapp.length + res.emails.length) > 0 && (
            <ul className="space-y-1">
              {res.phones.map((f) => row("phone", f))}
              {res.whatsapp.filter((w) => !res.phones.some((p) => p.display === w.display)).map((f) => row("phone", f))}
              {res.emails.map((f) => row("email", f))}
            </ul>)}
          {res.notes.map((n) => <p key={n} className="text-xs text-muted">{n}</p>)}
          <details className="text-xs text-muted"><summary className="cursor-pointer underline">Páginas revisadas ({res.pages.length})</summary><ul className="mt-1 list-disc pl-5">{res.pages.map((p) => <li key={p.url}>{p.url} — {p.ok ? "leída" : p.note}</li>)}</ul></details>
        </div>)}
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok text-sm">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad text-sm">{msg.error}</p>}</div>
    </div>
  );
}
