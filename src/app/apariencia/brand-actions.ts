"use server";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { isKind } from "@/lib/brand";
import { removeBrandAsset, saveBrandAsset, setBrandTint } from "@/lib/services/brand";

export interface BrandState { ok?: string; error?: string }

export async function saveBrandAction(kind: string, dataUrl: string): Promise<BrandState> {
  try {
    if (!isKind(kind)) return { error: "Tipo de imagen no válido." };
    const db = await getDb();
    await saveBrandAsset(db, await ensureDefaultOrg(db), kind, dataUrl, "usuario");
    revalidatePath("/", "layout");
    return { ok: "Imagen guardada. La pestaña del navegador puede tardar unos segundos en actualizar su ícono." };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}

export async function removeBrandAction(kind: string): Promise<BrandState> {
  try {
    if (!isKind(kind)) return { error: "Tipo de imagen no válido." };
    const db = await getDb();
    await removeBrandAsset(db, await ensureDefaultOrg(db), kind, "usuario");
    revalidatePath("/", "layout");
    return { ok: "Se volvió a la imagen de Pibox." };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo quitar." }; }
}

export async function setTintAction(tint: boolean): Promise<BrandState> {
  try {
    const db = await getDb();
    await setBrandTint(db, await ensureDefaultOrg(db), tint, "usuario");
    revalidatePath("/", "layout");
    return { ok: tint ? "El logo ahora usa el color principal del tema." : "El logo se muestra con sus colores originales." };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}
