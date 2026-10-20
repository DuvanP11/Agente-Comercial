import Link from "next/link";
import { desc, eq, ne, and } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import type { StoredScore } from "@/lib/services/analysis";

export const dynamic = "force-dynamic";

export default async function Analizar() {
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const rows = await db.select().from(prospects).where(and(eq(prospects.orgId, org), ne(prospects.status, "excluded_duplicate"))).orderBy(desc(prospects.createdAt)).limit(300);
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Analizar clientes</h1>
        <p className="text-sm text-muted">Valora cada criterio con su evidencia. Lo que no sepas, déjalo como “desconocido”: no suma ni resta. La propuesta automática con IA está pendiente.</p></header>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <p className="text-sm text-muted">No hay prospectos por analizar. Ejecuta una búsqueda primero.</p> : (
          <table className="table">
            <thead><tr><th>Empresa</th><th>Estado</th><th>Prioridad</th><th>Cobertura</th><th></th></tr></thead>
            <tbody>{rows.map((p) => {
              const s = p.scoreJson as StoredScore | null;
              return (
                <tr key={p.id}><td>{p.name}{p.isDemo && <span className="badge badge-warn ml-2">Demo</span>}</td>
                  <td><span className="badge">{p.status}</span></td>
                  <td>{!s ? "Sin valorar" : s.priority ?? "Info. insuficiente"}</td>
                  <td>{s ? `${Math.round(s.coverage * 100)} %` : "—"}</td>
                  <td><Link className="btn" href={`/analizar/${p.id}`}>{s ? "Revisar" : "Analizar"}</Link></td></tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
