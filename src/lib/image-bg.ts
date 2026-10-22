/**
 * Quita un fondo liso: parte de los bordes de la imagen y vuelve transparentes los píxeles conectados cuyo color se parece al del fondo
 * (el de la esquina más común). Lo que está dentro del dibujo no se toca aunque tenga el mismo color, porque no está conectado al borde.
 * `data` es RGBA (ImageData.data); se modifica en el sitio. Devuelve cuántos píxeles quedaron transparentes.
 */
export function removeFlatBackground(data: Uint8ClampedArray, w: number, h: number, tolerance: number): number {
  if (w < 2 || h < 2) return 0;
  const at = (x: number, y: number) => (y * w + x) * 4;
  // Color de fondo = el más repetido entre las cuatro esquinas (cercanas entre sí).
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const dist = (i: number, j: number) => Math.hypot(data[i] - data[j], data[i + 1] - data[j + 1], data[i + 2] - data[j + 2]);
  let ref = corners[0], best = -1;
  for (const c of corners) { const votes = corners.filter((o) => dist(c, o) <= 24).length; if (votes > best) { best = votes; ref = c; } }
  const bg = [data[ref], data[ref + 1], data[ref + 2], data[ref + 3]];
  // Si la esquina ya es transparente no hay nada que quitar.
  if (bg[3] < 16) return 0;
  const near = (i: number) => data[i + 3] < 16 || Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]) <= tolerance;
  const seen = new Uint8Array(w * h), stack: number[] = [];
  const push = (x: number, y: number) => { const k = y * w + x; if (!seen[k] && near(k * 4)) { seen[k] = 1; stack.push(k); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  let n = 0;
  while (stack.length) {
    const k = stack.pop()!, x = k % w, y = (k - x) / w;
    data[k * 4 + 3] = 0; n++;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  return n;
}


export interface LogoAnalysis { transparentShare: number; colors: number; tintable: boolean }

/**
 * ¿Sirve la imagen para pintarla con el color del tema? Solo si tiene transparencia (la silueta) y pocos colores:
 * una imagen con fondo o con varios colores quedaría como un bloque liso. Cuenta colores «relevantes» (≥ 3 % de los píxeles visibles).
 */
export function analyzeLogo(data: Uint8ClampedArray, w: number, h: number): LogoAnalysis {
  const total = w * h; let transparent = 0, visible = 0;
  const buckets = new Map<number, number>();
  for (let i = 0; i < total; i++) {
    const a = data[i * 4 + 3];
    if (a < 16) { transparent++; continue; }
    visible++;
    const key = ((data[i * 4] >> 5) << 6) | ((data[i * 4 + 1] >> 5) << 3) | (data[i * 4 + 2] >> 5); // 8 niveles por canal
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const colors = [...buckets.values()].filter((n) => n >= visible * 0.03).length;
  const transparentShare = total ? transparent / total : 0;
  return { transparentShare, colors, tintable: transparentShare >= 0.05 && colors <= 2 };
}
