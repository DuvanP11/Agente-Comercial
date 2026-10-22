import Link from "next/link";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { getScoringConfig } from "@/lib/services/settings";
import { ScoringForm } from "./ScoringForm";

export const dynamic = "force-dynamic";

export default async function Configuracion() {
  const db = await getDb();
  const cfg = await getScoringConfig(db, await ensureDefaultOrg(db));
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted">Ajustes de la plataforma que cambian cómo se calcula y se muestra la información.</p></header>
      <ScoringForm weights={cfg.weights} minCoverage={cfg.minCoverage} />
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
