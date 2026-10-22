import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { conversationAgent, SCENARIOS, type ConversationOutput, type ScenarioKey } from "../agents/conversation";
import { runAgent } from "../agents/core";
import type { AiProvider } from "../ai/provider";
import type { Db } from "../db/client";
import { auditLog, simConversations, simMessages, trainingLessons } from "../db/schema";
import { MAX_LESSON_CHARS } from "../training";
import { getGuidance } from "./settings";

const scenarioInput = z.object({
  business: z.string().trim().min(2, "Escribe el nombre del negocio de prueba.").max(120),
  category: z.string().trim().max(80).optional().transform((v) => v || null),
  city: z.string().trim().max(80).optional().transform((v) => v || null),
  behavior: z.string().optional(),
});
export interface Scenario { business: string; category: string | null; city: string | null; persona: string | null; behavior: string | null }

export type SimMessage = typeof simMessages.$inferSelect;
const MAX_TURNS = 40;

async function agentReply(db: Db, orgId: string, provider: AiProvider | null, actor: string, scenario: Scenario, history: { role: "agent" | "prospect"; text: string }[], correction: { previousReply: string; instruction: string } | null, convId: string): Promise<{ ok: boolean; out?: ConversationOutput; error?: string; warnings: string[] }> {
  const guidance = await getGuidance(db, orgId);
  const call = (corr: typeof correction) => runAgent(db, orgId, conversationAgent, {
    // El agente NO sabe cómo te vas a comportar (persona): si lo supiera, actuaría distinto a como lo haría con un cliente real.
    scenario: { business: scenario.business, category: scenario.category, city: scenario.city, persona: null }, history, correction: corr, guidance,
  }, provider, { actor, entityType: "sim_conversation", entityId: convId });
  let r = await call(correction);
  // Si una barrera de seguridad rechazó la respuesta (precio inventado, repetida, en inglés…), el agente lo intenta una vez más sabiendo por qué.
  if (!r.ok && r.error?.startsWith("Respuesta rechazada") && !correction) {
    const lastAgent = [...history].reverse().find((h) => h.role === "agent")?.text ?? "";
    r = await call({ previousReply: lastAgent, instruction: `Tu respuesta anterior fue rechazada por una regla de seguridad (${r.error.replace(/^Respuesta rechazada: /, "").replace(/[\d$%]+/g, "…").slice(0, 200)}). Escribe otra que responda a lo último que dijo el cliente, sin cifras ni precios, y respete todas las reglas.` });
  }
  return { ok: r.ok, out: r.output, error: r.error, warnings: r.warnings };
}

async function load(db: Db, orgId: string, id: string) {
  const [c] = await db.select().from(simConversations).where(and(eq(simConversations.id, id), eq(simConversations.orgId, orgId)));
  if (!c) throw new Error("Conversación no encontrada.");
  const msgs = await db.select().from(simMessages).where(eq(simMessages.conversationId, id)).orderBy(asc(simMessages.createdAt), asc(simMessages.id));
  return { c, msgs, scenario: c.scenario as Scenario };
}

/** Empieza una conversación de prueba: el agente escribe el primer mensaje (saludo). Nada se envía a nadie. */
export async function startSimulation(db: Db, orgId: string, user: { id: string; name: string }, raw: unknown, provider: AiProvider | null) {
  const p = scenarioInput.safeParse(raw);
  if (!p.success) throw new Error(p.error.issues[0].message);
  const behavior = p.data.behavior && p.data.behavior in SCENARIOS ? p.data.behavior as ScenarioKey : null;
  const scenario: Scenario = { business: p.data.business, category: p.data.category, city: p.data.city, persona: behavior ? SCENARIOS[behavior] : null, behavior };
  const [c] = await db.insert(simConversations).values({ orgId, userId: user.id, userName: user.name, scenario }).returning();
  const r = await agentReply(db, orgId, provider, user.name, scenario, [], null, c.id);
  if (!r.ok || !r.out) { await db.delete(simConversations).where(eq(simConversations.id, c.id)); throw new Error(r.error ?? "La IA no pudo escribir el primer mensaje."); }
  await db.insert(simMessages).values({ conversationId: c.id, role: "agent", text: r.out.reply, stage: r.out.stage });
  return { id: c.id, warnings: r.warnings };
}

