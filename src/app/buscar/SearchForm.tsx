"use client";
import { useActionState, useState } from "react";
import { runSearch, type SearchState } from "./actions";

const BADGE = { new: "badge-ok", excluded_duplicate: "badge-bad", needs_review: "badge-warn" } as const;
const LABEL = { new: "Nuevo", excluded_duplicate: "Excluido (duplicado)", needs_review: "Revisar duplicado" } as const;

interface Source { id: string; label: string; ready: boolean; howTo?: string }

export function SearchForm({ sources }: { sources: Source[] }) {
  const [s, action, pending] = useActionState<SearchState, FormData>(runSearch, { status: "idle" });
  const [sel, setSel] = useState(sources.find((x) => x.ready)?.id ?? sources[0].id);
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
          <textarea id="brief" name="brief" rows={2} className="input" placeholder="Ej.: cosmética y moda con tienda online en Chapinero y Usaquén…" />
          <p className="mt-1 text-xs text-muted">La conversión automática a criterios con IA está pendiente (fase 4). Por ahora completa los campos de abajo.</p>
        </div>
        <div><label className="label" htmlFor="city">Ciudad *</label><input id="city" name="city" required className="input" defaultValue="Bogotá" /></div>
        <div><label className="label" htmlFor="zones">Localidades o zonas (separadas por coma)</label><input id="zones" name="zones" className="input" placeholder="Chapinero, Usaquén, Suba" /></div>
        <div><label className="label" htmlFor="categories">Categorías / sectores * (coma)</label><input id="categories" name="categories" required className="input" placeholder="tienda de cosméticos, tienda de ropa" /></div>
        <div><label className="label" htmlFor="excludeTerms">Excluir si el nombre contiene</label><input id="excludeTerms" name="excludeTerms" className="input" /></div>
        <div><label className="label" htmlFor="maxResults">Máximo de resultados (1–60)</label><input id="maxResults" name="maxResults" type="number" min={1} max={60} defaultValue={20} className="input" /></div>
        <div className="flex items-end"><button className="btn btn-primary" disabled={pending || !current.ready}>{pending ? "Buscando… (puede tardar hasta un minuto)" : `Buscar en ${current.label}`}</button></div>
      </form>

      {s.status === "error" && <p role="alert" className="card badge-bad">{s.message}</p>}
      {s.status === "ok" && (
        <div className="card space-y-3">
          <p role="status" className="font-semibold">{s.message}</p>
          {s.errors?.map((e) => <p key={e} className="text-sm badge-warn">Fuente con error parcial: {e}</p>)}
          <table className="table">
            <thead><tr><th>Empresa</th><th>Resultado</th><th>Detalle</th></tr></thead>
            <tbody>{s.outcomes!.map((o) => (
              <tr key={o.prospectId}><td>{o.name}</td><td><span className={`badge ${BADGE[o.status]}`}>{LABEL[o.status]}</span></td>
                <td className="text-sm">{o.message}{o.matchedWith && <> Coincide con {o.matchedWith.type === "client" ? "cliente" : "prospecto"}: <b>{o.matchedWith.name}</b>.</>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
