import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { CP_STATUSES, CP_STATUS_KEYS } from "@/lib/campaigns";
import { campaignDetail, eligibleProspects } from "@/lib/services/campaigns";
import { normalizePhone } from "@/lib/dedup/normalize";
import { closeCampaignAction } from "../actions";
import { AddProspects } from "./AddProspects";
import { ProspectRow } from "./ProspectRow";

export const dynamic = "force-dynamic";
const bogotaDate = (d: Date | null) => (d ? new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10) : "");

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  let detail;
  try { detail = await campaignDetail(db, org, id); } catch { notFound(); }
  const { campaign: c, items, funnel } = detail;
  const closed = c.status === "closed";
  const options = closed ? [] : (await eligibleProspects(db, org, id)).map((p) => ({ id: p.id, name: p.name, city: p.city, category: p.category, hasPhone: !!normalizePhone(p.phone) }));

  return (
    <div className="space-y-5">
      <header>
        <Link href="/campanas" className="btn mb-2">← Volver a campañas</Link>
        <h1 className="text-2xl font-bold">{c.name} {closed && <span className="badge">Cerrada</span>}</h1>
        {c.objective && <p className="text-sm text-muted">{c.objective}</p>}
        {c.valueProposition && <p className="mt-1 text-sm"><b>Propuesta de valor:</b> {c.valueProposition}</p>}
        <details className="mt-2 text-sm"><summary className="cursor-pointer underline">Ver mensaje base</summary><p className="card mt-1 whitespace-pre-wrap">{c.template}</p></details>
      </header>

      <section className="card" aria-label="Embudo">
        <h2 className="mb-2 font-semibold">Embudo ({items.length} prospectos)</h2>
        <div className="flex flex-wrap gap-2">{CP_STATUS_KEYS.map((k) => <span key={k} className="badge">{CP_STATUSES[k]}: <b>{funnel[k]}</b></span>)}</div>
      </section>

      {!closed && <section aria-labelledby="add"><h2 id="add" className="mb-2 font-semibold">Agregar prospectos</h2><AddProspects campaignId={id} options={options} /></section>}

      <section aria-labelledby="pros" className="space-y-3">
        <h2 id="pros" className="font-semibold">Prospectos de la campaña</h2>
        {items.length === 0 ? <p className="card text-sm text-muted">Todavía no hay prospectos. Agrégalos arriba.</p> :
          items.map((i) => (
            <ProspectRow key={i.cp.id} campaignId={id} cpId={i.cp.id} closed={closed}
              p={{ id: i.p.id, name: i.p.name, phone: i.p.phone, city: i.p.city, doNotContact: i.p.doNotContact }}
              status={i.cp.status} followUpDate={bogotaDate(i.cp.nextFollowUpAt)} notes={i.cp.notes ?? ""} followUp={i.followUp}
              message={i.message ? { body: i.message.body, status: i.message.status } : null} opens={i.opens} />))}
      </section>

      {!closed && (
        <form action={async () => { "use server"; await closeCampaignAction(id); }}>
          <button className="btn">Cerrar campaña</button><span className="ml-3 text-xs text-muted">Cerrada, ya no admite cambios ni contactos.</span>
        </form>)}
    </div>
  );
}
