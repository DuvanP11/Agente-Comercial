import Link from "next/link";
import { Icon } from "@/components/icons";
import { BrandLogo } from "@/components/BrandLogo";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { ROLES } from "@/lib/permissions";
import { getBrandInfo } from "@/lib/services/brand";
import { welcomeStats } from "@/lib/services/welcome";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: 1, icon: "search", title: "Encuentra negocios", text: "Busca por ciudad y rubro en OpenStreetMap, en el Registro Mercantil o importa tu propia lista.", href: "/buscar", cta: "Buscar clientes" },
  { n: 2, icon: "analyze", title: "Califica con evidencia", text: "Valora cada prospecto, deja claro qué sabes y qué no, y obtén una prioridad para saber a quién llamar primero.", href: "/analizar", cta: "Analizar" },
  { n: 3, icon: "target", title: "Prepara el acercamiento", text: "Elige a los mejores, revisa su plan de acercamiento y súmalos a una campaña.", href: "/captar", cta: "Captar clientes" },
  { n: 4, icon: "megaphone", title: "Contacta con criterio", text: "Mensajes aprobados por ti, con imágenes, video o PDF. WhatsApp se abre; tú decides cuándo enviar.", href: "/campanas", cta: "Campañas" },
  { n: 5, icon: "database", title: "Da seguimiento", text: "Registra cada intento y su resultado: contactado, interesado, sin respuesta… y no pierdas ningún seguimiento.", href: "/prospectos", cta: "Base de prospectos" },
];

const CAPS = [
  { icon: "target", title: "Rastreo GPS en vivo", text: "Cada pedido con enlace de seguimiento para quien lo recibe y para el equipo del cliente." },
  { icon: "analyze", title: "Prueba de entrega", text: "Foto y confirmación en cada pedido: se acabó el «no me llegó»." },
  { icon: "plug", title: "Integración y carga masiva", text: "Los pedidos entran a PIBOX por API o por carga de archivos, sin digitar uno por uno." },
  { icon: "eye", title: "Monitoreo con alertas", text: "Un equipo audita los servicios y avisa si uno se demora o se desvía, antes de que llegue el reclamo." },
  { icon: "chart", title: "Tablero semanal", text: "A tiempo, devoluciones, incidentes y sus causas, con un ejecutivo que acompaña la mejora." },
];

const RULES = [
  "Habla de capacidades reales de PIBOX. Las mejoras se presentan como metas acordadas con el cliente, nunca como promesas.",
  "No des precios, descuentos ni tiempos que PIBOX no haya aprobado: si no tienes la tarifa oficial, ofrece enviarla.",
  "Respeta a quien pide no ser contactado (Ley 1581): márcalo y la plataforma lo bloquea en todas las campañas.",
  "Máximo de intentos por prospecto: cuando se agotan sin respuesta, se pasa al siguiente.",
];

