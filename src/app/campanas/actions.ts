"use server";
import { logError } from "@/lib/log";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { providerFromEnv } from "@/lib/ai/provider";
import { draftForCampaignProspect } from "@/lib/services/agents";
import { track } from "@/lib/track";
import { sendCampaignBatch, sendCampaignEmail, type SendOptions, type SendResult } from "@/lib/services/gmail";
import { guardCampaign } from "@/lib/guard";
import { requireUser } from "@/lib/session";
import { viewerOf } from "@/lib/services/scope";
import { ingestProspects } from "@/lib/services/prospects";
import { normalizeEmail } from "@/lib/dedup/normalize";
import { deleteAttachment, setCover } from "@/lib/services/campaign-media";
import {
  updateCampaign, addProspects, approveMessage, closeCampaign, createCampaign, generateDraft, openEmail, openWhatsApp, saveDraft,
  setCpStatus, setDoNotContact, setFollowUp,
} from "@/lib/services/campaigns";

const ACTOR = "usuario";
export interface ActionResult { error?: string; ok?: string; url?: string; repeatWarning?: string; warnings?: string[] }

async function ctx() { const db = await getDb(); return { db, org: await ensureDefaultOrg(db) }; }
const fail = (e: unknown): ActionResult => ({ error: e instanceof Error ? e.message : "Ocurrió un error." });

export async function createCampaignAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const me = await requireUser();
    const { db, org } = await ctx();
    id = (await createCampaign(db, org, {
      name: fd.get("name"), objective: fd.get("objective"), valueProposition: fd.get("valueProposition"), template: fd.get("template"),
    }, ACTOR, me.id)).id;
  } catch (e) { return fail(e); }
  await track("action", "Creó una campaña", { campana: id }, `/campanas/${id}`);
  redirect(`/campanas/${id}`);
}

/** Crea un cliente a mano (p. ej. para probar cómo se ve un mensaje o un correo) y lo suma a la campaña. */
export async function addManualProspectAction(campaignId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const me = await guardCampaign(campaignId);
    const name = String(fd.get("name") ?? "").trim().slice(0, 120), phone = String(fd.get("phone") ?? "").trim().slice(0, 30), emailRaw = String(fd.get("email") ?? "").trim();
    const city = String(fd.get("city") ?? "").trim().slice(0, 80), category = String(fd.get("category") ?? "").trim().slice(0, 80);
    if (!name) return { error: "Escribe el nombre del cliente." };
    if (!phone && !emailRaw) return { error: "Escribe al menos un teléfono o un correo." };
    if (phone && phone.replace(/\D/g, "").length < 7) return { error: "El teléfono no parece válido." };
    const email = emailRaw ? normalizeEmail(emailRaw) : null;
    if (emailRaw && !email) return { error: "El correo no parece válido." };
    const { db, org } = await ctx();
    const [o] = await ingestProspects(db, org, [{ name, category: category || null, website: null, phone: phone || null, email, address: null, city: city || null,
      sourceName: "Ingreso manual", sourceId: `manual-${crypto.randomUUID()}`, sourceUrl: null, consultedAt: new Date(), isDemo: false }], undefined, viewerOf(me));
    if (o.status !== "new") return { error: o.status === "needs_review" ? "Se parece a un prospecto que ya existe; revísalo en la Base de prospectos antes de sumarlo." : "Ya existe un prospecto con ese teléfono o correo (o no es tuyo). Usa otro dato para la prueba." };
    const r = await addProspects(db, org, campaignId, [o.prospectId], ACTOR, viewerOf(me));
    revalidatePath(`/campanas/${campaignId}`);
    await track("action", "Agregó un cliente manual a una campaña", { campana: campaignId }, `/campanas/${campaignId}`);
    return r.added ? { ok: `Listo: «${name}» quedó en la campaña.` } : { error: "Se creó el cliente pero no se pudo sumar a la campaña." };
  } catch (e) { return fail(e); }
}

