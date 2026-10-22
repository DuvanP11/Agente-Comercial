import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { HelpPanel } from "@/components/Insight";
import { listUsers } from "@/lib/services/users";
import { canManageUsers } from "@/lib/permissions";
import { requireNotHunter } from "@/lib/session";
import { UsersManager } from "./UsersManager";

export const dynamic = "force-dynamic";

export default async function Usuarios() {
  const admin = await requireNotHunter();
  const db = await getDb();
  const rows = await listUsers(db, await ensureDefaultOrg(db), admin.id);
  const pending = rows.filter((r) => r.resetRequestedAt).length;
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Usuarios</h1>
        <p className="text-sm text-muted">Solo Admin, Gerencia y Head crean, editan y desactivan usuarios, cambian sus roles y restablecen contraseñas. IT puede ver la lista, sin modificar nada.</p></header>
      {pending > 0 && <p role="status" className="card badge-warn">Hay {pending} solicitud(es) de restablecimiento de contraseña: busca la insignia amarilla en la lista.</p>}
      <HelpPanel title="Cómo funciona el acceso">
        <ul className="list-disc space-y-1 pl-5">
          <li>Cada persona entra con su <b>correo o usuario</b> y su contraseña. Solo se aceptan correos de los dominios corporativos permitidos.</li>
          <li>Al crear un usuario se genera una <b>contraseña temporal</b> que ves una sola vez; la persona debe cambiarla en su primer ingreso.</li>
          <li><b>Restablecer contraseña:</b> solo tú. Se genera una temporal nueva, se cierran sus sesiones abiertas y se le obliga a cambiarla. Quien la olvide puede pedirlo desde la pantalla de acceso y verás su solicitud aquí.</li>
          <li><b>Desactivar</b> bloquea el acceso y cierra sus sesiones, sin borrar nada de lo que hizo.</li>
          <li>Tras 5 contraseñas incorrectas seguidas, la cuenta se bloquea 15 minutos.</li>
          <li><b>Roles:</b> Hunter ve solo Prospección, Comercial y Reportes, y solo sus propios prospectos. Admin, Head, IT y Gerencia ven todos los módulos y todos los datos. Al cambiar el rol de alguien, esa persona debe volver a iniciar sesión.</li>
          <li>El administrador de arranque entra con <code>APP_PASSWORD</code> de Vercel y su identificador es <code>ADMIN_EMAIL</code> (o «admin»); no se puede desactivar, degradar ni restablecer desde aquí.</li>
        </ul>
      </HelpPanel>
      <UsersManager canManage={canManageUsers(admin.role)} meId={admin.id} rows={rows.map((u) => ({ bootstrap: u.bootstrap, id: u.id, name: u.name, email: u.email, username: u.username, role: u.role, active: u.active, mustChangePassword: u.mustChangePassword, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, resetRequestedAt: u.resetRequestedAt?.toISOString() ?? null, phone: u.phone ?? "", chatUserId: u.chatUserId ?? "", receivesLeads: u.receivesLeads }))} />
    </div>
  );
}
