import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { Insight } from "@/components/Insight";
import { funnelInsight, priorityInsight, qualityInsight, rankInsight, sourceInsight, statusInsight, trendInsight } from "@/lib/dashboard-insights";
import { ChartCard, Columns, Donut, Funnel, HBars, Spark, TrendChart, SERIES } from "@/components/charts";
import { funnel, priorityHistogram, PRIORITY_BANDS, weekBuckets } from "@/lib/dashboard";
import { bySource, byCategory, byCity, quality } from "@/lib/market";
import { loadMarket } from "@/lib/services/market";
import { activities, clients, duplicateReviews, prospects, searches } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function Kpi({ label, value, note, color = "var(--s1)", icon, trend }: { label: string; value: string | number; note?: string; color?: string; icon?: string; trend?: number[] }) {
  return (
    <div className="card kpi" style={{ ["--kpi" as string]: color }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted">{label}</div>
        {icon && <span className="kpi-icon" aria-hidden="true">{icon}</span>}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="text-2xl font-bold">{value}</div>
        {trend && <Spark values={trend} color={color} />}
      </div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  );
}

export default async function Dashboard() {
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const n = async (q: Promise<{ c: number }[]>) => (await q)[0]?.c ?? 0;

  const stageCount = (to: string) => n(db.select({ c: sql<number>`count(distinct ${activities.prospectId})`.mapWith(Number) }).from(activities)
    .where(and(eq(activities.orgId, org), eq(activities.type, "campaign_status"), sql`${activities.detail}->>'to' = ${to}`)));
  const [replied, meetings, proposals, won] = await Promise.all([stageCount("replied"), stageCount("meeting"), stageCount("proposal"), stageCount("won")]);
  const [clientCount, total, qualified, excluded, review, contacts, failedSearches, withPhone, withEmail, demo] = await Promise.all([
    n(db.select({ c: count() }).from(clients).where(and(eq(clients.orgId, org), isNull(clients.archivedAt)))),
    n(db.select({ c: count() }).from(prospects).where(eq(prospects.orgId, org))),
    n(db.select({ c: count() }).from(prospects).where(and(eq(prospects.orgId, org), eq(prospects.status, "qualified")))),
    n(db.select({ c: count() }).from(prospects).where(and(eq(prospects.orgId, org), eq(prospects.status, "excluded_duplicate")))),
    n(db.select({ c: count() }).from(duplicateReviews).where(and(eq(duplicateReviews.orgId, org), eq(duplicateReviews.decision, "pending")))),
    n(db.select({ c: count() }).from(activities).where(and(eq(activities.orgId, org), sql`${activities.type} in ('whatsapp_opened','email_sent')`))),
    n(db.select({ c: count() }).from(searches).where(and(eq(searches.orgId, org), eq(searches.status, "failed")))),
    n(db.select({ c: count() }).from(prospects).where(and(eq(prospects.orgId, org), sql`${prospects.phoneKey} <> ''`))),
    n(db.select({ c: count() }).from(prospects).where(and(eq(prospects.orgId, org), sql`${prospects.emailKey} <> ''`))),
    n(db.select({ c: count() }).from(prospects).where(and(eq(prospects.orgId, org), eq(prospects.isDemo, true)))),
  ]);
  const now = new Date(), since = new Date(now.getTime() - 12 * 7 * 86_400_000);
  const [market, newProspects, touches] = await Promise.all([
    loadMarket(db, org, { since: null, includeDemo: true }),
    db.select({ at: prospects.createdAt }).from(prospects).where(and(eq(prospects.orgId, org), gte(prospects.createdAt, since), sql`${prospects.status} <> 'excluded_duplicate'`)),
    db.select({ at: activities.createdAt }).from(activities).where(and(eq(activities.orgId, org), gte(activities.createdAt, since), sql`${activities.type} in ('whatsapp_opened','email_sent')`)),
  ]);
  const wkP = weekBuckets(newProspects.map((r) => r.at), now), wkT = weekBuckets(touches.map((r) => r.at), now);
  const labels = wkP.map((b) => b.start.toLocaleDateString("es-CO", { day: "numeric", month: "short" }));
  const rows = market.rows, fun = funnel(rows), q = quality(rows);
  const hist = priorityHistogram(rows.map((r) => r.priority));
  const statusCount = (st: string) => rows.filter((r) => r.status === st).length;
  const rubros = byCategory(rows).slice(0, 8), ciudades = byCity(rows).slice(0, 6), fuentes = bySource(rows);
  const pct = (x: number) => (total ? `${Math.round((x / total) * 100)} %` : "—");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard gerencial</h1>
        <p className="text-sm text-muted">Cifras calculadas desde la base de datos. Lo que no tiene datos se muestra como “No disponible”.</p>
      </header>
      {demo > 0 && <p role="status" className="card text-sm badge-warn">Hay {demo} prospectos de DEMOSTRACIÓN contados en estas cifras.</p>}
      <section aria-label="Investigación" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Clientes existentes cargados" value={clientCount} color="var(--s4)" icon="🏢" />
        <Kpi label="Prospectos descubiertos" value={total} color="var(--s1)" icon="🔎" trend={wkP.map((b) => b.count)} note="Tendencia: últimas 12 semanas" />
        <Kpi label="Excluidos por duplicidad" value={excluded} color="var(--s5)" icon="⧉" />
        <Kpi label="Duplicados por revisar" value={review} color="var(--s2)" icon="⚠" />
        <Kpi label="Prospectos calificados" value={qualified} color="var(--s3)" icon="✔" note="Los califica una persona en Analizar clientes" />
        <Kpi label="Con teléfono" value={pct(withPhone)} color="var(--s1)" icon="☎" note="Del total de prospectos" />
        <Kpi label="Con correo" value={pct(withEmail)} color="var(--s4)" icon="✉" />
        <Kpi label="Búsquedas con error" value={failedSearches} color="var(--s2)" icon="!" />
      </section>
      <section aria-label="Comercial" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Conversaciones abiertas por WhatsApp" value={contacts} color="var(--s3)" icon="💬" trend={wkT.map((b) => b.count)} note="Se abrió el chat; no implica que se haya enviado" />
        <Kpi label="Respondieron" value={replied} color="var(--s1)" icon="↩" note="Prospectos distintos que pasaron a “Respondió” en campañas" />
        <Kpi label="Reuniones agendadas" value={meetings} color="var(--s4)" icon="📅" note="Desde campañas" />
        <Kpi label="Propuestas enviadas" value={proposals} color="var(--s2)" icon="📄" note="Desde campañas" />
        <Kpi label="Clientes ganados" value={won} color="var(--s3)" icon="🏆" note="Desde campañas" />
        <Kpi label="Ingresos, costos y margen" value="No disponible" note="Requiere carga de datos financieros (fase 9)" />
      </section>
      <section aria-label="Gráficos" className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Tendencia semanal" note="Prospectos nuevos y chats abiertos por semana (últimas 12 semanas). Misma escala." legend={[{ label: "Prospectos nuevos", color: SERIES[0] }, { label: "Chats abiertos por WhatsApp", color: SERIES[2] }]}>
          <TrendChart labels={labels} series={[{ name: "Prospectos nuevos", color: SERIES[0], values: wkP.map((b) => b.count) }, { name: "Chats abiertos", color: SERIES[2], values: wkT.map((b) => b.count) }]} />
          <Insight>{trendInsight(wkP.map((b) => b.count), wkT.map((b) => b.count))}</Insight>
        </ChartCard>
        <ChartCard title="Embudo comercial" note="Cada etapa cuenta a quien llegó a ella o más lejos; el % es frente a la etapa anterior.">
          <Funnel steps={fun} />
          <Insight>{funnelInsight(fun)}</Insight>
        </ChartCard>
        <ChartCard title="Estado de los prospectos" note="Sin los duplicados excluidos.">
          <Donut center={String(rows.length)} data={[
            { label: "Nuevos", value: statusCount("new"), color: SERIES[0] },
            { label: "Calificados", value: statusCount("qualified"), color: SERIES[2] },
            { label: "Contactados", value: statusCount("contacted"), color: SERIES[3] },
            { label: "Por revisar (duplicado)", value: statusCount("needs_review"), color: SERIES[1] },
            { label: "Archivados", value: statusCount("archived"), color: SERIES[4] },
          ]} />
          <Insight>{statusInsight([{ label: "Nuevos", value: statusCount("new") }, { label: "Calificados", value: statusCount("qualified") }, { label: "Contactados", value: statusCount("contacted") }, { label: "Por revisar (duplicado)", value: statusCount("needs_review") }, { label: "Archivados", value: statusCount("archived") }])}</Insight>
        </ChartCard>
        <ChartCard title="Prioridad comercial" note={`Cuántos prospectos caen en cada franja. ${hist.none} no tienen prioridad todavía (información insuficiente, no es prioridad baja).`}>
          <Columns data={PRIORITY_BANDS.map((l, i) => ({ label: l, value: hist.bands[i] }))} color="var(--s4)" />
          <Insight>{priorityInsight(hist.bands, hist.none)}</Insight>
        </ChartCard>
        <ChartCard title="Calidad de los datos de contacto" note="Porcentaje de prospectos que tiene cada dato.">
          <HBars unit=" %" max={100} data={[
            { label: "Teléfono", value: q.phone ?? 0, color: SERIES[0] }, { label: "Sitio web", value: q.web ?? 0, color: SERIES[2] },
            { label: "Correo", value: q.email ?? 0, color: SERIES[3] }, { label: "Dirección", value: q.address ?? 0, color: SERIES[1] },
          ]} />
          <Insight>{qualityInsight(q)}</Insight>
        </ChartCard>
        <ChartCard title="Fuentes de los prospectos" note="De dónde salieron.">
          <HBars data={fuentes.map((g, i) => ({ label: g.label, value: g.total, color: SERIES[i % 3], note: `${g.withPhone} con teléfono` }))} />
          <Insight>{sourceInsight(fuentes)}</Insight>
        </ChartCard>
        <ChartCard title="Rubros con más prospectos" note="Top 8 por cantidad.">
          <HBars color="var(--s1)" data={rubros.map((g) => ({ label: g.label, value: g.total, note: `${g.withPhone} con teléfono · ${g.qualified} calificados` }))} />
          <Insight>{rankInsight(byCategory(rows), "rubros")}</Insight>
        </ChartCard>
        <ChartCard title="Ciudades con más prospectos" note="Top 6 por cantidad.">
          <HBars color="var(--s3)" data={ciudades.map((g) => ({ label: g.label, value: g.total, note: `${g.withPhone} con teléfono` }))} />
          <Insight>{rankInsight(byCity(rows), "ciudades")}</Insight>
        </ChartCard>
      </section>
    </div>
  );
}
