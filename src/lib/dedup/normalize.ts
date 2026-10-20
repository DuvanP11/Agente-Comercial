import { parsePhoneNumberFromString } from "libphonenumber-js";

const LEGAL_SUFFIXES = /\b(s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?|ltda\.?|e\.?\s?u\.?|s\.?\s?c\.?\s?a\.?|y cia|& cia|cia|sas|ltd|inc|llc|corp)\b/gi;

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Nombre comparable: sin tildes, sin sufijos legales, sin puntuación. */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return stripAccents(name)
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** NIT colombiano: solo dígitos, sin dígito de verificación (formato 900.123.456-7). */
export function normalizeNit(nit: string | null | undefined): string {
  if (!nit) return "";
  const raw = nit.trim();
  const withDv = raw.match(/^([\d.\s]+)-\s*\d$/);
  const body = withDv ? withDv[1] : raw;
  const digits = body.replace(/\D/g, "");
  return digits.length >= 6 ? digits : "";
}

/** Dominio sin protocolo, www ni ruta. Devuelve "" si no parece un dominio. */
export function normalizeDomain(input: string | null | undefined): string {
  if (!input) return "";
  let v = input.trim().toLowerCase();
  v = v.replace(/^mailto:/, "");
  if (v.includes("@") && !v.includes("/")) v = v.split("@")[1] ?? "";
  v = v.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  v = v.split(/[/?#:]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : "";
}

/** Separa un campo con varios teléfonos ("601 555 1234; 310 555 0000", "a / b", "a, b"). */
export function splitPhones(phone: string | null | undefined): string[] {
  if (!phone) return [];
  return [...new Set(phone.split(/[;/|\n]|,(?=\s*\+?\d)/).map((p) => p.trim()).filter(Boolean))];
}

/** Todos los teléfonos válidos de un campo, en E.164 y sin repetir. Solo valida formato, no que existan. */
export function normalizePhones(phone: string | null | undefined, defaultCountry: "CO" = "CO"): string[] {
  const out: string[] = [];
  for (const part of splitPhones(phone)) {
    const parsed = parsePhoneNumberFromString(part, defaultCountry);
    if (parsed && parsed.isValid() && !out.includes(parsed.number)) out.push(parsed.number);
  }
  return out;
}

/** El primer teléfono válido (el que usa WhatsApp). "" si ninguno lo es. */
export function normalizePhone(phone: string | null | undefined, defaultCountry: "CO" = "CO"): string {
  return normalizePhones(phone, defaultCountry)[0] ?? "";
}

/** ¿TODOS los números escritos son válidos? Sirve para validar lo que escribe el usuario. */
export function allPhonesValid(phone: string | null | undefined): boolean {
  const parts = splitPhones(phone);
  return parts.length > 0 && parts.every((p) => normalizePhones(p).length === 1);
}

export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return "";
  const v = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
}

/** Dominios de correo genéricos: no identifican a una empresa. */
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.es", "icloud.com", "live.com",
]);

export function normalizeAddress(address: string | null | undefined): string {
  if (!address) return "";
  return stripAccents(address)
    .toLowerCase()
    .replace(/\b(calle|cll|cl)\b/g, "calle")
    .replace(/\b(carrera|cra|kra|kr|cr)\b/g, "carrera")
    .replace(/\b(avenida|av|avda)\b/g, "avenida")
    .replace(/\b(numero|no|nro)\b\.?/g, "#")
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
