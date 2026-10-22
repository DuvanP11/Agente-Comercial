import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { listClients } from "@/lib/services/clients";
import { ClientImportHelp } from "./ClientImportHelp";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function Clientes() {
  const db = await getDb();
  const rows = await listClients(db, await ensureDefaultOrg(db));
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Clientes existentes</h1>
        <p className="text-sm text-muted">Cargar clientes existentes evita que se contacten como prospectos nuevos. {rows.length} registrados.</p>
      </header>
      <section aria-labelledby="cargar"><h2 id="cargar" className="mb-2 font-semibold">Cargar clientes existentes</h2><div className="space-y-3"><ClientImportHelp /><ImportForm /></div></section>
      <section aria-labelledby="lista" className="card overflow-x-auto">
        <h2 id="lista" className="mb-2 font-semibold">Registrados</h2>
        {rows.length === 0 ? <p className="text-sm text-muted">Aún no hay clientes cargados. Importa un CSV o Excel para empezar.</p> : (
          <table className="table">
            <thead><tr><th>Nombre</th><th>NIT</th><th>Ciudad</th><th>Teléfono</th><th>Web</th><th>Estado</th></tr></thead>
            <tbody>{rows.slice(0, 200).map((c) => (
              <tr key={c.id}><td>{c.name}</td><td>{c.nit}</td><td>{c.city}</td><td>{c.phone}</td><td>{c.website}</td><td>{c.commercialStatus}</td></tr>
            ))}</tbody>
          </table>
        )}
        {rows.length > 200 && <p className="mt-2 text-xs text-muted">Mostrando 200 de {rows.length}.</p>}
      </section>
    </div>
  );
}
