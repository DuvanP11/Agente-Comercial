"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { googleLinkedinUrl, linkedinSearchUrl } from "@/lib/linkedin";
import { addLinkedinProspectAction, type ManualState } from "./actions";

/** Fuentes profesionales (LinkedIn), de forma asistida: tú buscas en LinkedIn con tu cuenta y aquí guardas lo que encuentres. */
export function LinkedInAssist() {
  const [q, setQ] = useState(""); const [city, setCity] = useState("Bogotá");
  const [s, action, pending] = useActionState<ManualState, FormData>(addLinkedinProspectAction, {});
  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold">Fuentes profesionales (LinkedIn): búsqueda asistida</summary>
      <div className="mt-3 space-y-4 text-sm">
        <p>LinkedIn <b>no permite extraer sus datos automáticamente</b> ni ofrece una API pública para buscar empresas, y hacerlo violaría sus condiciones. Por eso aquí lo haces tú con tu cuenta y la plataforma te ayuda a guardar lo que encuentres, con su enlace como fuente. Si usas Sales Navigator, exporta tu lista y cárgala en <Link className="underline" href="/importar">Importar prospectos</Link>.</p>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
          <div><label className="label" htmlFor="li-q">Qué buscas (rubro)</label><input id="li-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="tienda de ropa online" /></div>
          <div><label className="label" htmlFor="li-city">Ciudad</label><input id="li-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <a className="btn" target="_blank" rel="noopener noreferrer" href={linkedinSearchUrl(q, city)}>Abrir en LinkedIn</a>
          <a className="btn" target="_blank" rel="noopener noreferrer" href={googleLinkedinUrl(q, city)}>Buscar en Google</a>
        </div>
        <form action={action} className="grid gap-3 md:grid-cols-2" aria-label="Guardar empresa de LinkedIn">
          <h3 className="font-semibold md:col-span-2">Guardar una empresa que encontraste</h3>
          <div><label className="label" htmlFor="li-name">Nombre de la empresa *</label><input id="li-name" name="name" required className="input" /></div>
          <div><label className="label" htmlFor="li-url">Enlace de su página en LinkedIn *</label><input id="li-url" name="url" required className="input" placeholder="https://www.linkedin.com/company/nombre" /></div>
          <div><label className="label" htmlFor="li-cat">Rubro</label><input id="li-cat" name="category" className="input" defaultValue={q} /></div>
          <div><label className="label" htmlFor="li-ct">Ciudad</label><input id="li-ct" name="city" className="input" defaultValue={city} /></div>
          <div><label className="label" htmlFor="li-web">Sitio web</label><input id="li-web" name="website" className="input" placeholder="https://…" /></div>
          <div><label className="label" htmlFor="li-ph">Teléfono (si lo muestra)</label><input id="li-ph" name="phone" className="input" /></div>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={pending}>{pending ? "Guardando…" : "Guardar como prospecto"}</button>
            {s.error && <span role="alert" className="badge-bad">{s.error}</span>}
            {s.ok && <span role="status" className="badge-ok">{s.ok}{s.outcome && <> <Link className="underline" href={`/prospectos/${s.outcome.prospectId}`}>Ver ficha</Link></>}</span>}
          </div>
        </form>
        <p className="text-xs text-muted">Se guarda como «copiado a mano de LinkedIn», sin verificar. Se compara con tus clientes y prospectos para avisarte si ya existe.</p>
      </div>
    </details>
  );
}
