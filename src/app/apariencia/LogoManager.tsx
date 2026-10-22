"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KINDS, MAX_BRAND_BYTES, type BrandKind } from "@/lib/brand";
import { analyzeLogo, removeFlatBackground, type LogoAnalysis } from "@/lib/image-bg";
import { removeBrandAction, saveBrandAction, setTintAction } from "./brand-actions";

const CHECKER = "repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 50% / 16px 16px";

/** Mira una imagen (URL o data URL) y dice si sirve para pintarla con el color del tema. */
async function analyzeUrl(src: string): Promise<LogoAnalysis> {
  const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error("No se pudo leer la imagen.")); i.src = src; });
  const k = Math.min(1, 128 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0, c.width, c.height);
  return analyzeLogo(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
}

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
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [tol, setTol] = useState(40);
  const [preview, setPreview] = useState<string | null>(null);
  const [an, setAn] = useState<LogoAnalysis | null>(null);
  const [wantTint, setWantTint] = useState(tint);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const maxSide = kind === "logo" ? 640 : 256;
  const current = `/${kind === "logo" ? "brand/logo" : "brand/icon"}?v=${version}`;

  // Una imagen ya guardada que no sirve para pintarla (tiene fondo o varios colores) deja de pintarse: así no se ve como un bloque liso.
  useEffect(() => {
    if (!hasImage || !tint) return;
    let alive = true;
    analyzeUrl(current).then((a) => {
      if (!alive || a.tintable) return;
      setTintAction(kind, false).then((r) => { if (!alive) return; setWantTint(false); setNote("Tu imagen tiene fondo o varios colores, así que se muestra con sus colores originales (pintarla con el color del tema la dejaba como un bloque liso)."); if (r.ok) router.refresh(); });
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = (f: File | null, rb: boolean, t: number) => {
    if (!f) { setPreview(null); setAn(null); return; }
    prepare(f, rb ? t : null, maxSide).then(async (p) => { setPreview(p); const a = await analyzeUrl(p); setAn(a); if (!a.tintable) setWantTint(false); else setWantTint(true); }).catch((e) => setMsg({ error: e instanceof Error ? e.message : "No se pudo leer la imagen." }));
  };
  const shown = preview ?? current;
  const showTinted = preview ? !!an?.tintable && wantTint : tint;
  const dim = kind === "logo" ? { height: 56, width: 190 } : { height: 56, width: 56 };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{KINDS[kind]}</h3>
      <div className="flex flex-wrap items-center gap-4">
        <div className="rounded border p-2" style={{ borderColor: "var(--color-border)", background: CHECKER }} title="El cuadriculado indica transparencia">
          {showTinted
            ? <span role="img" aria-label={KINDS[kind]} style={{ display: "block", ...dim, background: "var(--color-primary)", WebkitMaskImage: `url(${shown})`, maskImage: `url(${shown})`, WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskPosition: "left center", maskPosition: "left center" }} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={shown} alt={KINDS[kind]} style={{ ...dim, objectFit: "contain", objectPosition: "left center" }} />}
        </div>
        <div className="text-xs text-muted">{preview ? "Vista previa de la imagen nueva (aún sin guardar)." : hasImage ? "Imagen guardada." : "Imagen de Pibox por defecto."}</div>
      </div>
      {note && <p role="status" className="text-sm badge-warn">{note}</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="input" aria-label={`Elegir ${KINDS[kind]}`}
        onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setMsg(null); setNote(null); refresh(f, removeBg, tol); }} />
      {file && (
        <div className="space-y-2 rounded border p-3 text-sm" style={{ borderColor: "var(--color-border)" }}>
          {an && (an.tintable
            ? <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={wantTint} onChange={(e) => setWantTint(e.target.checked)} /><span>Pintarla con el color principal del tema (cambia de color con el diseño). Tu imagen es de un solo color y tiene fondo transparente: se ve bien así.</span></label>
            : <p className="badge-warn">{an.transparentShare < 0.05 ? "Esta imagen tiene fondo (no es transparente)" : "Esta imagen tiene varios colores"}: se mostrará con sus colores originales y no cambiará con el tema.{an.transparentShare < 0.05 ? " Si es un fondo liso (p. ej. blanco) y quieres que sí cambie de color, quítalo abajo." : ""}</p>)}
          <label className="flex items-center gap-2"><input type="checkbox" checked={removeBg} onChange={(e) => { setRemoveBg(e.target.checked); refresh(file, e.target.checked, tol); }} /> Quitar el fondo (si la imagen tiene un fondo liso, p. ej. blanco)</label>
          {removeBg && (
            <div><label className="label" htmlFor={`tol-${kind}`}>Qué tanto fondo quitar: {tol}</label>
              <input id={`tol-${kind}`} type="range" min={5} max={140} value={tol} className="w-full" onChange={(e) => setTol(Number(e.target.value))} onPointerUp={() => refresh(file, true, tol)} onKeyUp={() => refresh(file, true, tol)} />
              <p className="text-xs text-muted">Sube el valor si quedan restos del fondo; bájalo si se come parte del dibujo. Solo se quita el fondo conectado con el borde de la imagen.</p></div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={pending || !preview || !an} onClick={() => start(async () => {
              try {
                const r = await saveBrandAction(kind, preview!);
                if (r.ok) { await setTintAction(kind, !!an?.tintable && wantTint); setFile(null); setPreview(null); setAn(null); if (input.current) input.current.value = ""; router.refresh(); }
                setMsg(r);
              } catch { setMsg({ error: "No se pudo guardar. Recarga la página e inténtalo de nuevo." }); }
            })}>{pending ? "Guardando…" : "Guardar imagen"}</button>
            <button className="btn" disabled={pending} onClick={() => { setFile(null); setPreview(null); setAn(null); if (input.current) input.current.value = ""; }}>Cancelar</button>
          </div>
        </div>
      )}
      {hasImage && !file && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={tint} disabled={pending} onChange={(e) => start(async () => { try { const r = await setTintAction(kind, e.target.checked); setMsg(r); router.refresh(); } catch { setMsg({ error: "No se pudo guardar." }); } })} /><span>Pintar con el color principal del tema (solo si la imagen es de un solo color y de fondo transparente).</span></label>
          <button className="btn" disabled={pending} onClick={() => start(async () => { try { setMsg(await removeBrandAction(kind)); router.refresh(); } catch { setMsg({ error: "No se pudo quitar." }); } })}>Volver a la imagen de Pibox</button>
        </div>
      )}
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok text-sm">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad text-sm">{msg.error}</p>}</div>
    </div>
  );
}

export function LogoManager({ hasLogo, hasIcon, tint, iconTint, version }: { hasLogo: boolean; hasIcon: boolean; tint: boolean; iconTint: boolean; version: string }) {
  return (
    <section className="card space-y-4" aria-label="Logo e ícono">
      <div>
        <h2 className="text-lg font-semibold">Logo e ícono</h2>
        <p className="text-sm text-muted">El logo del menú y el ícono de la pestaña del navegador. Sube un PNG, JPG o WebP de hasta {Math.round(MAX_BRAND_BYTES / 1024)} KB.</p>
        <p className="mt-1 text-sm text-muted"><b>Colores:</b> si tu imagen es de <b>un solo color y fondo transparente</b> (como el logo de Pibox), puede pintarse con el color del tema y cambia con el diseño. Si tiene <b>fondo o varios colores</b> (por ejemplo un robot con su cuadro morado), se muestra tal cual, con sus colores. La app lo detecta sola al subirla; también puedes quitar un fondo liso aquí mismo.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Slot kind="logo" hasImage={hasLogo} version={version} tint={tint} />
        <Slot kind="icon" hasImage={hasIcon} version={version} tint={iconTint} />
      </div>
    </section>
  );
}
