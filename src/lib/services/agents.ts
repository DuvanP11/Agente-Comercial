import { and, desc, eq } from "drizzle-orm";
import { runAgent, type RunResult } from "../agents/core";
import { draftingAgent } from "../agents/drafting";
import { qualificationAgent, type QualificationProposal } from "../agents/qualification";
import { searchInterpreter, type InterpretedSearch } from "../agents/searchInterpreter";
import type { AiProvider } from "../ai/provider";
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
  return runAgent(db, orgId, qualificationAgent, {
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
