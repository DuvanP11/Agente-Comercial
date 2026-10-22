/** Reglas puras de usuarios: dominios permitidos, normalización y contraseñas. */
export const ALLOWED_EMAIL_DOMAINS = ["pibox.app", "picap.app", "picap.io", "softlab.app"] as const;

export const normEmail = (s: string) => s.trim().toLowerCase();
export const normUsername = (s: string) => s.trim().toLowerCase();

/** Devuelve el correo normalizado o lanza con un mensaje claro. Solo dominios corporativos exactos (no subdominios). */
export function validateCorporateEmail(input: string): string {
  const e = normEmail(input);
  if (!/^[a-z0-9._%+\-]{1,64}@[a-z0-9.\-]{3,100}$/.test(e)) throw new Error("Escribe un correo válido.");
  const domain = e.split("@")[1];
  if (!(ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain)) throw new Error(`Solo se permiten correos corporativos: ${ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(", ")}.`);
  return e;
}

export function validateUsername(input: string): string {
  const u = normUsername(input);
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(u)) throw new Error("El usuario debe tener de 3 a 30 caracteres (letras, números, punto, guion o guion bajo) y empezar con letra o número.");
  return u;
}

export function validateName(input: string): string {
  const n = input.trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 80) throw new Error("El nombre debe tener entre 2 y 80 caracteres.");
  return n;
}

export const MIN_PASSWORD = 10;
/** Mínimo 10 caracteres, con letras y números. */
export function passwordIssue(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (p.length > 100) return "La contraseña es demasiado larga (máximo 100 caracteres).";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "La contraseña debe combinar letras y números.";
  return null;
}

/** Contraseña temporal legible (sin caracteres que se confunden), de 12 caracteres con letras y números. */
export function tempPassword(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const letters = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", digits = "23456789", all = letters + digits;
  const b = rand(12);
  const chars = Array.from(b, (x, i) => (i === 0 ? letters : i === 1 ? digits : all)[x % (i === 0 ? letters.length : i === 1 ? digits.length : all.length)]);
  return chars.join("");
}

export const MAX_FAILED = 5, LOCK_MINUTES = 15;