/** La persona (que hace de cliente potencial) escribe y el agente responde. */
export async function sendProspectMessage(db: Db, orgId: string, user: { id: string; name: string }, convId: string, text: string, provider: AiProvider | null) {
  const t = text.trim().slice(0, 600);
  if (!t) throw new Error("Escribe un mensaje.");
  const { c, msgs, scenario } = await load(db, orgId, convId);
  if (c.userId !== user.id) throw new Error("Esta conversación es de otra persona.");
  if (msgs.length >= MAX_TURNS) throw new Error("La conversación ya es muy larga: inicia otra.");
  const history = [...msgs.map((m) => ({ role: m.role as "agent" | "prospect", text: m.text })), { role: "prospect" as const, text: t }];
  const r = await agentReply(db, orgId, provider, user.name, scenario, history.slice(-24), null, convId);
  if (!r.ok || !r.out) throw new Error(r.error ?? "La IA no pudo responder.");
  // Marcas de tiempo explícitas y distintas: así el orden de lectura es siempre el correcto, aunque se guarden en el mismo milisegundo.
  const at = Date.now();
  await db.insert(simMessages).values({ conversationId: convId, role: "prospect", text: t, createdAt: new Date(at) });
  await db.insert(simMessages).values({ conversationId: convId, role: "agent", text: r.out.reply, stage: r.out.stage, createdAt: new Date(at + 1) });
  return { handoff: r.out.handoff, warnings: r.warnings };
}

export async function markOk(db: Db, orgId: string, user: { id: string }, messageId: string) {
  const m = await ownedAgentMessage(db, orgId, user.id, messageId);
  if (m.status === "corrected") throw new Error("Este mensaje ya se corrigió.");
  await db.update(simMessages).set({ status: "ok" }).where(eq(simMessages.id, messageId));
}

async function ownedAgentMessage(db: Db, orgId: string, userId: string, messageId: string) {
  const [m] = await db.select().from(simMessages).where(eq(simMessages.id, messageId));
  if (!m || m.role !== "agent") throw new Error("Mensaje no encontrado.");
  const { c } = await load(db, orgId, m.conversationId);
  if (c.userId !== userId) throw new Error("Esta conversación es de otra persona.");
  return m;
}

/**
 * Corrige un mensaje del agente: la persona dice qué debió hacer. Con `rewrite` el agente reescribe ese mensaje aplicando la instrucción
 * (queda el original guardado); con `saveLesson` la instrucción pasa a ser una lección que se suma a las instrucciones de los agentes.
 */
