import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = {
  new: "Nuevo", excluded_duplicate: "Excluido (duplicado)", needs_review: "Revisar duplicado",
  qualified: "Calificado", contacted: "Contactado", archived: "Archivado",
};

export default async function Prospectos({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const all = await db.select().from(prospects).where(eq(prospects.orgId, org)).orderBy(desc(prospects.createdAt)).limit(500);
  const rows = status ? all.filter((p) => p.status === status) : all;
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Base de prospectos</h1>
        <p className="text-sm text-muted">{all.length} registros. Filtra por estado:</p>
        <nav aria-label="Filtros" className="mt-2 flex flex-wrap gap-2">
          <Link className="btn" href="/prospectos">Todos</Link>
          {Object.entries(LABEL).map(([k, v]) => <Link key={k} className="btn" href={`/prospectos?status=${k}`}>{v}</Link>)}
        </nav>
      </header>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <p className="text-sm text-muted">No hay prospectos con este filtro. Ejecuta una búsqueda en “Buscar clientes”.</p> : (
          <table className="table">
            <thead><tr><th>Empresa</th><th>Ciudad</th><th>Categoría</th><th>Fuente</th><th>Estado</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td><Link className="font-semibold underline" href={`/prospectos/${p.id}`}>{p.name}</Link>{p.isDemo && <span className="badge badge-warn ml-2">Demo</span>}</td>
                <td>{p.city}</td><td>{p.category}</td><td>{p.sourceName}</td><td><span className="badge">{LABEL[p.status] ?? p.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
