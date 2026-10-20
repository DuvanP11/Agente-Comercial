import { and, count, eq, isNull, sql } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { activities, clients, duplicateReviews, prospects, searches } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function Kpi({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  );
}

export default async function Dashboard() {
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const n = async (q: Promise<{ c: number }[]>) => (await q)[0]?.c ?? 0;

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
  const pct = (x: number) => (total ? `${Math.round((x / total) * 100)} %` : "—");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard gerencial</h1>
        <p className="text-sm text-muted">Cifras calculadas desde la base de datos. Lo que no tiene datos se muestra como “No disponible”.</p>
      </header>
      {demo > 0 && <p role="status" className="card text-sm badge-warn">Hay {demo} prospectos de DEMOSTRACIÓN contados en estas cifras.</p>}
      <section aria-label="Investigación" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Clientes existentes cargados" value={clientCount} />
        <Kpi label="Prospectos descubiertos" value={total} />
        <Kpi label="Excluidos por duplicidad" value={excluded} />
        <Kpi label="Duplicados por revisar" value={review} />
        <Kpi label="Prospectos calificados" value={qualified} note="Requiere el agente de calificación (fase 5)" />
        <Kpi label="Con teléfono" value={pct(withPhone)} note="Del total de prospectos" />
        <Kpi label="Con correo" value={pct(withEmail)} />
        <Kpi label="Búsquedas con error" value={failedSearches} />
      </section>
      <section aria-label="Comercial" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Conversaciones abiertas por WhatsApp" value={contacts} note="Se abrió el chat; no implica que se haya enviado" />
        <Kpi label="Respuestas / reuniones / propuestas" value="No disponible" note="Aún no se registran (fase 6)" />
        <Kpi label="Ingresos, costos y margen" value="No disponible" note="Requiere carga de datos financieros (fase 9)" />
        <Kpi label="Metas" value="No disponible" note="Módulo de metas pendiente (fase 9)" />
      </section>
    </div>
  );
}
