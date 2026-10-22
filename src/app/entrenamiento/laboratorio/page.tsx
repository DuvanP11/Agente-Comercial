import Link from "next/link";
import { aiReady } from "@/lib/ai/ready";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { HelpPanel } from "@/components/Insight";
import { getConversation, listConversations, listLessons, simStats } from "@/lib/services/simulator";
import { requireNotHunter } from "@/lib/session";
import { Lab } from "./Lab";
import { Lessons } from "./Lessons";

export const dynamic = "force-dynamic";

export default async function Laboratorio({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const me = await requireNotHunter();
  const { c } = await searchParams;
  const db = await getDb(), org = await ensureDefaultOrg(db);
  const [stats, lessons, recent] = await Promise.all([simStats(db, org), listLessons(db, org), listConversations(db, org, me)]);
  let current: Awaited<ReturnType<typeof getConversation>> | null = null;
  if (c) { try { current = await getConversation(db, org, me, c); } catch { current = null; } }
  const kpi = (label: string, value: string, note: string, color: string) => (
    <div className="card kpi" style={{ ["--kpi" as string]: color }}><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted">{note}</div></div>
  );
  return (
    <div className="space-y-4">
      <header>
        <Link href="/entrenamiento" className="btn mb-2">← Volver a Entrenamiento de IA</Link>
        <h1 className="text-2xl font-bold">Laboratorio de conversación</h1>
        <p className="text-sm text-muted">Prueba en tiempo real cómo conduce el agente el primer contacto: saludo, preguntas filtro, presentación y siguiente paso. Tú haces de cliente potencial; cuando se equivoque, lo corriges y aprende para la próxima.</p>
      </header>
      <p className="card text-sm">Lo que Bix aprende aquí es lo que usa con los leads reales por WhatsApp. Cuando conversa como quieres, márcalo como listo en <Link className="underline" href="/bix">Bix</Link>.</p>
      <HelpPanel title="Cómo funciona">
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Elige un escenario</b> (un negocio de prueba y cómo te vas a comportar) y empieza: el agente escribe el primer mensaje.</li>
          <li><b>Respóndele como el cliente.</b> El agente hace una pregunta filtro a la vez, presenta PIBOX con lo que escribiste en Entrenamiento y propone el siguiente paso.</li>
          <li>Si algo está bien, pulsa <b>👍 Está bien</b>. Si se equivoca, pulsa <b>✎ Corregir</b> y escribe qué debió hacer: puede <b>reescribir ese mensaje</b> y <b>guardar la corrección como lección</b>.</li>
          <li>Las lecciones activas se suman a las instrucciones de los agentes: la próxima conversación (y la redacción de mensajes de campañas y la calificación) ya las aplican.</li>
        </ol>
        <p className="text-xs text-muted">No se reentrena ningún modelo: aprende porque tus lecciones viajan como instrucciones. El agente nunca da precios, descuentos, garantías ni tiempos, aunque se lo pidas; esas reglas mandan sobre cualquier lección. Nada se envía a nadie real.</p>
      </HelpPanel>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen">
        {kpi("Mensajes revisados", String(stats.reviewed), `${stats.pending} sin revisar`, "var(--s1)")}
        {kpi("Acierto del agente", stats.accuracy === null ? "—" : `${stats.accuracy} %`, "Marcados «está bien» sobre los revisados", "var(--s3)")}
        {kpi("Correcciones", String(stats.corrected), "Mensajes que hubo que corregir", "var(--s2)")}
        {kpi("Lecciones activas", String(lessons.filter((l) => l.active).length), `${lessons.length} en total`, "var(--s4)")}
      </section>
      <Lab key={current?.id ?? "nueva"} aiReady={aiReady()} initialId={current?.id ?? null}
        initialMessages={(current?.messages ?? []).map((m) => ({ id: m.id, role: m.role as "agent" | "prospect", text: m.text, originalText: m.originalText, stage: m.stage, status: m.status }))}
        initialScenario={{ business: current?.scenario.business ?? "", category: current?.scenario.category ?? "", city: current?.scenario.city ?? "Bogotá", behavior: current?.scenario.behavior ?? "" }} />
      <Lessons rows={lessons.map((l) => ({ id: l.id, text: l.text, active: l.active, createdBy: l.createdBy, createdAt: l.createdAt.toISOString() }))} />
      {recent.length > 0 && (
        <section className="card" aria-label="Conversaciones anteriores"><h2 className="mb-2 font-semibold">Tus conversaciones anteriores</h2>
          <ul className="space-y-1 text-sm">{recent.map((r) => <li key={r.id}><Link className="underline" href={`/entrenamiento/laboratorio?c=${r.id}`}>{r.scenario.business}</Link> <span className="text-muted">· {r.n} mensajes · {r.createdAt.toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></li>)}</ul></section>)}
    </div>
  );
}
