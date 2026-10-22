import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Cifrado AES-256-GCM para guardar tokens (p. ej. de Gmail). La clave sale de GMAIL_TOKEN_KEY o, si no existe, de AUTH_SECRET. */
function key(): Buffer {
  const base = process.env.GMAIL_TOKEN_KEY?.trim() || process.env.AUTH_SECRET;
  if (!base || base.length < 24) throw new Error("Falta AUTH_SECRET (≥ 24 caracteres) o GMAIL_TOKEN_KEY para proteger los tokens.");
  return createHash("sha256").update(`secret-box:v1:${base}`).digest();
}
const u = (b: Buffer) => b.toString("base64url");

export function seal(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${u(iv)}.${u(c.getAuthTag())}.${u(ct)}`;
}

/** Devuelve null si el texto fue alterado o la clave cambió (nunca devuelve basura). */
export function open(sealed: string): string | null {
  try {
    const [v, iv, tag, ct] = sealed.split(".");
    if (v !== "v1" || !iv || !tag || !ct) return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}
