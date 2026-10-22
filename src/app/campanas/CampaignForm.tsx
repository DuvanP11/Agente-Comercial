"use client";
import { useActionState, useState } from "react";
import { WhatsAppPreview } from "@/components/WhatsAppPreview";
import { renderTemplate } from "@/lib/campaigns";
import { MESSAGE_TEMPLATES } from "@/lib/campaign-templates";
import { createCampaignAction, type ActionResult } from "./actions";

const SAMPLE = { empresa: "Panadería La Espiga", ciudad: "Bogotá", categoria: "panadería" };

export function CampaignForm() {
  const [s, action, pending] = useActionState<ActionResult, FormData>(createCampaignAction, {});
  const [name, setName] = useState(""); const [objective, setObjective] = useState("");
  const [vp, setVp] = useState(""); const [template, setTemplate] = useState(MESSAGE_TEMPLATES[0].body);
  const [tpl, setTpl] = useState(MESSAGE_TEMPLATES[0].id);
  const r = renderTemplate(template, SAMPLE);
  return (
    <form action={action} className="card grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div><label className="label" htmlFor="c-name">Nombre de la campaña *</label><input id="c-name" name="name" required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Belleza en Suba — octubre" /></div>
        <div><label className="label" htmlFor="c-obj">Objetivo</label><input id="c-obj" name="objective" className="input" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Captar tiendas con ventas online" /></div>
        <div><label className="label" htmlFor="c-vp">Propuesta de valor (para tu equipo; no se envía sola)</label><textarea id="c-vp" name="valueProposition" rows={2} className="input" value={vp} onChange={(e) => setVp(e.target.value)} /></div>
        <p className="text-xs text-muted">Después de crearla podrás ponerle una <b>imagen de portada</b> y adjuntar <b>imágenes, video, PDF o Word</b>.</p>
      </div>
      <div className="space-y-3">
        <div>
          <span className="label">Empieza desde un mensaje listo</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Mensajes de ejemplo">
            {MESSAGE_TEMPLATES.map((m) => (
              <button key={m.id} type="button" className="btn" title={m.goal} aria-pressed={tpl === m.id} onClick={() => { setTpl(m.id); setTemplate(m.body); }}
                style={tpl === m.id ? { background: "var(--color-primary)", color: "var(--color-on-primary)" } : undefined}>{m.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="c-tpl">Mensaje base de WhatsApp *</label>
          <textarea id="c-tpl" name="template" rows={5} required className="input" value={template} maxLength={1500} onChange={(e) => { setTemplate(e.target.value); setTpl(""); }} />
          <p className="mt-1 text-xs text-muted">{template.length}/1500 · Variables: <code>{"{empresa}"}</code>, <code>{"{ciudad}"}</code>, <code>{"{categoria}"}</code>. Cada mensaje se genera por prospecto, lo revisas y lo apruebas antes de abrir WhatsApp. No pongas precios ni promesas que no estén aprobados.</p>
          {r.unknown.length > 0 && <p role="alert" className="text-xs badge-warn">Variable desconocida: {r.unknown.map((v) => `{${v}}`).join(", ")}. No se podrá aprobar.</p>}
        </div>
        <WhatsAppPreview text={r.text} />
        <p className="text-xs text-muted">Vista previa con un negocio de ejemplo ({SAMPLE.empresa}).</p>
      </div>
      <div className="lg:col-span-2 flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Creando…" : "Crear campaña"}</button>
        {s.error && <span role="alert" className="text-sm badge-bad">{s.error}</span>}
      </div>
    </form>
  );
}
