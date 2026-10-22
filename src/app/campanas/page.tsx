import Link from "next/link";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { CP_STATUSES, type CpStatus } from "@/lib/campaigns";
import { campaignFunnel, campaignNumbers, campaignsOverview, campaignInsight } from "@/lib/campaign-stats";
import { followUps, listCampaigns } from "@/lib/services/campaigns";
import { CampaignCover } from "@/components/CampaignCover";
import { ChartCard, Funnel, HBars, SERIES } from "@/components/charts";
import { HelpPanel, Insight } from "@/components/Insight";
import { CampaignForm } from "./CampaignForm";

export const dynamic = "force-dynamic";
const fmt = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short" });
const FU: Record<string, [string, string]> = { overdue: ["Vencido", "badge-bad"], today: ["Hoy", "badge-warn"], upcoming: ["Próximo", ""] };

export default async function Campanas() {
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const [camps, fus] = await Promise.all([listCampaigns(db, org), followUps(db, org)]);
  const nums = camps.map((c) => campaignNumbers(c.funnel));
  const all = nums.reduce((a, n) => ({ total: a.total + n.total, contacted: a.contacted + n.contacted, replied: a.replied + n.replied, won: a.won + n.won }), { total: 0, contacted: 0, replied: 0, won: 0 });
  const merged = Object.fromEntries((Object.keys(CP_STATUSES) as CpStatus[]).map((k) => [k, camps.reduce((s, c) => s + c.funnel[k], 0)])) as Record<CpStatus, number>;
  const kpi = (label: string, value: string | number, note: string, color: string) => (
    <div className="card kpi" style={{ ["--kpi" as string]: color }}><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted">{note}</div></div>
  );
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-bold">Campañas comerciales</h1>
        <p className="text-sm text-muted">Agrupa prospectos, prepara el mensaje de cada uno (con imágenes, video o documentos), apruébalo y registra qué pasó. WhatsApp solo se abre; el envío lo haces tú.</p></header>

      <HelpPanel title="Cómo funciona una campaña">
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Crea la campaña</b> con un nombre, un objetivo y un mensaje base (puedes partir de uno listo). Ponle una <b>portada</b> para reconocerla.</li>
          <li><b>Adjunta material</b> (imágenes, video MP4, PDF o Word) en la campaña.</li>
          <li><b>Agrega prospectos</b> calificados. Se genera un mensaje por prospecto con sus datos; tú lo revisas y lo apruebas.</li>
          <li><b>Abre WhatsApp</b>: se abre el chat con el texto. WhatsApp no deja adjuntar archivos desde un enlace, así que el material se <b>copia o descarga</b> desde la campaña y lo pegas tú en el chat. Cada apertura cuenta como un intento de contacto.</li>
          <li><b>Registra el resultado</b> (contactado, respondió, reunión, propuesta, ganado…) y programa seguimientos.</li>
        </ol>
      </HelpPanel>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Resumen">
        {kpi("Campañas activas", camps.filter((c) => c.status === "active").length, `${camps.length} en total`, "var(--s1)")}
        {kpi("Prospectos en campañas", all.total, "Sumando todas", "var(--s4)")}
        {kpi("Contactados", all.contacted, `${all.total ? Math.round((all.contacted / all.total) * 100) : 0} % de los prospectos`, "var(--s2)")}
        {kpi("Respondieron", all.replied, `${all.contacted ? Math.round((all.replied / all.contacted) * 100) : 0} % de los contactados`, "var(--s3)")}
        {kpi("Ganados", all.won, "Clientes cerrados", "var(--s5)")}
      </section>

      {camps.length > 0 && all.total > 0 && (
        <section className="grid gap-3 lg:grid-cols-2" aria-label="Gráficos">
          <ChartCard title="Embudo de todas las campañas" note="Cada etapa cuenta a quien llegó a ella o más lejos; el % es frente a la etapa anterior.">
            <Funnel steps={campaignFunnel(merged)} />
            <Insight>{campaignsOverview(camps.map((c) => ({ name: c.name, counts: c.funnel })))}</Insight>
          </ChartCard>
          <ChartCard title="Prospectos por campaña" note="Cuántos prospectos tiene cada campaña y cuántos ya se contactaron." legend={[{ label: "Prospectos", color: SERIES[0] }, { label: "Contactados", color: SERIES[2] }]}>
            <HBars data={camps.slice(0, 8).flatMap((c, i) => [{ label: c.name, value: nums[i].total, color: SERIES[0], note: "prospectos" }, { label: "  ↳ contactados", value: nums[i].contacted, color: SERIES[2] }])} />
            <Insight>{camps.length === 1 ? `«${camps[0].name}» tiene ${nums[0].total} prospectos y ${nums[0].contacted} contactados.` : `La campaña más grande es «${camps[nums.map((n) => n.total).indexOf(Math.max(...nums.map((n) => n.total)))].name}».`}</Insight>
          </ChartCard>
        </section>
      )}

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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{camps.map((c, i) => {
            const n = nums[i];
            return (
              <Link key={c.id} href={`/campanas/${c.id}`} className="card block overflow-hidden !p-0 hover:bg-surface-2">
                <CampaignCover id={c.id} name={c.name} coverLen={c.coverLen} height={110} rounded={false} />
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2"><b>{c.name}</b><span className={`badge ${c.status === "active" ? "badge-ok" : ""}`}>{c.status === "active" ? "Activa" : "Cerrada"}</span></div>
                  {c.objective && <p className="line-clamp-2 text-sm text-muted">{c.objective}</p>}
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }} title={`${n.contacted} de ${n.total} contactados`}><div className="h-2 rounded-full" style={{ width: `${n.contactRate}%`, background: "var(--s3)" }} /></div>
                  <p className="text-xs text-muted">{n.total} prospectos · {n.contacted} contactados · {n.replied} respondieron · {n.won} ganados</p>
                  <p className="text-xs">{campaignInsight(n)}</p>
                  {c.coverLen === 0 && <p className="text-xs text-muted">Sin portada: ábrela para subir una imagen.</p>}
                </div>
              </Link>);
          })}</div>)}
      </section>

      <section aria-labelledby="nueva"><h2 id="nueva" className="mb-2 font-semibold">Nueva campaña</h2><CampaignForm /></section>
    </div>
  );
}