export async function addProspectsAction(campaignId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const ids = fd.getAll("prospect").map(String);
    if (!ids.length) return { error: "Marca al menos un prospecto." };
    const me = await guardCampaign(campaignId);
    const { db, org } = await ctx();
    const r = await addProspects(db, org, campaignId, ids, ACTOR, viewerOf(me));
    revalidatePath(`/campanas/${campaignId}`);
    await track("action", `Agregó ${r.added} prospecto(s) a una campaña`, { campana: campaignId }, `/campanas/${campaignId}`);
    return { ok: `Se agregaron ${r.added} prospectos${r.skipped.length ? `; ${r.skipped.length} no eran elegibles` : ""}.` };
  } catch (e) { return fail(e); }
}

async function run<T>(campaignId: string, fn: (db: Awaited<ReturnType<typeof ctx>>["db"], org: string) => Promise<T>, label?: string): Promise<T | ActionResult> {
  try {
    await guardCampaign(campaignId);
    const { db, org } = await ctx(); const r = await fn(db, org); revalidatePath(`/campanas/${campaignId}`); revalidatePath("/campanas");
    // Se registra solo si la acción salió bien (los fallos de validación no cuentan como algo hecho).
    if (label && !(r && typeof r === "object" && "error" in (r as object) && (r as { error?: string }).error)) await track("action", label, { campana: campaignId }, `/campanas/${campaignId}`);
    return r;
  }
  catch (e) { return fail(e); }
}

export async function statusAction(campaignId: string, cpId: string, status: string): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await setCpStatus(db, org, cpId, status, ACTOR); return { ok: "Estado actualizado." } as ActionResult; }, "Cambió el estado de un prospecto en una campaña")) as ActionResult;
}
export async function followUpAction(campaignId: string, cpId: string, date: string, notes: string): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await setFollowUp(db, org, cpId, date, notes); return { ok: date ? "Seguimiento programado." : "Seguimiento quitado." } as ActionResult; }, "Programó un seguimiento")) as ActionResult;
}
export async function draftAction(campaignId: string, cpId: string, body: string): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await saveDraft(db, org, cpId, body); return { ok: "Borrador guardado (sin aprobar)." } as ActionResult; }, "Guardó un borrador de mensaje")) as ActionResult;
}
export async function generateAction(campaignId: string, cpId: string): Promise<ActionResult & { text?: string }> {
  return (await run(campaignId, async (db, org) => {
    const r = await generateDraft(db, org, cpId);
    const warnings = [...r.empty.map((v) => `No hay dato de «${v}» para este prospecto: revisa el texto.`), ...r.unknown.map((v) => `Variable desconocida {${v}}: corrígela antes de aprobar.`)];
    return { ok: "Borrador generado desde la plantilla.", text: r.text, warnings } as ActionResult & { text?: string };
  }, "Generó un mensaje desde la plantilla")) as ActionResult & { text?: string };
}
export async function approveAction(campaignId: string, cpId: string): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await approveMessage(db, org, cpId, ACTOR); return { ok: "Mensaje aprobado." } as ActionResult; }, "Aprobó un mensaje")) as ActionResult;
}
export async function whatsappAction(campaignId: string, cpId: string, confirmRepeat: boolean): Promise<ActionResult> {
  const r = (await run(campaignId, async (db, org) => openWhatsApp(db, org, cpId, ACTOR, confirmRepeat) as Promise<ActionResult>)) as ActionResult;
  if (r.url) await track("action", "Abrió WhatsApp desde una campaña", { campana: campaignId }, `/campanas/${campaignId}`); // solo si de verdad se abrió el chat
  return r;
}
export async function emailAction(campaignId: string, cpId: string, confirmRepeat: boolean): Promise<ActionResult> {
  const r = (await run(campaignId, async (db, org) => openEmail(db, org, cpId, ACTOR, confirmRepeat) as Promise<ActionResult>)) as ActionResult;
  if (r.url) await track("action", "Abrió el correo desde una campaña", { campana: campaignId }, `/campanas/${campaignId}`);
  return r;
}
export async function doNotContactAction(campaignId: string, prospectId: string, flag: boolean): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await setDoNotContact(db, org, prospectId, flag, null, ACTOR); revalidatePath(`/prospectos/${prospectId}`); return { ok: flag ? "Marcado como NO CONTACTAR." : "Se quitó la marca de no contactar." } as ActionResult; }, "Cambió la marca «No contactar»")) as ActionResult;
}
export async function closeCampaignAction(campaignId: string): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await closeCampaign(db, org, campaignId, ACTOR); return { ok: "Campaña cerrada." } as ActionResult; }, "Cerró una campaña")) as ActionResult;
}


