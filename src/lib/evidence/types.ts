import { z } from "zod";

/** Naturaleza de una afirmación: nunca se mezclan hechos con inferencias. */
export const claimKind = z.enum([
  "confirmed",   // dato confirmado por una fuente
  "declared",    // declarado por el usuario
  "inferred",    // inferencia comercial
  "hypothesis",  // hipótesis por validar
  "unknown",     // desconocido
  "contradicted" // fuentes en conflicto
]);
export type ClaimKind = z.infer<typeof claimKind>;

export const verificationStatus = z.enum([
  "unverified",
  "format_valid", // solo se comprobó el formato; NO es verificación
  "source_observed",
  "user_confirmed",
]);

export const evidenceInput = z.object({
  entityType: z.enum(["prospect", "client", "contact"]),
  entityId: z.string().min(1),
  field: z.string().min(1),
  observedValue: z.string().min(1),
  sourceRef: z.string().min(1),   // URL o identificador de la fuente
  sourceName: z.string().min(1),  // p.ej. google_places
  method: z.enum(["api", "web_page", "user_input", "csv_import", "manual"]),
  observedAt: z.coerce.date(),
  verification: verificationStatus,
  limitations: z.string().optional(),
});
export type EvidenceInput = z.infer<typeof evidenceInput>;

/** Una afirmación comercial solo es "confirmed" si cita al menos una evidencia. */
export function validateClaim(kind: ClaimKind, evidenceIds: string[]): string | null {
  if (kind === "confirmed" && evidenceIds.length === 0) {
    return "Un dato confirmado debe citar al menos una evidencia.";
  }
  return null;
}

/** Detecta contradicciones: mismo campo, valores normalizados distintos entre fuentes. */
export function findContradictions(
  items: { field: string; value: string; sourceName: string }[],
  normalize: (field: string, v: string) => string = (_f, v) => v.trim().toLowerCase(),
) {
  const byField = new Map<string, Map<string, string[]>>();
  for (const it of items) {
    const vals = byField.get(it.field) ?? new Map<string, string[]>();
    const key = normalize(it.field, it.value);
    vals.set(key, [...(vals.get(key) ?? []), it.sourceName]);
    byField.set(it.field, vals);
  }
  return [...byField.entries()]
    .filter(([, vals]) => vals.size > 1)
    .map(([field, vals]) => ({ field, values: [...vals.entries()].map(([value, sources]) => ({ value, sources })) }));
}
