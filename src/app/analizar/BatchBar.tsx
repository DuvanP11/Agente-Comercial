"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeManyAction } from "./actions";

const SEL = "input[data-analyze]";
const checked = () => [...document.querySelectorAll<HTMLInputElement>(`${SEL}:checked`)].map((x) => x.dataset.analyze!);
const CHUNK = 5;
const MAX_AUTO_WAIT = 120; // segundos: hasta aquí se espera solo; más que eso (cupo del día) se detiene

/** Casilla de la cabecera: elige o quita todos los prospectos de la tabla. */
export function SelectAllBox() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const sync = () => {
      const all = [...document.querySelectorAll<HTMLInputElement>(SEL)], on = all.filter((x) => x.checked).length;
      if (ref.current) { ref.current.checked = all.length > 0 && on === all.length; ref.current.indeterminate = on > 0 && on < all.length; }
    };
    document.addEventListener("change", sync); sync();
    return () => document.removeEventListener("change", sync);
  }, []);
  return <input ref={ref} type="checkbox" aria-label="Elegir o quitar todos" title="Elegir o quitar todos los de la tabla" onChange={(e) => document.querySelectorAll<HTMLInputElement>(SEL).forEach((x) => { x.checked = e.target.checked; x.dispatchEvent(new Event("change", { bubbles: true })); })} />;
}

interface Result { name: string; reason?: string; state: string }

