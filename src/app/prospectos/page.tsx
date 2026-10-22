import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { prospects, users } from "@/lib/db/schema";
import { canManageUsers } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { prospectVisible, viewerOf } from "@/lib/services/scope";
import { AssignUnowned } from "./AssignUnowned";
import { mailtoLink, phoneLinks, safeWebUrl } from "@/lib/contact-links";
import { CONTACT_FILTER_LABEL, isContactFilter, matchesContactFilter, type ContactFilter } from "@/lib/contact-filter";
import { contactState, STATE_LABEL, type ContactStateKey } from "@/lib/contact-tracking";
import { hasContactData } from "@/lib/services/contact-tracking";
import { getContactRules } from "@/lib/services/settings";
import { ChartCard, Columns, Donut, Funnel, SERIES } from "@/components/charts";
import { HelpPanel, Insight } from "@/components/Insight";
import { funnelInsight } from "@/lib/dashboard-insights";
import { Dots } from "./[id]/ContactManager";

export const dynamic = "force-dynamic";

const STAGE: Record<string, string> = {
  new: "Lead nuevo", needs_review: "Revisar duplicado", qualified: "Prospecto calificado", contacted: "En gestión", archived: "Archivado", excluded_duplicate: "Excluido (duplicado)",
};
const GESTION = Object.keys(STATE_LABEL) as ContactStateKey[];
const isGestion = (v: unknown): v is ContactStateKey => typeof v === "string" && (GESTION as string[]).includes(v);
const TONE: Record<string, string> = { interested: "badge-ok", not_interested: "badge-bad", exhausted: "badge-bad", no_info: "badge-warn", no_answer: "badge-warn" };

