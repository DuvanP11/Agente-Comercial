import Link from "next/link";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { CP_STATUSES, type CpStatus } from "@/lib/campaigns";
import { followUps, listCampaigns } from "@/lib/services/campaigns";
import { CampaignForm } from "./CampaignForm";

export const dynamic = "force-dynamic";
const fmt = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short" });
const FU: Record<string, [string, string]> = { overdue: ["Vencido", "badge-bad"], today: ["Hoy", "badge-warn"], upcoming: ["Próximo", ""] };

export default async function Campanas() {
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const [camps, fus] = await Promise.all([listCampaigns(db, org), followUps(db, org)]);
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-bold">Campañas comerciales</h1>
        <p className="text-sm text-muted">Agrupa prospectos, prepara el mensaje de cada uno, apruébalo y registra qué pasó. WhatsApp solo se abre; el envío lo haces tú.</p></header>

      <section className="card" aria-labelledby="seg">
        <h2 id="seg" className="mb-2 font-semibold">Seguimientos pendientes ({fus.length})</h2>
        {fus.length === 0 ? <p className="text-sm text-muted">No hay seguimientos programados.</p> : (
          <table className="table"><thead><tr><th>Cuándo</th><th>Prospecto</th><th>Campaña</th><th>Estado</th><th>Nota</th></tr></thead>
            <tbody>{fus.map((f) => (
              <tr key={f.cp.id}><td><span className={`badge ${FU[f.state][1]}`}>{FU[f.state][0]}</span> {fmt(f.cp.nextFollowUpAt!)}</td>
                <td><Link className="underline" href={`/campanas/${f.c.id}`}>{f.p.name}</Link></td><td>{f.c.name}</td>
                <td>{CP_STATUSES[f.cp.status as CpStatus]}</td><td className="text-sm">{f.cp.notes}</td></tr>))}</tbody></table>)}
      </section>

      <section aria-labelledby="lista"><h2 id="lista" className="mb-2 font-semibold">Campañas ({camps.length})</h2>
        {camps.length === 0 ? <p className="card text-sm text-muted">Aún no hay campañas. Crea la primera abajo.</p> : (
          <div className="grid gap-3 md:grid-cols-2">{camps.map((c) => (
            <Link key={c.id} href={`/campanas/${c.id}`} className="card block hover:bg-surface-2">
              <div className="flex items-center justify-between"><b>{c.name}</b><span className="badge">{c.status === "active" ? "Activa" : "Cerrada"}</span></div>
              {c.objective && <p className="text-sm text-muted">{c.objective}</p>}
              <p className="mt-2 text-sm">{c.total} prospectos · {c.funnel.contacted + c.funnel.replied + c.funnel.meeting + c.funnel.proposal + c.funnel.won + c.funnel.lost + c.funnel.not_interested} gestionados · {c.funnel.won} ganados</p>
            </Link>))}</div>)}
      </section>

      <section aria-labelledby="nueva"><h2 id="nueva" className="mb-2 font-semibold">Nueva campaña</h2><CampaignForm /></section>
    </div>
  );
}
