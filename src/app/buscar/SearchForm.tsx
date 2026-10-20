"use client";
import { useActionState, useEffect, useState } from "react";
import { OutcomeTable } from "@/components/OutcomeTable";
import { runSearch, type SearchState } from "./actions";
import type { IngestOutcome } from "@/lib/services/prospects";


interface Source { id: string; label: string; ready: boolean; howTo?: string }

export interface Restored {
  searchId: string; connector: string; brief: string;
  criteria: { city: string; zones: string[]; categories: string[]; maxResults: number; excludeTerms: string[] };
  snapshot: { message: string; errors: string[]; items: IngestOutcome[] } | null;
}

export function SearchForm({ sources, restored }: { sources: Source[]; restored?: Restored }) {
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
          <textarea id="brief" name="brief" rows={2} className="input" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ej.: cosmética y moda con tienda online en Chapinero y Usaquén…" />
          <p className="mt-1 text-xs text-muted">La conversión automática a criterios con IA está pendiente (fase 4). Por ahora completa los campos de abajo.</p>
        </div>
        <div><label className="label" htmlFor="city">Ciudad *</label><input id="city" name="city" required className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div><label className="label" htmlFor="zones">Localidades o zonas (separadas por coma)</label><input id="zones" name="zones" className="input" value={zones} onChange={(e) => setZones(e.target.value)} placeholder="Chapinero, Usaquén, Suba" /></div>
        <div><label className="label" htmlFor="categories">Categorías / sectores * (coma)</label><input id="categories" name="categories" required className="input" value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="tienda de cosméticos, tienda de ropa" /></div>
        <div><label className="label" htmlFor="excludeTerms">Excluir si el nombre contiene</label><input id="excludeTerms" name="excludeTerms" className="input" value={excludeTerms} onChange={(e) => setExcludeTerms(e.target.value)} /></div>
        <div><label className="label" htmlFor="maxResults">Máximo de resultados (1–60)</label><input id="maxResults" name="maxResults" type="number" min={1} max={60} className="input" value={maxResults} onChange={(e) => setMaxResults(e.target.value)} /></div>
        <div className="flex items-end"><button className="btn btn-primary" disabled={pending || !current.ready}>{pending ? "Buscando… (puede tardar hasta un minuto)" : `Buscar en ${current.label}`}</button></div>
      </form>

      {s.status === "error" && <p role="alert" className="card badge-bad">{s.message}</p>}
      {s.status === "ok" && (
        <div className="card space-y-3">
          <p role="status" className="font-semibold">{s.message}</p>
          {s.errors?.map((e) => <p key={e} className="text-sm badge-warn">Fuente con error parcial: {e}</p>)}
          <OutcomeTable outcomes={s.outcomes!} searchId={s.searchId} />
        </div>
      )}
    </div>
  );
}
