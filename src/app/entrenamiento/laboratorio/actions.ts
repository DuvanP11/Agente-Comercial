"use server";
import { revalidatePath } from "next/cache";
import { providerFromEnv } from "@/lib/ai/provider";
import { aiReady } from "@/lib/ai/ready";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { tooMany } from "@/lib/rate-limit";
import { correctMessage, deleteLesson, getConversation, markOk, sendProspectMessage, setLessonActive, startSimulation } from "@/lib/services/simulator";
import { requireNotHunter } from "@/lib/session";
import { track } from "@/lib/track";

export interface LabMessage { id: string; role: "agent" | "prospect"; text: string; originalText: string | null; stage: string | null; status: string }
export interface LabResult { ok?: string; error?: string; conversationId?: string; messages?: LabMessage[]; handoff?: boolean; warnings?: string[] }

const fail = (e: unknown): LabResult => ({ error: e instanceof Error ? e.message : "Ocurrió un error." });
async function ctx() { const me = await requireNotHunter(); const db = await getDb(); return { me, db, org: await ensureDefaultOrg(db) }; }
async function snapshot(convId: string): Promise<LabMessage[]> {
  const { me, db, org } = await ctx();
  return (await getConversation(db, org, me, convId)).messages.map((m) => ({ id: m.id, role: m.role as "agent" | "prospect", text: m.text, originalText: m.originalText, stage: m.stage, status: m.status }));
}
function gate(userId: string): string | null {
  if (!aiReady()) return "La IA no está configurada (ver Agentes y skills).";
  return tooMany(`lab:${userId}`, 40, 60_000) ? "Demasiados mensajes seguidos. Espera un momento." : null;
}

export async function startSimulationAction(input: { business: string; category: string; city: string; behavior: string }): Promise<LabResult> {
  try {
    const { me, db, org } = await ctx(); const g = gate(me.id); if (g) return { error: g };
    const r = await startSimulation(db, org, me, input, providerFromEnv());
    await track("action", "Inició una conversación de prueba con el agente", undefined, "/entrenamiento/laboratorio");
    return { conversationId: r.id, messages: await snapshot(r.id), warnings: r.warnings };
  } catch (e) { return fail(e); }
}

export async function sendMessageAction(convId: string, text: string): Promise<LabResult> {
  try {
    const { me, db, org } = await ctx(); const g = gate(me.id); if (g) return { error: g };
    const r = await sendProspectMessage(db, org, me, convId, text, providerFromEnv());
    return { conversationId: convId, messages: await snapshot(convId), handoff: r.handoff, warnings: r.warnings };
  } catch (e) { return { ...fail(e), conversationId: convId, messages: await snapshot(convId).catch(() => undefined) }; }
}

export async function markOkAction(convId: string, messageId: string): Promise<LabResult> {
  try { const { me, db, org } = await ctx(); await markOk(db, org, me, messageId); revalidatePath("/entrenamiento/laboratorio"); return { conversationId: convId, messages: await snapshot(convId) }; }
  catch (e) { return fail(e); }
}

export async function correctAction(convId: string, messageId: string, instruction: string, rewrite: boolean, saveLesson: boolean): Promise<LabResult> {
  try {
    const { me, db, org } = await ctx(); if (rewrite) { const g = gate(me.id); if (g) return { error: g }; }
    const r = await correctMessage(db, org, me, messageId, instruction, { rewrite, saveLesson }, providerFromEnv());
    await track("admin", `Corrigió un mensaje del agente${saveLesson ? " y guardó una lección" : ""}`, undefined, "/entrenamiento/laboratorio");
    revalidatePath("/entrenamiento/laboratorio"); revalidatePath("/entrenamiento");
    return { ok: [r.rewritten ? "Mensaje reescrito." : null, r.lessonId ? "Lección guardada: los agentes la aplicarán desde ahora." : null].filter(Boolean).join(" "), conversationId: convId, messages: await snapshot(convId), warnings: r.warnings };
  } catch (e) { return fail(e); }
}

export async function toggleLessonAction(id: string, active: boolean): Promise<LabResult> {
  try { const { me, db, org } = await ctx(); await setLessonActive(db, org, me.email, id, active); revalidatePath("/entrenamiento/laboratorio"); return { ok: active ? "Lección activada." : "Lección desactivada." }; }
  catch (e) { return fail(e); }
}
export async function deleteLessonAction(id: string): Promise<LabResult> {
  try { const { me, db, org } = await ctx(); await deleteLesson(db, org, me.email, id); revalidatePath("/entrenamiento/laboratorio"); return { ok: "Lección eliminada." }; }
  catch (e) { return fail(e); }
}
