"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { COLOR_FIELDS, PRESETS, type PaletteColors } from "@/lib/theme/presets";
import { checkContrast, DEFAULT_THEME, resolveTheme, tokensFromPalette, tokensToCssVars, type ThemeTokens } from "@/lib/theme/tokens";
import { resetTheme, saveTheme } from "./actions";

type Scheme = "auto" | "light" | "dark";
const MODES: [Scheme, string][] = [["auto", "Automático"], ["light", "Claro"], ["dark", "Oscuro"]];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Colores del tema como los muestran los campos (clave de paleta → valor). */
function colorsOf(t: ThemeTokens): PaletteColors {
  return { brand: t.primary, accent: t.accent, bg: t.background, surface: t.surface, text: t.text, muted: t.muted ?? t.secondary, border: t.border ?? "#cccccc", ok: t.success ?? "#167a4a", warn: t.warning ?? "#8a5a00", err: t.danger ?? "#b3261e" };
}
const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export function ThemeEditor({ initial }: { initial: ThemeTokens }) {
  const [t, setT] = useState<ThemeTokens>(initial);
  const [name, setName] = useState("Mi tema");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const scheme: Scheme = t.scheme ?? t.mode;
  const palette = t.palette && t.palette !== "custom" && PRESETS[t.palette] ? t.palette : "custom";

  // Lo que se está viendo ahora: con «automático», lo que pida el sistema.
  const shown = useMemo(() => { const r = resolveTheme(t); return r.dark && systemDark() ? r.dark : r.light; }, [t]);
  const issues = useMemo(() => checkContrast(shown), [shown]);
  const colors = colorsOf(palette === "custom" ? t : shown);

  // Vista previa en vivo: se escriben las mismas variables que usa toda la app.
  useEffect(() => { for (const [k, v] of Object.entries(tokensToCssVars(shown))) document.documentElement.style.setProperty(k, v); }, [shown]);

  const shared = (x: ThemeTokens) => ({ font: x.font, radius: x.radius, density: x.density, cardStyle: x.cardStyle });
  const setScheme = (s: Scheme) => setT((x) => ({ ...x, scheme: s, mode: s === "dark" ? "dark" : "light" }));
  const pickPreset = (id: string) => setT((x) => ({ ...tokensFromPalette(PRESETS[id][(x.scheme ?? x.mode) === "dark" || ((x.scheme ?? x.mode) === "auto" && systemDark()) ? "dark" : "light"], x.mode, shared(x)), palette: id, scheme: x.scheme ?? x.mode }));
  const startCustom = () => setT((x) => ({ ...x, palette: "custom" }));
  const setColor = (key: keyof PaletteColors, value: string) => {
    if (!HEX.test(value)) return;
    setT((x) => {
      const base = palette === "custom" ? colorsOf(x) : colorsOf(shown);
      const c = { ...base, [key]: value };
      return { ...tokensFromPalette(c, x.mode, shared(x)), palette: "custom", scheme: x.scheme ?? x.mode };
    });
  };
  const set = <K extends keyof ThemeTokens>(k: K, v: ThemeTokens[K]) => setT((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-4">
      <section className="card space-y-2" aria-label="Modo">
        <h2 className="text-lg font-semibold">Modo</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Modo claro u oscuro">
          {MODES.map(([k, l]) => <button key={k} className="btn" aria-pressed={scheme === k} onClick={() => setScheme(k)} style={scheme === k ? { background: "var(--color-primary)", color: "var(--color-on-primary)" } : undefined}>{l}</button>)}
        </div>
        <p className="text-xs text-muted">«Automático» sigue la configuración de tu computador. Con colores personalizados el modo no cambia tus colores.</p>
      </section>

      <section className="card space-y-3" aria-label="Paleta de colores">
        <h2 className="text-lg font-semibold">Paleta de colores</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {Object.entries(PRESETS).map(([id, p]) => {
            const c = p[scheme === "dark" || (scheme === "auto" && systemDark()) ? "dark" : "light"];
            return (
              <button key={id} className="rounded-[var(--radius)] border p-2 text-left text-sm" aria-pressed={palette === id}
                style={{ borderColor: palette === id ? "var(--color-primary)" : "var(--color-border)", borderWidth: palette === id ? 2 : 1, background: "var(--color-surface)" }} onClick={() => pickPreset(id)}>
                <span className="mb-2 flex h-5 overflow-hidden rounded">{[c.brand, c.accent, c.bg, c.surface, c.text].map((x, i) => <span key={i} className="flex-1" style={{ background: x }} />)}</span>
                {p.label}
              </button>
            );
          })}
          <button className="rounded-[var(--radius)] border p-2 text-left text-sm" aria-pressed={palette === "custom"} onClick={startCustom}
            style={{ borderColor: palette === "custom" ? "var(--color-primary)" : "var(--color-border)", borderWidth: palette === "custom" ? 2 : 1, background: "var(--color-surface)" }}>
            <span className="mb-2 flex h-5 overflow-hidden rounded">{[colors.brand, colors.accent, colors.bg, colors.surface, colors.text].map((x, i) => <span key={i} className="flex-1" style={{ background: x }} />)}</span>
            Personalizada
          </button>
        </div>
      </section>

      <section className="card space-y-3" aria-label="Colores personalizados">
        <div><h2 className="text-lg font-semibold">Colores personalizados</h2><p className="text-sm text-muted">Ajusta cada parte de la aplicación. Cambiar un color pasa automáticamente a «Personalizada». El texto sobre cada color se calcula solo.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COLOR_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <input type="color" aria-label={label} className="h-10 w-12 shrink-0 cursor-pointer rounded border" style={{ borderColor: "var(--color-border)" }} value={colors[key]} onChange={(e) => setColor(key, e.target.value)} />
              <div className="min-w-0 flex-1"><label className="label" htmlFor={`c-${key}`}>{label}</label>
                <input id={`c-${key}`} className="input font-mono" maxLength={7} value={colors[key]} onChange={(e) => setColor(key, e.target.value)} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Letra y formas">
        <h2 className="text-lg font-semibold sm:col-span-2 lg:col-span-4">Letra y formas</h2>
        <div><label className="label" htmlFor="font">Tipografía</label>
          <select id="font" className="input" value={t.font} onChange={(e) => set("font", e.target.value as ThemeTokens["font"])}><option value="system">Sans (sistema)</option><option value="serif">Serif</option><option value="mono">Monoespaciada</option></select></div>
        <div><label className="label" htmlFor="radius">Esquinas: {t.radius}px</label>
          <input id="radius" type="range" min={0} max={24} value={t.radius} className="w-full" onChange={(e) => set("radius", Number(e.target.value))} /></div>
        <div><label className="label" htmlFor="density">Densidad</label>
          <select id="density" className="input" value={t.density} onChange={(e) => set("density", e.target.value as ThemeTokens["density"])}><option value="compact">Compacta</option><option value="comfortable">Cómoda</option><option value="spacious">Amplia</option></select></div>
        <div><label className="label" htmlFor="cardStyle">Estilo de tarjetas</label>
          <select id="cardStyle" className="input" value={t.cardStyle} onChange={(e) => set("cardStyle", e.target.value as ThemeTokens["cardStyle"])}><option value="flat">Plano</option><option value="outlined">Con borde</option><option value="elevated">Con sombra</option></select></div>
      </section>

      {issues.length > 0 ? (
        <div role="alert" className="card badge-warn"><b>Contraste insuficiente (WCAG AA):</b>
          <ul className="list-disc pl-5">{issues.map((i) => <li key={i.pair}>{i.pair}: {i.ratio}:1 (mínimo {i.required}:1)</li>)}</ul></div>
      ) : <p role="status" className="card badge-ok">La paleta cumple contraste AA en los pares comprobados.</p>}

      <div className="card flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="tname">Nombre del tema</label><input id="tname" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { try { const r = await saveTheme(name, t); setMsg("error" in r ? String(r.error) : "Tema guardado para toda la organización."); } catch { setMsg("No se pudo guardar. Recarga la página e inténtalo de nuevo."); } })}>Guardar tema</button>
        <button className="btn" disabled={pending} onClick={() => start(async () => { await resetTheme(); setT(DEFAULT_THEME); setMsg("Restablecido al diseño de Pibox."); })}>Restablecer apariencia</button>
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <p className="text-xs text-muted">Lo que cambies aquí se ve al instante, pero solo se guarda para todos con «Guardar tema». Las paletas son una propuesta; puedes ajustarlas o crear la tuya.</p>
    </div>
  );
}
