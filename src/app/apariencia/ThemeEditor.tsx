"use client";
import { useMemo, useState, useTransition } from "react";
import { checkContrast, PROVISIONAL_DARK, PROVISIONAL_THEME, tokensToCssVars, type ThemeTokens } from "@/lib/theme/tokens";
import { resetTheme, saveTheme } from "./actions";

const COLORS: [keyof ThemeTokens, string][] = [
  ["primary", "Color primario"], ["secondary", "Color secundario"], ["accent", "Color de acento"],
  ["background", "Fondo general"], ["surface", "Fondo de superficies"], ["text", "Color del texto"],
];

export function ThemeEditor({ initial }: { initial: ThemeTokens }) {
  const [t, setT] = useState<ThemeTokens>(initial);
  const [name, setName] = useState("Mi tema");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const issues = useMemo(() => checkContrast(t), [t]);

  // Vista previa en vivo: se escriben las mismas variables que usa toda la app.
  const apply = (next: ThemeTokens) => {
    setT(next);
    const vars = tokensToCssVars(next);
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  };
  const set = <K extends keyof ThemeTokens>(k: K, v: ThemeTokens[K]) => apply({ ...t, [k]: v });

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COLORS.map(([k, label]) => (
          <div key={k}><label className="label" htmlFor={k}>{label}</label>
            <input id={k} type="color" className="h-9 w-full cursor-pointer" value={t[k] as string} onChange={(e) => set(k, e.target.value as never)} /></div>
        ))}
        <div><label className="label" htmlFor="font">Tipografía</label>
          <select id="font" className="input" value={t.font} onChange={(e) => set("font", e.target.value as ThemeTokens["font"])}>
            <option value="system">Sans (sistema)</option><option value="serif">Serif</option><option value="mono">Monoespaciada</option></select></div>
        <div><label className="label" htmlFor="radius">Radio de bordes: {t.radius}px</label>
          <input id="radius" type="range" min={0} max={24} value={t.radius} className="w-full" onChange={(e) => set("radius", Number(e.target.value))} /></div>
        <div><label className="label" htmlFor="density">Densidad</label>
          <select id="density" className="input" value={t.density} onChange={(e) => set("density", e.target.value as ThemeTokens["density"])}>
            <option value="compact">Compacta</option><option value="comfortable">Cómoda</option><option value="spacious">Amplia</option></select></div>
        <div><label className="label" htmlFor="cardStyle">Estilo de tarjetas</label>
          <select id="cardStyle" className="input" value={t.cardStyle} onChange={(e) => set("cardStyle", e.target.value as ThemeTokens["cardStyle"])}>
            <option value="flat">Plano</option><option value="outlined">Con borde</option><option value="elevated">Con sombra</option></select></div>
        <div><label className="label" htmlFor="mode">Apariencia</label>
          <select id="mode" className="input" value={t.mode} onChange={(e) => apply(e.target.value === "dark" ? PROVISIONAL_DARK : PROVISIONAL_THEME)}>
            <option value="light">Clara</option><option value="dark">Oscura (reinicia colores)</option></select></div>
      </div>

      {issues.length > 0 ? (
        <div role="alert" className="card badge-warn"><b>Contraste insuficiente (WCAG AA):</b>
          <ul className="list-disc pl-5">{issues.map((i) => <li key={i.pair}>{i.pair}: {i.ratio}:1 (mínimo {i.required}:1)</li>)}</ul></div>
      ) : <p role="status" className="card badge-ok">La paleta cumple contraste AA en los pares comprobados.</p>}

      <div className="card flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="tname">Nombre del tema</label><input id="tname" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await saveTheme(name, t); setMsg("error" in r ? String(r.error) : "Tema guardado para toda la organización."); })}>Guardar tema</button>
        <button className="btn" disabled={pending} onClick={() => start(async () => { await resetTheme(); apply(PROVISIONAL_THEME); setMsg("Restablecido al diseño provisional."); })}>Volver al diseño original</button>
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <p className="text-xs text-muted">Los colores iniciales son PROVISIONALES, no los oficiales de PIBOX. Pendiente: cargar la imagen corporativa para fijarlos.</p>
    </div>
  );
}
