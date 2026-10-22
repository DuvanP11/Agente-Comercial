/** Reglas puras de las imágenes de marca: formatos admitidos, tamaño máximo y comprobación del contenido real (no solo del nombre). */
export const MAX_BRAND_BYTES = 500 * 1024;
export const KINDS = { logo: "Logo (menú lateral)", icon: "Ícono de la pestaña del navegador" } as const;
export type BrandKind = keyof typeof KINDS;
export const isKind = (v: unknown): v is BrandKind => v === "logo" || v === "icon";

export type BrandMime = "image/png" | "image/jpeg" | "image/webp";

/** Detecta el formato por los primeros bytes. Solo PNG, JPEG y WebP: un SVG puede traer scripts, así que no se acepta. */
export function sniffMime(buf: Uint8Array): BrandMime | null {
  if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 12 && String.fromCharCode(...buf.slice(0, 4)) === "RIFF" && String.fromCharCode(...buf.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** «data:image/png;base64,...» → bytes y formato verificado. Lanza con un mensaje claro. */
export function parseImageDataUrl(dataUrl: string): { mime: BrandMime; base64: string; bytes: Buffer } {
  const m = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) throw new Error("La imagen debe ser PNG, JPG o WebP.");
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > MAX_BRAND_BYTES) throw new Error(`La imagen pesa ${Math.round(bytes.length / 1024)} KB; el máximo es ${Math.round(MAX_BRAND_BYTES / 1024)} KB.`);
  const mime = sniffMime(bytes);
  if (!mime) throw new Error("El archivo no es una imagen PNG, JPG o WebP válida.");
  return { mime, base64: m[1], bytes };
}
