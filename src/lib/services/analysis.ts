import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditLog, evidence, prospects } from "../db/schema";
import { validateClaim } from "../evidence/types";
import { getScoringConfig } from "./settings";
import { criterionAssessment, scoreProspect, DEFAULT_WEIGHTS, type CriterionAssessment, type CriterionKey, type ScoreResult } from "../scoring/score";

export type StoredScore = ScoreResult & {
  assessments: Partial<Record<CriterionKey, CriterionAssessment>>;
  assessedAt: string; assessedBy: string;
};

/** Guarda la valoración manual de los criterios y calcula el puntaje de forma reproducible. */
export async function saveAssessment(
  db: Db, orgId: string, prospectId: string,
  input: Partial<Record<CriterionKey, unknown>>, actor: string,
): Promise<StoredScore> {
  const [p] = await db.select().from(prospects).where(and(eq(prospects.id, prospectId), eq(prospects.orgId, orgId)));
  if (!p) throw new Error("Prospecto no encontrado.");
  if (p.status === "excluded_duplicate") throw new Error("Este prospecto está excluido por duplicado; no se califica.");

  const ownEvidence = new Set((await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.entityId, prospectId))).map((e) => e.id));
  const clean: Partial<Record<CriterionKey, CriterionAssessment>> = {};
  for (const key of Object.keys(DEFAULT_WEIGHTS) as CriterionKey[]) {
    const raw = input[key];
    if (raw === undefined) continue;
    const parsed = criterionAssessment.safeParse(raw);
    if (!parsed.success) throw new Error(`Criterio ${key}: ${parsed.error.issues[0].message}`);
    const a = parsed.data;
    const err = validateClaim(a.kind, a.evidenceIds);
    if (err) throw new Error(`Criterio ${key}: ${err}`);
    if (a.evidenceIds.some((id) => !ownEvidence.has(id))) throw new Error(`Criterio ${key}: cita una evidencia que no pertenece a este prospecto.`);
    clean[key] = a;
  }
  const cfg = await getScoringConfig(db, orgId);
  const result = scoreProspect(clean, cfg.weights, cfg.minCoverage);
  const stored: StoredScore = { ...result, assessments: clean, assessedAt: new Date().toISOString(), assessedBy: actor };
  await db.update(prospects).set({ scoreJson: stored }).where(eq(prospects.id, prospectId));
  await db.insert(auditLog).values({ orgId, actor, action: "prospect.assessed", entity: prospectId, detail: { priority: result.priority, coverage: result.coverage } });
  return stored;
}

/** Decisión humana de calificar. Exige puntaje calculable: sin información suficiente no se califica. */
export async function setQualification(db: Db, orgId: string, prospectId: string, qualified: boolean, actor: string) {
  const [p] = await db.select().from(prospects).where(and(eq(prospects.id, prospectId), eq(prospects.orgId, orgId)));
  if (!p) throw new Error("Prospecto no encontrado.");
  if (p.status === "excluded_duplicate" || p.status === "needs_review") throw new Error("Resuelve primero el duplicado de este prospecto.");
  if (qualified) {
    const s = p.scoreJson as StoredScore | null;
    if (!s || s.priority === null) throw new Error("No hay información suficiente para calificar: completa la valoración de criterios.");
    // La IA puede valorar en lote, pero calificar es decisión de una persona que revisó esa valoración.
    if (s.assessedBy === "IA (sin revisar)") throw new Error("Esta valoración la hizo la IA y nadie la ha revisado: ábrela con «Revisar», ajústala si hace falta y guárdala antes de calificar.");
  }
  if (p.status === "contacted" || p.status === "archived") throw new Error(`El prospecto está ${p.status}; no se cambia su estado desde aquí.`);
  await db.update(prospects).set({ status: qualified ? "qualified" : "new" }).where(eq(prospects.id, prospectId));
  await db.insert(auditLog).values({ orgId, actor, action: qualified ? "prospect.qualified" : "prospect.unqualified", entity: prospectId });
}

export async function evidenceFor(db: Db, prospectId: string) {
  return db.select().from(evidence).where(and(eq(evidence.entityId, prospectId), inArray(evidence.entityType, ["prospect"])));
}
