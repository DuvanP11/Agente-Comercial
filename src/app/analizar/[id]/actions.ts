"use server";
import { guardProspect } from "@/lib/guard";
import { track } from "@/lib/track";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { saveAssessment, setQualification } from "@/lib/services/analysis";
import { providerFromEnv } from "@/lib/ai/provider";
import { proposeAssessment } from "@/lib/services/agents";
import type { QualificationProposal } from "@/lib/agents/qualification";
import { DEFAULT_WEIGHTS, type CriterionKey } from "@/lib/scoring/score";

export interface AnalysisState { error?: string; ok?: string }

export async function saveAction(prospectId: string, _: AnalysisState, fd: FormData): Promise<AnalysisState> {
  const input: Partial<Record<CriterionKey, unknown>> = {};
  for (const key of Object.keys(DEFAULT_WEIGHTS) as CriterionKey[]) {
    const kind = String(fd.get(`${key}_kind`) ?? "unknown");
    if (kind === "unknown") continue;
    input[key] = {
      kind, value: Number(fd.get(`${key}_value`) ?? 0),
      evidenceIds: fd.getAll(`${key}_ev`).map(String), note: String(fd.get(`${key}_note`) ?? "").slice(0, 500) || undefined,
    };
  }
  try {
    await guardProspect(prospectId);
    const db = await getDb();
    const s = await saveAssessment(db, await ensureDefaultOrg(db), prospectId, input, "usuario");
    revalidatePath(`/analizar/${prospectId}`);
    await track("action", "Guardó la valoración de un prospecto", { prospecto: prospectId, prioridad: s.priority }, `/analizar/${prospectId}`);
    return { ok: s.priority === null ? "Guardado. Información insuficiente para calcular prioridad." : `Guardado. Prioridad ${s.priority}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

export async function qualifyAction(prospectId: string, qualified: boolean) {
  const db = await getDb();
  try { await guardProspect(prospectId); await setQualification(db, await ensureDefaultOrg(db), prospectId, qualified, "usuario"); }
  catch (e) { return e instanceof Error ? e.message : "Error"; }
  revalidatePath(`/analizar/${prospectId}`);
  return null;
}


export interface ProposeResult { ok: boolean; error?: string; warnings: string[]; proposal?: QualificationProposal }

/** La IA propone la valoración. NO se guarda nada: el formulario la carga y la persona decide. */
export async function proposeAction(prospectId: string): Promise<ProposeResult> {
  try {
    await guardProspect(prospectId);
    const db = await getDb();
    const r = await proposeAssessment(db, await ensureDefaultOrg(db), prospectId, providerFromEnv(), "usuario");
    if (r.ok) await track("action", "Pidió una propuesta de valoración a la IA", { prospecto: prospectId }, `/analizar/${prospectId}`);
    return { ok: r.ok, error: r.error, warnings: r.warnings, proposal: r.output };
  } catch (e) {
    console.error("proposeAction falló:", e);
    return { ok: false, error: "No se pudo generar la propuesta.", warnings: [] };
  }
}
