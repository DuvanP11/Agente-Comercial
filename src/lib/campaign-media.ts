/** Reglas puras de los archivos de una campaña: tipos admitidos, tamaños y comprobación del contenido real (no solo del nombre). */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;       // la plataforma de hosting limita cada petición a ~4,5 MB
export const MAX_CAMPAIGN_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 12;
export const MAX_COVER_BYTES = 300 * 1024;

export type MediaKind = "image" | "video" | "pdf" | "doc";
export const KIND_LABEL: Record<MediaKind, string> = { image: "Imagen", video: "Video", pdf: "PDF", doc: "Word" };

const hex = (b: Uint8Array, at: number, h: string) => h.match(/../g)!.every((x, i) => b[at + i] === parseInt(x, 16));
const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.slice(at, at + len));

/** Detecta el tipo por los primeros bytes. Devuelve null si no es uno de los admitidos. */
export function sniffMedia(b: Uint8Array, fileName: string): { kind: MediaKind; mime: string } | null {
  if (b.length < 12) return null;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (hex(b, 0, "89504e47")) return { kind: "image", mime: "image/png" };
  if (hex(b, 0, "ffd8ff")) return { kind: "image", mime: "image/jpeg" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { kind: "image", mime: "image/webp" };
  if (ascii(b, 0, 4) === "GIF8") return { kind: "image", mime: "image/gif" };
  if (ascii(b, 4, 4) === "ftyp") return { kind: "video", mime: "video/mp4" };           // MP4 / MOV (WhatsApp lee MP4)
  if (hex(b, 0, "1a45dfa3")) return { kind: "video", mime: "video/webm" };
  if (ascii(b, 0, 4) === "%PDF") return { kind: "pdf", mime: "application/pdf" };
  if (hex(b, 0, "504b0304") && ext === "docx") return { kind: "doc", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  if (hex(b, 0, "d0cf11e0") && ext === "doc") return { kind: "doc", mime: "application/msword" };
  return null;
}

/** Nombre seguro para guardar y para el encabezado de descarga: sin rutas, comillas ni caracteres de control. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "archivo";
  const clean = base.replace(/[\u0000-\u001f"<>:|?*]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return clean || "archivo";
}

export interface FileCheck { ok: boolean; error?: string; kind?: MediaKind; mime?: string; name?: string }

export function checkFile(bytes: Uint8Array, fileName: string, current: { count: number; total: number }): FileCheck {
  if (bytes.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: `El archivo pesa ${(bytes.length / 1048576).toFixed(1)} MB; el máximo por archivo es ${MAX_FILE_BYTES / 1048576} MB. Comprime el video o la imagen e inténtalo de nuevo.` };
  if (current.count >= MAX_FILES) return { ok: false, error: `Una campaña admite hasta ${MAX_FILES} archivos.` };
  if (current.total + bytes.length > MAX_CAMPAIGN_BYTES) return { ok: false, error: `Con este archivo la campaña pasaría de ${MAX_CAMPAIGN_BYTES / 1048576} MB en total.` };
  const t = sniffMedia(bytes, fileName);
  if (!t) return { ok: false, error: "Formato no admitido. Usa imagen (PNG, JPG, WebP, GIF), video MP4, PDF o Word (.docx, .doc)." };
  return { ok: true, ...t, name: safeFileName(fileName) };
}

/** Las imágenes y el video se muestran dentro de la página; PDF y Word siempre se descargan. */
export const isInline = (kind: string) => kind === "image" || kind === "video";

export function formatSize(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
