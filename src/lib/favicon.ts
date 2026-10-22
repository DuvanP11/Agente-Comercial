/** Favicon en SVG. Con `tint` la imagen se usa como máscara y se pinta con el color del tema (claro y, si hay, oscuro según el sistema). */
export function faviconSvg(o: { base64: string; mime: string; tint: boolean; light: string; dark?: string | null }): string {
  const href = `data:${o.mime};base64,${o.base64}`;
  const img = `<image href="${href}" width="64" height="64" preserveAspectRatio="xMidYMid meet"/>`;
  if (!o.tint) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${img}</svg>`;
  const hex = /^#[0-9a-fA-F]{6}$/;
  const light = hex.test(o.light) ? o.light : "#5b2a86", dark = o.dark && hex.test(o.dark) ? o.dark : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><mask id="m" style="mask-type:alpha">${img}</mask></defs>` +
    `<style>.f{fill:${light}}${dark ? `@media (prefers-color-scheme:dark){.f{fill:${dark}}}` : ""}</style><rect class="f" width="64" height="64" mask="url(#m)"/></svg>`;
}
