"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { guardProspect } from "@/lib/guard";
import { tooMany } from "@/lib/rate-limit";
import { applyWebFinding, researchWebsite, type WebResult } from "@/lib/services/web-research";
import { track } from "@/lib/track";

export interface WebActionResult { ok?: string; error?: string; result?: WebResult }

/** Lee la página pública del propio negocio para sugerir teléfono o correo. No guarda nada. */
export async function researchWebsiteAction(prospectId: string): Promise<WebActionResult> {
  try {
    const me = await guardProspect(prospectId);
    if (tooMany(`web:${me.id}`, 10, 60_000)) return { error: "Demasiadas búsquedas seguidas. Espera un minuto." };
    const db = await getDb();
    const [p] = await db.select({ website: prospects.website }).from(prospects).where(eq(prospects.id, prospectId));
    if (!p?.website) return { error: "Este prospecto no tiene sitio web registrado." };
    const result = await researchWebsite(p.website);
    await track("action", "Buscó contacto en el sitio web de un prospecto", { prospecto: prospectId, paginas: result.pages.length, telefonos: result.phones.length, correos: result.emails.length }, `/prospectos/${prospectId}`);
    return { result };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo leer el sitio web." }; }
}

export async function applyWebFindingAction(prospectId: string, kind: "phone" | "email", value: string, sourceUrl: string): Promise<WebActionResult> {
  try {
    const me = await guardProspect(prospectId);
    const db = await getDb();
    await applyWebFinding(db, await ensureDefaultOrg(db), me.email, prospectId, kind === "email" ? "email" : "phone", String(value).slice(0, 200), String(sourceUrl).slice(0, 500));
    await track("action", `Guardó un ${kind === "phone" ? "teléfono" : "correo"} encontrado en el sitio web`, { prospecto: prospectId }, `/prospectos/${prospectId}`);
    revalidatePath(`/prospectos/${prospectId}`); revalidatePath("/prospectos");
    return { ok: "Guardado, con la página de origen como evidencia." };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}
