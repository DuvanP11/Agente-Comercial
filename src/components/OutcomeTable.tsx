import Link from "next/link";
import { mailtoLink, phoneLinks, safeWebUrl } from "@/lib/contact-links";
import type { IngestOutcome } from "@/lib/services/prospects";
import type { Reading } from "@/lib/services/agents";

const BADGE: Record<string, string> = { new: "badge-ok", excluded_duplicate: "badge-bad", needs_review: "badge-warn", already_stored: "", qualified: "badge-ok", contacted: "", archived: "" };
const LABEL: Record<string, string> = { new: "Nuevo", excluded_duplicate: "Excluido (duplicado)", needs_review: "Revisar duplicado", already_stored: "Ya guardado", qualified: "Calificado", contacted: "Contactado", archived: "Archivado" };
const FIELD = { nit: "NIT", source_id: "ID de la fuente", domain: "web", phone: "teléfono", email: "correo", "name+city": "nombre y dirección", name: "nombre" } as const;

const Dash = () => <span className="text-muted">No disponible</span>;

/** Tabla de resultados: todo lo que se sabe de cada empresa y, si hay duplicado, con quién coincide y por qué. */
/** Texto del enlace a la fuente según de dónde viene el dato (antes decía «OpenStreetMap» para todo). */
export function sourceLabel(url: string): string {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return "Ver fuente"; }
  if (host.endsWith("openstreetmap.org")) return "Ver en OpenStreetMap";
  if (host.endsWith("datos.gov.co")) return "Ver registro (datos abiertos)";
  if (host.endsWith("linkedin.com")) return "Ver en LinkedIn";
  if (host.endsWith("google.com") || host.endsWith("goo.gl")) return "Ver en Google Maps";
  return "Ver fuente";
}

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
            <td>{o.sourceUrl && /^https?:\/\//.test(o.sourceUrl) ? <a className="underline" target="_blank" rel="noopener noreferrer" href={o.sourceUrl}>{sourceLabel(o.sourceUrl)}</a> : <span className="text-sm">{o.sourceUrl ?? "—"}</span>}</td>
            <td className="min-w-64">
              <span className={`badge ${BADGE[o.status]}`}>{LABEL[o.status]}</span>
              {o.message && <p className="mt-1 text-sm">{o.message}</p>}
              {o.matchedWith && (o.foreign || !o.matchedWith.id ? (
                // Es de otra persona: solo se muestra el nombre, sin ficha, teléfono ni dirección.
                <div className="mt-1 rounded border border-border p-2 text-xs"><b>Coincide con un prospecto de otra persona:</b> {o.matchedWith.name}</div>
              ) : (
                <div className="mt-1 rounded border border-border p-2 text-xs">
                  <b>Coincide con {o.matchedWith.type === "client" ? "un cliente existente" : "un prospecto que ya tenías guardado"}:</b>{" "}
                  {o.matchedWith.type === "prospect" ? <Link className="underline" href={ficha(o.matchedWith.id)}>{o.matchedWith.name}</Link> : o.matchedWith.name}
                  <div>Dirección: {o.matchedWith.address ?? "No disponible"} · Tel.: {o.matchedWith.phone ?? "No disponible"}</div>
                  {Array.isArray(o.reasons) && <div>Coinciden en: {(o.reasons as { field: keyof typeof FIELD }[]).map((r) => FIELD[r.field] ?? r.field).join(", ")}</div>}
                </div>
              ))}
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
  const pct = Math.round(r.coverage * 100);
  return (
    <div className="space-y-1">
      <div>
        {r.priority === null
          ? <b title="Para calcular una prioridad hace falta conocer el mínimo de criterios (por peso) definido en Configuración (40 % de arranque). Tener teléfono, web o correo cuenta solo en el criterio «canal de contacto».">Aún sin prioridad</b>
          : <b>Prioridad {r.priority}</b>}
        <span className="text-muted"> · {pct} % de los criterios con base</span>
        {r.state === "cached" && <span className="badge ml-1">análisis previo</span>}
      </div>
      {r.headline && <p>{r.headline}</p>}
      {(r.known ?? []).length > 0 && <p className="text-xs"><b>Con base:</b> {(r.known ?? []).join(", ")}.</p>}
      {(r.unknown ?? []).length > 0 && <p className="text-xs text-muted"><b>Falta saber:</b> {(r.unknown ?? []).join(", ")}.</p>}
      <p className="text-xs text-muted">Propuesta de la IA, sin guardar. {r.priority === null && "Tener contacto no basta para valorarlo: faltan datos del negocio (se ven hablando con él)."}</p>
      <Link className="text-xs underline" href={`/analizar/${id}`}>Revisar y guardar en Analizar</Link>
    </div>
  );
}
