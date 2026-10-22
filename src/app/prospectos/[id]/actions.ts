"use server";
import { guardProspect } from "@/lib/guard";
import { track } from "@/lib/track";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { activities, messages, prospects } from "@/lib/db/schema";
import { resolveReview } from "@/lib/services/prospects";
import { updateContact } from "@/lib/services/prospect-contact";
import { assertCanContact, registerAttempt, setOutcome } from "@/lib/services/contact-tracking";
import { isChannel } from "@/lib/contact-tracking";
import { whatsappLink } from "@/lib/contact-links";

export async function resolveDuplicate(reviewId: string, decision: "excluded" | "linked" | "not_duplicate", prospectId: string) {
  await guardProspect(prospectId);
  await resolveReview(await getDb(), reviewId, decision, "usuario");
  revalidatePath(`/prospectos/${prospectId}`);
}

/** Registra que el usuario ABRIÓ WhatsApp con el texto. No hay forma de saber si lo envió. */
export async function openWhatsApp(prospectId: string, body: string): Promise<{ url?: string; error?: string }> {
  try { await guardProspect(prospectId); } catch { return { error: "Prospecto no encontrado." }; }
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const [p] = await db.select().from(prospects).where(eq(prospects.id, prospectId));
  if (!p || !p.phoneKey) return { error: "El prospecto no tiene un teléfono con formato válido." };
  if (p.doNotContact) return { error: "Este prospecto pidió no ser contactado." };
  try { await assertCanContact(db, org, p); } catch (e) { return { error: e instanceof Error ? e.message : "No se puede contactar." }; }
  const url = whatsappLink(p.phoneKey, body);
  if (!url) return { error: "Número inválido para WhatsApp." };
  if (!body.trim()) return { error: "El mensaje está vacío." };
  const [m] = await db.insert(messages).values({ orgId: org, prospectId, channel: "whatsapp", body, status: "draft" }).returning();
  await db.insert(activities).values({ orgId: org, prospectId, type: "whatsapp_opened", actor: "usuario", detail: { messageId: m.id, note: "Se abrió el chat; el envío lo hace el usuario." } });
  await registerAttempt(db, org, prospectId, { channel: "whatsapp", activity: false }, "usuario");
  await track("action", "Abrió WhatsApp desde la ficha de un prospecto", { prospecto: prospectId }, `/prospectos/${prospectId}`);
  revalidatePath(`/prospectos/${prospectId}`);
  return { url };
}

export interface ContactState { error?: string; ok?: string; warnings?: string[] }

export async function saveContact(prospectId: string, _: ContactState, fd: FormData): Promise<ContactState> {
  try {
    await guardProspect(prospectId);
    const db = await getDb();
    const r = await updateContact(db, await ensureDefaultOrg(db), prospectId, {
      phone: String(fd.get("phone") ?? ""), website: String(fd.get("website") ?? ""), email: String(fd.get("email") ?? ""),
    }, "usuario");
    revalidatePath(`/prospectos/${prospectId}`);
    await track("action", "Completó datos de contacto de un prospecto", { prospecto: prospectId, campos: r.changed }, `/prospectos/${prospectId}`);
    return { ok: r.changed.length ? `Guardado (${r.changed.join(", ")}). Quedó registrado como dato ingresado por ti.` : "No hubo cambios.", warnings: r.warnings };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

export interface ManageState { ok?: string; error?: string }

/** Registra un intento de contacto hecho fuera de la app (llamada, correo, visita) o por WhatsApp. */
export async function registerAttemptAction(prospectId: string, channel: string, note: string): Promise<ManageState> {
  try {
    if (!isChannel(channel)) return { error: "Canal no válido." };
    await guardProspect(prospectId);
    const db = await getDb();
    const st = await registerAttempt(db, await ensureDefaultOrg(db), prospectId, { channel, note }, "usuario");
    revalidatePath(`/prospectos/${prospectId}`); revalidatePath("/prospectos");
    await track("action", `Registró un intento de contacto (${channel})`, { prospecto: prospectId }, `/prospectos/${prospectId}`);
    return { ok: st.key === "exhausted" ? "Intento registrado. Fue el último permitido: el prospecto queda como agotado si no responde." : `Intento registrado. Quedan ${st.attemptsLeft}.` };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo registrar." }; }
}

export async function setOutcomeAction(prospectId: string, outcome: string, note: string): Promise<ManageState> {
  try {
    await guardProspect(prospectId);
    const db = await getDb();
    await setOutcome(db, await ensureDefaultOrg(db), prospectId, outcome, note, "usuario");
    revalidatePath(`/prospectos/${prospectId}`); revalidatePath("/prospectos");
    await track("action", `Marcó el resultado «${outcome}» de un prospecto`, { prospecto: prospectId }, `/prospectos/${prospectId}`);
    return { ok: "Resultado guardado." };
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}
