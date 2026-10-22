import { z } from "zod";
import { claimKind } from "../evidence/types";

/**
 * Criterios iniciales. Los pesos son configurables por organización; estos son
 * valores PROVISIONALES de arranque, no calibrados con datos de PIBOX.
 */
export const DEFAULT_WEIGHTS = {
  icp_fit: 20,
  logistics_need: 20,
  delivery_volume: 15,
  delivery_frequency: 10,
  geo_compatibility: 10,
  operational_viability: 5,
  contact_channel: 10,
  evidence_quality: 10,
} as const;
export type CriterionKey = keyof typeof DEFAULT_WEIGHTS;

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  icp_fit: "Ajuste al cliente ideal",
  logistics_need: "Necesidad logística observable",
  delivery_volume: "Volumen potencial de entregas",
  delivery_frequency: "Frecuencia potencial",
  geo_compatibility: "Compatibilidad geográfica",
  operational_viability: "Viabilidad operativa",
  contact_channel: "Canal de contacto disponible",
  evidence_quality: "Calidad de la evidencia",
};

export const criterionAssessment = z.object({
  /** 0..1. Se ignora cuando kind === "unknown". */
  value: z.number().min(0).max(1),
  kind: claimKind,
  evidenceIds: z.array(z.string()).default([]),
  note: z.string().optional(),
});
export type CriterionAssessment = z.infer<typeof criterionAssessment>;

export interface ScoreResult {
  /** Prioridad comercial 0..100 calculada SOLO sobre criterios con información. */
  priority: number | null;
  /** Peso con información / peso total, 0..1. Con poca cobertura, la prioridad es poco fiable. */
  coverage: number;
  /** Fracción del peso conocido respaldada por evidencia citada (no inferencias). */
  evidenceBacked: number;
  unknownCriteria: CriterionKey[];
  breakdown: { key: CriterionKey; label: string; weight: number; contribution: number | null; kind: string; note?: string }[];
}

/** Mínima cobertura para mostrar prioridad; por debajo, "información insuficiente". */
export const MIN_COVERAGE = 0.4;

export function scoreProspect(
  assessments: Partial<Record<CriterionKey, CriterionAssessment>>,
  weights: Record<CriterionKey, number> = { ...DEFAULT_WEIGHTS },
  minCoverage: number = MIN_COVERAGE,
): ScoreResult {
  const keys = Object.keys(weights) as CriterionKey[];
  const totalWeight = keys.reduce((s, k) => s + weights[k], 0);
  let knownWeight = 0, earned = 0, backedWeight = 0;
  const unknown: CriterionKey[] = [];

  const breakdown = keys.map((key) => {
    const a = assessments[key];
    const w = weights[key];
    if (!a || a.kind === "unknown") {
      unknown.push(key);
      return { key, label: CRITERION_LABELS[key], weight: w, contribution: null, kind: "unknown" };
    }
    knownWeight += w;
    earned += w * a.value;
    if (a.kind === "confirmed" && a.evidenceIds.length > 0) backedWeight += w;
    return { key, label: CRITERION_LABELS[key], weight: w, contribution: w * a.value, kind: a.kind, note: a.note };
  });

  const coverage = totalWeight ? knownWeight / totalWeight : 0;
  const priority = knownWeight > 0 && coverage >= minCoverage - 1e-9 ? Math.round((earned / knownWeight) * 100) : null;
  return {
    priority,
    coverage,
    evidenceBacked: knownWeight ? backedWeight / knownWeight : 0,
    unknownCriteria: unknown,
    breakdown,
  };
}
