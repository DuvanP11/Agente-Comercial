"use server";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { saveAssessment, setQualification } from "@/lib/services/analysis";
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
    const db = await getDb();
    const s = await saveAssessment(db, await ensureDefaultOrg(db), prospectId, input, "usuario");
    revalidatePath(`/analizar/${prospectId}`);
    return { ok: s.priority === null ? "Guardado. Información insuficiente para calcular prioridad." : `Guardado. Prioridad ${s.priority}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

export async function qualifyAction(prospectId: string, qualified: boolean) {
  const db = await getDb();
  try { await setQualification(db, await ensureDefaultOrg(db), prospectId, qualified, "usuario"); }
  catch (e) { return e instanceof Error ? e.message : "Error"; }
  revalidatePath(`/analizar/${prospectId}`);
  return null;
}
