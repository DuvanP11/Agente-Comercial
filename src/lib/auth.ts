/**
 * Sesión por cookie firmada (HMAC-SHA256 con AUTH_SECRET). Solo usa Web Crypto: sirve en el middleware (edge) y en el servidor.
 * El token no es una prueba de que el usuario siga activo: eso se comprueba contra la base en cada pantalla (getCurrentUser).
 */
export const SESSION_COOKIE = "pci_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 horas

export interface SessionPayload {
  /** id de usuario */ u: string;
  /** versión de sesión del usuario */ v: number;
  /** expira (epoch s) */ e: number;
  /** debe cambiar la contraseña */ m: boolean;
  /** rol (si cambia, sube la versión de sesión y hay que volver a entrar) */ r: string;
}

const enc = new TextEncoder();
const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const safeEqual = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export function authConfigured(): boolean {
  return !!process.env.APP_PASSWORD && !!process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 24;
}

export async function makeSessionToken(p: Omit<SessionPayload, "e">, now = Date.now()): Promise<string> {
  const body = b64(JSON.stringify({ ...p, e: Math.floor(now / 1000) + SESSION_MAX_AGE } satisfies SessionPayload));
  return `${body}.${await hmac(process.env.AUTH_SECRET!, `session:${body}`)}`;
}

/** Devuelve el contenido del token si la firma es válida y no venció; si no, null. */
export async function readSession(token: string | undefined, now = Date.now()): Promise<SessionPayload | null> {
  if (!token || !authConfigured()) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, await hmac(process.env.AUTH_SECRET!, `session:${body}`))) return null;
  try {
    const p = JSON.parse(unb64(body)) as SessionPayload;
    if (typeof p.u !== "string" || typeof p.v !== "number" || typeof p.e !== "number" || typeof p.r !== "string" || p.e * 1000 < now) return null;
    return { u: p.u, v: p.v, e: p.e, m: !!p.m, r: p.r };
  } catch { return null; }
}

/** ¿Coincide con APP_PASSWORD? (la clave del administrador de arranque). Tiempo constante. */
export async function appPasswordMatches(input: string): Promise<boolean> {
  const real = process.env.APP_PASSWORD ?? "";
  if (!real) return false;
  const [a, b] = await Promise.all([hmac("cmp", input), hmac("cmp", real)]);
  return safeEqual(a, b);
}
