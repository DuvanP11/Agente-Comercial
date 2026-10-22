"use server";
import { track } from "@/lib/track";
import { requireNotHunter } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { isKind } from "@/lib/brand";
import { removeBrandAsset, saveBrandAsset, setBrandTint } from "@/lib/services/brand";

export interface BrandState { ok?: string; error?: string }

export async function saveBrandAction(kind: string, dataUrl: string): Promise<BrandState> {
  await requireNotHunter(); // el Hunter no usa este módulo
  try {
    if (!isKind(kind)) return { error: "Tipo de imagen no válido." };
    const db = await getDb();
    await saveBrandAsset(db, await ensureDefaultOrg(db), kind, dataUrl, "usuario");
    revalidatePath("/", "layout");
    await track("admin", `Cambió el ${kind === "logo" ? "logo" : "ícono de la pestaña"}`, undefined, "/apariencia");
    return { ok: "Imagen guardada. La pestaña del navegador puede tardar unos segundos en actualizar su ícono." };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}

export async function removeBrandAction(kind: string): Promise<BrandState> {
  await requireNotHunter(); // el Hunter no usa este módulo
  try {
    if (!isKind(kind)) return { error: "Tipo de imagen no válido." };
    const db = await getDb();
    await removeBrandAsset(db, await ensureDefaultOrg(db), kind, "usuario");
    revalidatePath("/", "layout");
    return { ok: "Se volvió a la imagen de Pibox." };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo quitar." }; }
}

export async function setTintAction(kind: string, tint: boolean): Promise<BrandState> {
  await requireNotHunter(); // el Hunter no usa este módulo
  try {
    if (!isKind(kind)) return { error: "Tipo de imagen no válido." };
    const db = await getDb();
    await setBrandTint(db, await ensureDefaultOrg(db), kind, tint, "usuario");
    revalidatePath("/", "layout");
    return { ok: tint ? "Ahora usa el color principal del tema." : "Se muestra con sus colores originales." };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}
