import Link from "next/link";
import { requireUser } from "@/lib/session";
import { viewerOf } from "@/lib/services/scope";
import { notFound } from "next/navigation";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { CP_STATUSES, CP_STATUS_KEYS } from "@/lib/campaigns";
import { campaignDetail, eligibleProspects } from "@/lib/services/campaigns";
import { normalizePhone } from "@/lib/dedup/normalize";
import { closeCampaignAction } from "../actions";
import { aiReady } from "@/lib/ai/ready";
import { CampaignCover } from "@/components/CampaignCover";
import { ChartCard, Donut, Funnel, SERIES } from "@/components/charts";
import { Insight } from "@/components/Insight";
import { campaignFunnel, campaignInsight, campaignNumbers } from "@/lib/campaign-stats";
import { listAttachments } from "@/lib/services/campaign-media";
import { EmailSender } from "./EmailSender";
import { dailyCap, getConnection, sendableRecipients, sentToday } from "@/lib/services/gmail";
import { oauthConfig } from "@/lib/google-oauth";
import { renderTemplate } from "@/lib/campaigns";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { CampaignEditor } from "./CampaignEditor";
import { CoverUploader } from "./CoverUploader";
import { AddProspects } from "./AddProspects";
import { ProspectRow } from "./ProspectRow";

export const dynamic = "force-dynamic";
const bogotaDate = (d: Date | null) => (d ? new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10) : "");

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = viewerOf(await requireUser());
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  let detail;
  try { detail = await campaignDetail(db, org, id, viewer); } catch { notFound(); }
  const { campaign: c, items, funnel } = detail;
  const closed = c.status === "closed";
  const ai = aiReady();
  const attachments = await listAttachments(db, org, id);
  const n = campaignNumbers(funnel);
  const me = await requireUser();
  const [conn, recipients, today] = await Promise.all([getConnection(db, me.id), sendableRecipients(db, org, id), sentToday(db, me.email)]);
  const coverLen = c.coverData ? c.coverData.length : 0;
  const options = closed ? [] : (await eligibleProspects(db, org, id, viewer)).map((p) => ({ id: p.id, name: p.name, city: p.city, category: p.category, hasPhone: !!normalizePhone(p.phone) }));

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <Link href="/campanas" className="btn">← Volver a campañas</Link>
        <div className="card overflow-hidden !p-0">
          <CampaignCover id={c.id} name={c.name} coverLen={coverLen} height={220} rounded={false} whole />
          <div className="space-y-1 p-4">
            <h1 className="text-2xl font-bold">{c.name} {closed && <span className="badge">Cerrada</span>}</h1>
            {c.objective && <p className="text-sm text-muted">{c.objective}</p>}
            {c.valueProposition && <p className="text-sm"><b>Propuesta de valor:</b> {c.valueProposition}</p>}
            <details className="text-sm"><summary className="cursor-pointer underline">Ver mensaje base</summary><p className="card mt-1 whitespace-pre-wrap">{c.template}</p></details>
          </div>
        </div>
      </header>

      <CoverUploader campaignId={id} hasCover={coverLen > 0} coverLen={coverLen} closed={closed} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Resumen">
        {[["Prospectos", n.total, "En esta campaña", "var(--s1)"], ["Contactados", n.contacted, `${n.contactRate} % de los prospectos`, "var(--s2)"], ["Respondieron", n.replied, `${n.replyRate} % de los contactados`, "var(--s3)"], ["Reuniones", n.meetings, "Agendadas o más avanzadas", "var(--s4)"], ["Ganados", n.won, `${n.winRate} % de los contactados`, "var(--s5)"]].map(([l, v, note, col]) => (
          <div key={String(l)} className="card kpi" style={{ ["--kpi" as string]: String(col) }}><div className="text-xs text-muted">{l}</div><div className="mt-1 text-2xl font-bold">{v}</div><div className="mt-1 text-xs text-muted">{note}</div></div>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-2" aria-label="Gráficos">
        <ChartCard title="Embudo de la campaña" note="Cada etapa cuenta a quien llegó a ella o más lejos; el % es frente a la etapa anterior.">
          <Funnel steps={campaignFunnel(funnel)} />
          <Insight>{campaignInsight(n)}</Insight>
        </ChartCard>
        <ChartCard title="Estado de los prospectos" note="Dónde está cada uno ahora.">
          <Donut center={String(n.total)} data={CP_STATUS_KEYS.map((k, i) => ({ label: CP_STATUSES[k], value: funnel[k], color: ["#94a3b8", SERIES[0], SERIES[3], SERIES[1], SERIES[4], SERIES[2], "#64748b", "#475569", "#334155"][i] })).filter((d) => d.value > 0)} />
          <Insight>{n.total === 0 ? "Sin prospectos todavía." : `${funnel.pending} de ${n.total} siguen pendientes de contactar${funnel.not_interested + funnel.lost + funnel.do_not_contact ? `; ${funnel.not_interested + funnel.lost + funnel.do_not_contact} se cerraron sin éxito` : ""}.`}</Insight>
        </ChartCard>
      </section>

      <AttachmentsPanel campaignId={id} items={attachments} closed={closed} />

      <EmailSender campaignId={id} configured={!!oauthConfig()} connectedAs={conn?.email ?? null} recipients={recipients} attachments={attachments.map((a) => ({ id: a.id, name: a.name, kind: a.kind, size: a.size }))} sentToday={today} cap={dailyCap()} closed={closed}
        subjectPreview={renderTemplate(c.emailSubject?.trim() || c.name, { empresa: "Nombre del negocio", ciudad: "Bogotá", categoria: "su rubro" }).text} />

      {!closed && <details className="card"><summary className="cursor-pointer font-semibold">Editar textos de la campaña</summary><div className="mt-3"><CampaignEditor campaignId={id} initial={{ name: c.name, objective: c.objective ?? "", valueProposition: c.valueProposition ?? "", template: c.template, emailSubject: c.emailSubject ?? "" }} /></div></details>}

      {!closed && <section aria-labelledby="add"><h2 id="add" className="mb-2 font-semibold">Agregar prospectos</h2><AddProspects campaignId={id} options={options} /></section>}

      <section aria-labelledby="pros" className="space-y-3">
        <h2 id="pros" className="font-semibold">Prospectos de la campaña</h2>
        {items.length === 0 ? <p className="card text-sm text-muted">Todavía no hay prospectos. Agrégalos arriba.</p> :
          items.map((i) => (
            <ProspectRow key={i.cp.id} campaignId={id} cpId={i.cp.id} closed={closed}
              p={{ id: i.p.id, name: i.p.name, phone: i.p.phone, email: i.p.email, city: i.p.city, doNotContact: i.p.doNotContact }}
              status={i.cp.status} followUpDate={bogotaDate(i.cp.nextFollowUpAt)} notes={i.cp.notes ?? ""} followUp={i.followUp}
              message={i.message ? { body: i.message.body, status: i.message.status } : null} opens={i.opens} aiReady={ai} attachments={attachments} gmailConnected={!!conn} />))}
      </section>

      {!closed && (
        <form action={async () => { "use server"; await closeCampaignAction(id); }}>
          <button className="btn">Cerrar campaña</button><span className="ml-3 text-xs text-muted">Cerrada, ya no admite cambios ni contactos.</span>
        </form>)}
    </div>
  );
}
