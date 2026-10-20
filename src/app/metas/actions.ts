"use server";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { createGoal, deleteGoal } from "@/lib/services/goals";

export async function addGoal(_: { error?: string; ok?: boolean }, fd: FormData) {
  try {
    const db = await getDb();
    await createGoal(db, await ensureDefaultOrg(db), Object.fromEntries(fd), "usuario");
    revalidatePath("/metas");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la meta." };
  }
}

export async function removeGoal(id: string) {
  const db = await getDb();
  await deleteGoal(db, await ensureDefaultOrg(db), id, "usuario");
  revalidatePath("/metas");
}
