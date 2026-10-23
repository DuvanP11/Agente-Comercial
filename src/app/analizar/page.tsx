import Link from "next/link";
import { desc, eq, ne, and } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { prospects, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { prospectVisible, viewerOf } from "@/lib/services/scope";
import { Icon } from "@/components/icons";
import { ChartCard, Columns, Donut, SERIES } from "@/components/charts";
import { HelpPanel, Insight } from "@/components/Insight";
import { AnalyzeOneButton, BatchBar, SelectAllBox } from "./BatchBar";
import { AI_ACTOR } from "@/lib/services/analysis-batch";
import { aiReady } from "@/lib/ai/ready";
import { priorityHistogram, PRIORITY_BANDS } from "@/lib/dashboard";
import { priorityInsight } from "@/lib/dashboard-insights";
import { CRITERION_HELP as WHAT, CRITERION_LABELS, DEFAULT_WEIGHTS, type CriterionKey } from "@/lib/scoring/score";
import { getScoringConfig } from "@/lib/services/settings";
import type { StoredScore } from "@/lib/services/analysis";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { new: "Nuevo", needs_review: "Revisar duplicado", qualified: "Calificado", contacted: "Contactado", archived: "Archivado" };
const FILTERS = { todos: "Todos", sin: "Sin valorar", prioridad: "Con prioridad", insuf: "Sin prioridad (falta información)" } as const;
type Filter = keyof typeof FILTERS;

/** Qué datos de contacto tiene el prospecto, de un vistazo (solo cuentan los válidos). */
function ContactChips({ phone, email, web }: { phone: boolean; email: boolean; web: boolean }) {
  if (!phone && !email && !web) return <span className="badge badge-warn" title="No tiene teléfono, correo ni web válidos: complétalos en su ficha">Sin contacto</span>;
  const chip = (on: boolean, icon: string, label: string) => (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" title={on ? `Tiene ${label}` : `Sin ${label}`}
      style={on ? { background: "color-mix(in srgb, var(--s3) 18%, transparent)", color: "var(--color-text)" } : { opacity: 0.4, textDecoration: "line-through" }}><Icon name={icon} size={12} />{label}</span>
  );
  return <div className="flex flex-wrap gap-1">{chip(phone, "phone", "teléfono")}{chip(email, "mail", "correo")}{chip(web, "globe", "web")}</div>;
}

function PriorityBadge({ s }: { s: StoredScore | null }) {
  if (!s) return <span className="badge">Sin valorar</span>;
  const ia = s.assessedBy === AI_ACTOR && <span className="badge badge-warn ml-1" title="La valoró la IA y nadie la ha revisado. Ábrela con «Revisar» para confirmarla antes de calificar.">IA · sin revisar</span>;
  if (s.priority === null) return <span className="inline-flex items-center"><span className="badge badge-warn" title="Falta información para calcular una prioridad: no significa que sea un mal prospecto.">Falta información</span>{ia}</span>;
  const color = s.priority >= 60 ? "var(--s3)" : s.priority >= 40 ? "var(--s2)" : "var(--s5)";
  return (
    <span className="inline-flex items-center gap-2" title={`Prioridad ${s.priority} de 100`}>
      <span className="inline-block h-2 w-20 overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }}><span className="block h-2 rounded-full" style={{ width: `${s.priority}%`, background: color }} /></span>
      <b>{s.priority}</b>{ia}
    </span>
  );
}

export const maxDuration = 60; // cada llamada analiza hasta 5 prospectos con IA

export default async function Analizar({ searchParams }: { searchParams: Promise<{ f?: string; c?: string; r?: string }> }) {
  const { f, c, r } = await searchParams;
  const me = await requireUser();
  const viewer = viewerOf(me);
  const contact: "todos" | "con" | "sin" = c === "con" || c === "sin" ? c : "todos";
  const filter: Filter = f && f in FILTERS ? (f as Filter) : "todos";
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const cfg = await getScoringConfig(db, org);
  const people = viewer.seesAll ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(users.name) : [];
  const nameOf = new Map(people.map((x) => [x.id, x.name]));
  const owner = viewer.seesAll ? (r === "mios" ? me.id : r === "sin" ? "sin" : r && nameOf.has(r) ? r : undefined) : undefined;
  // El Hunter analiza solo lo suyo; los demás roles ven todo y pueden filtrar por responsable.
  const all = (await db.select().from(prospects).where(and(eq(prospects.orgId, org), ne(prospects.status, "excluded_duplicate"), prospectVisible(viewer))).orderBy(desc(prospects.createdAt)).limit(300))
    .filter((p) => !owner || (owner === "sin" ? !p.ownerId : p.ownerId === owner));
  const withScore = all.map((p) => ({ p, s: p.scoreJson as StoredScore | null }));
  const unrated = withScore.filter((x) => !x.s), noPriority = withScore.filter((x) => x.s && x.s.priority === null), ranked = withScore.filter((x) => x.s && x.s.priority !== null);
  const hist = priorityHistogram(withScore.map((x) => (x.s ? x.s.priority : null)).filter((_, i) => withScore[i].s));
  const hasContact = (p: (typeof all)[number]) => !!(p.phoneKey || p.emailKey || p.domainKey); // datos válidos: un teléfono mal escrito no cuenta
  const base = filter === "sin" ? unrated : filter === "prioridad" ? ranked : filter === "insuf" ? noPriority : withScore;
  const withC = base.filter((x) => hasContact(x.p)).length;
  const rows = (contact === "con" ? base.filter((x) => hasContact(x.p)) : contact === "sin" ? base.filter((x) => !hasContact(x.p)) : base)
    .slice().sort((a, b) => (b.s?.priority ?? -1) - (a.s?.priority ?? -1));
  const count: Record<Filter, number> = { todos: withScore.length, sin: unrated.length, prioridad: ranked.length, insuf: noPriority.length };
  const avgCov = withScore.filter((x) => x.s).length ? Math.round((withScore.reduce((a, x) => a + (x.s?.coverage ?? 0), 0) / withScore.filter((x) => x.s).length) * 100) : null;
  const link = (ff: string | undefined, cc: string, rr: string | undefined = r) => { const q = new URLSearchParams(); if (ff) q.set("f", ff); if (cc !== "todos") q.set("c", cc); if (rr) q.set("r", rr); const t = q.toString(); return t ? `/analizar?${t}` : "/analizar"; };
  const pill = (active: boolean) => (active ? { background: "var(--color-primary)", color: "var(--color-on-primary)" } : undefined);
  const keys = Object.keys(DEFAULT_WEIGHTS) as CriterionKey[];
  const kpi = (label: string, value: string | number, note: string, color: string) => (
    <div className="card kpi" style={{ ["--kpi" as string]: color }}><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted">{note}</div></div>
  );
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Analizar clientes</h1>
        <p className="text-sm text-muted">Aquí decides qué prospectos valen la pena: cada uno se valora con criterios y evidencia, y el resultado es una <b>prioridad de 0 a 100</b> para saber a quién contactar primero.</p>
      </header>

      <HelpPanel title="Cómo funciona (qué se valora, qué significa la prioridad y cómo usarla)">
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Para analizar a muchos a la vez:</b> usa la barra «Analizar con IA» (los elegidos con las casillas, todos los que se ven, o solo los que faltan por valorar), o el botón <b>✨ IA</b> de una fila para uno solo. La IA guarda su resultado como «IA (sin revisar)»: ordena por prioridad, pero para calificar a alguien una persona debe abrirlo con <b>Revisar</b> y guardar la valoración.</li>
          <li>Para analizar uno a uno, entra a un prospecto con <b>Analizar</b>. Puedes pulsar <b>Proponer con IA</b> (carga una propuesta, no guarda nada) o llenar los criterios tú.</li>
          <li>Para cada criterio eliges la <b>naturaleza</b>: «Confirmado» (exige evidencia), «Inferencia», «Hipótesis» o «Desconocido». Lo desconocido <b>no suma ni resta</b>.</li>
          <li>Pulsa <b>Guardar valoración</b>: se calcula la prioridad. Si la prioridad existe, puedes marcarlo <b>Calificado</b> y llevarlo a una campaña desde Captar clientes.</li>
        </ol>
        <p><b>La prioridad solo aparece</b> si lo que sabes pesa al menos el <b>{Math.round(cfg.minCoverage * 100)} %</b> del total (cobertura). Con menos, dice «Falta información»: no es una mala nota, es que aún no se puede juzgar. Tener teléfono o web solo cuenta en el criterio de contacto. Los pesos y esa cobertura se cambian en <Link className="underline" href="/configuracion">Configuración</Link>.</p>
        <div className="overflow-x-auto">
          <table className="table"><thead><tr><th>Criterio</th><th>Peso</th><th>Qué mide</th></tr></thead>
            <tbody>{keys.map((k) => <tr key={k}><td><b>{CRITERION_LABELS[k]}</b></td><td>{cfg.weights[k]}</td><td className="text-muted">{WHAT[k]}</td></tr>)}</tbody></table>
        </div>
        <p className="text-xs text-muted">La prioridad no es una probabilidad de que el prospecto contrate: ordena a quién mirar primero con la información disponible.</p>
      </HelpPanel>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen">
        {kpi("Prospectos por analizar", all.length, "Sin los duplicados excluidos", "var(--s1)")}
        {kpi("Sin valorar", unrated.length, "Aún no se les ha hecho análisis", "var(--s2)")}
        {kpi("Con prioridad", ranked.length, "Listos para decidir si se califican", "var(--s3)")}
        {kpi("Cobertura promedio", avgCov === null ? "—" : `${avgCov} %`, `Se necesita ${Math.round(cfg.minCoverage * 100)} % para dar prioridad`, "var(--s4)")}
      </section>

      {all.length > 0 && (
        <section className="grid gap-3 lg:grid-cols-2" aria-label="Gráficos">
          <ChartCard title="Avance del análisis" note="En qué punto está cada prospecto.">
            <Donut center={String(all.length)} data={[
              { label: "Sin valorar", value: unrated.length, color: SERIES[1] },
              { label: "Falta información", value: noPriority.length, color: SERIES[4] },
              { label: "Con prioridad", value: ranked.length, color: SERIES[2] },
            ]} />
            <Insight>{unrated.length === all.length ? "Todavía no has analizado ningún prospecto: empieza por los que tengan teléfono para poder contactarlos pronto." : `${Math.round((ranked.length / all.length) * 100)} % ya tiene prioridad. ${noPriority.length ? `${noPriority.length} se valoraron pero aún les falta información para tener prioridad.` : ""}`}</Insight>
          </ChartCard>
          <ChartCard title="Prioridad de los valorados" note="Cuántos prospectos caen en cada franja de prioridad.">
            <Columns data={PRIORITY_BANDS.map((l, i) => ({ label: l, value: hist.bands[i] }))} color="var(--s4)" />
            <Insight>{ranked.length === 0 ? "Aún no hay prospectos con prioridad." : priorityInsight(hist.bands, 0)}</Insight>
          </ChartCard>
        </section>
      )}

      <nav aria-label="Filtrar" className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Ver:</span>
        {(Object.keys(FILTERS) as Filter[]).map((k) => <Link key={k} className="btn" style={pill(filter === k)} href={link(k === "todos" ? undefined : k, contact)}>{FILTERS[k]} ({count[k]})</Link>)}
      </nav>
      {viewer.seesAll && (
        <nav aria-label="Filtrar por responsable" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Responsable:</span>
          <Link className="btn" style={pill(!owner)} href={link(filter === "todos" ? undefined : filter, contact, "")}>Todos</Link>
          <Link className="btn" style={pill(owner === me.id)} href={link(filter === "todos" ? undefined : filter, contact, "mios")}>Míos</Link>
          <Link className="btn" style={pill(owner === "sin")} href={link(filter === "todos" ? undefined : filter, contact, "sin")}>Sin asignar</Link>
          <form method="get" className="flex items-center gap-2">
            {filter !== "todos" && <input type="hidden" name="f" value={filter} />}{contact !== "todos" && <input type="hidden" name="c" value={contact} />}
            <select name="r" aria-label="Elegir persona" className="input !w-auto" defaultValue={owner && owner !== "sin" && owner !== me.id ? owner : ""}><option value="">Otra persona…</option>{people.filter((x) => x.id !== me.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="btn">Ver</button>
          </form>
        </nav>)}
      <nav aria-label="Filtrar por contacto" className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Contacto:</span>
        {([["todos", "Todos", base.length], ["con", "Con contacto", withC], ["sin", "Sin contacto", base.length - withC]] as const).map(([k, l, n]) => <Link key={k} className="btn" style={pill(contact === k)} href={link(filter === "todos" ? undefined : filter, k)}>{l} ({n})</Link>)}
      </nav>

      {rows.length > 0 && <BatchBar visibleIds={rows.map(({ p }) => p.id)} unratedIds={rows.filter(({ s }) => !s).map(({ p }) => p.id)} aiReady={aiReady()} />}

      <div className="card overflow-x-auto">
        {rows.length === 0 ? <p className="text-sm text-muted">{all.length === 0 ? "No hay prospectos por analizar. Ejecuta una búsqueda primero." : "No hay prospectos con este filtro."}</p> : (
          <table className="table">
            <thead><tr><th className="w-8"><SelectAllBox /></th><th>Empresa</th><th>Rubro</th><th>Contacto</th><th>Estado</th><th>Prioridad</th><th>Cobertura</th>{viewer.seesAll && <th>Responsable</th>}<th></th></tr></thead>
            <tbody>{rows.map(({ p, s }) => (
              <tr key={p.id}>
                <td><input type="checkbox" data-analyze={p.id} aria-label={`Elegir ${p.name}`} /></td>
                <td><Link className="font-semibold underline" href={`/prospectos/${p.id}`}>{p.name}</Link>{p.isDemo && <span className="badge badge-warn ml-2">Demo</span>}<div className="text-xs text-muted">{p.city}</div></td>
                <td>{p.category ?? <span className="text-muted">—</span>}</td>
                <td><ContactChips phone={!!p.phoneKey} email={!!p.emailKey} web={!!p.domainKey} /></td>
                <td><span className="badge">{STATUS[p.status] ?? p.status}</span></td>
                <td><PriorityBadge s={s} /></td>
                <td>{s ? <span className="inline-flex items-center gap-2"><span className="inline-block h-2 w-16 overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }}><span className="block h-2 rounded-full" style={{ width: `${Math.round(s.coverage * 100)}%`, background: "var(--s1)" }} /></span>{Math.round(s.coverage * 100)} %</span> : <span className="text-muted">—</span>}</td>
                {viewer.seesAll && <td className="text-sm">{p.ownerId ? nameOf.get(p.ownerId) ?? "—" : <span className="badge badge-warn">Sin asignar</span>}</td>}
                <td className="whitespace-nowrap"><div className="flex items-center gap-2"><AnalyzeOneButton id={p.id} rated={!!s} aiReady={aiReady()} /><Link className="btn" href={`/analizar/${p.id}`}>{s ? "Revisar" : "Analizar"}</Link></div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {all.length >= 300 && <p className="mt-2 text-xs text-muted">Se muestran los 300 más recientes.</p>}
      </div>
    </div>
  );
}
