"use client";
import { useState, useTransition } from "react";
import { WhatsAppPreview } from "@/components/WhatsAppPreview";
import { renderTemplate } from "@/lib/campaigns";
import { MESSAGE_TEMPLATES } from "@/lib/campaign-templates";
import { updateCampaignAction } from "../actions";

/** Edita los textos de la campaña y su portada. */
export function CampaignEditor({ campaignId, initial }: { campaignId: string; initial: { name: string; objective: string; valueProposition: string; template: string; emailSubject: string } }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const r = renderTemplate(v.template, { empresa: "Panadería La Espiga", ciudad: "Bogotá", categoria: "panadería" });
  const set = (k: keyof typeof v, x: string) => setV((s) => ({ ...s, [k]: x }));
  return (
    <div className="card space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label" htmlFor="e-name">Nombre</label><input id="e-name" className="input" value={v.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className="label" htmlFor="e-obj">Objetivo</label><input id="e-obj" className="input" value={v.objective} onChange={(e) => set("objective", e.target.value)} /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="e-sub">Asunto de los correos (opcional; admite {"{empresa}"}, {"{ciudad}"})</label><input id="e-sub" className="input" maxLength={150} value={v.emailSubject} onChange={(e) => set("emailSubject", e.target.value)} placeholder="Si lo dejas vacío se usa el nombre de la campaña" /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="e-vp">Propuesta de valor (para tu equipo)</label><textarea id="e-vp" rows={2} className="input" value={v.valueProposition} onChange={(e) => set("valueProposition", e.target.value)} /></div>
        <div>
          <label className="label" htmlFor="e-tpl">Mensaje base de WhatsApp</label>
          <div className="mb-2 flex flex-wrap gap-2">{MESSAGE_TEMPLATES.map((m) => <button key={m.id} type="button" className="btn" title={m.goal} onClick={() => set("template", m.body)}>{m.label}</button>)}</div>
          <textarea id="e-tpl" rows={5} className="input" maxLength={1500} value={v.template} onChange={(e) => set("template", e.target.value)} />
          <p className="text-xs text-muted">{v.template.length}/1500 · Variables: {"{empresa}"}, {"{ciudad}"}, {"{categoria}"}.</p>
        </div>
        <WhatsAppPreview text={r.text} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { try { setMsg(await updateCampaignAction(campaignId, v)); } catch { setMsg({ error: "No se pudo guardar." }); } })}>Guardar cambios</button>
      </div>
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok text-sm">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad text-sm">{msg.error}</p>}</div>
    </div>
  );
}