export async function correctMessage(
  db: Db, orgId: string, user: { id: string; name: string }, messageId: string, instruction: string, opts: { rewrite: boolean; saveLesson: boolean }, provider: AiProvider | null,
) {
  const text = instruction.replace(/\s+/g, " ").trim();
  if (text.length < 8) throw new Error("Explica qué debe corregir (al menos una frase corta).");
  if (text.length > MAX_LESSON_CHARS) throw new Error(`La corrección es muy larga (máximo ${MAX_LESSON_CHARS} caracteres): resúmela en una regla clara.`);
  if (!opts.rewrite && !opts.saveLesson) throw new Error("Elige al menos una opción: reescribir el mensaje o guardarlo como lección.");
  const m = await ownedAgentMessage(db, orgId, user.id, messageId);
  const { msgs, scenario } = await load(db, orgId, m.conversationId);
  const idx = msgs.findIndex((x) => x.id === m.id);
  const before = msgs.slice(0, Math.max(idx, 0)).map((x) => ({ role: x.role as "agent" | "prospect", text: x.text })); // lo que se dijo ANTES de ese mensaje
  let newText: string | null = null, warnings: string[] = [];
  if (opts.rewrite) {
    const r = await agentReply(db, orgId, provider, user.name, scenario, before.slice(-24), { previousReply: m.text, instruction: text }, m.conversationId);
    if (!r.ok || !r.out) throw new Error(r.error ?? "La IA no pudo reescribir el mensaje con esa corrección.");
    newText = r.out.reply; warnings = r.warnings;
  }
  if (newText !== null) await db.update(simMessages).set({ text: newText, originalText: m.originalText ?? m.text, status: "corrected" }).where(eq(simMessages.id, messageId));
  else await db.update(simMessages).set({ status: "corrected" }).where(eq(simMessages.id, messageId));
  let lessonId: string | null = null;
  if (opts.saveLesson) {
    const [l] = await db.insert(trainingLessons).values({ orgId, text, createdBy: user.name, context: { agente: m.originalText ?? m.text, etapa: m.stage, escenario: scenario.behavior, negocio: scenario.category } }).returning({ id: trainingLessons.id });
    lessonId = l.id;
    await db.insert(auditLog).values({ orgId, actor: user.id, action: "training.lesson_add", entity: l.id, detail: { chars: text.length } });
  }
  return { rewritten: newText, lessonId, warnings };
}

export async function getConversation(db: Db, orgId: string, user: { id: string }, id: string) {
  const { c, msgs, scenario } = await load(db, orgId, id);
  if (c.userId !== user.id) throw new Error("Esta conversación es de otra persona.");
  return { id: c.id, scenario, messages: msgs, createdAt: c.createdAt };
}

export async function listConversations(db: Db, orgId: string, user: { id: string }, limit = 8) {
  const rows = await db.select({ id: simConversations.id, scenario: simConversations.scenario, createdAt: simConversations.createdAt, n: sql<number>`(select count(*)::int from sim_messages m where m.conversation_id = ${simConversations.id})` })
    .from(simConversations).where(and(eq(simConversations.orgId, orgId), eq(simConversations.userId, user.id))).orderBy(desc(simConversations.createdAt)).limit(limit);
  return rows.map((r) => ({ ...r, scenario: r.scenario as Scenario }));
}

/** ¿Cuánto acierta el agente? Mensajes del agente revisados por las personas del equipo. */
export async function simStats(db: Db, orgId: string) {
  const rows = await db.select({ status: simMessages.status, n: sql<number>`count(*)::int` }).from(simMessages)
    .innerJoin(simConversations, eq(simConversations.id, simMessages.conversationId)).where(and(eq(simConversations.orgId, orgId), eq(simMessages.role, "agent"))).groupBy(simMessages.status);
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  const ok = n("ok"), corrected = n("corrected"), pending = n("pending");
  return { ok, corrected, pending, reviewed: ok + corrected, accuracy: ok + corrected ? Math.round((ok / (ok + corrected)) * 100) : null };
}

export async function listLessons(db: Db, orgId: string) {
  return db.select().from(trainingLessons).where(eq(trainingLessons.orgId, orgId)).orderBy(desc(trainingLessons.createdAt)).limit(200);
}
export async function setLessonActive(db: Db, orgId: string, actor: string, id: string, active: boolean) {
  const r = await db.update(trainingLessons).set({ active }).where(and(eq(trainingLessons.id, id), eq(trainingLessons.orgId, orgId))).returning({ id: trainingLessons.id });
  if (!r.length) throw new Error("Lección no encontrada.");
  await db.insert(auditLog).values({ orgId, actor, action: active ? "training.lesson_on" : "training.lesson_off", entity: id });
}
export async function deleteLesson(db: Db, orgId: string, actor: string, id: string) {
  const r = await db.delete(trainingLessons).where(and(eq(trainingLessons.id, id), eq(trainingLessons.orgId, orgId))).returning({ id: trainingLessons.id });
  if (!r.length) throw new Error("Lección no encontrada.");
  await db.insert(auditLog).values({ orgId, actor, action: "training.lesson_delete", entity: id });
}
