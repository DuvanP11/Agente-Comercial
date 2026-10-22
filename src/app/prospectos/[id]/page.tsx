import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activities, clients, duplicateReviews, evidence, prospects } from "@/lib/db/schema";
import { findContradictions } from "@/lib/evidence/types";
import { duplicateMessage } from "@/lib/dedup/match";
import { mailtoLink, mapSearchLink, phoneLinks, safeWebUrl } from "@/lib/contact-links";
import { CRITERION_LABELS, type ScoreResult } from "@/lib/scoring/score";
import { SEARCH_ID } from "@/lib/services/searches";
import { ContactManager } from "./ContactManager";
import { stateOf } from "@/lib/services/contact-tracking";
import { getContactRules } from "@/lib/services/settings";
import { ensureDefaultOrg } from "@/lib/db/client";
import { isOutcome, OUTCOMES, type Outcome } from "@/lib/contact-tracking";
import { Composer } from "./Composer";
import { ContactEditor } from "./ContactEditor";
import { resolveDuplicate } from "./actions";

const ACT_CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", call: "llamada", email: "correo", visit: "visita u otro" };
function actLabel(a: { type: string; detail: unknown }): string {
  const d = (a.detail ?? {}) as { channel?: string; n?: number; note?: string | null; to?: string };
  if (a.type === "whatsapp_opened") return "Se abrió WhatsApp (envío no confirmado)";
  if (a.type === "contact_attempt") return `Intento de contacto #${d.n ?? "?"} por ${ACT_CHANNEL[d.channel ?? ""] ?? "otro canal"}${d.note ? `: ${d.note}` : ""}`;
  if (a.type === "contact_outcome") return `Resultado: ${(OUTCOMES as Record<string, string>)[d.to ?? ""] ?? d.to}${d.note ? ` — ${d.note}` : ""}`;
  if (a.type === "campaign_status") return `Cambió su estado en una campaña${d.to ? ` a «${d.to}»` : ""}`;
  return a.type;
}

export const dynamic = "force-dynamic";

