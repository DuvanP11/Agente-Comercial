import { eq } from "drizzle-orm";
import type { ZodType } from "zod";
import { AgentOutputError, parseJsonOutput } from "../ai/guards";
import { AiError, type AiProvider } from "../ai/provider";
import type { Db } from "../db/client";
import { agentRuns } from "../db/schema";

/** Rechazo determinista: el modelo respondió bien el formato, pero el contenido viola una regla del negocio. */
export class AgentRejected extends Error { constructor(message: string) { super(message); this.name = "AgentRejected"; } }

export interface AgentDef<I, O> {
  id: string;
  label: string;
  description: string;
  /** Herramientas que el agente puede usar. Hoy ninguno: no envía mensajes, no escribe datos ni llama servicios. */
  allowedTools: readonly string[];
  inputSchema: ZodType<I>;
  outputSchema: ZodType<O>;
  build(input: I): { system: string; user: string };
  /** Barrera determinista sobre la salida; puede corregir (con avisos) o lanzar AgentRejected. */
  validate(input: I, output: O): { output: O; warnings: string[] };
}

export interface RunResult<O> { runId: string | null; ok: boolean; output?: O; warnings: string[]; error?: string }

const MAX_INPUT_BYTES = 20_000;

/**
 * Ejecuta un agente: valida la entrada, llama al proveedor (con un reintento de reparación si el JSON viene mal),
 * valida la salida con reglas deterministas y deja todo en agent_runs. NUNCA lanza hacia afuera ni simula respuestas.
 */
export async function runAgent<I, O>(
  db: Db, orgId: string, agent: AgentDef<I, O>, rawInput: unknown, provider: AiProvider | null,
  ctx: { actor: string; entityType?: string; entityId?: string },
): Promise<RunResult<O>> {
  if (!provider) return { runId: null, ok: false, warnings: [], error: "La IA no está configurada. Define AI_BASE_URL, AI_MODEL y AI_API_KEY (ver Integraciones)." };

  const parsedIn = agent.inputSchema.safeParse(rawInput);
  if (!parsedIn.success) return { runId: null, ok: false, warnings: [], error: `Entrada inválida: ${parsedIn.error.issues[0]?.message}` };
  const input = parsedIn.data;
  if (JSON.stringify(input).length > MAX_INPUT_BYTES) return { runId: null, ok: false, warnings: [], error: "La entrada es demasiado grande." };

  const [run] = await db.insert(agentRuns).values({
    orgId, agent: agent.id, status: "running", input: input as object, actor: ctx.actor, entityType: ctx.entityType, entityId: ctx.entityId, model: provider.model,
  }).returning();
  const t0 = Date.now();
  let attempts = 0, promptTokens = 0, completionTokens = 0;

  const finish = async (patch: Partial<typeof agentRuns.$inferInsert>) => {
    await db.update(agentRuns).set({ ...patch, attempts, promptTokens: promptTokens || null, completionTokens: completionTokens || null, durationMs: Date.now() - t0, finishedAt: new Date() }).where(eq(agentRuns.id, run.id));
  };
  const fail = async (error: string): Promise<RunResult<O>> => { await finish({ status: "failed", error }); return { runId: run.id, ok: false, warnings: [], error }; };

  try {
    const { system, user } = agent.build(input);
    let output: O | undefined;
    let lastFormatError = "";
    for (let i = 0; i < 2 && output === undefined; i++) {
      attempts++;
      const c = await provider.complete({ system, user: i === 0 ? user : `${user}\n\nTu respuesta anterior no fue válida (${lastFormatError}). Responde SOLO con el JSON pedido.` });
      promptTokens += c.usage?.promptTokens ?? 0; completionTokens += c.usage?.completionTokens ?? 0;
      try { output = parseJsonOutput(c.text, agent.outputSchema); }
      catch (e) { if (!(e instanceof AgentOutputError)) throw e; lastFormatError = e.message; }
    }
    if (output === undefined) return await fail(`El modelo no devolvió una respuesta utilizable tras ${attempts} intentos: ${lastFormatError}`);

    const checked = agent.validate(input, output);
    await finish({ status: "completed", output: checked.output as object, warnings: checked.warnings });
    return { runId: run.id, ok: true, output: checked.output, warnings: checked.warnings };
  } catch (e) {
    if (e instanceof AgentRejected) return fail(`Respuesta rechazada: ${e.message}`);
    if (e instanceof AiError) return fail(e.message);
    return fail("Error inesperado al ejecutar el agente."); // el detalle va al log del servidor, no a la pantalla
  }
}
