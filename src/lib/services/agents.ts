import { and, desc, eq } from "drizzle-orm";
import { getGuidance, getScoringConfig, DEFAULT_SCORING } from "./settings";
import { scoreProspect, type CriterionAssessment, type CriterionKey } from "../scoring/score";
import { runAgent, type RunResult } from "../agents/core";
import { draftingAgent } from "../agents/drafting";
import { qualificationAgent, type QualificationProposal } from "../agents/qualification";
import { searchInterpreter, type InterpretedSearch } from "../agents/searchInterpreter";
import type { AiProvider } from "../ai/provider";
import { looksEnglish } from "../ai/guards";
import type { Db } from "../db/client";
import { agentRuns, evidence, prospects } from "../db/schema";
import { loadCp, saveDraft } from "./campaigns";

/**
 * Minimización de datos (Ley 1581): al proveedor de IA NO se le envían teléfonos ni correos, solo si existen.
 * El modelo recibe nombre, rubro, ciudad, dirección y el sitio web público del negocio.
 */
const REDACT = new Set(["phone", "email"]);

export function interpretSearch(db: Db, orgId: string, text: string, provider: AiProvider | null, actor: string): Promise<RunResult<InterpretedSearch>> {
  return runAgent(db, orgId, searchInterpreter, { text }, provider, { actor });
}

export async function proposeAssessment(db: Db, orgId: string, prospectId: string, provider: AiProvider | null, actor: string): Promise<RunResult<QualificationProposal>> {
  const [p] = await db.select().from(prospects).where(and(eq(prospects.id, prospectId), eq(prospects.orgId, orgId)));
  if (!p) return { runId: null, ok: false, warnings: [], error: "Prospecto no encontrado." };
  if (p.status === "excluded_duplicate") return { runId: null, ok: false, warnings: [], error: "Este prospecto está excluido por duplicado; no se califica." };
  const ev = await db.select().from(evidence).where(eq(evidence.entityId, prospectId));
  const guidance = await getGuidance(db, orgId);
  return runAgent(db, orgId, qualificationAgent, {
    guidance,
    prospect: { name: p.name, category: p.category, city: p.city, address: p.address, hasPhone: !!p.phoneKey, hasEmail: !!p.emailKey, website: p.website },
    evidence: ev.map((e) => ({ id: e.id, field: e.field, value: REDACT.has(e.field) ? "[registrado]" : e.observedValue, source: e.sourceName, verification: e.verification })),
  }, provider, { actor, entityType: "prospect", entityId: prospectId });
}

/** Genera un borrador con IA para un prospecto de una campaña. Se guarda SIEMPRE como borrador sin aprobar. */
export async function draftForCampaignProspect(db: Db, orgId: string, cpId: string, provider: AiProvider | null, actor: string, revisionRequest: string | null = null): Promise<RunResult<{ body: string }>> {
  let row;
  try { row = await loadCp(db, orgId, cpId); } catch (e) { return { runId: null, ok: false, warnings: [], error: e instanceof Error ? e.message : "No se encontró el registro." }; }
  const { p, c } = row;
  if (p.doNotContact) return { runId: null, ok: false, warnings: [], error: "Este prospecto pidió no ser contactado." };
  if (c.status === "closed") return { runId: null, ok: false, warnings: [], error: "La campaña está cerrada." };
  const r = await runAgent(db, orgId, draftingAgent, {
    guidance: await getGuidance(db, orgId),
    prospect: { name: p.name, city: p.city, category: p.category },
    campaign: { objective: c.objective, valueProposition: c.valueProposition, baseMessage: c.template },
    channel: "whatsapp", revisionRequest: revisionRequest?.trim() || null,
  }, provider, { actor, entityType: "campaign_prospect", entityId: cpId });
  if (r.ok && r.output) await saveDraft(db, orgId, cpId, r.output.body); // borrador; la aprobación sigue siendo humana
  return r;
}

export function listRuns(db: Db, orgId: string, limit = 30) {
  return db.select().from(agentRuns).where(eq(agentRuns.orgId, orgId)).orderBy(desc(agentRuns.startedAt)).limit(limit);
}


// ---------------------------------------------------------------------------------------------
// Lectura de varios resultados a la vez (vista previa; NO guarda ninguna valoración)
// ---------------------------------------------------------------------------------------------

const QUALIFICATION = "qualification";
const CACHE_MS = 24 * 3600_000;

export function previewScore(p: QualificationProposal, cfg: { weights: Record<CriterionKey, number>; minCoverage: number } = DEFAULT_SCORING) {
  const map: Partial<Record<CriterionKey, CriterionAssessment>> = {};
  for (const a of p.assessments) map[a.criterion] = { value: a.value, kind: a.kind, evidenceIds: a.evidenceIds, note: a.note };
  return scoreProspect(map, cfg.weights, cfg.minCoverage);
}

/** Lo más útil que dijo el modelo, en una línea: su resumen o la nota de un criterio con base. */
function headline(p: QualificationProposal): string {
  if (p.summary) return p.summary;
  const note = p.assessments.find((a) => a.origin === "model" && a.kind !== "unknown" && a.note)?.note;
  return note ?? "";
}

/** Análisis guardados antes de exigir español pueden traer texto en inglés: no se muestra. */
export function dropEnglish(p: QualificationProposal): QualificationProposal {
  return { summary: looksEnglish(p.summary ?? "") ? "" : p.summary, assessments: p.assessments.map((a) => (looksEnglish(a.note ?? "") ? { ...a, note: "" } : a)) };
}

