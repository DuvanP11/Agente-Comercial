import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { mailtoLink, phoneLinks, safeWebUrl } from "@/lib/contact-links";
import { CONTACT_FILTER_LABEL, isContactFilter, matchesContactFilter, type ContactFilter } from "@/lib/contact-filter";

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = {
  new: "Nuevo", excluded_duplicate: "Excluido (duplicado)", needs_review: "Revisar duplicado",
  qualified: "Calificado", contacted: "Contactado", archived: "Archivado",
};

export default async function Prospectos({ searchParams }: { searchParams: Promise<{ status?: string; contacto?: string }> }) {
  const sp = await searchParams;
  const status = sp.status && sp.status in LABEL ? sp.status : undefined;
  const contacto: ContactFilter = isContactFilter(sp.contacto) ? sp.contacto : "all";
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const all = await db.select().from(prospects).where(eq(prospects.orgId, org)).orderBy(desc(prospects.createdAt)).limit(500);
  // El filtro de contacto usa las claves ya validadas (teléfono válido, correo válido, dominio): un dato mal escrito no cuenta.
  const hasKeys = (p: (typeof all)[number]) => ({ phone: p.phoneKey || null, email: p.emailKey || null, website: p.domainKey || null });
  const byStatus = status ? all.filter((p) => p.status === status) : all;
  const rows = byStatus.filter((p) => matchesContactFilter(hasKeys(p), contacto));
  const href = (s?: string, c?: ContactFilter) => {
    const q = new URLSearchParams();
    if (s) q.set("status", s);
    if (c && c !== "all") q.set("contacto", c);
    const t = q.toString();
    return t ? `/prospectos?${t}` : "/prospectos";
  };
  const pill = (active: boolean) => (active ? { background: "var(--color-primary)", color: "var(--color-on-primary)" } : undefined);
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Base de prospectos</h1>
        <p className="text-sm text-muted">{rows.length} de {all.length} registros.</p>
        <nav aria-label="Filtrar por estado" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Estado:</span>
          <Link className="btn" style={pill(!status)} href={href(undefined, contacto)}>Todos</Link>
          {Object.entries(LABEL).map(([k, v]) => <Link key={k} className="btn" style={pill(status === k)} href={href(k, contacto)}>{v}</Link>)}
        </nav>
        <nav aria-label="Filtrar por contacto" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Contacto:</span>
          {(Object.keys(CONTACT_FILTER_LABEL) as ContactFilter[]).map((f) => {
            const n = byStatus.filter((p) => matchesContactFilter(hasKeys(p), f)).length;
            return <Link key={f} className="btn" style={pill(contacto === f)} href={href(status, f)}>{CONTACT_FILTER_LABEL[f]} ({n})</Link>;
          })}
        </nav>
      </header>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <p className="text-sm text-muted">No hay prospectos con estos filtros. Prueba otros, o ejecuta una búsqueda en “Buscar clientes”.</p> : (
          <table className="table">
            <thead><tr><th>Empresa</th><th>Ciudad</th><th>Categoría</th><th>Teléfono</th><th>Correo</th><th>Web</th><th>Fuente</th><th>Estado</th></tr></thead>
            <tbody>{rows.map((p) => {
              const web = safeWebUrl(p.website), mail = mailtoLink(p.email);
              return (
                <tr key={p.id}>
                  <td><Link className="font-semibold underline" href={`/prospectos/${p.id}`}>{p.name}</Link>{p.isDemo && <span className="badge badge-warn ml-2">Demo</span>}</td>
                  <td>{p.city}</td><td>{p.category}</td>
                  <td className="text-sm">{p.phone ? phoneLinks(p.phone).map((x, i) => <div key={i} className="whitespace-nowrap">{x.href ? <a className="underline" href={x.href}>{x.text}</a> : x.text}</div>) : <span className="text-muted">—</span>}</td>
                  <td className="text-sm">{p.email ? (mail ? <a className="break-all underline" href={mail}>{p.email}</a> : p.email) : <span className="text-muted">—</span>}</td>
                  <td className="text-sm">{p.website ? (web ? <a className="break-all underline" target="_blank" rel="noopener noreferrer" href={web}>{p.website}</a> : p.website) : <span className="text-muted">—</span>}</td>
                  <td>{p.sourceName}</td><td><span className="badge">{LABEL[p.status] ?? p.status}</span></td>
                </tr>);
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
