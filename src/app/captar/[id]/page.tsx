import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { approachFor } from "@/lib/services/captar";
import { SECTOR_LABEL } from "@/lib/skills/approach";

export const dynamic = "force-dynamic";

function List({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return <Tag className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 text-sm`}>{items.map((i) => <li key={i}>{i}</li>)}</Tag>;
}

export default async function Plan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  let r;
  try { r = await approachFor(db, await ensureDefaultOrg(db), id); } catch { notFound(); }
  const { prospect: p, approach: a, score } = r;
  const tone = a.nextAction.code === "blocked" || a.nextAction.code === "resolve_duplicate" ? "badge-bad" : a.nextAction.code === "add_to_campaign" ? "badge-ok" : "badge-warn";
  return (
    <div className="space-y-4">
      <header>
        <Link href="/captar" className="btn mb-2">← Volver a Captar clientes</Link>
        <h1 className="text-2xl font-bold">Plan de acercamiento: {p.name}</h1>
        <p className="text-sm text-muted">{SECTOR_LABEL[a.sector]} · {[p.category, p.city].filter(Boolean).join(" · ")} · <Link className="underline" href={`/prospectos/${p.id}`}>ver ficha</Link> · <Link className="underline" href={`/analizar/${p.id}`}>analizar</Link></p>
        <p className="mt-2 text-xs text-muted">Guía generada con reglas fijas a partir de los datos registrados, <b>sin IA</b>. Lo que no está en los datos aparece como “por verificar”: no lo des por hecho.</p>
      </header>

      <section className="card" aria-label="Siguiente acción"><h2 className="mb-1 font-semibold">Siguiente acción recomendada</h2>
        <p className={`text-sm font-semibold ${tone}`}>{a.nextAction.text}</p>
        {score && <p className="mt-1 text-xs text-muted">Prioridad {score.priority ?? "no calculable"} · cobertura {Math.round(score.coverage * 100)} %. La prioridad no es una probabilidad de contratación.</p>}</section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card" aria-label="Qué sabemos"><h2 className="mb-2 font-semibold">Qué sabemos</h2>{a.known.length ? <List items={a.known} /> : <p className="text-sm text-muted">Casi nada registrado.</p>}</section>
        <section className="card" aria-label="Qué no sabemos"><h2 className="mb-2 font-semibold">Qué no sabemos todavía</h2><List items={a.unknown} /></section>
      </div>

      {a.toVerify.length > 0 && <section className="card" aria-label="Por verificar"><h2 className="mb-2 font-semibold">Por verificar antes o durante la conversación</h2><List items={a.toVerify} /></section>}

      <section className="card" aria-label="Apertura"><h2 className="mb-1 font-semibold">Mensaje de apertura sugerido</h2>
        <p className="whitespace-pre-wrap rounded border border-border p-3 text-sm">{a.opening}</p>
        <p className="mt-1 text-xs text-muted">Es solo una sugerencia: en la campaña lo generas, lo editas y lo apruebas antes de abrir WhatsApp.</p></section>

      <section className="card" aria-label="Preguntas de diagnóstico"><h2 className="mb-2 font-semibold">Preguntas de diagnóstico</h2><List items={a.diagnosticQuestions} ordered /></section>

      <section className="card" aria-label="Objeciones"><h2 className="mb-2 font-semibold">Objeciones previsibles</h2>
        <div className="space-y-3">{a.objections.map((o) => (
          <div key={o.objection} className="rounded border border-border p-3 text-sm">
            <p className="font-semibold">“{o.objection}”</p>
            <p className="mt-1"><b>Cómo responder:</b> {o.response}</p>
            <p className="mt-1 badge-warn"><b>Cuidado:</b> {o.caution}</p>
          </div>))}</div>
        <p className="mt-2 text-xs text-muted">Base provisional; el equipo podrá editarla en “Entrenamiento de IA” (pendiente).</p></section>

      <section className="card" aria-label="Preparar la reunión"><h2 className="mb-2 font-semibold">Para preparar la reunión</h2><List items={a.meetingChecklist} /></section>
    </div>
  );
}
