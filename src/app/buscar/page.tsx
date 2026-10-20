import Link from "next/link";
import { getConnectors } from "@/lib/connectors/registry";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { loadSearch } from "@/lib/services/searches";
import { aiReady } from "@/lib/ai/ready";
import { SearchForm } from "./SearchForm";

export const dynamic = "force-dynamic";
// Las búsquedas encadenan geocodificación + consulta externa; margen para el servidor saturado de OSM.
export const maxDuration = 60;

export default async function Buscar({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { search } = await searchParams;
  const sources = getConnectors().map((c) => ({ id: c.id, label: c.label, ready: c.status().state === "connected", howTo: (() => { const st = c.status(); return st.state === "not_configured" ? st.howTo : undefined; })() }));

  // Volver desde una ficha: se recupera la búsqueda guardada (criterios + resultados con su estado actual).
  let restored = null;
  if (search) {
    const db = await getDb();
    restored = await loadSearch(db, await ensureDefaultOrg(db), search);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Buscar clientes</h1>
        <p className="text-sm text-muted">Cada resultado se compara con tus clientes y prospectos antes de guardarse.</p>
      </header>
      {search && !restored && <p role="alert" className="card badge-warn">No se encontró esa búsqueda guardada. Puedes hacer una nueva.</p>}
      <p className="card text-sm">¿Sin clave de Google? Puedes cargar tu propia lista en <Link className="underline font-semibold" href="/importar">Importar prospectos</Link> (CSV o Excel, sin costo).</p>
      <SearchForm sources={sources} aiReady={aiReady()} restored={restored ? {
        searchId: restored.id, connector: restored.connector, brief: restored.brief ?? "", criteria: restored.criteria, snapshot: restored.snapshot,
      } : undefined} />
    </div>
  );
}
