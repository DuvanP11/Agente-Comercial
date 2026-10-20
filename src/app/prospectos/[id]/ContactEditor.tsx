"use client";
import { useActionState, useState } from "react";
import { saveContact, type ContactState } from "./actions";

export function ContactEditor({ prospectId, phone, website, email, googleUrl }: {
  prospectId: string; phone: string; website: string; email: string; googleUrl: string;
}) {
  const [s, action, pending] = useActionState<ContactState, FormData>(saveContact.bind(null, prospectId), {});
  // Controlados: si no, React vacía los campos al terminar de guardar.
  const [p, setP] = useState(phone);
  const [w, setW] = useState(website);
  const [e, setE] = useState(email);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div><label className="label" htmlFor="c-phone">Teléfono</label>
          <input id="c-phone" name="phone" className="input" inputMode="tel" placeholder="310 123 4567 o 601 555 1234" value={p} onChange={(x) => setP(x.target.value)} /></div>
        <div><label className="label" htmlFor="c-web">Sitio web</label>
          <input id="c-web" name="website" className="input" inputMode="url" placeholder="https://tienda.com" value={w} onChange={(x) => setW(x.target.value)} /></div>
        <div><label className="label" htmlFor="c-mail">Correo</label>
          <input id="c-mail" name="email" className="input" inputMode="email" placeholder="ventas@tienda.com" value={e} onChange={(x) => setE(x.target.value)} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Guardando…" : "Guardar contacto"}</button>
        <a className="btn" href={googleUrl} target="_blank" rel="noopener noreferrer">Buscar en Google ↗</a>
        <span className="text-xs text-muted">Se abre Google con el nombre y la ciudad; copia aquí lo que encuentres. Queda marcado como “ingresado por el usuario”.</span>
      </div>
      {s.error && <p role="alert" className="text-sm badge-bad">{s.error}</p>}
      {s.ok && <p role="status" className="text-sm badge-ok">{s.ok}</p>}
      {s.warnings?.map((w2) => <p key={w2} role="alert" className="text-sm badge-warn">⚠ {w2}</p>)}
    </form>
  );
}
