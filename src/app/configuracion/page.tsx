import Link from "next/link";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { getContactRules, getScoringConfig } from "@/lib/services/settings";
import { NAV } from "@/lib/nav";
import { ContactRulesForm } from "./ContactRulesForm";
import { ScoringForm } from "./ScoringForm";

export const dynamic = "force-dynamic";

export default async function Configuracion() {
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const cfg = await getScoringConfig(db, org), rules = await getContactRules(db, org);
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted">Ajustes de la plataforma que cambian cómo se calcula y se muestra la información.</p></header>
      <ScoringForm weights={cfg.weights} minCoverage={cfg.minCoverage} />
      <ContactRulesForm maxAttempts={rules.maxAttempts} />
      <section className="card space-y-2 text-sm" aria-label="Estado de los módulos">
        <h2 className="font-semibold">Estado de los módulos y qué falta</h2>
        <p className="text-muted"><b>Completo</b> = hace todo lo previsto. <b>Parcial</b> = funciona con datos reales, pero falta una parte que se explica en cada fila; casi siempre depende de algo externo (una clave, datos financieros, tarifas oficiales o una integración).</p>
        <div className="overflow-x-auto"><table className="table"><thead><tr><th>Módulo</th><th>Estado</th><th>Qué hay y qué falta</th></tr></thead>
          <tbody>{NAV.map((n) => (
            <tr key={n.slug}><td><Link className="underline" href={n.href}>{n.label}</Link></td>
              <td><span className={`badge ${n.status === "ready" ? "badge-ok" : "badge-warn"}`}>{n.status === "ready" ? "Completo" : n.status === "partial" ? "Parcial" : "Pendiente"}</span></td>
              <td className="text-muted">{n.note ?? "Hace todo lo previsto."}</td></tr>))}</tbody></table></div>
      </section>
      <section className="card text-sm space-y-1" aria-label="Otros ajustes">
        <h2 className="font-semibold">Otros ajustes</h2>
        <p>Colores y marca: <Link className="underline" href="/apariencia">Apariencia y marca</Link>.</p>
        <p>Conexión de IA, Google Places, OpenStreetMap y base de datos: <Link className="underline" href="/integraciones">Integraciones</Link>.</p>
        <p>Metas comerciales: <Link className="underline" href="/metas">Metas y rendimiento</Link>.</p>
        <p className="text-muted">Las claves y contraseñas no se editan aquí: se definen como variables de entorno en Vercel.</p>
      </section>
    </div>
  );
}
