/** Paletas listas para elegir. Cada una trae su versión clara y su versión oscura (misma familia de colores). */
export interface PaletteColors { brand: string; accent: string; bg: string; surface: string; text: string; muted: string; border: string; ok: string; warn: string; err: string }

const DARK_STATUS = { ok: "#62d49a", warn: "#f5c566", err: "#ff8a82" };
const LIGHT_STATUS = { ok: "#167a4a", warn: "#8a5a00", err: "#b3261e" };

export const PRESETS: Record<string, { label: string; light: PaletteColors; dark: PaletteColors }> = {
  pibox: {
    label: "Pibox (morado)",
    light: { brand: "#5b2a86", accent: "#f5b83d", bg: "#faf8fc", surface: "#ffffff", text: "#231a2e", muted: "#6b6277", border: "#e4dcee", ...LIGHT_STATUS },
    dark: { brand: "#b88ae6", accent: "#f5b83d", bg: "#16111c", surface: "#1f1828", text: "#efe9f6", muted: "#a79bb8", border: "#3a2f48", ...DARK_STATUS },
  },
  oceano: {
    label: "Océano (azul)",
    light: { brand: "#0b6e99", accent: "#f59e0b", bg: "#f4f9fc", surface: "#ffffff", text: "#10222e", muted: "#587081", border: "#d3e3ec", ...LIGHT_STATUS },
    dark: { brand: "#5cc0ee", accent: "#f5b83d", bg: "#0d1a22", surface: "#13252f", text: "#e6f3fa", muted: "#8fb0c2", border: "#254250", ...DARK_STATUS },
  },
  bosque: {
    label: "Bosque (verde)",
    light: { brand: "#2f6b3a", accent: "#e0a526", bg: "#f6faf4", surface: "#ffffff", text: "#1a2a1c", muted: "#5f7262", border: "#d9e6d6", ...LIGHT_STATUS },
    dark: { brand: "#8fd49a", accent: "#f5b83d", bg: "#0f1a12", surface: "#16241a", text: "#e8f3e9", muted: "#9bb59f", border: "#2a4130", ...DARK_STATUS },
  },
  atardecer: {
    label: "Atardecer (naranja)",
    light: { brand: "#c2410c", accent: "#7c3aed", bg: "#fff8f3", surface: "#ffffff", text: "#2b1a12", muted: "#7a6558", border: "#f0dccd", ...LIGHT_STATUS },
    dark: { brand: "#fb923c", accent: "#c4b5fd", bg: "#1c1310", surface: "#281c17", text: "#fbeee6", muted: "#c0a899", border: "#473429", ...DARK_STATUS },
  },
  grafito: {
    label: "Grafito (gris)",
    light: { brand: "#374151", accent: "#f59e0b", bg: "#f3f4f6", surface: "#ffffff", text: "#111827", muted: "#6b7280", border: "#d9dce1", ...LIGHT_STATUS },
    dark: { brand: "#cbd5e1", accent: "#fbbf24", bg: "#111214", surface: "#1a1c1f", text: "#f1f3f5", muted: "#9aa1ab", border: "#33373d", ...DARK_STATUS },
  },
  contraste: {
    label: "Alto contraste",
    light: { brand: "#0000b3", accent: "#b35900", bg: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#3d3d3d", border: "#000000", ok: "#006100", warn: "#6b3f00", err: "#a00000" },
    dark: { brand: "#ffd60a", accent: "#00e5ff", bg: "#000000", surface: "#0a0a0a", text: "#ffffff", muted: "#d0d0d0", border: "#ffffff", ok: "#4dff88", warn: "#ffd60a", err: "#ff6b6b" },
  },
};
export const DEFAULT_PALETTE = "pibox";

export const COLOR_FIELDS: { key: keyof PaletteColors; label: string }[] = [
  { key: "brand", label: "Color principal (botones, menú activo, logo)" },
  { key: "accent", label: "Acento (resaltados)" },
  { key: "bg", label: "Fondo de la página" },
  { key: "surface", label: "Fondo de tarjetas y menú" },
  { key: "text", label: "Texto" },
  { key: "muted", label: "Texto secundario" },
  { key: "border", label: "Bordes y separadores" },
  { key: "ok", label: "Éxito" },
  { key: "warn", label: "Advertencia" },
  { key: "err", label: "Error" },
];
