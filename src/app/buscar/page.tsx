import { getConnectors } from "@/lib/connectors/registry";
import Link from "next/link";
import { SearchForm } from "./SearchForm";

export const dynamic = "force-dynamic";
// Las búsquedas encadenan geocodificación + consulta externa; margen para el servidor saturado de OSM.
export const maxDuration = 60;

export default function Buscar() {
  const sources = getConnectors().map((c) => ({ id: c.id, label: c.label, ready: c.status().state === "connected", howTo: (() => { const st = c.status(); return st.state === "not_configured" ? st.howTo : undefined; })() }));
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Buscar clientes</h1>
        <p className="text-sm text-muted">Cada resultado se compara con tus clientes y prospectos antes de guardarse.</p>
      </header>
      <p className="card text-sm">¿Sin clave de Google? Puedes cargar tu propia lista en <Link className="underline font-semibold" href="/importar">Importar prospectos</Link> (CSV o Excel, sin costo).</p>
      <SearchForm sources={sources} />
    </div>
  );
}
