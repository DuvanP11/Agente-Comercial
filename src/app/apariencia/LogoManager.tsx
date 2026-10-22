"use client";
import { useRef, useState, useTransition } from "react";
import { KINDS, MAX_BRAND_BYTES, type BrandKind } from "@/lib/brand";
import { removeFlatBackground } from "@/lib/image-bg";
import { removeBrandAction, saveBrandAction, setTintAction } from "./brand-actions";

const CHECKER = "repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 50% / 16px 16px";

/** Carga la imagen, la reduce hasta que pese poco y, si se pide, le quita el fondo liso. Devuelve un PNG (data URL). */
async function prepare(file: File, bgTolerance: number | null, maxSide: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error("No se pudo leer la imagen.")); i.src = url; });
    for (let side = maxSide; side >= 128; side = Math.round(side * 0.75)) {
      const k = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0, c.width, c.height);
      if (bgTolerance !== null) { const d = ctx.getImageData(0, 0, c.width, c.height); removeFlatBackground(d.data, c.width, c.height, bgTolerance); ctx.putImageData(d, 0, 0); }
      const out = c.toDataURL("image/png");
      if (out.length * 0.75 <= MAX_BRAND_BYTES * 0.9) return out;
    }
    throw new Error("La imagen es demasiado compleja para reducirla a un tamaño razonable.");
  } finally { URL.revokeObjectURL(url); }
}

function Slot({ kind, hasImage, version, tint }: { kind: BrandKind; hasImage: boolean; version: string; tint: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [tol, setTol] = useState(40);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const maxSide = kind === "logo" ? 640 : 256;

  const refresh = (f: File | null, rb: boolean, t: number) => {
    if (!f) { setPreview(null); return; }
    prepare(f, rb ? t : null, maxSide).then(setPreview).catch((e) => setMsg({ error: e instanceof Error ? e.message : "No se pudo leer la imagen." }));
  };
  const current = `/${kind === "logo" ? "brand/logo" : "brand/icon"}?v=${version}`;
  const shown = preview ?? current;
  const dim = kind === "logo" ? { height: 56, width: 190 } : { height: 56, width: 56 };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{KINDS[kind]}</h3>
      <div className="flex flex-wrap items-center gap-4">
        <div className="rounded border p-2" style={{ borderColor: "var(--color-border)", background: CHECKER }} title="El cuadriculado indica transparencia">
          {tint && !preview
            ? <span role="img" aria-label={KINDS[kind]} style={{ display: "block", ...dim, background: "var(--color-primary)", WebkitMaskImage: `url(${shown})`, maskImage: `url(${shown})`, WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskPosition: "left center", maskPosition: "left center" }} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={shown} alt={KINDS[kind]} style={{ ...dim, objectFit: "contain", objectPosition: "left center" }} />}
        </div>
        <div className="text-xs text-muted">{preview ? "Vista previa de la imagen nueva (aún sin guardar)." : hasImage ? "Imagen guardada." : "Imagen de Pibox por defecto."}</div>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="input" aria-label={`Elegir ${KINDS[kind]}`}
        onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setMsg(null); refresh(f, removeBg, tol); }} />
      {file && (
        <div className="space-y-2 rounded border p-3 text-sm" style={{ borderColor: "var(--color-border)" }}>
          <label className="flex items-center gap-2"><input type="checkbox" checked={removeBg} onChange={(e) => { setRemoveBg(e.target.checked); refresh(file, e.target.checked, tol); }} /> Quitar el fondo (si la imagen tiene un fondo liso, p. ej. blanco)</label>
          {removeBg && (
            <div><label className="label" htmlFor={`tol-${kind}`}>Qué tanto fondo quitar: {tol}</label>
              <input id={`tol-${kind}`} type="range" min={5} max={140} value={tol} className="w-full" onChange={(e) => setTol(Number(e.target.value))} onPointerUp={() => refresh(file, true, tol)} onKeyUp={() => refresh(file, true, tol)} />
              <p className="text-xs text-muted">Sube el valor si quedan restos del fondo; bájalo si se come parte del dibujo. Solo se quita el fondo conectado con el borde de la imagen.</p></div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={pending || !preview} onClick={() => start(async () => { try { const r = await saveBrandAction(kind, preview!); setMsg(r); if (r.ok) { setFile(null); setPreview(null); if (input.current) input.current.value = ""; } } catch { setMsg({ error: "No se pudo guardar. Recarga la página e inténtalo de nuevo." }); } })}>{pending ? "Guardando…" : "Guardar imagen"}</button>
            <button className="btn" disabled={pending} onClick={() => { setFile(null); setPreview(null); if (input.current) input.current.value = ""; }}>Cancelar</button>
          </div>
        </div>
      )}
      {hasImage && !file && <button className="btn" disabled={pending} onClick={() => start(async () => { try { setMsg(await removeBrandAction(kind)); } catch { setMsg({ error: "No se pudo quitar." }); } })}>Volver a la imagen de Pibox</button>}
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok text-sm">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad text-sm">{msg.error}</p>}</div>
    </div>
  );
}

export function LogoManager({ hasLogo, hasIcon, tint, version }: { hasLogo: boolean; hasIcon: boolean; tint: boolean; version: string }) {
  const [t, setT] = useState(tint);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-4" aria-label="Logo e ícono">
      <div>
        <h2 className="text-lg font-semibold">Logo e ícono</h2>
        <p className="text-sm text-muted">El logo del menú y el ícono de la pestaña del navegador. Sube un PNG, JPG o WebP de hasta {Math.round(MAX_BRAND_BYTES / 1024)} KB. Si tu imagen tiene fondo, puedes quitarlo aquí mismo.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={t} disabled={pending} onChange={(e) => { const v = e.target.checked; setT(v); start(async () => { try { setMsg(await setTintAction(v)); } catch { setMsg({ error: "No se pudo guardar." }); } }); }} />
        <span><b>Pintar el logo y el ícono con el color principal del tema.</b> Así cambian de color cada vez que cambias el diseño. Solo se ve bien con imágenes de <b>fondo transparente</b> y de un solo color (como el logo de Pibox); si tu imagen tiene varios colores, desmarca esta opción.</span>
      </label>
      <div className="grid gap-6 md:grid-cols-2">
        <Slot kind="logo" hasImage={hasLogo} version={version} tint={t} />
        <Slot kind="icon" hasImage={hasIcon} version={version} tint={t} />
      </div>
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok text-sm">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad text-sm">{msg.error}</p>}</div>
    </section>
  );
}
