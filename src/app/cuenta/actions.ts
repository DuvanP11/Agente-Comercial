"use server";
import { redirect } from "next/navigation";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { homeFor } from "@/lib/permissions";
import { changeOwnPassword, updateOwnName } from "@/lib/services/users";
import { track } from "@/lib/track";
import { endSession, requireUser, startSession } from "@/lib/session";

export interface AccountState { ok?: string; error?: string }

export async function saveNameAction(_: AccountState, fd: FormData): Promise<AccountState> {
  const me = await requireUser();
  try { const db = await getDb(); await updateOwnName(db, await ensureDefaultOrg(db), me.id, String(fd.get("name") ?? "")); return { ok: "Nombre actualizado." }; }
  catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}

export async function changePasswordAction(_: AccountState, fd: FormData): Promise<AccountState> {
  const me = await requireUser();
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "La confirmación no coincide con la nueva contraseña." };
  try {
    const db = await getDb();
    const u = await changeOwnPassword(db, await ensureDefaultOrg(db), me.id, String(fd.get("current") ?? ""), next);
    await track("action", "Cambió su contraseña");
    await startSession(u); // sesión nueva: la versión cambió y las demás sesiones quedan cerradas
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo cambiar la contraseña." }; }
  redirect(`${homeFor("hunter")}?clave=cambiada`);
}

export async function logoutAction() { await track("logout", "Cerró sesión"); await endSession(); redirect("/login"); }
