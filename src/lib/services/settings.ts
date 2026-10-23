import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { DEFAULT_RULES, parseRules, type ContactRules } from "../contact-tracking";
import { combineGuidance, parseTraining, guidanceText, type Training } from "../training";
import { cleanHidden, DEFAULT_HIDDEN_MODULES } from "../nav";
import { auditLog, orgSettings, prospects, trainingLessons } from "../db/schema";
import { CRITERION_LABELS, DEFAULT_WEIGHTS, MIN_COVERAGE, scoreProspect, type CriterionAssessment, type CriterionKey } from "../scoring/score";

export interface ScoringConfig { weights: Record<CriterionKey, number>; minCoverage: number }

export const DEFAULT_SCORING: ScoringConfig = { weights: { ...DEFAULT_WEIGHTS }, minCoverage: MIN_COVERAGE };

const KEYS = Object.keys(DEFAULT_WEIGHTS) as CriterionKey[];
const schema = z.object({
  weights: z.record(z.string(), z.number()),
  minCoverage: z.number(),
});

/** Valida y completa: pesos enteros 0–100 (al menos uno > 0) y cobertura mínima entre 10 % y 90 %. Lanza con un mensaje claro. */
export function parseScoring(input: unknown): ScoringConfig {
  const r = schema.safeParse(input);
  if (!r.success) throw new Error("Configuración de puntaje inválida.");
  const weights = {} as Record<CriterionKey, number>;
  for (const k of KEYS) {
    const w = r.data.weights[k] ?? DEFAULT_WEIGHTS[k];
    if (!Number.isInteger(w) || w < 0 || w > 100) throw new Error(`${CRITERION_LABELS[k]}: el peso debe ser un número entero entre 0 y 100.`);
    weights[k] = w;
  }
  if (KEYS.every((k) => weights[k] === 0)) throw new Error("Al menos un criterio debe pesar más de 0.");
  const m = r.data.minCoverage;
  if (!(m >= 0.1 && m <= 0.9)) throw new Error("La cobertura mínima debe estar entre 10 % y 90 %.");
  return { weights, minCoverage: Math.round(m * 100) / 100 };
}

/** Lo guardado, o los valores de arranque si nunca se configuró (o si lo guardado no es válido). */
export async function getScoringConfig(db: Db, orgId: string): Promise<ScoringConfig> {
  const [row] = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId));
  if (!row?.scoring) return DEFAULT_SCORING;
  try { return parseScoring(row.scoring); } catch { return DEFAULT_SCORING; }
}

/** Guarda la configuración y recalcula el puntaje de los prospectos ya valorados con ella (sus valoraciones no cambian). */
export async function saveScoringConfig(db: Db, orgId: string, input: unknown, actor: string): Promise<{ config: ScoringConfig; recalculated: number }> {
  const config = parseScoring(input);
  const now = new Date();
  await db.insert(orgSettings).values({ orgId, scoring: config, updatedAt: now })
    .onConflictDoUpdate({ target: orgSettings.orgId, set: { scoring: config, updatedAt: now } });
  let recalculated = 0;
  for (const p of await db.select({ id: prospects.id, scoreJson: prospects.scoreJson }).from(prospects).where(eq(prospects.orgId, orgId))) {
    const s = p.scoreJson as ({ assessments?: Partial<Record<CriterionKey, CriterionAssessment>> } & Record<string, unknown>) | null;
    if (!s?.assessments) continue;
    const r = scoreProspect(s.assessments, config.weights, config.minCoverage);
    await db.update(prospects).set({ scoreJson: { ...s, ...r } }).where(eq(prospects.id, p.id));
    recalculated++;
  }
  await db.insert(auditLog).values({ orgId, actor, action: "settings.scoring", entity: orgId, detail: { weights: config.weights, minCoverage: config.minCoverage, recalculated } });
  return { config, recalculated };
}

export async function resetScoringConfig(db: Db, orgId: string, actor: string) {
  return saveScoringConfig(db, orgId, DEFAULT_SCORING, actor);
}

// ---------------------------------------------------------------------------------------------
// Entrenamiento de IA: guía escrita por el equipo (contexto y estilo para los agentes)
// ---------------------------------------------------------------------------------------------

export async function getTraining(db: Db, orgId: string): Promise<Training> {
  const [row] = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId));
  return parseTraining(row?.training);
}

export async function saveTraining(db: Db, orgId: string, input: unknown, actor: string): Promise<Training> {
  const t = parseTraining(input);
  const now = new Date();
  await db.insert(orgSettings).values({ orgId, training: t, updatedAt: now })
    .onConflictDoUpdate({ target: orgSettings.orgId, set: { training: t, updatedAt: now } });
  await db.insert(auditLog).values({ orgId, actor, action: "settings.training", entity: orgId, detail: { chars: guidanceText(t)?.length ?? 0 } });
  return t;
}

/** Texto que se añade a las instrucciones de los agentes (o null si el equipo no ha escrito nada). */
export async function getGuidance(db: Db, orgId: string): Promise<string | null> {
  const lessons = await db.select({ text: trainingLessons.text }).from(trainingLessons).where(and(eq(trainingLessons.orgId, orgId), eq(trainingLessons.active, true))).orderBy(desc(trainingLessons.createdAt)).limit(20);
  return combineGuidance(await getTraining(db, orgId), lessons.map((l) => l.text));
}

// ---------------------------------------------------------------------------------------------
// Reglas de contacto (máximo de intentos)
// ---------------------------------------------------------------------------------------------

export async function getContactRules(db: Db, orgId: string): Promise<ContactRules> {
  const [row] = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId));
  if (!row?.contactRules) return DEFAULT_RULES;
  try { return parseRules(row.contactRules); } catch { return DEFAULT_RULES; }
}

export async function saveContactRules(db: Db, orgId: string, input: unknown, actor: string): Promise<ContactRules> {
  const rules = parseRules(input);
  const now = new Date();
  await db.insert(orgSettings).values({ orgId, contactRules: rules, updatedAt: now })
    .onConflictDoUpdate({ target: orgSettings.orgId, set: { contactRules: rules, updatedAt: now } });
  await db.insert(auditLog).values({ orgId, actor, action: "settings.contact_rules", entity: orgId, detail: rules });
  return rules;
}

// ---------------------------------------------------------------------------------------------
// Módulos del menú encendidos / apagados
// ---------------------------------------------------------------------------------------------
export async function getHiddenModules(db: Db, orgId: string): Promise<string[]> {
  const [row] = await db.select({ h: orgSettings.hiddenModules }).from(orgSettings).where(eq(orgSettings.orgId, orgId));
  return row?.h == null ? [...DEFAULT_HIDDEN_MODULES] : cleanHidden(row.h);
}
export async function saveHiddenModules(db: Db, orgId: string, actor: string, hidden: unknown): Promise<string[]> {
  const list = cleanHidden(hidden);
  await db.insert(orgSettings).values({ orgId }).onConflictDoNothing();
  await db.update(orgSettings).set({ hiddenModules: list, updatedAt: new Date() }).where(eq(orgSettings.orgId, orgId));
  await db.insert(auditLog).values({ orgId, actor, action: "modules.visibility", entity: orgId, detail: { hidden: list } });
  return list;
}
