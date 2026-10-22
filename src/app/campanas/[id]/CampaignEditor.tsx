"use client";
import { useRef, useState, useTransition } from "react";
import { WhatsAppPreview } from "@/components/WhatsAppPreview";
import { renderTemplate } from "@/lib/campaigns";
import { MESSAGE_TEMPLATES } from "@/lib/campaign-templates";
import { MAX_COVER_BYTES } from "@/lib/campaign-media";
import { setCoverAction, updateCampaignAction } from "../actions";

/** Reduce la imagen (máx. 960×480) y la guarda como JPEG hasta que pese poco. */
async function coverFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error("No se pudo leer la imagen.")); i.src = url; });
    for (let q = 0.85, k = Math.min(1, 960 / img.width, 480 / img.height); q > 0.3; q -= 0.15, k *= 0.9) {
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length * 0.75 <= MAX_COVER_BYTES * 0.95) return out;
    }
    throw new Error("La imagen es demasiado pesada para usarla de portada.");
  } finally { URL.revokeObjectURL(url); }
}

/** Edita los textos de la campaña y su portada. */
export function CampaignEditor({ campaignId, initial, hasCover }: { campaignId: string; initial: { name: string; objective: string; valueProposition: string; template: string }; hasCover: boolean }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const r = renderTemplate(v.template, { empresa: "Panadería La Espiga", ciudad: "Bogotá", categoria: "panadería" });
  const set = (k: keyof typeof v, x: string) => setV((s) => ({ ...s, [k]: x }));
  return (
    <div className="card space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label" htmlFor="e-name">Nombre</label><input id="e-name" className="input" value={v.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className="label" htmlFor="e-obj">Objetivo</label><input id="e-obj" className="input" value={v.objective} onChange={(e) => set("objective", e.target.value)} /></div>
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
      <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <label className="label" htmlFor="cover">Imagen de portada (se reduce sola; sirve para reconocer la campaña)</label>
        <input id="cover" ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="input" disabled={pending}
          onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; start(async () => { try { const d = await coverFromFile(f); setMsg(await setCoverAction(campaignId, d)); } catch (err) { setMsg({ error: err instanceof Error ? err.message : "No se pudo guardar la portada." }); } if (file.current) file.current.value = ""; }); }} />
        {hasCover && <button className="btn" disabled={pending} onClick={() => start(async () => { try { setMsg(await setCoverAction(campaignId, null)); } catch { setMsg({ error: "No se pudo quitar." }); } })}>Quitar portada</button>}
      </div>
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok text-sm">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad text-sm">{msg.error}</p>}</div>
    </div>
  );
}
