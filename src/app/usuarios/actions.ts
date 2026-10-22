"use server";
import { track } from "@/lib/track";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { createUser, resetPassword, updateUser } from "@/lib/services/users";
import { requireManager } from "@/lib/session";

export interface UserActionResult { ok?: string; error?: string; tempPassword?: string; who?: string }
const fail = (e: unknown): UserActionResult => ({ error: e instanceof Error ? e.message : "Ocurrió un error." });

export async function createUserAction(input: { name: string; email: string; username: string; role: string }): Promise<UserActionResult> {
  const admin = await requireManager();
  try {
    const db = await getDb();
    const r = await createUser(db, await ensureDefaultOrg(db), admin.id, input);
    revalidatePath("/usuarios");
    await track("admin", `Creó el usuario ${r.user.email} (${r.user.role})`, { usuario: r.user.id }, "/usuarios");
    return { ok: "Usuario creado.", tempPassword: r.tempPassword, who: `${r.user.name} (${r.user.email})` };
  } catch (e) { return fail(e); }
}

export async function updateUserAction(id: string, input: { name?: string; email?: string; username?: string; active?: boolean; role?: string }): Promise<UserActionResult> {
  const admin = await requireManager();
  try {
    const db = await getDb();
    await updateUser(db, await ensureDefaultOrg(db), admin.id, id, input);
    await track("admin", input.active === false ? "Desactivó un usuario" : input.active === true ? "Activó un usuario" : input.role ? `Cambió el rol de un usuario a ${input.role}` : "Editó un usuario", { usuario: id }, "/usuarios");
    revalidatePath("/usuarios");
    return { ok: input.role !== undefined && input.active === undefined && input.name === undefined && input.email === undefined && input.username === undefined ? "Rol actualizado: la persona deberá volver a iniciar sesión." : input.active === undefined ? "Cambios guardados." : input.active ? "Usuario activado." : "Usuario desactivado: sus sesiones se cerraron." };
  } catch (e) { return fail(e); }
}

export async function resetPasswordAction(id: string): Promise<UserActionResult> {
  const admin = await requireManager();
  try {
    const db = await getDb();
    const r = await resetPassword(db, await ensureDefaultOrg(db), admin.id, id);
    revalidatePath("/usuarios");
    await track("admin", `Restableció la contraseña de ${r.user.email}`, { usuario: id }, "/usuarios");
    return { ok: "Contraseña restablecida. Sus sesiones abiertas se cerraron.", tempPassword: r.tempPassword, who: `${r.user.name} (${r.user.email})` };
  } catch (e) { return fail(e); }
}