/** Barra para analizar con IA: los elegidos, todos los que se ven o solo los que faltan por valorar. Procesa de a 5 con avance y botón para detener. */
export function BatchBar({ visibleIds, unratedIds, aiReady }: { visibleIds: string[]; unratedIds: string[]; aiReady: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState(0);
  const [includeRated, setIncludeRated] = useState(false);
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState({ done: 0, total: 0, saved: 0, skipped: 0, failed: 0 });
  const [problems, setProblems] = useState<Result[]>([]);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [waiting, setWaiting] = useState(0);
  const stop = useRef(false);

  useEffect(() => {
    const sync = () => setPicked(checked().length);
    document.addEventListener("change", sync); sync();
    return () => document.removeEventListener("change", sync);
  }, []);

  const run = async (ids: string[], label: string, resume = false) => {
    if (!ids.length) { setNote({ text: "No hay prospectos para analizar con esa opción.", warn: true }); return; }
    const msg = `Se harán hasta ${ids.length} consulta(s) a la IA (${label}). ${includeRated ? "OJO: los que ya tienen valoración, incluidas las hechas por una persona, se REEMPLAZAN. " : "Los que ya tienen valoración se omiten. "}Cada resultado queda marcado «IA (sin revisar)» hasta que una persona lo revise. ¿Continuar?`;
    if (!resume && ids.length > 3 && !confirm(msg)) return;
    setRunning(true); setNote(null); setProblems([]); setPending([]); setWaiting(0); stop.current = false;
    let t = resume ? prog : { done: 0, total: ids.length, saved: 0, skipped: 0, failed: 0 };
    if (resume) t = { ...t, total: t.done + ids.length };
    setProg(t);
    const bad: Result[] = resume ? [...problems] : []; let halted: string | null = null;
    const queue = [...ids]; let autoWaits = 0;
    while (queue.length && !stop.current) {
      const slice = queue.splice(0, CHUNK);
      const r = await analyzeManyAction(slice, includeRated);
      if (r.error) { queue.unshift(...slice); halted = r.error; break; }
      const back = new Set(r.remaining ?? []); // los que el proveedor no dejó analizar: se repiten
      const finished = slice.length - back.size;
      t = { ...t, done: t.done + finished, saved: t.saved + r.saved, skipped: t.skipped + r.skipped - back.size, failed: t.failed + r.failed }; setProg(t);
      for (const it of r.items) if (it.state === "error") bad.push({ name: it.name || "Prospecto", reason: it.reason, state: it.state });
      setProblems([...bad]);
      if (r.stopped && /no está configurada/i.test(r.stopped)) { halted = r.stopped; break; }
      if (back.size) {
        queue.unshift(...slice.filter((id) => back.has(id)));
        if (r.stopped && /límite de uso/i.test(r.stopped)) {
          const wait = r.retryAfterSec ?? 0;
          // Límite corto (por minuto): se espera y se sigue solo. Límite largo (cupo del día) o desconocido: se detiene y queda el botón para continuar.
          if (wait > 0 && wait <= MAX_AUTO_WAIT && autoWaits < 8) {
            autoWaits++;
            for (let left = Math.ceil(wait) + 1; left > 0 && !stop.current; left--) { setWaiting(left); await new Promise((res) => setTimeout(res, 1000)); }
            setWaiting(0); continue;
          }
          halted = `El proveedor de IA alcanzó su límite de uso${wait > 0 ? ` (pide esperar ${wait >= 90 ? `${Math.ceil(wait / 60)} min` : `${wait} s`})` : ""}. Se detuvo el lote; lo ya analizado quedó guardado.`;
          break;
        }
      }
    }
    setRunning(false); setWaiting(0);
    const left = [...queue];
    setPending(left);
    if (halted) setNote({ text: halted + (left.length ? ` Quedan ${left.length} por analizar.` : ""), warn: true });
    else if (stop.current) setNote({ text: `Detenido. Se analizaron ${t.saved}${left.length ? `; quedan ${left.length} sin analizar` : ""}.`, warn: left.length > 0 });
    else setNote({ text: `Listo: ${t.saved} analizado(s)${t.skipped ? `, ${t.skipped} omitido(s)` : ""}${t.failed ? `, ${t.failed} con error` : ""}.`, warn: false });
    router.refresh();
  };

  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  return (
    <section className="card space-y-3" aria-label="Analizar con IA">
      <div><h2 className="font-semibold">Analizar con IA</h2>
        <p className="text-sm text-muted">Elige a quién: uno, varios (marca las casillas de la tabla) o todos. La IA valora cada prospecto con sus datos y evidencias y <b>guarda el resultado marcado «IA (sin revisar)»</b>: sirve para ordenar por prioridad, pero <b>nadie queda «Calificado» hasta que una persona lo revise</b> con el botón «Revisar».</p></div>
      {!aiReady ? <p role="status" className="text-sm badge-warn">La IA no está configurada (ver Integraciones): sin ella no se puede analizar en lote.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" disabled={running || picked === 0} onClick={() => run(checked(), "los elegidos")}>Analizar los elegidos ({picked})</button>
            <button className="btn" disabled={running || visibleIds.length === 0} onClick={() => run(visibleIds, "todos los que se ven")}>Analizar todos los que se ven ({visibleIds.length})</button>
            <button className="btn" disabled={running || unratedIds.length === 0} onClick={() => run(unratedIds, "los que faltan por valorar")}>Solo los que faltan por valorar ({unratedIds.length})</button>
            {running && <button className="btn" onClick={() => { stop.current = true; }}>Detener</button>}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeRated} disabled={running} onChange={(e) => setIncludeRated(e.target.checked)} /> También volver a analizar los que ya tienen valoración (la reemplaza, incluso si la hizo una persona)</label>
        </>)}
      {(running || prog.total > 0) && (
        <div aria-live="polite" className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }}><div className="h-2 rounded-full" style={{ width: `${pct}%`, background: "var(--color-primary)", transition: "width .3s" }} /></div>
          <p className="text-xs text-muted">{prog.done} de {prog.total} revisados · {prog.saved} analizados · {prog.skipped} omitidos · {prog.failed} con error{running ? " (la IA tarda unos segundos por prospecto)" : ""}</p>
        </div>)}
      {waiting > 0 && <p role="status" className="text-sm badge-warn">El proveedor de IA pidió esperar: sigo solo en {waiting} s… (puedes pulsar «Detener»).</p>}
      <div role="status" aria-live="polite">{note && <p className={`text-sm ${note.warn ? "badge-warn" : "badge-ok"}`}>{note.text}</p>}</div>
      {!running && pending.length > 0 && <button className="btn btn-primary" onClick={() => run(pending, "los que quedaron pendientes", true)}>Continuar con los {pending.length} pendientes</button>}
      {problems.length > 0 && <ul className="list-disc pl-5 text-sm">{problems.slice(0, 20).map((x, i) => <li key={i} className="badge-bad"><b>{x.name}:</b> {x.reason}</li>)}{problems.length > 20 && <li className="text-muted">…y {problems.length - 20} más.</li>}</ul>}
    </section>
  );
}

/** Botón rápido de una fila: analiza solo a ese prospecto con IA. */
export function AnalyzeOneButton({ id, rated, aiReady }: { id: string; rated: boolean; aiReady: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!aiReady) return null;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button className="btn" disabled={busy} title={rated ? "Vuelve a analizar solo a este prospecto con IA (reemplaza su valoración)" : "Analiza solo a este prospecto con IA"}
        onClick={async () => {
          if (rated && !confirm("Este prospecto ya tiene una valoración. Si la analizas con IA se REEMPLAZA. ¿Continuar?")) return;
          setBusy(true); setMsg(null);
          const r = await analyzeManyAction([id], true);
          setBusy(false);
          const it = r.items[0];
          setMsg(r.error ?? (it?.state === "saved" ? null : it?.reason ?? r.stopped ?? "No se pudo analizar."));
          if (it?.state === "saved") router.refresh();
        }}>{busy ? "Analizando…" : "✨ IA"}</button>
      {msg && <span role="alert" className="max-w-40 text-xs badge-bad">{msg}</span>}
    </span>
  );
}
