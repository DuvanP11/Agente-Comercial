"use server";
import { track } from "@/lib/track";
import { requireManager, requireNotHunter } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { resetScoringConfig, saveContactRules, saveHiddenModules, saveScoringConfig } from "@/lib/services/settings";

export interface ConfigState { ok?: string; error?: string }

export async function saveScoringAction(input: { weights: Record<string, number>; minCoverage: number }): Promise<ConfigState> {
  await requireNotHunter(); // el Hunter no usa este módulo
  try {
    const db = await getDb();
    const r = await saveScoringConfig(db, await ensureDefaultOrg(db), input, "usuario");
    revalidatePath("/configuracion"); revalidatePath("/analizar", "layout"); revalidatePath("/prospectos", "layout");
    await track("admin", "Cambió los pesos del puntaje", { recalculados: r.recalculated }, "/configuracion");
    return { ok: `Guardado. ${r.recalculated === 0 ? "Aún no hay prospectos valorados." : `Se recalculó la prioridad de ${r.recalculated} prospecto(s) ya valorado(s); sus valoraciones no cambiaron.`}` };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}

export async function resetScoringAction(): Promise<ConfigState> {
  await requireNotHunter(); // el Hunter no usa este módulo
  try {
    const db = await getDb();
    const r = await resetScoringConfig(db, await ensureDefaultOrg(db), "usuario");
    revalidatePath("/configuracion"); revalidatePath("/analizar", "layout"); revalidatePath("/prospectos", "layout");
    return { ok: `Valores de arranque restaurados (${r.recalculated} prospecto(s) recalculado(s)).` };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo restaurar." }; }
}

export async function saveContactRulesAction(maxAttempts: number): Promise<ConfigState> {
  await requireNotHunter(); // el Hunter no usa este módulo
  try {
    const db = await getDb();
    const r = await saveContactRules(db, await ensureDefaultOrg(db), { maxAttempts }, "usuario");
    revalidatePath("/configuracion"); revalidatePath("/prospectos", "layout");
    await track("admin", "Cambió el máximo de intentos de contacto", { maximo: r.maxAttempts }, "/configuracion");
    return { ok: `Guardado: máximo ${r.maxAttempts} intento${r.maxAttempts === 1 ? "" : "s"} por prospecto. Se aplica desde ahora, también a los que ya estaban contactados.` };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}

export async function saveModulesAction(hidden: string[]): Promise<ConfigState & { hidden?: string[] }> {
  const me = await requireManager();
  try {
    const db = await getDb();
    const list = await saveHiddenModules(db, await ensureDefaultOrg(db), me.id, hidden);
    revalidatePath("/", "layout");
    await track("admin", "Cambió los módulos visibles del menú", { apagados: list.length }, "/configuracion");
    return { ok: "Guardado.", hidden: list };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}
