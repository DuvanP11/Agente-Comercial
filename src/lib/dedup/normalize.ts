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

/** Teléfono en E.164. Asume Colombia si no trae prefijo. Solo valida formato, no que exista. */
export function normalizePhone(phone: string | null | undefined, defaultCountry: "CO" = "CO"): string {
  if (!phone) return "";
  const parsed = parsePhoneNumberFromString(phone, defaultCountry);
  return parsed && parsed.isValid() ? parsed.number : "";
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
