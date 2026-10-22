import { describe, expect, it } from "vitest";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { parseImageDataUrl, sniffMime, MAX_BRAND_BYTES } from "@/lib/brand";
import { faviconSvg } from "@/lib/favicon";
import { removeFlatBackground } from "@/lib/image-bg";
import { PRESETS } from "@/lib/theme/presets";
import { checkContrast, DEFAULT_THEME, PROVISIONAL_THEME, resolveTheme, themeCss, themeTokens } from "@/lib/theme/tokens";
import { getBrandAsset, getBrandInfo, removeBrandAsset, saveBrandAsset, setBrandTint } from "@/lib/services/brand";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png64 = `data:image/png;base64,${PNG.toString("base64")}`;

describe("tema: paletas, modo automático y compatibilidad con temas viejos", () => {
  it("el diseño de arranque es válido y es la paleta Pibox en modo automático", () => {
    expect(themeTokens.safeParse(DEFAULT_THEME).success).toBe(true);
    expect(DEFAULT_THEME).toMatchObject({ palette: "pibox", scheme: "auto", primary: PRESETS.pibox.light.brand });
  });
  it("auto trae variante clara y oscura; claro u oscuro solo una; un tema viejo se respeta tal cual", () => {
    const auto = resolveTheme(DEFAULT_THEME);
    expect(auto.light.primary).toBe(PRESETS.pibox.light.brand); expect(auto.dark?.primary).toBe(PRESETS.pibox.dark.brand);
    expect(resolveTheme({ ...DEFAULT_THEME, scheme: "dark" })).toMatchObject({ light: { primary: PRESETS.pibox.dark.brand, mode: "dark" }, dark: null });
    expect(resolveTheme({ ...DEFAULT_THEME, scheme: "light" }).dark).toBeNull();
    const old = resolveTheme(PROVISIONAL_THEME); // guardado antes de existir paletas
    expect(old.light).toEqual(PROVISIONAL_THEME); expect(old.dark).toBeNull();
    expect(resolveTheme({ ...DEFAULT_THEME, palette: "custom", primary: "#112233" }).light.primary).toBe("#112233");
  });
  it("el CSS lleva media query solo en modo automático y nada que no sea hex o lista cerrada", () => {
    expect(themeCss(DEFAULT_THEME)).toMatch(/^:root\{.*\}@media \(prefers-color-scheme: dark\)\{:root\{.*\}\}$/);
    expect(themeCss({ ...DEFAULT_THEME, scheme: "light" })).not.toMatch(/@media/);
    expect(themeTokens.safeParse({ ...DEFAULT_THEME, primary: "red;}</style><script>" }).success).toBe(false);
    expect(themeTokens.safeParse({ ...DEFAULT_THEME, muted: "javascript:1" }).success).toBe(false);
  });
  it("todas las paletas (claras y oscuras) pasan el contraste AA en los pares comprobados", () => {
    for (const id of Object.keys(PRESETS)) for (const scheme of ["light", "dark"] as const) {
      const r = resolveTheme({ ...DEFAULT_THEME, palette: id, scheme });
      expect(checkContrast(r.light), `${id}/${scheme}`).toEqual([]);
    }
  });
});

describe("marca: logo e ícono", () => {
  it("solo PNG, JPG y WebP verificados por su contenido; SVG y archivos disfrazados se rechazan", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(parseImageDataUrl(png64).mime).toBe("image/png");
    expect(() => parseImageDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toThrow(/PNG, JPG o WebP/);
    expect(() => parseImageDataUrl(`data:image/png;base64,${Buffer.from("<html>no soy png</html>").toString("base64")}`)).toThrow(/no es una imagen/);
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_BRAND_BYTES)]);
    expect(() => parseImageDataUrl(`data:image/png;base64,${big.toString("base64")}`)).toThrow(/máximo/);
  });
  it("guardar, leer, quitar y cambiar el color; la versión cambia para invalidar cachés", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    expect(await getBrandInfo(d, o)).toMatchObject({ hasLogo: false, hasIcon: false, tint: true, version: "0" });
    await saveBrandAsset(d, o, "logo", png64, "t");
    const i1 = await getBrandInfo(d, o);
    expect(i1).toMatchObject({ hasLogo: true, hasIcon: false });
    expect((await getBrandAsset(d, o, "logo"))?.mime).toBe("image/png");
    expect(await getBrandAsset(d, o, "icon")).toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    await setBrandTint(d, o, false, "t");
    const i2 = await getBrandInfo(d, o);
    expect(i2.tint).toBe(false); expect(i2.version).not.toBe(i1.version); expect(i2.hasLogo).toBe(true);
    await removeBrandAsset(d, o, "logo", "t");
    expect((await getBrandInfo(d, o)).hasLogo).toBe(false);
  });
  it("favicon: con color del tema usa máscara de transparencia y variante oscura; sin él, la imagen tal cual; nunca un color no hex", () => {
    const s = faviconSvg({ base64: "AAAA", mime: "image/png", tint: true, light: "#5b2a86", dark: "#b88ae6" });
    expect(s).toContain('mask-type:alpha'); expect(s).toContain(".f{fill:#5b2a86}"); expect(s).toContain("prefers-color-scheme:dark");
    expect(faviconSvg({ base64: "AAAA", mime: "image/png", tint: false, light: "#000000" })).not.toContain("mask");
    expect(faviconSvg({ base64: "AAAA", mime: "image/png", tint: true, light: "red;}x{", dark: "url(x)" })).toContain("#5b2a86");
  });
});

describe("quitar fondo liso", () => {
  const px = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); d.set([r, g, b, 255], (y * w + x) * 4); } return d; };
  const alpha = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4 + 3];
  it("quita el fondo blanco conectado al borde y conserva el dibujo, incluso un hueco blanco interior", () => {
    // 20x20 blanco; cuadrado morado 4..15 con un hueco blanco 8..11 (no conectado al borde)
    const w = 20, d = px(w, 20, (x, y) => (x >= 4 && x <= 15 && y >= 4 && y <= 15 ? (x >= 8 && x <= 11 && y >= 8 && y <= 11 ? [255, 255, 255] : [120, 37, 188]) : [255, 255, 255]));
    removeFlatBackground(d, w, 20, 40);
    expect(alpha(d, w, 0, 0)).toBe(0); expect(alpha(d, w, 19, 19)).toBe(0); expect(alpha(d, w, 10, 2)).toBe(0);
    expect(alpha(d, w, 5, 5)).toBe(255); expect(alpha(d, w, 9, 9)).toBe(255); // el hueco interior se queda
  });
  it("con poca tolerancia no toca un degradado; si la esquina ya es transparente no hace nada", () => {
    const w = 10, d = px(w, 10, (x) => [x * 25, x * 25, x * 25]);
    expect(removeFlatBackground(d, w, 10, 5)).toBeLessThan(w * 10);
    const t = new Uint8ClampedArray(10 * 10 * 4); // todo transparente
    expect(removeFlatBackground(t, 10, 10, 50)).toBe(0);
  });
});
