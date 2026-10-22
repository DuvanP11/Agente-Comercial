import Link from "next/link";
import { HelpPanel } from "@/components/Insight";
import { providerFromEnv } from "@/lib/ai/provider";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { canManageUsers } from "@/lib/permissions";
import { bixDailyCap, bixState, bixStats, conversationDetail, conversationsToday, getChatWebhook, launchable, listConversations, readiness, STATUS_LABEL } from "@/lib/services/bix";
import { viewerOf } from "@/lib/services/scope";
import { interestRange } from "@/lib/google-chat";
import { requireUser } from "@/lib/session";
import { BixPanel } from "./BixPanel";
import { Launcher } from "./Launcher";
import { RetryChat } from "./RetryChat";

export const dynamic = "force-dynamic";
const TONE: Record<string, string> = { interested: "badge-ok", not_interested: "badge-bad", not_found: "badge-bad", failed: "badge-bad", sent: "badge-warn", talking: "", queued: "" };
const fmt = (d: Date | null) => (d ? d.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function BixPage({ searchParams }: { searchParams: Promise<{ c?: string; estado?: string }> }) {
  const me = await requireUser();
  const { c, estado } = await searchParams;
  const db = await getDb(), org = await ensureDefaultOrg(db), v = viewerOf(me);
  const [state, r, stats, convs, options, today, hook] = await Promise.all([
    bixState(db, org), readiness(db, org, providerFromEnv()), bixStats(db, org, v), listConversations(db, org, v, estado), launchable(db, org, v), conversationsToday(db, org), getChatWebhook(db, org),
  ]);
  let detail: Awaited<ReturnType<typeof conversationDetail>> | null = null;
  if (c) { try { detail = await conversationDetail(db, org, v, c); } catch { detail = null; } }
  const kpi = (label: string, value: number, note: string, color: string) => (
    <div className="card kpi" style={{ ["--kpi" as string]: color }}><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div><div className="text-xs text-muted">{note}</div></div>);
  const why = !state.ready ? "Bix está apagado: un administrador debe completar la lista de verificación y marcarlo como listo." : !r.canSend ? `Falta: ${r.items.filter((i) => !i.ok).map((i) => i.label).join(", ")}.` : "";
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Bix · agente de WhatsApp</h1>
        <p className="text-sm text-muted">Bix conversa por WhatsApp con los leads que le entregas, les hace las preguntas filtro, mide su interés y, al terminar, los pasa a un Hunter y avisa en Google Chat. Lo entrenas en el <Link className="underline" href="/entrenamiento/laboratorio">Laboratorio de conversación</Link>.</p></header>
      <HelpPanel title="Cómo funciona Bix">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Un administrador completa la <b>lista de verificación</b> y marca a Bix como <b>listo</b>. Mientras esté apagado no escribe a nadie.</li>
          <li>Tú le <b>entregas leads</b> (prospectos con WhatsApp). Bix escribe primero —con la plantilla aprobada por Meta— y, cuando el cliente responde, conversa con las preguntas filtro.</li>
          <li>Si el cliente muestra interés, Bix le indica que lo atenderá un ejecutivo y le comparte el <b>WhatsApp del Hunter asignado</b> (en rotación: cada lead, al siguiente Hunter). No le entrega el contacto del cliente a nadie por chat.</li>
          <li>En el <b>espacio de Google Chat</b> aparece el aviso con el rango de interés (Alto / Medio / Bajo), nombre, teléfono, correo, lo que respondió y el Hunter arrobado.</li>
          <li>Si el cliente dice que no le interesa o pide que no le escriban, Bix se despide y lo marca «No contactar». Bix <b>nunca</b> da precios ni promete nada fuera de lo que escribiste en Entrenamiento.</li>
        </ol>
      </HelpPanel>

      <BixPanel items={r.items} ready={state.ready} readyBy={state.readyBy} canMarkReady={r.canMarkReady} canManage={canManageUsers(me.role)} hasWebhook={!!hook} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Estadísticas de Bix">
        {kpi("Contactado", stats.contacted, "Les llegó el mensaje de Bix", "var(--s1)")}
        {kpi("Interesado", stats.interested, `Alto ${stats.byRange.Alto} · Medio ${stats.byRange.Medio} · Bajo ${stats.byRange.Bajo}`, "var(--s3)")}
        {kpi("Sin respuesta aún", stats.noResponse, "Recibieron el mensaje y no han contestado", "var(--s2)")}
        {kpi("No interesado", stats.notInterested, "Dijeron que no o pidieron no ser contactados", "var(--s4)")}
        {kpi("No encontrado", stats.notFound, "El número no tiene WhatsApp", "var(--s5)")}
      </section>
      <p className="text-xs text-muted">«Contactado» incluye a quienes ya están conversando ({stats.talking}). {stats.failed > 0 && <>Además, {stats.failed} envío(s) fallaron por otro motivo (ver la lista).</>}</p>

      <Launcher options={options.slice(0, 300)} enabled={state.ready && r.canSend} why={why} cap={bixDailyCap()} today={today} />

      <section className="card space-y-2" aria-label="Conversaciones">
        <div className="flex flex-wrap items-center gap-2"><h2 className="mr-2 font-semibold">Conversaciones</h2>
          {[["", "Todas"], ["sent", "Sin respuesta"], ["talking", "En conversación"], ["interested", "Interesados"], ["not_interested", "No interesados"], ["not_found", "No encontrados"], ["failed", "Fallaron"]].map(([k, l]) => (
            <Link key={k} href={k ? `/bix?estado=${k}` : "/bix"} className={`btn ${(estado ?? "") === k ? "btn-primary" : ""}`}>{l}</Link>))}</div>
        {convs.length === 0 ? <p className="text-sm text-muted">Todavía no hay conversaciones{estado ? " con ese estado" : ""}.</p> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Negocio</th><th>Estado</th><th>Interés</th><th>Hunter</th><th>Mensajes</th><th>Última actividad</th><th /></tr></thead>
            <tbody>{convs.map((x) => (
              <tr key={x.id}><td><b>{x.businessName}</b><div className="text-xs text-muted">+{x.phone}</div></td>
                <td><span className={`badge ${TONE[x.status] ?? ""}`}>{STATUS_LABEL[x.status] ?? x.status}</span>{x.lastError && <div className="text-xs badge-bad">{x.lastError}</div>}</td>
                <td>{x.interest === null ? "—" : `${interestRange(x.interest)} (${x.interest})`}</td>
                <td>{x.assignedName ?? "—"}{x.status === "interested" && (x.chatNotifiedAt ? <div className="text-xs badge-ok">Avisado en Chat</div> : <div className="text-xs badge-bad">Sin avisar{x.chatError ? `: ${x.chatError}` : ""}</div>)}</td>
                <td>{x.messages}</td><td className="text-sm">{fmt(x.lastInboundAt ?? x.lastOutboundAt ?? x.createdAt)}</td>
                <td><Link className="underline" href={`/bix?c=${x.id}${estado ? `&estado=${estado}` : ""}`}>Ver</Link></td></tr>))}</tbody></table></div>)}
      </section>

      {detail && (
        <section className="card space-y-3" aria-label="Detalle de la conversación">
          <div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">{detail.c.businessName}</h2><span className={`badge ${TONE[detail.c.status] ?? ""}`}>{STATUS_LABEL[detail.c.status]}</span>
            {detail.c.interest !== null && <span className="badge">Interés {interestRange(detail.c.interest)} ({detail.c.interest}/100)</span>}
            <Link className="btn ml-auto" href="/bix">Cerrar</Link></div>
          {detail.c.status === "interested" && <div className="flex flex-wrap items-center gap-3 text-sm"><span>Asignado a <b>{detail.c.assignedName}</b> · {fmt(detail.c.handedOffAt)}</span>{!detail.c.chatNotifiedAt && <RetryChat id={detail.c.id} />}{detail.c.chatError && <span className="badge-bad">{detail.c.chatError}</span>}</div>}
          {Array.isArray(detail.c.answers) && (detail.c.answers as { q: string; a: string }[]).length > 0 && (
            <div><b className="text-sm">Respuestas a las preguntas filtro</b><ul className="list-disc pl-5 text-sm">{(detail.c.answers as { q: string; a: string }[]).map((a, i) => <li key={i}>{a.q} → <i>{a.a}</i></li>)}</ul></div>)}
          <div className="space-y-2 rounded bg-[color-mix(in_srgb,var(--color-border)_30%,transparent)] p-3">
            {detail.msgs.map((m) => <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : ""}`}><div className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.direction === "out" ? "bg-[#dcf8c6] text-black" : "bg-surface"}`}><div className="mb-0.5 text-xs opacity-70">{m.direction === "out" ? "Bix" : detail.c.businessName} · {fmt(m.createdAt)}</div>{m.body}</div></div>)}
          </div>
        </section>)}
    </div>
  );
}
