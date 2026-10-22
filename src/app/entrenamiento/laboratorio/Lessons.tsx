"use client";
import { useState, useTransition } from "react";
import { deleteLessonAction, toggleLessonAction } from "./actions";

export interface LessonRow { id: string; text: string; active: boolean; createdBy: string | null; createdAt: string }

export function Lessons({ rows }: { rows: LessonRow[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (p: Promise<{ ok?: string; error?: string }>) => start(async () => { try { const r = await p; setMsg(r.error ?? r.ok ?? null); } catch { setMsg("No se pudo completar."); } });
  return (
    <section className="card space-y-2" aria-label="Lecciones aprendidas">
      <div><h2 className="font-semibold">Lecciones aprendidas ({rows.filter((r) => r.active).length} activas)</h2>
        <p className="text-sm text-muted">Cada corrección guardada se suma a las instrucciones de los agentes de conversación, redacción y calificación (las 15 más recientes activas). Desactiva o elimina las que ya no apliquen.</p></div>
      {rows.length === 0 ? <p className="text-sm text-muted">Aún no hay lecciones. Corrige un mensaje del agente y guárdalo como lección.</p> : (
        <ul className="space-y-2">{rows.map((l) => (
          <li key={l.id} className="flex flex-wrap items-start gap-3 rounded p-2 text-sm" style={{ background: "var(--color-surface-2)", opacity: l.active ? 1 : 0.55 }}>
            <div className="min-w-0 flex-1"><p>{l.text}</p><p className="text-xs text-muted">{l.createdBy ?? "—"} · {new Date(l.createdAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}</p></div>
            <button className="btn" disabled={pending} onClick={() => run(toggleLessonAction(l.id, !l.active))}>{l.active ? "Desactivar" : "Activar"}</button>
            <button className="btn" disabled={pending} onClick={() => { if (confirm("¿Eliminar esta lección?")) run(deleteLessonAction(l.id)); }}>Eliminar</button>
          </li>))}</ul>)}
      {msg && <p role="status" className="text-sm badge-ok">{msg}</p>}
    </section>
  );
}
