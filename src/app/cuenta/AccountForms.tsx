"use client";
import { useActionState } from "react";
import { MIN_PASSWORD } from "@/lib/user-rules";
import { changePasswordAction, saveNameAction, type AccountState } from "./actions";

export function AccountForms({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const [n, nameAction, namePending] = useActionState<AccountState, FormData>(saveNameAction, {});
  const [p, passAction, passPending] = useActionState<AccountState, FormData>(changePasswordAction, {});
  return (
    <>
      <form action={nameAction} className="card space-y-2" aria-label="Nombre">
        <h2 className="font-semibold">Nombre</h2>
        <input name="name" className="input" defaultValue={name} required minLength={2} maxLength={80} aria-label="Nombre" />
        <div className="flex items-center gap-3"><button className="btn" disabled={namePending}>Guardar nombre</button>{n.ok && <span role="status" className="badge-ok">{n.ok}</span>}{n.error && <span role="alert" className="badge-bad">{n.error}</span>}</div>
      </form>
      {isAdmin ? (
        <section className="card text-sm" aria-label="Contraseña"><h2 className="mb-1 font-semibold">Contraseña</h2>
          <p>Eres el administrador: tu contraseña es la variable <code>APP_PASSWORD</code> de Vercel. Para cambiarla, edítala allá y vuelve a desplegar.</p></section>
      ) : (
        <form action={passAction} className="card space-y-3" aria-label="Cambiar contraseña">
          <h2 className="font-semibold">Cambiar contraseña</h2>
          <div><label className="label" htmlFor="cur">Contraseña actual (o temporal)</label><input id="cur" name="current" type="password" className="input" required autoComplete="current-password" /></div>
          <div><label className="label" htmlFor="new">Contraseña nueva</label><input id="new" name="next" type="password" className="input" required minLength={MIN_PASSWORD} autoComplete="new-password" />
            <p className="text-xs text-muted">Mínimo {MIN_PASSWORD} caracteres, combinando letras y números.</p></div>
          <div><label className="label" htmlFor="conf">Repite la nueva</label><input id="conf" name="confirm" type="password" className="input" required autoComplete="new-password" /></div>
          <div className="flex items-center gap-3"><button className="btn btn-primary" disabled={passPending}>{passPending ? "Guardando…" : "Cambiar contraseña"}</button>{p.error && <span role="alert" className="badge-bad">{p.error}</span>}</div>
          <p className="text-xs text-muted">Al cambiarla se cierran tus otras sesiones abiertas. Si la olvidas, solo el administrador puede restablecerla.</p>
        </form>
      )}
    </>
  );
}
