"use server";
import { revalidatePath } from "next/cache";
import { providerFromEnv } from "@/lib/ai/provider";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { onlyMine } from "@/lib/guard";
import { analyzeAndSaveBatch, type AnalyzeSaveResult } from "@/lib/services/analysis-batch";
import { requireUser } from "@/lib/session";
import { track } from "@/lib/track";

/** Analiza con IA hasta 5 prospectos por llamada (el navegador repite la llamada hasta terminar). El Hunter solo puede analizar los suyos. */
export async function analyzeManyAction(prospectIds: string[], includeRated: boolean): Promise<AnalyzeSaveResult & { error?: string }> {
  await requireUser();
  try {
    const mine = new Set(await onlyMine(prospectIds.slice(0, 60)));
    const allowed = prospectIds.slice(0, 60).filter((id) => mine.has(id));
    const db = await getDb();
    const r = await analyzeAndSaveBatch(db, await ensureDefaultOrg(db), allowed, providerFromEnv(), { includeRated });
    if (r.saved > 0) { revalidatePath("/analizar"); await track("action", `Analizó con IA ${r.saved} prospecto(s)`, { guardados: r.saved, reemplazo: includeRated }, "/analizar"); }
    return r;
  } catch (e) {
    return { items: [], saved: 0, skipped: 0, failed: 0, pending: 0, error: e instanceof Error ? e.message : "No se pudo analizar." };
  }
}