export default async function Bienvenida() {
  const me = await requireUser();
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const [brand, stats] = await Promise.all([getBrandInfo(db, org), welcomeStats(db, org, me)]);
  const first = me.name.split(" ")[0];
  const hour = new Date(Date.now() - 5 * 3600_000).getUTCHours();
  const greet = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const kpis = [
    { label: stats.scope === "own" ? "Mis prospectos" : "Prospectos", value: stats.total, note: stats.scope === "own" ? "Los que has encontrado o importado" : "En toda la plataforma", color: "var(--s1)", icon: "database" },
    { label: "Por contactar", value: stats.toContact, note: "Con datos y sin intentos", color: "var(--s4)", icon: "megaphone" },
    { label: "Seguimientos para hoy", value: stats.followToday, note: stats.followOverdue ? `${stats.followOverdue} vencido(s)` : "Al día", color: stats.followOverdue ? "var(--s2)" : "var(--s3)", icon: "flag" },
    { label: "Campañas activas", value: stats.campaigns, note: stats.scope === "own" ? "Las tuyas" : "De todo el equipo", color: "var(--s5)", icon: "megaphone" },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="hero p-6 md:p-10" aria-label="Bienvenida">
        <div className="relative z-10 grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm opacity-90">
              <span className="rounded-full px-3 py-1 font-semibold" style={{ background: "rgb(255 255 255 / .18)" }}>PIBOX Mensajería · B2B</span>
              <span className="rounded-full px-3 py-1" style={{ background: "rgb(255 255 255 / .12)" }}>{ROLES[me.role as keyof typeof ROLES] ?? me.role}</span>
            </div>
            <h1 className="text-3xl font-extrabold leading-tight md:text-5xl">{greet}, {first}.<br />Hoy conseguimos clientes que despachan.</h1>
            <p className="max-w-xl text-base opacity-95 md:text-lg">Entregas a tiempo y visibles, pedido por pedido. Encuentra negocios con envíos, califícalos con evidencia y llévalos de la primera conversación a ser clientes de PIBOX.</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/buscar" className="hero-btn"><Icon name="search" size={18} /> Buscar clientes</Link>
              <Link href="/campanas" className="hero-btn ghost"><Icon name="megaphone" size={18} /> Ver campañas</Link>
            </div>
          </div>
          <div className="drift hidden justify-self-center md:block" aria-hidden="true">
            <svg width="300" height="260" viewBox="0 0 300 260" fill="none">
              <path d="M30 210 C 80 120, 120 230, 160 150 S 250 60, 270 70" stroke="rgb(255 255 255 / .85)" strokeWidth="4" strokeDasharray="2 12" strokeLinecap="round" />
              <circle cx="30" cy="210" r="13" fill="white" /><circle cx="30" cy="210" r="5" fill="var(--color-primary)" />
              <g transform="translate(205 20)"><path d="M0 0h70a8 8 0 0 1 8 8v54a8 8 0 0 1-8 8H0a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8z" fill="white" opacity=".95" /><path d="M-8 22h86" stroke="var(--color-primary)" strokeWidth="5" opacity=".35" /><path d="M35 0v70" stroke="var(--color-primary)" strokeWidth="5" opacity=".35" /></g>
              <g transform="translate(250 70)"><path d="M0 0c-14 0-22 10-22 22 0 16 22 38 22 38s22-22 22-38C22 10 14 0 0 0z" fill="white" /><circle cx="0" cy="22" r="8" fill="var(--color-primary)" /></g>
              <circle cx="120" cy="196" r="26" fill="rgb(255 255 255 / .18)" /><circle cx="120" cy="196" r="14" fill="rgb(255 255 255 / .9)" />
            </svg>
          </div>
        </div>
        <div className="relative z-10 mt-6 opacity-90"><div style={{ filter: "brightness(0) invert(1)" }}><BrandLogo version={brand.version} tint={false} height={26} /></div></div>
      </section>

      <section aria-label="Tu panorama">
        <h2 className="mb-3 text-xl font-bold">{stats.scope === "own" ? "Tu panorama" : "Panorama del equipo"}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="card kpi" style={{ ["--kpi" as string]: k.color }}>
              <div className="flex items-center justify-between gap-2"><div className="text-xs text-muted">{k.label}</div><span className="kpi-icon" style={{ color: k.color }}><Icon name={k.icon} size={16} /></span></div>
              <div className="mt-1 text-3xl font-extrabold">{k.value}</div><div className="mt-1 text-xs text-muted">{k.note}</div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Cómo trabajar">
        <h2 className="mb-1 text-xl font-bold">Del primer contacto al cliente, en 5 pasos</h2>
        <p className="mb-3 text-sm text-muted">Este es el camino que sigue cada prospecto hasta convertirse en cliente de PIBOX.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s) => (
            <Link key={s.n} href={s.href} className="card step-card flex flex-col gap-3">
              <div className="flex items-center justify-between"><span className="step-num">{s.n}</span><span style={{ color: "var(--color-primary)" }}><Icon name={s.icon} size={22} /></span></div>
              <div><div className="font-bold">{s.title}</div><p className="mt-1 text-sm text-muted">{s.text}</p></div>
              <span className="mt-auto text-sm font-semibold" style={{ color: "var(--color-primary)" }}>{s.cta} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Qué ofrece PIBOX">
        <h2 className="mb-1 text-xl font-bold">Lo que PIBOX le ofrece a un cliente</h2>
        <p className="mb-3 text-sm text-muted">Capacidades reales para usar en tu conversación comercial.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CAPS.map((c) => (
            <div key={c.title} className="card cap-card space-y-2">
              <span className="kpi-icon" style={{ ["--kpi" as string]: "var(--color-primary)", width: "2.4rem", height: "2.4rem", color: "var(--color-primary)" }}><Icon name={c.icon} size={20} /></span>
              <div className="font-bold">{c.title}</div><p className="text-sm text-muted">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-3" aria-label="Reglas de oro">
        <h2 className="flex items-center gap-2 text-xl font-bold"><span style={{ color: "var(--color-primary)" }}><Icon name="shield" size={22} /></span> Reglas de oro</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {RULES.map((r) => <li key={r} className="flex gap-3 rounded-[var(--radius)] p-3 text-sm" style={{ background: "var(--color-surface-2)" }}><span style={{ color: "var(--color-primary)" }}>✓</span><span>{r}</span></li>)}
        </ul>
        <p className="text-xs text-muted">Tip: pulsa <kbd className="rounded border border-border px-1.5">/</kbd> en cualquier pantalla para buscar una opción del menú.</p>
      </section>
    </div>
  );
}
