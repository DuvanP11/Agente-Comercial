"use client";
import { useState, useTransition } from "react";
import { ROLES, ROLE_KEYS } from "@/lib/permissions";
import { ALLOWED_EMAIL_DOMAINS } from "@/lib/user-rules";
import { createUserAction, resetPasswordAction, updateUserAction, type UserActionResult } from "./actions";

export interface Row { bootstrap: boolean; id: string; name: string; email: string; username: string; role: string; active: boolean; lastLoginAt: string | null; resetRequestedAt: string | null; mustChangePassword: boolean }

function TempBox({ r, onClose }: { r: UserActionResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!r.tempPassword) return null;
  return (
    <div role="alert" className="card space-y-2" style={{ borderColor: "var(--color-warning)" }}>
      <p className="font-semibold">Contraseña temporal de {r.who}</p>
      <p className="flex flex-wrap items-center gap-3"><code className="rounded px-3 py-1 text-lg" style={{ background: "var(--color-surface-2)" }}>{r.tempPassword}</code>
        <button className="btn" onClick={() => navigator.clipboard.writeText(r.tempPassword!).then(() => setCopied(true)).catch(() => setCopied(false))}>{copied ? "Copiada ✓" : "Copiar"}</button></p>
      <p className="text-sm text-muted"><b>Se muestra solo ahora</b>: no queda guardada en ninguna parte. Entrégasela por un canal seguro; al entrar, el usuario deberá cambiarla por una suya.</p>
      <button className="btn" onClick={onClose}>Ya la copié, cerrar</button>
    </div>
  );
}

export function UsersManager({ rows, meId, canManage }: { rows: Row[]; meId: string; canManage: boolean }) {
  const [form, setForm] = useState({ name: "", email: "", username: "", role: "hunter" });
  const [res, setRes] = useState<UserActionResult | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", email: "", username: "", role: "hunter" });
  const [pending, start] = useTransition();
  const run = (p: Promise<UserActionResult>, after?: (r: UserActionResult) => void) => start(async () => { try { const r = await p; setRes(r); after?.(r); } catch { setRes({ error: "No se pudo completar. Recarga la página e inténtalo de nuevo." }); } });
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("es-CO") : "Nunca");

  return (
    <div className="space-y-4">
      {res && <TempBox r={res} onClose={() => setRes(null)} />}
      {res?.error && <p role="alert" className="card badge-bad">{res.error}</p>}
      {res?.ok && !res.tempPassword && <p role="status" className="card badge-ok">{res.ok}</p>}

      {canManage && <section className="card space-y-3" aria-label="Crear usuario">
        <div><h2 className="font-semibold">Crear usuario</h2>
          <p className="text-sm text-muted">Solo correos corporativos: {ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(", ")}. Se genera una contraseña temporal que verás una sola vez.</p></div>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label className="label" htmlFor="u-name">Nombre completo *</label><input id="u-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="u-email">Correo corporativo *</label><input id="u-email" type="email" className="input" value={form.email} placeholder={`nombre@${ALLOWED_EMAIL_DOMAINS[0]}`} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label" htmlFor="u-user">Usuario (opcional)</label><input id="u-user" className="input" value={form.username} placeholder="se toma del correo" onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div><label className="label" htmlFor="u-role">Rol</label><select id="u-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLE_KEYS.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select></div>
        </div>
        <button className="btn btn-primary" disabled={pending || !form.name.trim() || !form.email.trim()} onClick={() => run(createUserAction(form), (r) => { if (r.ok) setForm({ name: "", email: "", username: "", role: "hunter" }); })}>{pending ? "Creando…" : "Crear usuario"}</button>
      </section>}

      <section className="card overflow-x-auto" aria-label="Usuarios">
        <h2 className="mb-2 font-semibold">Usuarios ({rows.length})</h2>
        <table className="table">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id}>
              <td><b>{u.name}</b>{u.id === meId && <span className="badge ml-2">tú</span>}{u.resetRequestedAt && <div className="badge badge-warn mt-1" title={fmt(u.resetRequestedAt)}>Pidió restablecer contraseña</div>}{u.mustChangePassword && <div className="text-xs text-muted">Debe cambiar su contraseña temporal</div>}</td>
              <td>{u.email}</td><td>{u.username}</td>
              <td><span className="badge">{ROLES[u.role as keyof typeof ROLES] ?? u.role}{u.bootstrap ? " (arranque)" : ""}</span></td>
              <td><span className={`badge ${u.active ? "badge-ok" : "badge-bad"}`}>{u.active ? "Activo" : "Desactivado"}</span></td>
              <td className="text-sm">{fmt(u.lastLoginAt)}</td>
              <td>{canManage ? (<div className="flex flex-wrap gap-2">
                <button className="btn" disabled={pending} onClick={() => { setEdit(edit === u.id ? null : u.id); setDraft({ name: u.name, email: u.email, username: u.username, role: u.role }); }}>{edit === u.id ? "Cerrar" : "Editar"}</button>
                {!u.bootstrap && u.id !== meId && <button className="btn" disabled={pending} onClick={() => { if (confirm(`¿Restablecer la contraseña de ${u.name}? Se cerrarán sus sesiones y deberá cambiarla al entrar.`)) run(resetPasswordAction(u.id)); }}>Restablecer contraseña</button>}
                {!u.bootstrap && u.id !== meId && <button className="btn" disabled={pending} onClick={() => { if (u.active ? confirm(`¿Desactivar a ${u.name}? No podrá entrar y se cerrarán sus sesiones.`) : true) run(updateUserAction(u.id, { active: !u.active })); }}>{u.active ? "Desactivar" : "Activar"}</button>}
              </div>) : <span className="text-xs text-muted">Solo lectura</span>}
                {edit === u.id && (
                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    <div><label className="label" htmlFor={`e-n-${u.id}`}>Nombre</label><input id={`e-n-${u.id}`} className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                    <div><label className="label" htmlFor={`e-e-${u.id}`}>Correo</label><input id={`e-e-${u.id}`} className="input" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
                    <div><label className="label" htmlFor={`e-u-${u.id}`}>Usuario</label><input id={`e-u-${u.id}`} className="input" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} /></div>
                    {!u.bootstrap && u.id !== meId && <div><label className="label" htmlFor={`e-r-${u.id}`}>Rol</label><select id={`e-r-${u.id}`} className="input" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>{ROLE_KEYS.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select>
                      <p className="text-xs text-muted">Si cambias el rol, la persona debe volver a iniciar sesión.</p></div>}
                    <div className="md:col-span-4"><button className="btn btn-primary" disabled={pending} onClick={() => run(updateUserAction(u.id, u.bootstrap || u.id === meId ? { name: draft.name, email: draft.email, username: draft.username } : draft), (r) => { if (r.ok) setEdit(null); })}>Guardar cambios</button></div>
                  </div>)}
              </td>
            </tr>))}</tbody>
        </table>
      </section>
    </div>
  );
}
