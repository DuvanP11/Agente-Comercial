import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** OAuth de Google para que cada persona conecte SU Gmail y envíe desde la web con su propia cuenta. Solo el permiso de enviar. */
export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"]; // «email» solo para saber qué cuenta autorizó; el único permiso sobre el correo es enviar
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth", TOKEN = "https://oauth2.googleapis.com/token", PROFILE = "https://openidconnect.googleapis.com/v1/userinfo";

export interface OAuthConfig { clientId: string; clientSecret: string }
export function oauthConfig(env: Record<string, string | undefined> = process.env): OAuthConfig | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim(), clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** URL de retorno que debe estar registrada en el cliente OAuth. Sale del dominio real de la petición (o de GOOGLE_OAUTH_REDIRECT_URI). */
export function redirectUri(h: { get(n: string): string | null }, env: Record<string, string | undefined> = process.env): string {
  if (env.GOOGLE_OAUTH_REDIRECT_URI?.trim()) return env.GOOGLE_OAUTH_REDIRECT_URI.trim();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^localhost|^127\./.test(host) ? "http" : "https");
  return `${proto}://${host}/api/gmail/callback`;
}

const secret = () => { const s = process.env.AUTH_SECRET; if (!s || s.length < 24) throw new Error("Falta AUTH_SECRET."); return s; };
/** «state» firmado: liga la vuelta de Google con la persona que inició la conexión y vence en 10 minutos. */
export function signState(userId: string, returnTo: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ u: userId, r: returnTo, e: now + 600_000, n: randomBytes(6).toString("hex") })).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(`gmail-state:${body}`).digest("base64url")}`;
}
export function verifyState(state: string, now = Date.now()): { userId: string; returnTo: string } | null {
  try {
    const [body, sig] = state.split("."); if (!body || !sig) return null;
    const good = createHmac("sha256", secret()).update(`gmail-state:${body}`).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== good.length || !timingSafeEqual(given, good)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u: string; r: string; e: number };
    return p.e < now ? null : { userId: p.u, returnTo: safeReturn(p.r) };
  } catch { return null; }
}
/** Solo rutas internas de la propia app (nunca una URL externa). */
export const safeReturn = (r: string) => (/^\/[A-Za-z0-9/_\-]*$/.test(r) && !r.startsWith("//") ? r : "/integraciones");

export function authUrl(cfg: OAuthConfig, redirect: string, state: string, loginHint?: string): string {
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirect, response_type: "code", scope: GMAIL_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  if (loginHint) q.set("login_hint", loginHint);
  return `${AUTH}?${q}`;
}

export interface Tokens { accessToken: string; refreshToken?: string; expiresIn: number; scope: string }
async function tokenCall(body: Record<string, string>, fetchImpl: typeof fetch): Promise<Tokens> {
  const res = await fetchImpl(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(15_000) });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) { const e = new Error(j.error === "invalid_grant" ? "invalid_grant" : `Google rechazó la conexión (${j.error ?? res.status}).`); throw e; }
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresIn: j.expires_in ?? 3000, scope: j.scope ?? "" };
}
export const exchangeCode = (cfg: OAuthConfig, code: string, redirect: string, f: typeof fetch = fetch) => tokenCall({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }, f);
export const refreshAccess = (cfg: OAuthConfig, refreshToken: string, f: typeof fetch = fetch) => tokenCall({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }, f);

/** Correo de la cuenta que acaba de autorizar (para comprobar que es la del usuario). */
export async function gmailAddress(accessToken: string, f: typeof fetch = fetch): Promise<string> {
  const res = await f(PROFILE, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  const j = (await res.json().catch(() => ({}))) as { email?: string; email_verified?: boolean };
  if (!res.ok || !j.email || j.email_verified === false) throw new Error("No se pudo leer la cuenta de Google que autorizó la conexión.");
  return j.email.toLowerCase();
}
export const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/** Error legible para quien usa la plataforma (nunca incluye códigos ni secretos). */
export const toGoogleError = (e: unknown) => new Error(e instanceof Error && /^Google|^No se pudo/.test(e.message) ? e.message : "No se pudo hablar con Google. Intenta de nuevo en unos minutos.");
