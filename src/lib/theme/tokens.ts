import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal #RRGGBB");

export const themeTokens = z.object({
  mode: z.enum(["light", "dark"]),
  primary: hex, secondary: hex, accent: hex,
  background: hex, surface: hex, text: hex,
  font: z.enum(["system", "serif", "mono"]),
  radius: z.number().int().min(0).max(24),
  density: z.enum(["compact", "comfortable", "spacious"]),
  cardStyle: z.enum(["flat", "outlined", "elevated"]),
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
  const border = mix(t.text, t.surface, 0.14);
  return {
    "--color-primary": t.primary, "--color-on-primary": onColor(t.primary),
    "--color-secondary": t.secondary, "--color-accent": t.accent, "--color-on-accent": onColor(t.accent),
    "--color-bg": t.background, "--color-surface": t.surface, "--color-text": t.text,
    "--color-muted": mix(t.text, t.surface, 0.62), "--color-border": border,
    "--color-surface-2": mix(t.text, t.surface, 0.05),
    "--color-danger": t.mode === "dark" ? "#ff8a8a" : "#b42318",
    "--color-warning": t.mode === "dark" ? "#fbbf24" : "#92600a",
    "--color-success": t.mode === "dark" ? "#4ade80" : "#106b3a",
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
    ["Acento como texto sobre superficies", t.accent, t.surface, 4.5],
  ];
  return pairs
    .map(([pair, fg, bg, required]) => ({ pair, ratio: Math.round(contrastRatio(fg, bg) * 100) / 100, required }))
    .filter((p) => p.ratio < p.required);
}
