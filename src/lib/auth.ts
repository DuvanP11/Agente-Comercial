/** Acceso por contraseña compartida (APP_PASSWORD). Provisional: ver docs/SECURITY_AND_PRIVACY.md. */
export const SESSION_COOKIE = "pci_session";

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function authConfigured(): boolean {
  return !!process.env.APP_PASSWORD && !!process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 24;
}

export async function makeSessionToken(): Promise<string> {
  return hmac(process.env.AUTH_SECRET!, `session:${process.env.APP_PASSWORD}`);
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token || !authConfigured()) return false;
  const expected = await makeSessionToken();
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function passwordMatches(input: string): Promise<boolean> {
  const real = process.env.APP_PASSWORD ?? "";
  if (!real) return false;
  const [a, b] = await Promise.all([hmac("cmp", input), hmac("cmp", real)]);
  return a === b;
}
