"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_COVER_BYTES } from "@/lib/campaign-media";
import { setCoverAction } from "../actions";

export const COVER_SPECS = { w: 1200, h: 400, max: 960 };

/** Reduce la imagen (máx. 960×480) y la guarda como JPEG hasta que pese poco. */
async function coverFromFile(file: File): Promise<{ data: string; w: number; h: number; from: { w: number; h: number } }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error("No se pudo leer la imagen. Usa PNG, JPG o WebP.")); i.src = url; });
    for (let q = 0.85, k = Math.min(1, 960 / img.width, 480 / img.height); q > 0.3; q -= 0.15, k *= 0.9) {
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length * 0.75 <= MAX_COVER_BYTES * 0.95) return { data: out, w: c.width, h: c.height, from: { w: img.width, h: img.height } };
    }
    throw new Error("La imagen es demasiado pesada para usarla de portada. Prueba con una más pequeña.");
  } finally { URL.revokeObjectURL(url); }
}

/** Subir, cambiar o quitar la portada de una campaña, con las medidas recomendadas y una vista previa de cómo se recorta. */
export function CoverUploader({ campaignId, hasCover, coverLen, closed }: { campaignId: string; hasCover: boolean; coverLen: number; closed: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [prep, setPrep] = useState<Awaited<ReturnType<typeof coverFromFile>> | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const reset = () => { setPrep(null); if (input.current) input.current.value = ""; };

  if (closed) return null;
  return (
    <section className="card space-y-3" aria-label="Portada de la campaña">
      <div>
        <h2 className="font-semibold">Portada de la campaña</h2>
        <p className="text-sm text-muted">Es la imagen que identifica a la campaña en la lista y arriba de esta página. Mientras no subas una, se ve la letra de su nombre.</p>
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        <li><b>Formato:</b> PNG, JPG o WebP.</li>
        <li><b>Medidas recomendadas:</b> {COVER_SPECS.w} × {COVER_SPECS.h} píxeles (horizontal, proporción 3:1). Cualquier tamaño sirve, pero si es muy cuadrada o vertical se recorta.</li>
        <li><b>Peso:</b> sin límite al elegirla; la app la reduce sola a máximo 960 × 480 px y {Math.round(MAX_COVER_BYTES / 1024)} KB.</li>
        <li><b>Consejo:</b> deja lo importante (logo, texto) en el centro: los bordes pueden recortarse según la pantalla.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="input max-w-md" aria-label="Elegir imagen de portada" disabled={pending}
          onChange={async (e) => { const f = e.target.files?.[0]; setMsg(null); if (!f) { setPrep(null); return; } try { setPrep(await coverFromFile(f)); } catch (err) { setPrep(null); setMsg({ error: err instanceof Error ? err.message : "No se pudo leer la imagen." }); } }} />
        {hasCover && !prep && <button className="btn" disabled={pending} onClick={() => start(async () => { try { setMsg(await setCoverAction(campaignId, null)); router.refresh(); } catch { setMsg({ error: "No se pudo quitar." }); } })}>Quitar portada</button>}
      </div>
      {prep && (
        <div className="space-y-2">
          <p className="text-xs text-muted">Tu imagen: {prep.from.w} × {prep.from.h} px → se guardará de {prep.w} × {prep.h} px (~{Math.round((prep.data.length * 0.75) / 1024)} KB). Así se verá:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="mb-1 text-xs text-muted">En la lista de campañas</div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={prep.data} alt="Vista previa en la lista" className="w-full rounded" style={{ height: 110, objectFit: "cover" }} /></div>
            <div><div className="mb-1 text-xs text-muted">Arriba de la campaña</div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={prep.data} alt="Vista previa en la campaña" className="w-full rounded" style={{ height: 110, objectFit: "cover" }} /></div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { try { const r = await setCoverAction(campaignId, prep.data); setMsg(r); if (r.ok) { reset(); router.refresh(); } } catch { setMsg({ error: "No se pudo guardar la portada." }); } })}>{pending ? "Guardando…" : "Guardar portada"}</button>
            <button className="btn" disabled={pending} onClick={reset}>Cancelar</button>
          </div>
        </div>
      )}
      {hasCover && !prep && <p className="text-xs text-muted">Portada actual guardada ({Math.round(coverLen * 0.75 / 1024)} KB).</p>}
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok text-sm">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad text-sm">{msg.error}</p>}</div>
    </section>
  );
}
