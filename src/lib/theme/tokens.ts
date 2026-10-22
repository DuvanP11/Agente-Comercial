import { z } from "zod";
import { DEFAULT_PALETTE, PRESETS, type PaletteColors } from "./presets";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal #RRGGBB");

export const themeTokens = z.object({
  mode: z.enum(["light", "dark"]),
  primary: hex, secondary: hex, accent: hex,
  background: hex, surface: hex, text: hex,
  font: z.enum(["system", "serif", "mono"]),
  radius: z.number().int().min(0).max(24),
  density: z.enum(["compact", "comfortable", "spacious"]),
  cardStyle: z.enum(["flat", "outlined", "elevated"]),
  /** Paleta elegida («custom» = colores propios) y si sigue al sistema, o es siempre clara u oscura. Opcionales: los temas viejos no los traen. */
  palette: z.string().max(20).optional(),
  scheme: z.enum(["auto", "light", "dark"]).optional(),
  muted: hex.optional(), border: hex.optional(), success: hex.optional(), warning: hex.optional(), danger: hex.optional(),
});
export type ThemeTokens = z.infer<typeof themeTokens>;

/**
 * Tema PROVISIONAL. No son los colores oficiales de PIBOX: se reemplazan cuando
 * se cargue la imagen corporativa (ver docs/ROADMAP.md, pendiente P-1).
 */
export const PROVISIONAL_THEME: ThemeTokens = {
  mode: "light",
  primary: "#1f4fd8", secondary: "#475569", accent: "#0b7a5e",
  background: "#f5f7fb", surface: "#ffffff", text: "#111827",
  font: "system", radius: 10, density: "comfortable", cardStyle: "outlined",
};

/** Diseño de arranque: paleta Pibox (morado), siguiendo el modo claro/oscuro del sistema. */
export function tokensFromPalette(c: PaletteColors, mode: "light" | "dark", shared: Pick<ThemeTokens, "font" | "radius" | "density" | "cardStyle">): ThemeTokens {
  return { mode, primary: c.brand, secondary: c.muted, accent: c.accent, background: c.bg, surface: c.surface, text: c.text, muted: c.muted, border: c.border, success: c.ok, warning: c.warn, danger: c.err, ...shared };
}
const SHARED = { font: "system", radius: 10, density: "comfortable", cardStyle: "outlined" } as const;
export const DEFAULT_THEME: ThemeTokens = { ...tokensFromPalette(PRESETS[DEFAULT_PALETTE].light, "light", SHARED), palette: DEFAULT_PALETTE, scheme: "auto" };

export const PROVISIONAL_DARK: ThemeTokens = {
  ...PROVISIONAL_THEME, mode: "dark",
  primary: "#6b93ff", secondary: "#94a3b8", accent: "#34d3a5",
  background: "#0b1020", surface: "#141b2e", text: "#e8ecf6",
};

const FONTS = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: 'ui-serif, Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};
const DENSITY = { compact: "0.75", comfortable: "1", spacious: "1.25" };

export function onColor(bg: string): string {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#000000") ? "#ffffff" : "#000000";
}

/** Todas las variables que consume la interfaz; ningún componente usa colores sueltos. */
export function tokensToCssVars(t: ThemeTokens): Record<string, string> {
  const border = t.border ?? mix(t.text, t.surface, 0.14);
  return {
    "--color-primary": t.primary, "--color-on-primary": onColor(t.primary),
    "--color-secondary": t.secondary, "--color-accent": t.accent, "--color-on-accent": onColor(t.accent),
    "--color-bg": t.background, "--color-surface": t.surface, "--color-text": t.text,
    "--color-muted": t.muted ?? mix(t.text, t.surface, 0.62), "--color-border": border,
    "--color-surface-2": mix(t.text, t.surface, 0.05),
    "--color-danger": t.danger ?? (t.mode === "dark" ? "#ff8a8a" : "#b42318"),
    "--color-warning": t.warning ?? (t.mode === "dark" ? "#fbbf24" : "#92600a"),
    "--color-success": t.success ?? (t.mode === "dark" ? "#4ade80" : "#106b3a"),
    "--radius": `${t.radius}px`, "--density": DENSITY[t.density], "--font": FONTS[t.font],
    "--card-shadow": t.cardStyle === "elevated" ? "0 4px 18px rgb(0 0 0 / 0.12)" : "none",
    "--card-border": t.cardStyle === "flat" ? "1px solid transparent" : `1px solid ${border}`,
    "color-scheme": t.mode,
  };
}

function toRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, ratio: number): string {
  const [ar, ag, ab] = toRgb(a), [br, bg, bb] = toRgb(b);
  const c = (x: number, y: number) => Math.round(x * ratio + y * (1 - ratio)).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

export function luminance(h: string): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = toRgb(h);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export interface ContrastIssue { pair: string; ratio: number; required: number }

/** WCAG AA: 4.5 para texto normal. Devuelve los pares que no cumplen. */
export function checkContrast(t: ThemeTokens): ContrastIssue[] {
  const v = tokensToCssVars(t);
  const pairs: [string, string, string, number][] = [
    ["Texto sobre fondo", t.text, t.background, 4.5],
    ["Texto sobre superficies", t.text, t.surface, 4.5],
    ["Texto secundario sobre superficies", v["--color-muted"], t.surface, 4.5],
    ["Texto de botón primario", v["--color-on-primary"], t.primary, 4.5],
    ["Primario como texto/enlace sobre superficies", t.primary, t.surface, 4.5],
    // El acento no se usa para texto en ninguna pantalla (solo como resaltado), por eso no se exige contraste de texto.
  ];
  return pairs
    .map(([pair, fg, bg, required]) => ({ pair, ratio: Math.round(contrastRatio(fg, bg) * 100) / 100, required }))
    .filter((p) => p.ratio < p.required);
}


/**
 * Resuelve un tema a sus variantes. Con una paleta de la lista y modo «auto» hay clara y oscura (el navegador elige según el sistema);
 * con colores propios hay una sola. Un tema viejo (sin paleta) se respeta tal cual.
 */
export function resolveTheme(t: ThemeTokens): { light: ThemeTokens; dark: ThemeTokens | null } {
  const preset = t.palette && t.palette !== "custom" ? PRESETS[t.palette] : undefined;
  if (!preset) return { light: t, dark: null };
  const shared = { font: t.font, radius: t.radius, density: t.density, cardStyle: t.cardStyle };
  const scheme = t.scheme ?? t.mode;
  const light = { ...tokensFromPalette(preset.light, "light", shared), palette: t.palette, scheme };
  const dark = { ...tokensFromPalette(preset.dark, "dark", shared), palette: t.palette, scheme };
  return scheme === "light" ? { light, dark: null } : scheme === "dark" ? { light: dark, dark: null } : { light, dark };
}

const css = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");

/** CSS del tema para el <style> del <head>. Los valores salen de colores hex validados y listas cerradas, nunca de texto libre. */
export function themeCss(t: ThemeTokens): string {
  const { light, dark } = resolveTheme(t);
  const base = `:root{${css(tokensToCssVars(light))}}`;
  return dark ? `${base}@media (prefers-color-scheme: dark){:root{${css(tokensToCssVars(dark))}}}` : base;
}
