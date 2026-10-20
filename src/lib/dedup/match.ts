import {
  FREE_MAIL_DOMAINS, normalizeAddress, normalizeDomain, normalizeEmail,
  normalizeName, normalizeNit, normalizePhone,
} from "./normalize";

export interface CompanyRecord {
  id: string;
  /** De dónde viene el registro de referencia: define el mensaje al usuario. */
  origin: "existing_client" | "prospect" | "contacted" | "opportunity" | "archived";
  name: string;
  legalName?: string | null;
  nit?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  sourceId?: string | null; // p.ej. place_id de Google
}

export type MatchField = "nit" | "source_id" | "domain" | "phone" | "email" | "name+city" | "name";

export interface MatchReason {
  field: MatchField;
  candidateValue: string;
  referenceValue: string;
}

/**
 * - exact: identificador fuerte coincide (NIT, id de fuente, dominio, teléfono, correo corporativo).
 * - probable: solo coincidencia aproximada de nombre → requiere revisión humana.
 */
export type MatchLevel = "exact" | "probable";

export interface DuplicateMatch {
  level: MatchLevel;
  reference: CompanyRecord;
  reasons: MatchReason[];
  /** Similitud de nombre 0..1, informativa; nunca decide sola una fusión. */
  nameSimilarity: number;
}

/** Distancia de Levenshtein → similitud 0..1. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

const NAME_PROBABLE_THRESHOLD = 0.85;

export function compareRecords(candidate: CompanyRecord, ref: CompanyRecord): DuplicateMatch | null {
  const reasons: MatchReason[] = [];
  const push = (field: MatchField, c: string, r: string) => reasons.push({ field, candidateValue: c, referenceValue: r });

  const cNit = normalizeNit(candidate.nit), rNit = normalizeNit(ref.nit);
  if (cNit && cNit === rNit) push("nit", cNit, rNit);

  if (candidate.sourceId && candidate.sourceId === ref.sourceId) push("source_id", candidate.sourceId, ref.sourceId);

  const cDom = normalizeDomain(candidate.website), rDom = normalizeDomain(ref.website);
  if (cDom && cDom === rDom) push("domain", cDom, rDom);

  const cPhone = normalizePhone(candidate.phone), rPhone = normalizePhone(ref.phone);
  if (cPhone && cPhone === rPhone) push("phone", cPhone, rPhone);

  const cMail = normalizeEmail(candidate.email), rMail = normalizeEmail(ref.email);
  const mailDomain = cMail.split("@")[1];
  if (cMail && cMail === rMail && !FREE_MAIL_DOMAINS.has(mailDomain)) push("email", cMail, rMail);

  const cName = normalizeName(candidate.name), rName = normalizeName(ref.name);
  const nameSim = similarity(cName, rName);
  const sameCity = !!candidate.city && !!ref.city &&
    normalizeName(candidate.city) === normalizeName(ref.city);
  const sameAddress = !!normalizeAddress(candidate.address) &&
    normalizeAddress(candidate.address) === normalizeAddress(ref.address);

  // Nombre idéntico + misma dirección es identificador fuerte; nombre solo/ciudad, no.
  if (cName && cName === rName && sameAddress) push("name+city", cName, rName);

  const strong = reasons.length > 0;
  if (strong) return { level: "exact", reference: ref, reasons, nameSimilarity: nameSim };

  if (cName && nameSim >= NAME_PROBABLE_THRESHOLD && (sameCity || !candidate.city || !ref.city)) {
    push(sameCity ? "name+city" : "name", cName, rName);
    return { level: "probable", reference: ref, reasons, nameSimilarity: nameSim };
  }
  return null;
}

/** Devuelve las coincidencias ordenadas: primero exactas, luego por similitud. */
export function findDuplicates(candidate: CompanyRecord, references: CompanyRecord[]): DuplicateMatch[] {
  return references
    .filter((r) => r.id !== candidate.id)
    .map((r) => compareRecords(candidate, r))
    .filter((m): m is DuplicateMatch => m !== null)
    .sort((a, b) => (a.level === b.level ? b.nameSimilarity - a.nameSimilarity : a.level === "exact" ? -1 : 1));
}

export const DUPLICATE_MESSAGES = {
  exact: "Este cliente ya está registrado en PIBOX. Se excluye de los nuevos prospectos para evitar duplicados.",
  probable: "Posible duplicado detectado. Revisa ambos registros antes de decidir.",
} as const;
