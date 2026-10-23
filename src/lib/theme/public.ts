import type { BrandInfo } from "../services/brand";
import { resolveTheme, tokensToCssVars, type ThemeTokens } from "./tokens";
import type { PaletteColors } from "./presets";

/** Lo que otras webs de PIBOX (el Automatizador de mensajes) necesitan para verse igual: solo colores, modo, formas y logo propio. Nada sensible. */
export interface PublicTheme {
  v: 1;
  /** auto = sigue el modo claro/oscuro del sistema (hay `dark`); light/dark = una sola variante, en `light`. */
  scheme: "auto" | "light" | "dark";
  light: PaletteColors; dark: PaletteColors | null;
  radius: number; font: "system" | "serif" | "mono";
  logoUrl: string | null; version: string;
}

function palette(t: ThemeTokens): PaletteColors {
  const v = tokensToCssVars(t);
  return { brand: t.primary, accent: t.accent, bg: t.background, surface: t.surface, text: t.text, muted: v["--color-muted"], border: v["--color-border"], ok: v["--color-success"], warn: v["--color-warning"], err: v["--color-danger"] };
}

export function publicTheme(theme: ThemeTokens, brand: BrandInfo, origin: string): PublicTheme {
  const { light, dark } = resolveTheme(theme);
  return {
    v: 1, scheme: dark ? "auto" : light.mode, light: palette(light), dark: dark ? palette(dark) : null,
    radius: theme.radius, font: theme.font,
    logoUrl: brand.hasLogo ? `${origin}/brand/logo?v=${brand.version}` : null,
    // Cambia cuando cambia cualquier cosa visible: la otra web lo usa para saber que debe repintar.
    version: `${brand.version}-${palette(light).brand.slice(1)}-${dark ? "d" : light.mode[0]}-${theme.radius}-${theme.font}`,
  };
}
