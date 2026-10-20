import Link from "next/link";
import { mailtoLink, phoneLinks, safeWebUrl } from "@/lib/contact-links";
import type { IngestOutcome } from "@/lib/services/prospects";
import type { Reading } from "@/lib/services/agents";

const BADGE: Record<string, string> = { new: "badge-ok", excluded_duplicate: "badge-bad", needs_review: "badge-warn", already_stored: "", qualified: "badge-ok", contacted: "", archived: "" };
const LABEL: Record<string, string> = { new: "Nuevo", excluded_duplicate: "Excluido (duplicado)", needs_review: "Revisar duplicado", already_stored: "Ya guardado", qualified: "Calificado", contacted: "Contactado", archived: "Archivado" };
const FIELD = { nit: "NIT", source_id: "ID de la fuente", domain: "web", phone: "teléfono", email: "correo", "name+city": "nombre y dirección", name: "nombre" } as const;

const Dash = () => <span className="text-muted">No disponible</span>;

/** Tabla de resultados: todo lo que se sabe de cada empresa y, si hay duplicado, con quién coincide y por qué. */
export function OutcomeTable({ outcomes, searchId, readings }: { outcomes: IngestOutcome[]; searchId?: string; readings?: Record<string, Reading> }) {
  const ficha = (id: string) => (searchId ? `/prospectos/${id}?from=${searchId}` : `/prospectos/${id}`);
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>Empresa</th><th>Dirección</th><th>Teléfono</th><th>Web / correo</th><th>Fuente</th><th>Resultado</th>{readings && <th>Lectura de la IA</th>}</tr></thead>
        <tbody>{outcomes.map((o) => (
          <tr key={o.prospectId}>
            <td><b>{o.name}</b>{o.category && <div className="text-xs text-muted">{o.category}</div>}
              <Link className="text-xs underline" href={ficha(o.prospectId)}>Ver ficha</Link></td>
            <td>{o.address ?? <Dash />}</td>
            <td>{o.phone ? phoneLinks(o.phone).map((p, i) => <div key={i} className="whitespace-nowrap">{p.href ? <a className="underline" href={p.href}>{p.text}</a> : p.text}</div>) : <Dash />}</td>
            <td>{o.website || o.email ? <>
              {o.website && (safeWebUrl(o.website) ? <a className="break-all underline" target="_blank" rel="noopener noreferrer" href={safeWebUrl(o.website)!}>{o.website}</a> : <span className="break-all">{o.website}</span>)}
              {o.website && o.email ? <br /> : null}
              {o.email && (mailtoLink(o.email) ? <a className="break-all underline" href={mailtoLink(o.email)!}>{o.email}</a> : <span className="break-all">{o.email}</span>)}
            </> : <Dash />}</td>
            <td>{o.sourceUrl && /^https?:\/\//.test(o.sourceUrl) ? <a className="underline" target="_blank" rel="noopener noreferrer" href={o.sourceUrl}>Ver en OpenStreetMap</a> : <span className="text-sm">{o.sourceUrl ?? "—"}</span>}</td>
            <td className="min-w-64">
              <span className={`badge ${BADGE[o.status]}`}>{LABEL[o.status]}</span>
              {o.message && <p className="mt-1 text-sm">{o.message}</p>}
              {o.matchedWith && (
                <div className="mt-1 rounded border border-border p-2 text-xs">
                  <b>Coincide con {o.matchedWith.type === "client" ? "un cliente existente" : "un prospecto que ya tenías guardado"}:</b>{" "}
                  {o.matchedWith.type === "prospect" ? <Link className="underline" href={ficha(o.matchedWith.id)}>{o.matchedWith.name}</Link> : o.matchedWith.name}
                  <div>Dirección: {o.matchedWith.address ?? "No disponible"} · Tel.: {o.matchedWith.phone ?? "No disponible"}</div>
                  {Array.isArray(o.reasons) && <div>Coinciden en: {(o.reasons as { field: keyof typeof FIELD }[]).map((r) => FIELD[r.field] ?? r.field).join(", ")}</div>}
                </div>
              )}
            </td>
            {readings && <td className="min-w-56 text-sm"><ReadingCell r={readings[o.prospectId]} id={o.prospectId} /></td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}


function ReadingCell({ r, id }: { r?: Reading; id: string }) {
  if (!r) return <span className="text-muted">—</span>;
  if (r.state === "skipped") return <span className="text-muted">{r.reason}</span>;
  if (r.state === "error") return <span className="badge-bad">{r.reason}</span>;
  return (
    <div className="space-y-1">
      <div><b>{r.priority === null ? "Info. insuficiente" : `Prioridad ${r.priority}`}</b> <span className="text-muted">· cobertura {Math.round(r.coverage * 100)} %</span>{r.state === "cached" && <span className="badge ml-1">análisis previo</span>}</div>
      {r.headline && <p>{r.headline}</p>}
      <p className="text-xs text-muted">{r.unknownCount} criterio(s) sin base. Propuesta de la IA, sin guardar.</p>
      <Link className="text-xs underline" href={`/analizar/${id}`}>Revisar y guardar en Analizar</Link>
    </div>
  );
}
