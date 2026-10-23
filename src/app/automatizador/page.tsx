import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { canManageUsers } from "@/lib/permissions";
import { getAutomatizadorUrl, getHiddenModules } from "@/lib/services/settings";
import { signAutomatizadorToken } from "@/lib/automatizador-audit";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Redirige a la web del Automatizador de mensajes. El menú la abre en otra pestaña; si la dirección aún no está configurada, explica cómo. */
export default async function Automatizador() {
  const me = await requireUser();
  const db = await getDb(), org = await ensureDefaultOrg(db);
  if ((await getHiddenModules(db, org)).includes("automatizador")) redirect("/bienvenida");
  const url = await getAutomatizadorUrl(db, org);
  if (url) {
    // La firma viaja en el «#» (el navegador nunca lo envía a ningún servidor ni queda en registros) y le sirve al Automatizador para informar a la Auditoría.
    const u = new URL(url); u.hash = `ac=${signAutomatizadorToken(me.id)}`;
    redirect(u.toString());
  }
  return (
    <div className="card max-w-xl space-y-2" role="status">
      <h1 className="text-xl font-bold">Falta la dirección del Automatizador</h1>
      <p className="text-sm text-muted">{canManageUsers(me.role) ? "Pégala en Configuración → «Automatizador de mensajes» y este acceso del menú te llevará directo a esa web." : "Un administrador debe configurar la dirección del Automatizador de mensajes."}</p>
      <div className="flex gap-2">{canManageUsers(me.role) && <Link className="btn btn-primary" href="/configuracion">Ir a Configuración</Link>}<Link className="btn" href="/bienvenida">Ir al inicio</Link></div>
    </div>
  );
}
