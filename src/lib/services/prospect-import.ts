import { normalizeEmail, normalizePhone } from "../dedup/normalize";
import type { RawProspect } from "../connectors/types";

export const PROSPECT_FIELDS = ["name", "category", "website", "phone", "email", "address", "city"] as const;
export type ProspectField = (typeof PROSPECT_FIELDS)[number];
export type ProspectMapping = Partial<Record<ProspectField, string>>;

const HINTS: Record<ProspectField, string[]> = {
  name: ["nombre comercial", "nombre", "empresa", "razon social", "razón social", "negocio"],
  category: ["categoria", "categoría", "sector", "actividad", "tipo"],
  website: ["web", "sitio", "dominio", "url", "pagina", "página"],
  phone: ["telefono", "teléfono", "celular", "movil", "móvil", "tel"],
  email: ["correo", "email", "e-mail", "mail"],
  address: ["direccion", "dirección"],
  city: ["ciudad", "municipio"],
};

export function suggestProspectMapping(headers: string[]): ProspectMapping {
  const m: ProspectMapping = {};
  const used = new Set<string>();
  for (const f of PROSPECT_FIELDS) {
    const hit = headers.find((h) => !used.has(h) && HINTS[f].includes(h.toLowerCase().trim())) ??
      headers.find((h) => !used.has(h) && HINTS[f].some((x) => h.toLowerCase().includes(x)));
    if (hit) { m[f] = hit; used.add(hit); }
  }
  return m;
}

export interface ProspectPreviewRow { line: number; values: Partial<Record<ProspectField, string>>; errors: string[]; warnings: string[] }

export function previewProspects(rows: Record<string, string>[], mapping: ProspectMapping): ProspectPreviewRow[] {
  return rows.map((r, i) => {
    const values: ProspectPreviewRow["values"] = {};
    for (const f of PROSPECT_FIELDS) { const c = mapping[f]; if (c) values[f] = (r[c] ?? "").trim(); }
    const errors: string[] = [], warnings: string[] = [];
    if (!values.name) errors.push("Falta el nombre de la empresa.");
    if (values.phone && !normalizePhone(values.phone)) warnings.push("Teléfono no reconocido: no se usará para deduplicar.");
    if (values.email && !normalizeEmail(values.email)) warnings.push("Correo con formato inválido: no se usará para deduplicar.");
    return { line: i + 2, values, errors, warnings };
  });
}

/** Convierte filas válidas en prospectos normalizados. Vacío = null, nunca inventado. */
export function toRawProspects(preview: ProspectPreviewRow[], fileName: string, now = new Date()): RawProspect[] {
  return preview.filter((p) => p.errors.length === 0).map(({ values: v }) => ({
    name: v.name!, category: v.category || null, website: v.website || null, phone: v.phone || null,
    email: v.email || null, address: v.address || null, city: v.city || null,
    sourceName: "csv_import", sourceId: null, sourceUrl: `archivo:${fileName.slice(0, 120)}`,
    consultedAt: now, isDemo: false, method: "csv_import" as const,
  }));
}
