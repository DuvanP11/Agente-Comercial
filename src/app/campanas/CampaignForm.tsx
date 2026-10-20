"use client";
import { useActionState, useState } from "react";
import { DEFAULT_TEMPLATE } from "@/lib/campaigns";
import { createCampaignAction, type ActionResult } from "./actions";

export function CampaignForm() {
  const [s, action, pending] = useActionState<ActionResult, FormData>(createCampaignAction, {});
  const [name, setName] = useState(""); const [objective, setObjective] = useState("");
  const [vp, setVp] = useState(""); const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  return (
    <form action={action} className="card grid gap-3 md:grid-cols-2">
      <div><label className="label" htmlFor="c-name">Nombre de la campaña *</label><input id="c-name" name="name" required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Belleza en Suba — octubre" /></div>
      <div><label className="label" htmlFor="c-obj">Objetivo</label><input id="c-obj" name="objective" className="input" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Captar tiendas con ventas online" /></div>
      <div className="md:col-span-2"><label className="label" htmlFor="c-vp">Propuesta de valor (para tu equipo; no se envía sola)</label><textarea id="c-vp" name="valueProposition" rows={2} className="input" value={vp} onChange={(e) => setVp(e.target.value)} /></div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="c-tpl">Mensaje base de WhatsApp *</label>
        <textarea id="c-tpl" name="template" rows={4} required className="input" value={template} onChange={(e) => setTemplate(e.target.value)} />
        <p className="mt-1 text-xs text-muted">Variables: <code>{"{empresa}"}</code>, <code>{"{ciudad}"}</code>, <code>{"{categoria}"}</code>. Cada mensaje se genera por prospecto, lo revisas y lo apruebas antes de abrir WhatsApp.</p>
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Creando…" : "Crear campaña"}</button>
        {s.error && <span role="alert" className="text-sm badge-bad">{s.error}</span>}
      </div>
    </form>
  );
}
