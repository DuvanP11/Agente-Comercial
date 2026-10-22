import Link from "next/link";
import { eq } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { activityStats, listActivity } from "@/lib/services/activity";
import { isKind, KINDS, moduleOf, type Kind } from "@/lib/activity";
import { requireNotHunter } from "@/lib/session";
import { ChartCard, HBars, SERIES, TrendChart } from "@/components/charts";
import { HelpPanel, Insight } from "@/components/Insight";
import { ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const fmt = (d: Date) => d.toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const TONE: Partial<Record<Kind, string>> = { login_failed: "badge-bad", probe: "badge-bad", download: "badge-warn", import: "badge-warn", admin: "badge-warn", login: "badge-ok" };
const dayStart = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00-05:00`) : undefined);
const dayEnd = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T23:59:59-05:00`) : undefined);

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ u?: string; k?: string; q?: string; d?: string; h?: string; n?: string }> }) {
  await requireNotHunter();
  const sp = await searchParams;
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const kind = isKind(sp.k) ? sp.k : undefined;
  const limit = Math.min(Math.max(Number(sp.n) || 200, 50), 2000);
  const [rows, stats, people] = await Promise.all([
    listActivity(db, org, { userId: sp.u || undefined, kind, q: sp.q, from: dayStart(sp.d), to: dayEnd(sp.h), limit }),
    activityStats(db, org, 14),
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.orgId, org)).orderBy(users.name),
  ]);
  const now = new Date(), since7 = now.getTime() - 7 * 86_400_000, today = new Date(now.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
  const isToday = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10) === today;
  const week = stats.filter((s) => s.at.getTime() >= since7);
  const count = (k: Kind, list = week) => list.filter((s) => s.kind === k).length;
  const activeToday = new Set(stats.filter((s) => isToday(s.at) && s.userId).map((s) => s.userId)).size;
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(now.getTime() - (13 - i) * 86_400_000); return d.toISOString().slice(0, 10); });
  const perDay = days.map((d) => stats.filter((s) => new Date(s.at.getTime() - 5 * 3600_000).toISOString().slice(0, 10) === d).length);
  const perDayFail = days.map((d) => stats.filter((s) => (s.kind === "login_failed" || s.kind === "probe") && new Date(s.at.getTime() - 5 * 3600_000).toISOString().slice(0, 10) === d).length);
  const byKind = Object.entries(KINDS).map(([k, label]) => ({ label, value: week.filter((s) => s.kind === k).length })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const byUserMap = new Map<string, number>(); for (const s of week) byUserMap.set(s.userName ?? "(sin sesión)", (byUserMap.get(s.userName ?? "(sin sesión)") ?? 0) + 1);
  const byUser = [...byUserMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const byModMap = new Map<string, number>(); for (const s of week.filter((x) => x.kind === "view")) byModMap.set(moduleOf(s.path), (byModMap.get(moduleOf(s.path)) ?? 0) + 1);
  const byMod = [...byModMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const qs = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) if (v && k !== "n") qs.set(k, v);
  const kpi = (label: string, value: number, note: string, color: string) => (
    <div className="card kpi" style={{ ["--kpi" as string]: color }}><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted">{note}</div></div>
  );
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Auditoría de actividad</h1>
        <p className="text-sm text-muted">Quién entró, qué pantallas abrió, qué descargó, qué archivos importó y qué hizo en la plataforma. Solo lo ven Admin, Head, IT y Gerencia.</p></header>
      <HelpPanel title="Qué se registra (y qué no)">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Se registra:</b> inicios y cierres de sesión, intentos fallidos, cada pantalla abierta y cada clic en el menú, descargas (reportes y archivos), importaciones (con el nombre del archivo y cuántas filas), búsquedas, acciones comerciales (campañas, contactos, valoraciones), cambios de usuarios y de configuración, y escaneos bloqueados.</li>
          <li><b>No se registra:</b> contraseñas, el contenido de los mensajes ni los datos de los prospectos; solo qué se hizo y sobre qué.</li>
          <li>Cada línea guarda la persona, su rol, la dirección IP y el navegador. Es información personal de tus compañeros: úsala solo para seguridad y control (Ley 1581 de 2012).</li>
          <li>El registro no se puede editar ni borrar desde la plataforma.</li>
        </ul>
      </HelpPanel>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label="Resumen">
        {kpi("Personas activas hoy", activeToday, "Con sesión iniciada", "var(--s1)")}
        {kpi("Eventos (7 días)", week.length, "Todo lo registrado", "var(--s4)")}
        {kpi("Descargas (7 días)", count("download"), "Reportes y archivos", "var(--s2)")}
        {kpi("Importaciones (7 días)", count("import"), "Archivos subidos", "var(--s3)")}
        {kpi("Accesos fallidos (7 días)", count("login_failed"), "Contraseña o usuario incorrectos", count("login_failed") ? "var(--s5)" : "var(--s3)")}
        {kpi("Escaneos bloqueados (7 días)", count("probe"), "Intentos de explorar la web", count("probe") ? "var(--s5)" : "var(--s3)")}
      </section>
      <section className="grid gap-3 lg:grid-cols-2" aria-label="Gráficos">
        <ChartCard title="Actividad por día" note="Últimos 14 días." legend={[{ label: "Eventos", color: SERIES[0] }, { label: "Accesos fallidos y escaneos", color: SERIES[1] }]}>
          <TrendChart labels={days.map((d) => d.slice(5))} series={[{ name: "Eventos", color: SERIES[0], values: perDay }, { name: "Fallidos y escaneos", color: SERIES[1], values: perDayFail }]} />
          <Insight>{week.length === 0 ? "Aún no hay actividad registrada." : `${week.length} eventos en 7 días. ${count("login_failed") + count("probe") > 0 ? `Atención: ${count("login_failed")} accesos fallidos y ${count("probe")} escaneos bloqueados.` : "Sin accesos fallidos ni escaneos."}`}</Insight>
        </ChartCard>
        <ChartCard title="Qué se hace" note="Eventos por tipo (7 días)."><HBars data={byKind} color="var(--s1)" />
          <Insight>{byKind[0] ? `Lo más frecuente: ${byKind[0].label.toLowerCase()} (${byKind[0].value}).` : "Sin datos todavía."}</Insight></ChartCard>
        <ChartCard title="Quién hace más" note="Eventos por persona (7 días)."><HBars data={byUser} color="var(--s3)" />
          <Insight>{byUser[0] ? `${byUser[0].label} concentra ${Math.round((byUser[0].value / Math.max(1, week.length)) * 100)} % de la actividad.` : "Sin datos todavía."}</Insight></ChartCard>
        <ChartCard title="Pantallas más vistas" note="Por módulo (7 días)."><HBars data={byMod} color="var(--s4)" />
          <Insight>{byMod[0] ? `El módulo más usado es «${byMod[0].label}».` : "Sin datos todavía."}</Insight></ChartCard>
      </section>
      <form method="get" className="card grid gap-3 md:grid-cols-6 md:items-end" aria-label="Filtros">
        <div className="md:col-span-2"><label className="label" htmlFor="f-u">Persona</label><select id="f-u" name="u" className="input" defaultValue={sp.u ?? ""}><option value="">Todas</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name} · {ROLES[p.role as keyof typeof ROLES] ?? p.role}</option>)}</select></div>
        <div><label className="label" htmlFor="f-k">Tipo</label><select id="f-k" name="k" className="input" defaultValue={sp.k ?? ""}><option value="">Todos</option>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="f-d">Desde</label><input id="f-d" name="d" type="date" className="input" defaultValue={sp.d ?? ""} /></div>
        <div><label className="label" htmlFor="f-h">Hasta</label><input id="f-h" name="h" type="date" className="input" defaultValue={sp.h ?? ""} /></div>
        <div className="md:col-span-4"><label className="label" htmlFor="f-q">Buscar en el texto</label><input id="f-q" name="q" className="input" defaultValue={sp.q ?? ""} placeholder="archivo, módulo, persona…" /></div>
        <div className="flex gap-2 md:col-span-2"><button className="btn btn-primary">Filtrar</button><Link className="btn" href="/auditoria">Limpiar</Link><a className="btn" href={`/auditoria/exportar?${qs}`}>Descargar CSV</a></div>
      </form>
      <section className="card overflow-x-auto" aria-label="Registro">
        <h2 className="mb-2 font-semibold">Registro ({rows.length}{rows.length >= limit ? "+" : ""})</h2>
        {rows.length === 0 ? <p className="text-sm text-muted">No hay eventos con estos filtros.</p> : (
          <table className="table"><thead><tr><th>Cuándo</th><th>Persona</th><th>Tipo</th><th>Qué hizo</th><th>Módulo</th><th>IP</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap text-sm">{fmt(r.createdAt)}</td>
                <td className="text-sm">{r.userName ?? <span className="text-muted">(sin sesión)</span>}{r.role && <div className="text-xs text-muted">{ROLES[r.role as keyof typeof ROLES] ?? r.role}</div>}</td>
                <td><span className={`badge ${TONE[r.kind as Kind] ?? ""}`}>{KINDS[r.kind as Kind] ?? r.kind}</span></td>
                <td className="text-sm">{r.label}{r.detail ? <div className="text-xs text-muted">{Object.entries(r.detail as Record<string, unknown>).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ")}</div> : null}</td>
                <td className="text-sm">{moduleOf(r.path)}</td><td className="text-xs text-muted">{r.ip ?? "—"}</td></tr>))}</tbody></table>)}
        {rows.length >= limit && limit < 2000 && <p className="mt-2"><Link className="btn" href={`/auditoria?${qs}&n=${limit + 300}`}>Ver más</Link></p>}
      </section>
    </div>
  );
}
