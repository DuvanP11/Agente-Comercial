"use server";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { assignOwner, assignUnowned } from "@/lib/services/ownership";
import { requireNotHunter } from "@/lib/session";
import { track } from "@/lib/track";

export interface OwnerResult { ok?: string; error?: string }

/** Cambiar el responsable de un prospecto: solo los roles que ven todo (no el Hunter). */
export async function assignOwnerAction(prospectId: string, ownerId: string): Promise<OwnerResult> {
  const me = await requireNotHunter();
  try {
    const db = await getDb();
    await assignOwner(db, await ensureDefaultOrg(db), me.email, prospectId, ownerId || null);
    await track("action", "Cambió el responsable de un prospecto", { prospecto: prospectId, responsable: ownerId || "sin asignar" }, `/prospectos/${prospectId}`);
    revalidatePath(`/prospectos/${prospectId}`); revalidatePath("/prospectos");
    return { ok: "Responsable actualizado." };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo asignar." }; }
}

export async function assignUnownedAction(ownerId: string): Promise<OwnerResult> {
  const me = await requireNotHunter();
  try {
    const db = await getDb();
    const n = await assignUnowned(db, await ensureDefaultOrg(db), me.email, ownerId);
    await track("admin", `Asignó ${n} prospecto(s) sin responsable`, { responsable: ownerId, cantidad: n }, "/prospectos");
    revalidatePath("/prospectos"); revalidatePath("/analizar");
    return { ok: `Listo: se asignaron ${n} prospecto(s).` };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo asignar." }; }
}
