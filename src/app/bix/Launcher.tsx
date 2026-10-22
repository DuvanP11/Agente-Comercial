"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { launchAction } from "./actions";

interface Opt { id: string; name: string; city: string | null; category: string | null; phone: string | null }

/** Entrega leads a Bix: sale de a tandas de 10 con pausa; cada lead recibe el primer mensaje de Bix por WhatsApp. */
export function Launcher({ options, enabled, why, cap, today }: { options: Opt[]; enabled: boolean; why: string; cap: number; today: number }) {
  const router = useRouter();
  const [q, setQ] = useState(""); const [sel, setSel] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false); const [note, setNote] = useState<string | null>(null);
  const [fails, setFails] = useState<{ id: string; error?: string }[]>([]);
  const stop = useRef(false);
  const shown = useMemo(() => options.filter((o) => `${o.name} ${o.city} ${o.category}`.toLowerCase().includes(q.toLowerCase())), [options, q]);
  const left = Math.max(0, cap - today);
  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? id;
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const go = async () => {
    const ids = [...sel]; if (!ids.length) return;
    if (!confirm(`Bix le escribirá por WhatsApp a ${ids.length} lead(s) reales. ¿Continuar?`)) return;
    setRunning(true); setNote(null); setFails([]); stop.current = false;
    let ok = 0; const bad: typeof fails = [];
    for (let i = 0; i < ids.length && !stop.current; i += 10) {
      const r = await launchAction(ids.slice(i, i + 10));
      if (r.error) { setNote(r.error); break; }
      for (const x of r.results) x.ok ? ok++ : bad.push({ id: x.prospectId, error: x.error });
      setFails([...bad]);
      if (r.results.some((x) => !x.ok && /tope diario|rechazó el token|pidió esperar|no está marcado/i.test(x.error ?? ""))) break;
    }
    setRunning(false); setSel(new Set());
    setNote((p) => p ?? `${ok} lead(s) entregados a Bix${bad.length ? `; ${bad.length} no se pudieron (ver abajo)` : ""}.`);
    router.refresh();
  };
  return (
    <section className="card space-y-3" aria-label="Entregar leads a Bix">
      <div><h2 className="font-semibold">Entregar leads a Bix</h2>
        <p className="text-sm text-muted">Bix escribe el primer mensaje por WhatsApp, hace las preguntas filtro y, si hay interés, lo pasa a un Hunter. Solo salen prospectos con WhatsApp válido que no estén marcados «No contactar». Hoy van <b>{today}</b> de <b>{cap}</b> conversaciones nuevas permitidas.</p></div>
      {!enabled ? <p role="status" className="text-sm badge-warn">{why}</p> : options.length === 0 ? <p className="text-sm text-muted">No hay prospectos disponibles para Bix (necesitan teléfono válido y no tener ya una conversación).</p> : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input className="input min-w-60 flex-1" placeholder="Filtrar por nombre, ciudad o categoría" aria-label="Filtrar" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" disabled={running} onClick={() => setSel(sel.size >= shown.length ? new Set() : new Set(shown.slice(0, left || shown.length).map((o) => o.id)))}>{sel.size >= shown.length ? "Quitar todos" : "Elegir los visibles"}</button>
          </div>
          <ul className="max-h-60 overflow-y-auto rounded border border-border text-sm">
            {shown.map((o) => <li key={o.id} className="border-b border-border px-3 py-1.5 last:border-0"><label className="flex items-center gap-2"><input type="checkbox" checked={sel.has(o.id)} disabled={running} onChange={() => toggle(o.id)} /> <b>{o.name}</b><span className="text-muted">{[o.category, o.city].filter(Boolean).join(" · ")}</span><span className="ml-auto text-xs text-muted">{o.phone}</span></label></li>)}
            {shown.length === 0 && <li className="p-3 text-muted">Sin coincidencias.</li>}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={running || !sel.size || sel.size > left} onClick={go}>{running ? "Entregando…" : `Entregar ${sel.size} a Bix`}</button>
            {running && <button className="btn" onClick={() => { stop.current = true; }}>Detener</button>}
            {sel.size > left && <span className="badge-warn text-sm">Elegiste más de los que quedan hoy ({left}).</span>}
          </div>
        </>)}
      <div role="status" aria-live="polite">
        {note && <p className="text-sm badge-ok">{note}</p>}
        {fails.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm">{fails.map((x) => <li key={x.id} className="badge-bad"><b>{nameOf(x.id)}:</b> {x.error}</li>)}</ul>}
      </div>
    </section>
  );
}
