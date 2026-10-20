import { describe, expect, it } from "vitest";
import { checkContrast, contrastRatio, PROVISIONAL_DARK, PROVISIONAL_THEME, themeTokens, tokensToCssVars } from "@/lib/theme/tokens";

describe("tema", () => {
  it("contraste WCAG conocido: negro/blanco = 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
  it("los temas provisionales cumplen AA", () => {
    expect(checkContrast(PROVISIONAL_THEME)).toEqual([]);
    expect(checkContrast(PROVISIONAL_DARK)).toEqual([]);
  });
  it("detecta una paleta ilegible", () => {
    const bad = { ...PROVISIONAL_THEME, text: "#cccccc", primary: "#ffee00" };
    expect(checkContrast(bad).length).toBeGreaterThan(0);
  });
  it("cambiar la paleta cambia TODAS las variables derivadas", () => {
    const a = tokensToCssVars(PROVISIONAL_THEME);
    const b = tokensToCssVars({ ...PROVISIONAL_THEME, background: "#fff7ed", surface: "#fffbf5", text: "#2b1d0e", primary: "#b45309" });
    for (const k of ["--color-bg", "--color-surface", "--color-text", "--color-primary", "--color-border", "--color-muted", "--color-surface-2"]) {
      expect(a[k]).not.toBe(b[k]);
    }
  });
  it("rechaza colores inválidos", () => {
    expect(themeTokens.safeParse({ ...PROVISIONAL_THEME, primary: "rojo" }).success).toBe(false);
  });
});
