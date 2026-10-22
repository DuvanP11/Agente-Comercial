"use server";
import { track } from "@/lib/track";
import { requireNotHunter } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { saveTraining } from "@/lib/services/settings";

export async function saveTrainingAction(input: unknown): Promise<{ ok?: string; error?: string }> {
  await requireNotHunter(); // el Hunter no usa este módulo
  try {
    const db = await getDb();
    await saveTraining(db, await ensureDefaultOrg(db), input, "usuario");
    revalidatePath("/entrenamiento");
    await track("admin", "Actualizó la guía de entrenamiento de IA", undefined, "/entrenamiento");
    return { ok: "Guardado. Se usa desde la próxima redacción o análisis." };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}
