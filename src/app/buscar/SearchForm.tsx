"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { OutcomeTable } from "@/components/OutcomeTable";
import { analyzeResultsAction, interpretAction, runSearch, type AnalyzeResult, type InterpretResult, type SearchState } from "./actions";
import type { Reading } from "@/lib/services/agents";
import { describeSearch, keptFieldNames, mergeInterpretation, type FieldSource, type FormFields } from "@/lib/search-form";
import type { IngestOutcome } from "@/lib/services/prospects";


interface Source { id: string; label: string; ready: boolean; howTo?: string }

export interface Restored {
  searchId: string; connector: string; brief: string;
  criteria: { city: string; zones: string[]; categories: string[]; maxResults: number; excludeTerms: string[] };
  snapshot: { message: string; errors: string[]; items: IngestOutcome[] } | null;
}

export function SearchForm({ sources, restored, aiReady = false }: { sources: Source[]; restored?: Restored; aiReady?: boolean }) {
  const initial: SearchState = restored?.snapshot
    ? { status: "ok", message: restored.snapshot.message, errors: restored.snapshot.errors, outcomes: restored.snapshot.items, searchId: restored.searchId }
    : { status: "idle" };
  const [s, action, pending] = useActionState<SearchState, FormData>(runSearch, initial);
  const [sel, setSel] = useState(sources.find((x) => x.id === restored?.connector)?.id ?? sources.find((x) => x.ready)?.id ?? sources[0].id);
  // Campos controlados: React vacía los no controlados al terminar la acción y se perderían los criterios.
  const c = restored?.criteria;
  const [brief, setBrief] = useState(restored?.brief ?? "");
  const [city, setCity] = useState(c?.city ?? "Bogotá");
  const [zones, setZones] = useState(c?.zones.join(", ") ?? "");
  const [categories, setCategories] = useState(c?.categories.join(", ") ?? "");
  const [excludeTerms, setExcludeTerms] = useState(c?.excludeTerms.join(", ") ?? "");
  const [maxResults, setMaxResults] = useState(String(c?.maxResults ?? 20));

  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [batch, setBatch] = useState<AnalyzeResult | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const analyze = () => startAnalyze(async () => {
    const ids = (s.outcomes ?? []).filter((o) => o.status !== "excluded_duplicate").map((o) => o.prospectId);
    const r = await analyzeResultsAction(ids);
    setBatch(r);
    // Se conserva lo ya leído; solo se reemplazan filas con un resultado nuevo (no las «omitidas» de este lote).
    setReadings((cur) => { const next = { ...cur }; for (const x of r.readings) if (x.state !== "skipped" || !next[x.prospectId]) next[x.prospectId] = x; return next; });
  });
  const [ai, setAi] = useState<InterpretResult | null>(null);
  const [merged, setMerged] = useState<{ next: FormFields; source: Record<keyof FormFields, FieldSource> } | null>(null);
  const [aiPending, startAi] = useTransition();
  const interpret = () => startAi(async () => {
    const r = await interpretAction(brief);
    setAi(r);
    if (r.ok && r.output) {
      // La IA solo reemplaza lo que ENCONTRÓ; lo que ya habías escrito (ciudad, zonas, exclusiones) se conserva.
      const m = mergeInterpretation({ city, zones, categories, excludeTerms, maxResults }, r.output);
      setMerged(m);
      setCity(m.next.city); setZones(m.next.zones); setCategories(m.next.categories); setExcludeTerms(m.next.excludeTerms); setMaxResults(m.next.maxResults);
    } else setMerged(null);
  });

  // Tras una búsqueda nueva, la URL apunta a ella: así "Volver" desde una ficha y recargar la página la recuperan.
  useEffect(() => {
    if (s.status === "ok" && s.searchId) window.history.replaceState(null, "", `/buscar?search=${s.searchId}`);
  }, [s.status, s.searchId]);
  const current = sources.find((x) => x.id === sel)!;
  return (
    <div className="space-y-4">
      {!current.ready && <p role="status" className="card badge-warn">{current.label} no está conectado. {current.howTo} La búsqueda no devolverá resultados hasta entonces; no se muestran datos inventados.</p>}
      {current.id === "openstreetmap" && <p role="note" className="card text-sm">OpenStreetMap es gratis y sin clave, pero es información colaborativa: encuentra bien nombre y dirección, y <b>pocos negocios traen teléfono o web</b>. Los resultados con más datos salen primero. El servidor público puede tardar o saturarse.</p>}
      <form action={action} className="card grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2"><label className="label" htmlFor="connector">Fuente de datos</label>
          <select id="connector" name="connector" className="input" value={sel} onChange={(e) => setSel(e.target.value)}>
            {sources.map((x) => <option key={x.id} value={x.id}>{x.label}{x.ready ? "" : " — no conectada"}</option>)}</select></div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="brief">Descripción en lenguaje natural (se guarda como contexto)</label>
          <textarea id="brief" name="brief" rows={2} className="input" value={brief} onChange={(e) => { setBrief(e.target.value); setAi(null); setMerged(null); }} placeholder="Ej.: cosmética y moda con tienda online en Chapinero y Usaquén…" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" className="btn" disabled={!aiReady || aiPending || brief.trim().length < 3} onClick={interpret}>{aiPending ? "Interpretando…" : "Interpretar con IA"}</button>
            <span className="text-xs text-muted">{aiReady ? "Llena los campos de abajo a partir de tu descripción. Revísalos antes de buscar." : "IA no configurada: completa los campos a mano (ver Agentes y skills)."}</span>
          </div>
          {ai && !ai.ok && <p role="alert" className="mt-1 text-sm badge-bad">{ai.error}</p>}
          {ai?.ok && merged && (
            <div role="status" className="mt-2 space-y-2 rounded border border-border p-3 text-sm">
              <p><b>Entendí:</b> {describeSearch(merged.next)}</p>
              {keptFieldNames(merged.source).length > 0 && (
                <p className="text-xs text-muted">Se mantuvieron {keptFieldNames(merged.source).join(", ")} del formulario porque tu texto no los menciona. Cámbialos abajo si hace falta.</p>)}
              {(ai.output?.suggestions ?? []).filter((x) => !categories.toLowerCase().includes(x.toLowerCase())).length > 0 && (
                <div><span className="text-xs text-muted">Para ampliar la búsqueda, añade rubros relacionados:</span>
                  <div className="mt-1 flex flex-wrap gap-2">{(ai.output?.suggestions ?? []).filter((x) => !categories.toLowerCase().includes(x.toLowerCase())).map((x) => (
                    <button key={x} type="button" className="btn !py-0.5 text-xs" onClick={() => setCategories((c) => (c.trim() ? `${c.trim()}, ${x}` : x))}>+ {x}</button>))}</div></div>)}
              {ai.warnings.filter((w) => !w.startsWith("No se detectó la ciudad")).map((w) => <p key={w} className="badge-warn">⚠ {w}</p>)}
              {ai.output?.notes && <p className="text-xs text-muted">Nota del modelo: {ai.output.notes}</p>}
            </div>)}
          {aiReady && brief.trim().length > 0 && brief.trim().length < 3 && <p className="mt-1 text-xs text-muted">Escribe al menos 3 letras para poder interpretar.</p>}
        </div>
        <div><label className="label" htmlFor="city">Ciudad *</label><input id="city" name="city" autoComplete="off" required className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div><label className="label" htmlFor="zones">Localidades o zonas (separadas por coma)</label><input id="zones" name="zones" autoComplete="off" className="input" value={zones} onChange={(e) => setZones(e.target.value)} placeholder="Chapinero, Usaquén, Suba" /></div>
        <div><label className="label" htmlFor="categories">Categorías / sectores * (coma)</label><input id="categories" name="categories" autoComplete="off" required className="input" value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="tienda de cosméticos, tienda de ropa" /></div>
        <div><label className="label" htmlFor="excludeTerms">Excluir si el nombre contiene</label><input id="excludeTerms" name="excludeTerms" autoComplete="off" className="input" value={excludeTerms} onChange={(e) => setExcludeTerms(e.target.value)} /></div>
        <div><label className="label" htmlFor="maxResults">Máximo de resultados (1–60)</label><input id="maxResults" name="maxResults" autoComplete="off" type="number" min={1} max={60} className="input" value={maxResults} onChange={(e) => setMaxResults(e.target.value)} /></div>
        <div className="flex items-end"><button className="btn btn-primary" disabled={pending || !current.ready}>{pending ? "Buscando… (puede tardar hasta un minuto)" : `Buscar en ${current.label}`}</button></div>
      </form>

      {s.status === "error" && <p role="alert" className="card badge-bad">{s.message}</p>}
      {s.status === "ok" && (
        <div className="card space-y-3">
          <p role="status" className="font-semibold">{s.message}</p>
          {s.errors?.map((e) => <p key={e} className="text-sm badge-warn">Fuente con error parcial: {e}</p>)}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn" disabled={!aiReady || analyzing || (s.outcomes ?? []).length === 0} onClick={analyze}>{analyzing ? "Analizando… (puede tardar)" : "Analizar resultados con IA"}</button>
            <span className="text-xs text-muted">{aiReady ? "Lee hasta 8 resultados por clic y muestra una vista previa. No guarda ninguna valoración; vuelve a pulsar para continuar con los pendientes." : "IA no configurada (ver Agentes y skills)."}</span>
          </div>
          {batch?.error && <p role="alert" className="text-sm badge-bad">{batch.error}</p>}
          {batch && !batch.error && (
            <div role="status" className="text-sm">
              <p>{batch.analyzed} analizados ahora{batch.cached ? `, ${batch.cached} con análisis previo reutilizado` : ""}{batch.pending ? `, ${batch.pending} pendientes (pulsa de nuevo)` : ""}.</p>
              {batch.stopped && <p className="badge-warn">⚠ {batch.stopped}</p>}
            </div>)}
          <OutcomeTable outcomes={s.outcomes!} searchId={s.searchId} readings={Object.keys(readings).length ? readings : undefined} />
        </div>
      )}
    </div>
  );
}
