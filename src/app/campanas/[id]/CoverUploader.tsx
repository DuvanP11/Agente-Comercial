"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_COVER_BYTES } from "@/lib/campaign-media";
import { clamp, COVER_OUT, fitZoom, placeCover, rotatedSize } from "@/lib/cover-geometry";
import { setCoverAction } from "../actions";

export const COVER_SPECS = { w: 1200, h: 400 };

interface Tf { turns: number; flipH: boolean; flipV: boolean; zoom: number; ox: number; oy: number }
const INIT: Tf = { turns: 0, flipH: false, flipV: false, zoom: 1, ox: 0, oy: 0 };

/** Imagen ya girada y volteada, lista para encuadrar. */
function transformed(img: HTMLImageElement, t: Tf): HTMLCanvasElement {
  const { w, h } = rotatedSize(img.naturalWidth, img.naturalHeight, t.turns);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.translate(w / 2, h / 2); ctx.rotate((((t.turns % 4) + 4) % 4) * (Math.PI / 2)); ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return c;
}

/** Dibuja el encuadre final (3:1). Si la imagen no llena el marco, el resto se rellena con su color medio. */
function renderCover(img: HTMLImageElement, t: Tf, out: { w: number; h: number }): HTMLCanvasElement {
  const src = transformed(img, t);
  const c = document.createElement("canvas"); c.width = out.w; c.height = out.h;
  const ctx = c.getContext("2d")!;
  // Relleno de los lados cuando la imagen no llena el marco: su color medio (promedio real de una versión de 16×16).
  const tiny = document.createElement("canvas"); tiny.width = tiny.height = 16; const tctx = tiny.getContext("2d")!;
  tctx.drawImage(src, 0, 0, 16, 16);
  const px = tctx.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
  const n = px.length / 4;
  ctx.fillStyle = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`; ctx.fillRect(0, 0, out.w, out.h);
  const p = placeCover(src.width, src.height, t.zoom, t.ox, t.oy, out);
  ctx.drawImage(src, p.dx, p.dy, p.dw, p.dh);
  return c;
}

/** El encuadre se guarda como JPEG; si pesa de más se reduce un poco hasta que entre. */
function exportCover(img: HTMLImageElement, t: Tf): { data: string; w: number; h: number } {
  for (let k = 1, q = 0.88; k > 0.4; k *= 0.85, q -= 0.08) {
    const out = { w: Math.round(COVER_OUT.w * k), h: Math.round(COVER_OUT.h * k) };
    const data = renderCover(img, t, out).toDataURL("image/jpeg", Math.max(q, 0.5));
    if (data.length * 0.75 <= MAX_COVER_BYTES * 0.95) return { data, ...out };
  }
  throw new Error("La imagen es demasiado pesada para usarla de portada. Prueba con una más pequeña.");
}

/** Subir, cambiar o quitar la portada de una campaña, con las medidas recomendadas y una vista previa de cómo se recorta. */
export function CoverUploader({ campaignId, hasCover, coverLen, closed }: { campaignId: string; hasCover: boolean; coverLen: number; closed: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [tf, setTf] = useState<Tf>(INIT);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const reset = () => { setImg(null); setTf(INIT); if (input.current) input.current.value = ""; };
  const set = (p: Partial<Tf>) => setTf((x) => ({ ...x, ...p }));

  // Vista previa en vivo del encuadre (la misma imagen que se guardará).
  useEffect(() => {
    if (!img || !canvas.current) return;
    const c = renderCover(img, tf, COVER_OUT), ctx = canvas.current.getContext("2d")!;
    canvas.current.width = COVER_OUT.w; canvas.current.height = COVER_OUT.h; ctx.drawImage(c, 0, 0);
  }, [img, tf]);

  const load = (f: File) => {
    const url = URL.createObjectURL(f);
    const i = new Image();
    i.onload = () => { setImg(i); setTf(INIT); setMsg(null); };
    i.onerror = () => { URL.revokeObjectURL(url); setImg(null); setMsg({ error: "No se pudo leer la imagen. Usa PNG, JPG o WebP." }); };
    i.src = url;
  };
  const dims = img ? rotatedSize(img.naturalWidth, img.naturalHeight, tf.turns) : null;
  const [sizeKb, setSizeKb] = useState(0);
  // El peso estimado se recalcula con una pequeña espera para no frenar los deslizadores.
  useEffect(() => {
    if (!img) return;
    const t = setTimeout(() => { try { setSizeKb(Math.round((exportCover(img, tf).data.length * 0.75) / 1024)); } catch { setSizeKb(0); } }, 250);
    return () => clearTimeout(t);
  }, [img, tf]);

  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, ox: tf.ox, oy: tf.oy }; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !dims || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect(), k = COVER_OUT.w / rect.width;
    const p = placeCover(dims.w, dims.h, tf.zoom, 0, 0);
    const rx = Math.abs(p.dw - COVER_OUT.w) / 2, ry = Math.abs(p.dh - COVER_OUT.h) / 2;
    set({ ox: rx ? clamp(drag.current.ox + ((e.clientX - drag.current.x) * k) / rx, -1, 1) : 0, oy: ry ? clamp(drag.current.oy + ((e.clientY - drag.current.y) * k) / ry, -1, 1) : 0 });
  };

  if (closed) return null;
  return (
    <section className="card space-y-3" aria-label="Portada de la campaña">
      <div>
        <h2 className="font-semibold">Portada de la campaña</h2>
        <p className="text-sm text-muted">Es la imagen que identifica a la campaña en la lista y arriba de esta página. Mientras no subas una, se ve la letra de su nombre.</p>
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        <li><b>Formato:</b> PNG, JPG o WebP.</li>
        <li><b>Medidas recomendadas:</b> {COVER_SPECS.w} × {COVER_SPECS.h} píxeles (horizontal, proporción 3:1). Cualquier tamaño sirve: después la acomodas aquí mismo.</li>
        <li><b>Peso:</b> sin límite al elegirla; se guarda reducida a 960 × 320 px y máximo {Math.round(MAX_COVER_BYTES / 1024)} KB.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="input max-w-md" aria-label="Elegir imagen de portada" disabled={pending}
          onChange={(e) => { const f = e.target.files?.[0]; setMsg(null); if (!f) { setImg(null); return; } load(f); }} />
        {hasCover && !img && <button className="btn" disabled={pending} onClick={() => start(async () => { try { setMsg(await setCoverAction(campaignId, null)); router.refresh(); } catch { setMsg({ error: "No se pudo quitar." }); } })}>Quitar portada</button>}
      </div>
      {img && dims && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Tu imagen: {img.naturalWidth} × {img.naturalHeight} px. Se guardará de {COVER_OUT.w} × {COVER_OUT.h} px (~{sizeKb} KB). <b>Esto es lo que se verá</b>; arrastra la imagen para moverla.</p>
          <canvas ref={canvas} width={COVER_OUT.w} height={COVER_OUT.h} className="w-full max-w-3xl cursor-grab rounded border touch-none" style={{ borderColor: "var(--color-border)", aspectRatio: "3 / 1" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} aria-label="Vista previa del encuadre de la portada" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Girar y voltear">
              <button type="button" className="btn" onClick={() => set({ turns: tf.turns - 1, ox: 0, oy: 0 })} title="Girar a la izquierda">⟲ Girar</button>
              <button type="button" className="btn" onClick={() => set({ turns: tf.turns + 1, ox: 0, oy: 0 })} title="Girar a la derecha">⟳ Girar</button>
              <button type="button" className="btn" aria-pressed={tf.flipH} onClick={() => set({ flipH: !tf.flipH })} title="Invertir de izquierda a derecha">↔ Invertir</button>
              <button type="button" className="btn" aria-pressed={tf.flipV} onClick={() => set({ flipV: !tf.flipV })} title="Invertir de arriba abajo">↕ Invertir</button>
            </div>
            <div><label className="label" htmlFor="cz">Acercar o alejar: {Math.round(tf.zoom * 100)} %</label>
              <input id="cz" type="range" min={20} max={300} value={Math.round(tf.zoom * 100)} className="w-full" onChange={(e) => set({ zoom: Number(e.target.value) / 100 })} /></div>
            <div><label className="label" htmlFor="cx">Mover a los lados</label>
              <input id="cx" type="range" min={-100} max={100} value={Math.round(tf.ox * 100)} className="w-full" onChange={(e) => set({ ox: Number(e.target.value) / 100 })} /></div>
            <div><label className="label" htmlFor="cy">Subir o bajar</label>
              <input id="cy" type="range" min={-100} max={100} value={Math.round(tf.oy * 100)} className="w-full" onChange={(e) => set({ oy: Number(e.target.value) / 100 })} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => set({ zoom: fitZoom(dims.w, dims.h), ox: 0, oy: 0 })} title="Se ve toda la imagen; los lados que sobren se rellenan con su color">Ver imagen completa</button>
            <button type="button" className="btn" onClick={() => set({ zoom: 1, ox: 0, oy: 0 })}>Llenar el marco</button>
            <button type="button" className="btn" onClick={() => setTf(INIT)}>Deshacer cambios</button>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { try { const r = await setCoverAction(campaignId, exportCover(img, tf).data); setMsg(r); if (r.ok) { reset(); router.refresh(); } } catch (e) { setMsg({ error: e instanceof Error ? e.message : "No se pudo guardar la portada." }); } })}>{pending ? "Guardando…" : "Guardar portada"}</button>
            <button className="btn" disabled={pending} onClick={reset}>Cancelar</button>
          </div>
        </div>
      )}
      {hasCover && !img && <p className="text-xs text-muted">Portada actual guardada ({Math.round(coverLen * 0.75 / 1024)} KB). Para reacomodarla, vuelve a elegir la imagen original.</p>}
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok text-sm">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad text-sm">{msg.error}</p>}</div>
    </section>
  );
}
