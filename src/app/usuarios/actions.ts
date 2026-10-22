"use server";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { createUser, resetPassword, updateUser } from "@/lib/services/users";
import { requireAdmin } from "@/lib/session";

export interface UserActionResult { ok?: string; error?: string; tempPassword?: string; who?: string }
const fail = (e: unknown): UserActionResult => ({ error: e instanceof Error ? e.message : "Ocurrió un error." });

export async function createUserAction(input: { name: string; email: string; username: string }): Promise<UserActionResult> {
  const admin = await requireAdmin();
  try {
    const db = await getDb();
    const r = await createUser(db, await ensureDefaultOrg(db), admin.id, input);
    revalidatePath("/usuarios");
    return { ok: "Usuario creado.", tempPassword: r.tempPassword, who: `${r.user.name} (${r.user.email})` };
  } catch (e) { return fail(e); }
}

export async function updateUserAction(id: string, input: { name?: string; email?: string; username?: string; active?: boolean }): Promise<UserActionResult> {
  const admin = await requireAdmin();
  try {
    const db = await getDb();
    await updateUser(db, await ensureDefaultOrg(db), admin.id, id, input);
    revalidatePath("/usuarios");
    return { ok: input.active === undefined ? "Cambios guardados." : input.active ? "Usuario activado." : "Usuario desactivado: sus sesiones se cerraron." };
  } catch (e) { return fail(e); }
}

export async function resetPasswordAction(id: string): Promise<UserActionResult> {
  const admin = await requireAdmin();
  try {
    const db = await getDb();
    const r = await resetPassword(db, await ensureDefaultOrg(db), admin.id, id);
    revalidatePath("/usuarios");
    return { ok: "Contraseña restablecida. Sus sesiones abiertas se cerraron.", tempPassword: r.tempPassword, who: `${r.user.name} (${r.user.email})` };
  } catch (e) { return fail(e); }
}
