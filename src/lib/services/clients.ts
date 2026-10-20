import { and, eq, isNull } from "drizzle-orm";
import { normalizeDomain, normalizeEmail, normalizeName, normalizeNit, normalizePhone } from "../dedup/normalize";
import type { Db } from "../db/client";
import { auditLog, clients } from "../db/schema";

export const CLIENT_FIELDS = [
  "externalId", "name", "legalName", "nit", "website", "phone", "email",
  "address", "city", "commercialStatus", "accountOwner", "lastContactAt",
] as const;
export type ClientField = (typeof CLIENT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ClientField, string>>;

const HINTS: Record<ClientField, string[]> = {
  externalId: ["id", "identificador", "codigo", "código"],
  name: ["nombre comercial", "nombre", "empresa", "razon social", "razón social", "cliente"],
  legalName: ["nombre legal", "razon social", "razón social"],
  nit: ["nit", "documento"],
  website: ["web", "sitio", "dominio", "url", "pagina"],
  phone: ["telefono", "teléfono", "celular", "movil", "móvil", "tel"],
  email: ["correo", "email", "e-mail", "mail"],
  address: ["direccion", "dirección"],
  city: ["ciudad", "municipio"],
  commercialStatus: ["estado"],
  accountOwner: ["responsable", "asesor", "ejecutivo"],
  lastContactAt: ["ultimo contacto", "último contacto", "fecha"],
};

/** Sugiere un mapeo de columnas; el usuario siempre puede corregirlo antes de guardar. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const field of CLIENT_FIELDS) {
    const match = headers.find((h) => !used.has(h) && HINTS[field].some((hint) => h.toLowerCase().trim() === hint)) ??
      headers.find((h) => !used.has(h) && HINTS[field].some((hint) => h.toLowerCase().includes(hint)));
    if (match) { mapping[field] = match; used.add(match); }
  }
  return mapping;
}

export interface PreviewRow {
  line: number;
  values: Partial<Record<ClientField, string>>;
  errors: string[];
  warnings: string[];
}

export function previewImport(rows: Record<string, string>[], mapping: ColumnMapping): PreviewRow[] {
  return rows.map((r, i) => {
    const values: PreviewRow["values"] = {};
    for (const f of CLIENT_FIELDS) {
      const col = mapping[f];
      if (col) values[f] = (r[col] ?? "").trim();
    }
    const errors: string[] = [], warnings: string[] = [];
    if (!values.name) errors.push("Falta el nombre comercial.");
    if (values.email && !normalizeEmail(values.email)) warnings.push("Correo con formato inválido: no se usará para deduplicar.");
    if (values.phone && !normalizePhone(values.phone)) warnings.push("Teléfono no reconocido: no se usará para deduplicar.");
    if (values.nit && !normalizeNit(values.nit)) warnings.push("NIT no reconocido: no se usará para deduplicar.");
    return { line: i + 2, values, errors, warnings };
  });
}

export function clientKeys(v: Partial<Record<ClientField, string | null | undefined>>) {
  return {
    nameKey: normalizeName(v.name),
    nitKey: normalizeNit(v.nit),
    domainKey: normalizeDomain(v.website) || normalizeDomain(v.email),
    phoneKey: normalizePhone(v.phone),
    emailKey: normalizeEmail(v.email),
  };
}

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Guarda solo filas sin errores. Devuelve cuántas se guardaron y cuáles se omitieron. */
export async function commitImport(db: Db, orgId: string, preview: PreviewRow[], actor: string) {
  const batchId = crypto.randomUUID();
  const valid = preview.filter((p) => p.errors.length === 0);
  const skipped = preview.filter((p) => p.errors.length > 0).map((p) => ({ line: p.line, errors: p.errors }));

  if (valid.length) {
    await db.insert(clients).values(valid.map(({ values: v }) => ({
      orgId,
      externalId: v.externalId || null,
      name: v.name!,
      legalName: v.legalName || null,
      nit: v.nit || null,
      website: v.website || null,
      phone: v.phone || null,
      email: v.email || null,
      address: v.address || null,
      city: v.city || null,
      commercialStatus: v.commercialStatus || null,
      accountOwner: v.accountOwner || null,
      lastContactAt: parseDate(v.lastContactAt),
      importBatchId: batchId,
      ...clientKeys(v),
    })));
  }
  await db.insert(auditLog).values({
    orgId, actor, action: "clients.import", entity: batchId,
    detail: { imported: valid.length, skipped: skipped.length },
  });
  return { batchId, imported: valid.length, skipped };
}

export function listClients(db: Db, orgId: string) {
  return db.select().from(clients).where(and(eq(clients.orgId, orgId), isNull(clients.archivedAt)));
}