/** Última propuesta de calificación ya hecha para un prospecto (para cargarla sin volver a llamar a la IA). */
export async function latestQualification(db: Db, orgId: string, prospectId: string): Promise<{ proposal: QualificationProposal; at: Date } | null> {
  const [r] = await db.select().from(agentRuns).where(and(
    eq(agentRuns.orgId, orgId), eq(agentRuns.agent, QUALIFICATION), eq(agentRuns.entityId, prospectId), eq(agentRuns.status, "completed"),
  )).orderBy(desc(agentRuns.startedAt)).limit(1);
  return r?.output ? { proposal: dropEnglish(r.output as QualificationProposal), at: r.startedAt } : null;
}

export interface Reading {
  prospectId: string;
  /** analyzed = se llamó a la IA ahora · cached = ya existía un análisis reciente · skipped = no se analizó (motivo) · error */
  state: "analyzed" | "cached" | "skipped" | "error";
  priority: number | null; coverage: number; unknownCount: number; headline: string; warnings: string[];
  /** Criterios con base y criterios sin base, con su nombre en español (para explicar por qué falta prioridad). */
  known: string[]; unknown: string[];
  reason?: string; analyzedAt?: string;
}
export interface BatchResult { readings: Reading[]; analyzed: number; cached: number; pending: number; stopped?: string }

const EMPTY = { priority: null, coverage: 0, unknownCount: 0, headline: "", warnings: [] as string[], known: [] as string[], unknown: [] as string[] };
const split = (sc: ReturnType<typeof previewScore>) => ({ known: sc.breakdown.filter((b) => b.contribution !== null).map((b) => b.label), unknown: sc.breakdown.filter((b) => b.contribution === null).map((b) => b.label) });

/**
 * Analiza varios prospectos con la IA con límites duros: máximo `max` llamadas por lote, tope de tiempo,
 * reutiliza análisis de las últimas 24 h y se DETIENE si el proveedor llegó a su límite de uso.
 */
export async function analyzeBatch(
  db: Db, orgId: string, prospectIds: string[], provider: AiProvider | null, actor: string,
  opts: { max?: number; deadlineMs?: number; now?: () => number } = {},
): Promise<BatchResult> {
  const now = opts.now ?? Date.now;
  const max = opts.max ?? 8, deadline = now() + (opts.deadlineMs ?? 45_000);
  const ids = [...new Set(prospectIds)].slice(0, 60);
  const cfg = await getScoringConfig(db, orgId);
  const readings: Reading[] = [];
  let analyzed = 0, cached = 0, stopped: string | undefined;

  if (!provider) return { readings: ids.map((prospectId) => ({ prospectId, state: "error" as const, ...EMPTY, reason: "La IA no está configurada." })), analyzed: 0, cached: 0, pending: 0, stopped: "La IA no está configurada." };

  for (const id of ids) {
    const [p] = await db.select().from(prospects).where(and(eq(prospects.id, id), eq(prospects.orgId, orgId)));
    if (!p) { readings.push({ prospectId: id, state: "skipped", ...EMPTY, reason: "No encontrado." }); continue; }
    if (p.doNotContact) { readings.push({ prospectId: id, state: "skipped", ...EMPTY, reason: "Marcado «No contactar»." }); continue; }
    if (p.status === "excluded_duplicate") { readings.push({ prospectId: id, state: "skipped", ...EMPTY, reason: "Duplicado excluido." }); continue; }

    const prev = await latestQualification(db, orgId, id);
    if (prev && now() - prev.at.getTime() < CACHE_MS) {
      const sc = previewScore(prev.proposal, cfg);
      readings.push({ prospectId: id, state: "cached", priority: sc.priority, coverage: sc.coverage, unknownCount: sc.unknownCriteria.length, headline: headline(prev.proposal), warnings: [], ...split(sc), analyzedAt: prev.at.toISOString() });
      cached++; continue;
    }
    if (stopped) { readings.push({ prospectId: id, state: "skipped", ...EMPTY, reason: stopped }); continue; }
    if (analyzed >= max) { readings.push({ prospectId: id, state: "skipped", ...EMPTY, reason: "Límite por lote: pulsa de nuevo para continuar." }); continue; }
    if (now() > deadline) { stopped = "Se agotó el tiempo del lote: pulsa de nuevo para continuar."; readings.push({ prospectId: id, state: "skipped", ...EMPTY, reason: stopped }); continue; }

    const r = await proposeAssessment(db, orgId, id, provider, actor);
    if (r.ok && r.output) {
      const sc = previewScore(r.output, cfg);
      readings.push({ prospectId: id, state: "analyzed", priority: sc.priority, coverage: sc.coverage, unknownCount: sc.unknownCriteria.length, headline: headline(r.output), warnings: r.warnings, ...split(sc), analyzedAt: new Date(now()).toISOString() });
      analyzed++;
    } else {
      const rateLimited = /límite de uso|Ningún proveedor/i.test(r.error ?? "");
      readings.push({ prospectId: id, state: "error", ...EMPTY, reason: r.error ?? "Error." });
      if (rateLimited) stopped = "El proveedor de IA alcanzó su límite de uso: se detuvo el lote. Reintenta en unos minutos.";
    }
  }
  return { readings, analyzed, cached, pending: readings.filter((x) => x.state === "skipped" && /pulsa de nuevo|límite de uso/.test(x.reason ?? "")).length, stopped };
}
