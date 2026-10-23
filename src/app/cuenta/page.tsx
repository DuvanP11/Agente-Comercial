import { ROLES } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { AccountForms } from "./AccountForms";

export const dynamic = "force-dynamic";

export default async function Cuenta({ searchParams }: { searchParams: Promise<{ cambio?: string }> }) {
  const me = await requireUser();
  const { cambio } = await searchParams;
  return (
    <div className="max-w-2xl space-y-4">
      <header><h1 className="text-2xl font-bold">Mi cuenta</h1><p className="text-sm text-muted">Tu perfil y tu contraseña.</p></header>
      {(cambio === "obligatorio" || me.mustChangePassword) && <p role="alert" className="card badge-warn">Estás usando una contraseña temporal. Debes cambiarla ahora para poder usar la plataforma.</p>}
      <section className="card grid gap-1 text-sm" aria-label="Perfil">
        <div><b>Correo:</b> {me.email}</div><div><b>Usuario:</b> {me.username}</div><div><b>Rol:</b> {ROLES[me.role as keyof typeof ROLES] ?? me.role}</div>
        <p className="text-xs text-muted">El correo y el usuario los cambia el administrador.</p>
      </section>
      <AccountForms name={me.name} isAdmin={me.role === "admin"} />
    </div>
  );
}
