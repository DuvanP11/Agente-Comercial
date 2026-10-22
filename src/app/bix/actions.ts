"use server";
import { revalidatePath } from "next/cache";
import { providerFromEnv } from "@/lib/ai/provider";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { onlyMine } from "@/lib/guard";
import { launchLeads, notifyChat, saveChatWebhook, setBixReady, testChatWebhook, conversationDetail, type LaunchResult } from "@/lib/services/bix";
import { requireManager, requireUser } from "@/lib/session";
import { viewerOf } from "@/lib/services/scope";
import { track } from "@/lib/track";

export interface BixResult { ok?: string; error?: string }
const fail = (e: unknown): BixResult => ({ error: e instanceof Error ? e.message : "Ocurrió un error." });
async function ctx() { const db = await getDb(); return { db, org: await ensureDefaultOrg(db) }; }

export async function setReadyAction(ready: boolean): Promise<BixResult> {
  const me = await requireManager();
  try {
    const { db, org } = await ctx();
    await setBixReady(db, org, me, ready, providerFromEnv());
    revalidatePath("/bix");
    await track("admin", ready ? "Marcó a Bix como listo" : "Apagó a Bix", undefined, "/bix");
    return { ok: ready ? "Bix está listo." : "Bix quedó apagado: no escribirá a nadie." };
  } catch (e) { return fail(e); }
}

export async function saveWebhookAction(url: string): Promise<BixResult> {
  const me = await requireManager();
  try {
    const { db, org } = await ctx();
    await saveChatWebhook(db, org, me.id, url);
    revalidatePath("/bix");
    await track("admin", url.trim() ? "Guardó el webhook de Google Chat de Bix" : "Quitó el webhook de Google Chat de Bix", undefined, "/bix");
    return { ok: url.trim() ? "Webhook guardado (cifrado)." : "Webhook eliminado." };
  } catch (e) { return fail(e); }
}

export async function testWebhookAction(): Promise<BixResult> {
  await requireManager();
  try { const { db, org } = await ctx(); await testChatWebhook(db, org); return { ok: "Mensaje de prueba enviado: míralo en el espacio de Google Chat." }; }
  catch (e) { return fail(e); }
}

export async function launchAction(prospectIds: string[]): Promise<{ results: LaunchResult[]; error?: string }> {
  const me = await requireUser();
  try {
    const { db, org } = await ctx();
    const mine = new Set(await onlyMine(prospectIds.slice(0, 10)));
    const allowed = prospectIds.slice(0, 10).filter((id) => mine.has(id));
    const results = await launchLeads(db, org, me, allowed, providerFromEnv());
    revalidatePath("/bix");
    await track("action", `Entregó ${results.filter((r) => r.ok).length} lead(s) a Bix`, undefined, "/bix");
    return { results };
  } catch (e) { return { results: [], error: e instanceof Error ? e.message : "Ocurrió un error." }; }
}

export async function retryChatAction(convId: string): Promise<BixResult> {
  const me = await requireUser();
  try {
    const { db, org } = await ctx();
    await conversationDetail(db, org, viewerOf(me), convId); // el Hunter solo reintenta lo suyo
    const r = await notifyChat(db, convId);
    revalidatePath("/bix");
    return r.ok ? { ok: "Aviso enviado a Google Chat." } : { error: r.error };
  } catch (e) { return fail(e); }
}