export default async function Prospectos({ searchParams }: { searchParams: Promise<{ status?: string; contacto?: string; gestion?: string; dueno?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const viewer = viewerOf(me);
  const status = sp.status && sp.status in STAGE ? sp.status : undefined;
  const contacto: ContactFilter = isContactFilter(sp.contacto) ? sp.contacto : "all";
  const gestion = isGestion(sp.gestion) ? sp.gestion : undefined;
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const rules = await getContactRules(db, org);
  const people = viewer.seesAll ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(users.name) : [];
  const nameOf = new Map(people.map((x) => [x.id, x.name]));
  const dueno = viewer.seesAll ? (sp.dueno === "mios" ? me.id : sp.dueno === "sin" ? "sin" : sp.dueno && nameOf.has(sp.dueno) ? sp.dueno : undefined) : undefined;
  // El Hunter solo ve los suyos; los demás roles ven todos y pueden filtrar por responsable.
  const all = (await db.select().from(prospects).where(and(eq(prospects.orgId, org), prospectVisible(viewer))).orderBy(desc(prospects.createdAt)).limit(500))
    .filter((p) => !dueno || (dueno === "sin" ? !p.ownerId : p.ownerId === dueno));
  const sinDueno = viewer.seesAll ? all.filter((p) => !p.ownerId).length : 0;
  // Se calcula una sola vez por prospecto: etapa, estado de contacto y datos de contacto (las claves ya validadas: un dato mal escrito no cuenta).
  const items = all.map((p) => ({ p, st: contactState({ outcome: p.contactOutcome, attempts: p.contactAttempts, hasContactData: hasContactData(p) }, rules), keys: { phone: p.phoneKey || null, email: p.emailKey || null, website: p.domainKey || null } }));
  const live = items.filter((x) => x.p.status !== "excluded_duplicate");
  const byStatus = status ? items.filter((x) => x.p.status === status) : items;
  const byContact = byStatus.filter((x) => matchesContactFilter(x.keys, contacto));
  const rows = gestion ? byContact.filter((x) => x.st.key === gestion) : byContact;

  const count = (k: ContactStateKey) => live.filter((x) => x.st.key === k).length;
  const attempted = live.filter((x) => x.p.contactAttempts > 0).length;
  const steps = [
    { label: "Leads (descubiertos)", value: live.length },
    { label: "Con datos de contacto", value: live.filter((x) => hasContactData(x.p)).length },
    { label: "Prospectos calificados", value: live.filter((x) => x.p.status === "qualified").length },
    { label: "Contactados (≥ 1 intento)", value: attempted },
    { label: "Interesados", value: live.filter((x) => x.p.contactOutcome === "interested").length },
  ];
  const maxA = rules.maxAttempts;
  const dist = Array.from({ length: maxA + 1 }, (_, n) => ({ label: n === 0 ? "0 (sin intentos)" : n === maxA ? `${n} (máximo)` : String(n), value: live.filter((x) => Math.min(x.p.contactAttempts, maxA) === n).length }));

  const href = (o: { status?: string; contacto?: ContactFilter; gestion?: string; dueno?: string }) => {
    const q = new URLSearchParams();
    if (o.dueno ?? sp.dueno) q.set("dueno", (o.dueno ?? sp.dueno)!);
    if (o.status) q.set("status", o.status);
    if (o.contacto && o.contacto !== "all") q.set("contacto", o.contacto);
    if (o.gestion) q.set("gestion", o.gestion);
    const t = q.toString();
    return t ? `/prospectos?${t}` : "/prospectos";
  };
  const pill = (active: boolean) => (active ? { background: "var(--color-primary)", color: "var(--color-on-primary)" } : undefined);
  const kpi = (label: string, value: number, note: string, color: string) => (
    <div className="card kpi" style={{ ["--kpi" as string]: color }}><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted">{note}</div></div>
  );
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Base de prospectos</h1>
        <p className="text-sm text-muted">{viewer.seesAll ? "Todo lo que el equipo ha descubierto o importado" : "Lo que tú has descubierto o importado"}, y qué ha pasado con cada uno: si ya se contactó, cuántas veces y cómo respondió.</p>
      </header>

      <HelpPanel title="Cómo funciona esta base (de lead a cliente)">
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Lead:</b> un negocio que apareció en una búsqueda o en un archivo. Entra aquí como «Lead nuevo», sin valorar.</li>
          <li><b>Prospecto:</b> un lead que valoraste en <Link className="underline" href="/analizar">Analizar clientes</Link> y marcaste como «Calificado» porque vale la pena contactarlo.</li>
          <li><b>Contacto:</b> desde la ficha del prospecto o desde una <Link className="underline" href="/campanas">campaña</Link> lo contactas. Cada WhatsApp abierto o intento registrado (llamada, correo, visita) cuenta como <b>un intento</b>.</li>
          <li><b>Resultado:</b> marcas cómo respondió: Contactado, Sin respuesta, Interesado o No interesado.</li>
        </ol>
        <p><b>Regla de intentos:</b> máximo <b>{maxA}</b> intento{maxA === 1 ? "" : "s"} por prospecto. Si se llega al máximo sin una respuesta clara, queda <b>Agotado</b> y la app ya no deja contactarlo. Un «No interesado» también bloquea nuevos contactos. El máximo se cambia en <Link className="underline" href="/configuracion">Configuración</Link>.</p>
        <p><b>Sin datos para contactar:</b> el negocio no tiene teléfono, correo ni web; complétalos en su ficha o búscalos en otra fuente.</p>
        <p className="text-xs text-muted">Los prospectos que ya tenías antes de esta función conservan su historial: cada WhatsApp que habías abierto cuenta como un intento.</p>
      </HelpPanel>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Resumen">
        {kpi("Leads y prospectos", live.length, "Sin los duplicados excluidos", "var(--s1)")}
        {kpi("Por contactar", count("pending"), "Con datos y sin intentos", "var(--s4)")}
        {kpi("En gestión", count("contacted") + count("no_answer"), "Contactados esperando respuesta", "var(--s2)")}
        {kpi("Interesados", count("interested"), "Respondieron con interés", "var(--s3)")}
        {kpi("Agotados", count("exhausted"), `Llegaron a ${maxA} intentos sin respuesta`, "var(--s5)")}
      </section>

      {live.length > 0 && (
        <section className="grid gap-3 lg:grid-cols-2" aria-label="Gráficos">
          <ChartCard title="De lead a interesado" note="Cada etapa cuenta a quien llegó a ella; el % es frente a la etapa anterior.">
            <Funnel steps={steps} />
            <Insight>{funnelInsight(steps)}</Insight>
          </ChartCard>
          <ChartCard title="Estado de la gestión de contacto" note="Cómo va cada prospecto.">
            <Donut center={String(live.length)} data={[
              { label: "Por contactar", value: count("pending"), color: SERIES[0] }, { label: "Contactado", value: count("contacted"), color: SERIES[3] },
              { label: "Sin respuesta", value: count("no_answer"), color: SERIES[1] }, { label: "Interesado", value: count("interested"), color: SERIES[2] },
              { label: "No interesado", value: count("not_interested"), color: SERIES[4] }, { label: "Agotado", value: count("exhausted"), color: "#94a3b8" },
              { label: "Sin datos para contactar", value: count("no_info"), color: "#64748b" },
            ].filter((d) => d.value > 0)} />
            <Insight>{attempted === 0 ? "Aún no se ha contactado a nadie." : `${attempted} de ${live.length} (${Math.round((attempted / live.length) * 100)} %) ya tienen al menos un intento. ${count("no_info") ? `${count("no_info")} no se pueden contactar porque no tienen ningún dato de contacto.` : ""}`}</Insight>
          </ChartCard>
          <ChartCard title="Intentos usados" note={`Cuántos prospectos llevan 0, 1… hasta ${maxA} intentos.`}>
            <Columns data={dist} color="var(--s1)" />
            <Insight>{count("exhausted") > 0 ? `${count("exhausted")} prospecto(s) ya agotaron los ${maxA} intentos: no se contactarán más, salvo que subas el máximo.` : `Ninguno ha agotado los ${maxA} intentos todavía.`}</Insight>
          </ChartCard>
        </section>
      )}

      {viewer.seesAll && canManageUsers(me.role) && sinDueno > 0 && <AssignUnowned count={sinDueno} people={people} meId={me.id} />}

      <section className="space-y-2" aria-label="Filtros">
        {viewer.seesAll && (
          <nav aria-label="Filtrar por responsable" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Responsable:</span>
            <Link className="btn" style={pill(!dueno)} href={href({ status, contacto, gestion, dueno: "" })}>Todos</Link>
            <Link className="btn" style={pill(dueno === me.id)} href={href({ status, contacto, gestion, dueno: "mios" })}>Míos</Link>
            <Link className="btn" style={pill(dueno === "sin")} href={href({ status, contacto, gestion, dueno: "sin" })}>Sin asignar</Link>
            <form method="get" className="flex items-center gap-2">
              {status && <input type="hidden" name="status" value={status} />}{gestion && <input type="hidden" name="gestion" value={gestion} />}{contacto !== "all" && <input type="hidden" name="contacto" value={contacto} />}
              <select name="dueno" aria-label="Elegir persona" className="input !w-auto" defaultValue={dueno && dueno !== "sin" && dueno !== me.id ? dueno : ""}><option value="">Otra persona…</option>{people.filter((x) => x.id !== me.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <button className="btn">Ver</button>
            </form>
          </nav>)}
        <nav aria-label="Filtrar por etapa" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Etapa:</span>
          <Link className="btn" style={pill(!status)} href={href({ contacto, gestion })}>Todos</Link>
          {Object.entries(STAGE).map(([k, v]) => <Link key={k} className="btn" style={pill(status === k)} href={href({ status: k, contacto, gestion })}>{v}</Link>)}
        </nav>
        <nav aria-label="Filtrar por gestión" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Gestión:</span>
          <Link className="btn" style={pill(!gestion)} href={href({ status, contacto })}>Todas</Link>
          {GESTION.map((k) => <Link key={k} className="btn" style={pill(gestion === k)} href={href({ status, contacto, gestion: k })}>{STATE_LABEL[k]} ({byContact.filter((x) => x.st.key === k).length})</Link>)}
        </nav>
        <nav aria-label="Filtrar por contacto" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Datos:</span>
          {(Object.keys(CONTACT_FILTER_LABEL) as ContactFilter[]).map((f) => {
            const n = byStatus.filter((x) => matchesContactFilter(x.keys, f)).length;
            return <Link key={f} className="btn" style={pill(contacto === f)} href={href({ status, contacto: f, gestion })}>{CONTACT_FILTER_LABEL[f]} ({n})</Link>;
          })}
        </nav>
        <p className="text-sm text-muted">{rows.length} de {all.length} registros{all.length >= 500 ? " (se cargan los 500 más recientes)" : ""}.</p>
      </section>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? <p className="text-sm text-muted">No hay prospectos con estos filtros. Prueba otros, o ejecuta una búsqueda en “Buscar clientes”.</p> : (
          <table className="table">
            <thead><tr><th>Empresa</th><th>Etapa</th><th>Gestión de contacto</th><th>Intentos</th><th>Teléfono</th><th>Correo / web</th><th>Ciudad · rubro</th>{viewer.seesAll && <th>Responsable</th>}</tr></thead>
            <tbody>{rows.map(({ p, st }) => {
              const web = safeWebUrl(p.website), mail = mailtoLink(p.email);
              return (
                <tr key={p.id}>
                  <td><Link className="font-semibold underline" href={`/prospectos/${p.id}`}>{p.name}</Link>{p.isDemo && <span className="badge badge-warn ml-2">Demo</span>}<div className="text-xs text-muted">{p.sourceName}</div></td>
                  <td><span className="badge">{STAGE[p.status] ?? p.status}</span></td>
                  <td><span className={`badge ${TONE[st.key] ?? ""}`}>{st.label}</span>{p.lastAttemptAt && <div className="text-xs text-muted">Último: {p.lastAttemptAt.toLocaleDateString("es-CO")}</div>}</td>
                  <td><div className="flex items-center gap-2"><Dots attempts={p.contactAttempts} max={maxA} /><span className="text-xs text-muted">{p.contactAttempts}/{maxA}</span></div></td>
                  <td className="text-sm">{p.phone ? phoneLinks(p.phone).map((x, i) => <div key={i} className="whitespace-nowrap">{x.href ? <a className="underline" href={x.href}>{x.text}</a> : x.text}</div>) : <span className="text-muted">—</span>}</td>
                  <td className="text-sm">{p.email ? (mail ? <a className="break-all underline" href={mail}>{p.email}</a> : p.email) : null}{p.website ? <div>{web ? <a className="break-all underline" target="_blank" rel="noopener noreferrer" href={web}>{p.website}</a> : p.website}</div> : null}{!p.email && !p.website && <span className="text-muted">—</span>}</td>
                  <td className="text-sm">{p.city}<div className="text-xs text-muted">{p.category}</div></td>
                  {viewer.seesAll && <td className="text-sm">{p.ownerId ? nameOf.get(p.ownerId) ?? "—" : <span className="badge badge-warn">Sin asignar</span>}</td>}
                </tr>);
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
