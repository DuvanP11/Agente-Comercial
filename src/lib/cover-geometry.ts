/** Geometría del encuadre de la portada. Pura (sin canvas) para poder probarla. */
export const COVER_OUT: { w: number; h: number } = { w: 960, h: 320 }; // 3:1: lo que se ve en el editor es exactamente lo que se guarda

export interface Placement { dx: number; dy: number; dw: number; dh: number }

/**
 * Dónde dibujar la imagen (ya girada/volteada, de sw×sh) dentro del marco out.w×out.h.
 * zoom 1 = cubre el marco justo (recorta lo que sobra); menos de 1 deja bordes; más de 1 acerca.
 * ox/oy en [-1, 1] mueven la imagen dentro del margen que le sobra (o falta) en cada eje.
 */
export function placeCover(sw: number, sh: number, zoom: number, ox: number, oy: number, out = COVER_OUT): Placement {
  const cover = Math.max(out.w / sw, out.h / sh);
  const scale = cover * clamp(zoom, 0.2, 4);
  const dw = sw * scale, dh = sh * scale;
  const range = (d: number, o: number) => Math.abs(d - o) / 2;
  return {
    dx: (out.w - dw) / 2 + clamp(ox, -1, 1) * range(dw, out.w), dy: (out.h - dh) / 2 + clamp(oy, -1, 1) * range(dh, out.h), dw, dh,
  };
}

/** Zoom con el que la imagen entra COMPLETA en el marco (sin recortar nada). */
export function fitZoom(sw: number, sh: number, out = COVER_OUT): number {
  return Math.min(out.w / sw, out.h / sh) / Math.max(out.w / sw, out.h / sh);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Tamaño de la imagen tras girarla: con 90° o 270° se intercambian ancho y alto. */
export function rotatedSize(w: number, h: number, quarterTurns: number): { w: number; h: number } {
  return ((quarterTurns % 4) + 4) % 2 === 1 ? { w: h, h: w } : { w, h };
}
