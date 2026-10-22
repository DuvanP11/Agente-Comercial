/** Límite de intentos por clave (p. ej. IP) en una ventana de tiempo. En memoria: vale por instancia del servidor (suficiente como freno a ráfagas). */
const hits = new Map<string, number[]>();

export function tooMany(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k); // limpieza
  return recent.length > max;
}
export const resetRateLimit = () => hits.clear();

/** IP del cliente según el proxy (primer valor de x-forwarded-for). Solo sirve como clave del límite, nunca como identidad. */
export function clientIp(h: { get(name: string): string | null }): string {
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "desconocida").trim().slice(0, 64);
}

/** ¿La petición viene de otro sitio? Las que traen Origin deben coincidir con el host (defensa extra contra CSRF). */
export function sameOrigin(h: { get(name: string): string | null }): boolean {
  const origin = h.get("origin");
  if (!origin) return true; // peticiones del mismo sitio sin Origin (o herramientas): la cookie SameSite ya las cubre
  try { return new URL(origin).host === (h.get("x-forwarded-host") ?? h.get("host")); } catch { return false; }
}