export default async function Ficha({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  // Solo se acepta un id de búsqueda con formato válido (nunca una URL arbitraria).
  const back = from && SEARCH_ID.test(from) ? { href: `/buscar?search=${from}`, label: "← Volver a la búsqueda" } : { href: "/prospectos", label: "← Volver a prospectos" };
  const db = await getDb();
  const [p] = await db.select().from(prospects).where(eq(prospects.id, id));
  if (!p) notFound();
  const [ev, revs, acts] = await Promise.all([
    db.select().from(evidence).where(eq(evidence.entityId, id)),
    db.select().from(duplicateReviews).where(eq(duplicateReviews.prospectId, id)),
    db.select().from(activities).where(eq(activities.prospectId, id)).orderBy(desc(activities.createdAt)),
  ]);
  const refNames = new Map<string, string>();
  for (const r of revs) {
    const [row] = r.referenceType === "client"
      ? await db.select({ n: clients.name }).from(clients).where(eq(clients.id, r.referenceId))
      : await db.select({ n: prospects.name }).from(prospects).where(eq(prospects.id, r.referenceId));
    refNames.set(r.id, row?.n ?? "(registro no encontrado)");
  }
  const contradictions = findContradictions(ev.map((e) => ({ field: e.field, value: e.observedValue, sourceName: e.sourceName })));
  const score = p.scoreJson as ScoreResult | null;
  const org = await ensureDefaultOrg(db);
  const cst = await stateOf(db, org, p), rules = await getContactRules(db, org);
  const draft = `Hola, equipo de ${p.name}. Somos PIBOX Mensajería. Nos gustaría conocer cómo gestionan hoy sus entregas y ver si podemos ayudarles. ¿Con quién podríamos hablar?`;

  return (
    <div className="space-y-5">
      <header>
        <Link href={back.href} className="btn mb-2">{back.label}</Link>
        <h1 className="text-2xl font-bold">{p.name} {p.isDemo && <span className="badge badge-warn">Demo</span>}</h1>
        <p className="text-sm text-muted">{p.category} · {p.city} · fuente {p.sourceName} · consultado {p.consultedAt.toLocaleDateString("es-CO")}</p>
      </header>

      {p.doNotContact && <p role="alert" className="card badge-bad font-semibold">NO CONTACTAR: {p.doNotContactReason}. Está bloqueado en campañas y WhatsApp.</p>}

      {revs.map((r) => (
        <section key={r.id} className="card space-y-2" aria-label="Duplicado">
          <p className={`font-semibold ${r.level === "exact" ? "badge-bad" : "badge-warn"}`}>
            {duplicateMessage(r.level as "exact" | "probable", r.referenceType as "client" | "prospect")}
          </p>
          <p className="text-sm">Coincide con {r.referenceType === "client" ? "un cliente existente" : "un prospecto que ya tenías guardado"}: {r.referenceType === "prospect" ? <Link className="font-semibold underline" href={`/prospectos/${r.referenceId}`}>{refNames.get(r.id)}</Link> : <b>{refNames.get(r.id)}</b>}. Campos: {(r.reasons as { field: string; candidateValue: string; referenceValue: string }[]).map((x) => `${x.field} (${x.candidateValue} ↔ ${x.referenceValue})`).join("; ")}.</p>
          <p className="text-xs text-muted">Decisión: {r.decision}{r.decidedBy ? ` por ${r.decidedBy}` : ""}</p>
          <div className="flex flex-wrap gap-2">
            {(["excluded", "linked", "not_duplicate"] as const).map((d) => (
              <form key={d} action={resolveDuplicate.bind(null, r.id, d, id)}>
                <button className="btn" disabled={r.decision === d}>{{ excluded: "Excluir como duplicado", linked: "Vincular registros", not_duplicate: "No es duplicado" }[d]}</button>
              </form>
            ))}
          </div>
        </section>
      ))}

      <section className="card grid gap-2 text-sm md:grid-cols-2" aria-label="Datos">
        <div><b>Dirección:</b> {p.address ?? "No disponible"} {p.address && <a className="underline" target="_blank" rel="noopener noreferrer" href={mapSearchLink(p.address, p.city)}>Buscar en Google Maps</a>}</div>
        <div><b>Teléfono:</b> {p.phone ? phoneLinks(p.phone).map((x, i) => <span key={i}>{i > 0 && " · "}{x.href ? <a className="underline" href={x.href}>{x.text}</a> : x.text}</span>) : "No encontrado"} {p.phone && !p.phoneKey && <span className="badge badge-warn">formato no reconocido</span>}</div>
        <div><b>Sitio web:</b> {p.website ? (safeWebUrl(p.website) ? <a className="break-all underline" target="_blank" rel="noopener noreferrer" href={safeWebUrl(p.website)!}>{p.website}</a> : p.website) : "No encontrado"}</div>
        <div><b>Correo:</b> {p.email ? (mailtoLink(p.email) ? <a className="break-all underline" href={mailtoLink(p.email)!}>{p.email}</a> : p.email) : "No encontrado"}</div>
      </section>

      <section className="card" aria-label="Completar contacto">
        <h2 className="mb-2 font-semibold">Completar contacto</h2>
        <ContactEditor prospectId={id} phone={p.phone ?? ""} website={p.website ?? ""} email={p.email ?? ""}
          googleUrl={`https://www.google.com/search?q=${encodeURIComponent([p.name, p.city, "teléfono contacto"].filter(Boolean).join(" "))}`} />
      </section>

      <section className="card" aria-label="Gestión de contacto">
        <h2 className="mb-2 font-semibold">Gestión de contacto</h2>
        <ContactManager prospectId={id} stateKey={cst.key} canContact={cst.canContact} reason={cst.reason} attempts={p.contactAttempts} max={rules.maxAttempts}
          outcome={(isOutcome(p.contactOutcome) ? p.contactOutcome : "pending") as Outcome} note={p.outcomeNote ?? ""} lastAttempt={p.lastAttemptAt ? p.lastAttemptAt.toLocaleString("es-CO") : null} />
      </section>

      <section className="card" aria-label="Calificación">
        <h2 className="mb-1 font-semibold">Calificación comercial</h2>
        {!score ? <p className="text-sm text-muted">Sin calificar. El agente de calificación (fase 5) aún no está implementado; no se asigna puntaje por defecto.</p> : (
          <div className="text-sm">
            <p>Prioridad: <b>{score.priority ?? "información insuficiente"}</b> · cobertura {(score.coverage * 100).toFixed(0)} % · respaldo en evidencia {(score.evidenceBacked * 100).toFixed(0)} %</p>
            <ul className="mt-1 list-disc pl-5">{score.breakdown.map((b) => <li key={b.key}>{CRITERION_LABELS[b.key]}: {b.contribution === null ? "desconocido" : `${b.contribution.toFixed(1)}/${b.weight} (${b.kind})`}</li>)}</ul>
            <p className="mt-1 text-xs text-muted">La prioridad no es una probabilidad de contratación.</p>
          </div>
        )}
      </section>

      <section className="card overflow-x-auto" aria-label="Evidencias">
        <h2 className="mb-1 font-semibold">Evidencias</h2>
        {contradictions.length > 0 && <p className="mb-2 text-sm badge-warn">Hay datos contradictorios: {contradictions.map((c) => c.field).join(", ")}.</p>}
        <table className="table">
          <thead><tr><th>Campo</th><th>Valor observado</th><th>Fuente</th><th>Fecha</th><th>Estado</th></tr></thead>
          <tbody>{ev.map((e) => (
            <tr key={e.id}><td>{e.field}</td><td>{e.observedValue}</td>
              <td>{e.sourceName === "user_input" ? "ingresado por el usuario" : /^https?:\/\//.test(e.sourceRef) ? <a className="underline" target="_blank" rel="noopener noreferrer" href={e.sourceRef}>{e.sourceName}</a> : e.sourceName}</td>
              <td>{e.observedAt.toLocaleDateString("es-CO")}</td>
              <td><span className="badge">{{ source_observed: "observado en la fuente", format_valid: "solo formato válido", unverified: "sin verificar", user_confirmed: "confirmado por usuario" }[e.verification] ?? e.verification}</span></td></tr>
          ))}</tbody>
        </table>
      </section>

      <section className="card" aria-label="Contacto"><h2 className="mb-2 font-semibold">Contacto por WhatsApp</h2>
        <Composer prospectId={id} initial={draft} canWhatsApp={!!p.phoneKey && p.status !== "excluded_duplicate" && !p.doNotContact} />
      </section>

      <section className="card" aria-label="Actividad"><h2 className="mb-1 font-semibold">Historial</h2>
        {acts.length === 0 ? <p className="text-sm text-muted">Sin actividad registrada.</p> : (
          <ul className="text-sm">{acts.map((a) => <li key={a.id}>{a.createdAt.toLocaleString("es-CO")} — {actLabel(a)}</li>)}</ul>)}
      </section>
    </div>
  );
}
