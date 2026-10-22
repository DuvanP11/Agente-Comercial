"use server";
import { logError } from "@/lib/log";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { providerFromEnv } from "@/lib/ai/provider";
import { draftForCampaignProspect } from "@/lib/services/agents";
import { track } from "@/lib/track";
import { guardCampaign } from "@/lib/guard";
import { requireUser } from "@/lib/session";
import { viewerOf } from "@/lib/services/scope";
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

export async function updateCampaignAction(campaignId: string, input: { name: string; objective: string; valueProposition: string; template: string }): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await updateCampaign(db, org, campaignId, input, ACTOR); return { ok: "Campaña actualizada. Los mensajes ya generados no cambian: usa «Generar desde la plantilla» en cada prospecto para actualizarlos." } as ActionResult; }, "Editó una campaña")) as ActionResult;
}
export async function setCoverAction(campaignId: string, dataUrl: string | null): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await setCover(db, org, campaignId, dataUrl, ACTOR); return { ok: dataUrl ? "Portada guardada." : "Portada quitada." } as ActionResult; }, "Cambió la portada de una campaña")) as ActionResult;
}
export async function deleteAttachmentAction(campaignId: string, attachmentId: string): Promise<ActionResult> {
  return (await run(campaignId, async (db, org) => { await deleteAttachment(db, org, campaignId, attachmentId, ACTOR); return { ok: "Archivo eliminado." } as ActionResult; }, "Eliminó un archivo de una campaña")) as ActionResult;
}
