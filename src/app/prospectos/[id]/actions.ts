"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { activities, messages, prospects } from "@/lib/db/schema";
import { resolveReview } from "@/lib/services/prospects";
import { updateContact } from "@/lib/services/prospect-contact";
import { whatsappLink } from "@/lib/contact-links";

export async function resolveDuplicate(reviewId: string, decision: "excluded" | "linked" | "not_duplicate", prospectId: string) {
  await resolveReview(await getDb(), reviewId, decision, "usuario");
  revalidatePath(`/prospectos/${prospectId}`);
}

/** Registra que el usuario ABRIÓ WhatsApp con el texto. No hay forma de saber si lo envió. */
export async function openWhatsApp(prospectId: string, body: string): Promise<{ url?: string; error?: string }> {
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const [p] = await db.select().from(prospects).where(eq(prospects.id, prospectId));
  if (!p || !p.phoneKey) return { error: "El prospecto no tiene un teléfono con formato válido." };
  const url = whatsappLink(p.phoneKey, body);
  if (!url) return { error: "Número inválido para WhatsApp." };
  if (!body.trim()) return { error: "El mensaje está vacío." };
  const [m] = await db.insert(messages).values({ orgId: org, prospectId, channel: "whatsapp", body, status: "draft" }).returning();
  await db.insert(activities).values({ orgId: org, prospectId, type: "whatsapp_opened", actor: "usuario", detail: { messageId: m.id, note: "Se abrió el chat; el envío lo hace el usuario." } });
  revalidatePath(`/prospectos/${prospectId}`);
  return { url };
}

export interface ContactState { error?: string; ok?: string; warnings?: string[] }

export async function saveContact(prospectId: string, _: ContactState, fd: FormData): Promise<ContactState> {
  try {
    const db = await getDb();
    const r = await updateContact(db, await ensureDefaultOrg(db), prospectId, {
      phone: String(fd.get("phone") ?? ""), website: String(fd.get("website") ?? ""), email: String(fd.get("email") ?? ""),
    }, "usuario");
    revalidatePath(`/prospectos/${prospectId}`);
    return { ok: r.changed.length ? `Guardado (${r.changed.join(", ")}). Quedó registrado como dato ingresado por ti.` : "No hubo cambios.", warnings: r.warnings };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