/** La IA redacta un borrador; queda guardado SIN aprobar. La aprobación sigue siendo humana. */
export async function aiDraftAction(campaignId: string, cpId: string, revision: string): Promise<ActionResult & { text?: string }> {
  try {
    await guardCampaign(campaignId);
    const { db, org } = await ctx();
    const r = await draftForCampaignProspect(db, org, cpId, providerFromEnv(), ACTOR, revision || null);
    revalidatePath(`/campanas/${campaignId}`);
    return { ok: r.ok ? "Borrador generado con IA. Revísalo y apruébalo si está bien." : undefined, error: r.error, warnings: r.warnings, text: r.output?.body };
  } catch (e) {
    logError("aiDraftAction falló:", e);
    return { error: "No se pudo redactar el borrador." };
  }
}

export async function updateCampaignAction(campaignId: string, input: { name: string; objective: string; valueProposition: string; template: string; emailSubject?: string }): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await updateCampaign(db, org, campaignId, input, ACTOR); return { ok: "Campaña actualizada. Los mensajes ya generados no cambian: usa «Generar desde la plantilla» en cada prospecto para actualizarlos." } as ActionResult; }, "Editó una campaña")) as ActionResult;
}
export async function setCoverAction(campaignId: string, dataUrl: string | null): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await setCover(db, org, campaignId, dataUrl, ACTOR); return { ok: dataUrl ? "Portada guardada." : "Portada quitada." } as ActionResult; }, "Cambió la portada de una campaña")) as ActionResult;
}
export async function deleteAttachmentAction(campaignId: string, attachmentId: string): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await deleteAttachment(db, org, campaignId, attachmentId, ACTOR); return { ok: "Archivo eliminado." } as ActionResult; }, "Eliminó un archivo de una campaña")) as ActionResult;
}


const cleanOpts = (o: SendOptions): SendOptions => ({ attachmentIds: Array.isArray(o.attachmentIds) ? o.attachmentIds.filter((x) => typeof x === "string").slice(0, 12) : [], inlineImages: !!o.inlineImages, optOut: o.optOut !== false, allowRepeat: !!o.allowRepeat });

/** Envía UN correo (el mensaje aprobado de ese prospecto) desde el Gmail de quien tiene sesión. */
export async function gmailSendOneAction(campaignId: string, cpId: string, opts: SendOptions): Promise<SendResult> {
  try {
    const me = await guardCampaign(campaignId);
    const { db, org } = await ctx();
    const r = await sendCampaignEmail(db, org, { id: me.id, email: me.email, name: me.name }, cpId, cleanOpts(opts));
    if (r.ok) { await track("action", "Envió un correo desde su Gmail (campaña)", { campana: campaignId }, `/campanas/${campaignId}`); revalidatePath(`/campanas/${campaignId}`); }
    return r;
  } catch (e) { return { cpId, ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." }; }
}

/** Una tanda (máx. 8) de un envío masivo. El navegador repite la llamada hasta terminar y muestra el avance. */
export async function gmailSendBatchAction(campaignId: string, cpIds: string[], opts: SendOptions): Promise<{ results: SendResult[]; error?: string }> {
  try {
    const me = await guardCampaign(campaignId);
    const { db, org } = await ctx();
    const results = await sendCampaignBatch(db, org, { id: me.id, email: me.email, name: me.name }, campaignId, Array.isArray(cpIds) ? cpIds.filter((x) => typeof x === "string") : [], cleanOpts(opts));
    const okN = results.filter((r) => r.ok).length;
    if (okN) { await track("action", `Envió ${okN} correo(s) desde su Gmail (campaña)`, { campana: campaignId, enviados: okN, fallidos: results.length - okN }, `/campanas/${campaignId}`); revalidatePath(`/campanas/${campaignId}`); }
    return { results };
  } catch (e) { return { results: [], error: e instanceof Error ? e.message : "No se pudo enviar." }; }
}
