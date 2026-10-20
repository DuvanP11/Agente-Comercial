/**
 * Proveedor de IA genérico: cualquier API compatible con OpenAI (/chat/completions).
 * Idea tomada de kandarpa02/lead_agent (MIT, © 2026 Kandarpa Sarkar): URL base + clave + modelo configurables.
 * Diferencia deliberada: la clave vive SOLO en variables de entorno del servidor, nunca en la base de datos.
 *
 * Ejemplos de AI_BASE_URL (se usa tal cual, sin añadir /v1):
 *   https://api.openai.com/v1 · https://api.groq.com/openai/v1 · https://openrouter.ai/api/v1
 *   https://generativelanguage.googleapis.com/v1beta/openai · http://localhost:11434/v1 (Ollama)
 */
export interface AiConfig { baseUrl: string; apiKey: string; model: string; timeoutMs: number }

export type AiErrorCode = "not_configured" | "auth" | "rate_limit" | "timeout" | "http" | "bad_response" | "network";
export class AiError extends Error {
  constructor(public code: AiErrorCode, message: string) { super(message); this.name = "AiError"; }
}

export interface Completion { text: string; model: string; usage?: { promptTokens?: number; completionTokens?: number } }
export interface AiProvider {
  readonly model: string;
  complete(req: { system: string; user: string; temperature?: number; signal?: AbortSignal }): Promise<Completion>;
}

export function aiConfigFromEnv(env: Record<string, string | undefined> = process.env): AiConfig | null {
  const baseUrl = env.AI_BASE_URL?.trim(), apiKey = env.AI_API_KEY?.trim(), model = env.AI_MODEL?.trim();
  if (!baseUrl || !model) return null;
  // Ollama local no exige clave; los demás sí.
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseUrl);
  if (!apiKey && !local) return null;
  const t = Number(env.AI_TIMEOUT_MS);
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey: apiKey ?? "", model, timeoutMs: Number.isFinite(t) && t >= 5_000 && t <= 120_000 ? t : 45_000 };
}

export type AiStatus = { state: "connected"; model: string; host: string } | { state: "not_configured"; missing: string[]; howTo: string };

export function aiStatus(env: Record<string, string | undefined> = process.env): AiStatus {
  const c = aiConfigFromEnv(env);
  if (c) { let host = ""; try { host = new URL(c.baseUrl).host; } catch { /* se informa vacío */ } return { state: "connected", model: c.model, host }; }
  const missing = ["AI_BASE_URL", "AI_MODEL", "AI_API_KEY"].filter((k) => !env[k]?.trim());
  return { state: "not_configured", missing, howTo: "Define AI_BASE_URL, AI_MODEL y AI_API_KEY (no necesaria con Ollama local) en las variables de entorno del servidor. Ver docs/INTEGRATIONS.md." };
}

export function createProvider(cfg: AiConfig, fetchImpl: typeof fetch = fetch): AiProvider {
  return {
    model: cfg.model,
    async complete({ system, user, temperature = 0.2, signal }) {
      const timeout = AbortSignal.timeout(cfg.timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
          body: JSON.stringify({ model: cfg.model, temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (e) {
        if (e instanceof Error && e.name === "TimeoutError") throw new AiError("timeout", `El proveedor de IA no respondió en ${Math.round(cfg.timeoutMs / 1000)} s.`);
        throw new AiError("network", "No se pudo conectar con el proveedor de IA. Revisa AI_BASE_URL.");
      }
      if (res.status === 401 || res.status === 403) throw new AiError("auth", "El proveedor de IA rechazó la clave (AI_API_KEY).");
      if (res.status === 429) throw new AiError("rate_limit", "El proveedor de IA alcanzó su límite de uso. Reintenta en unos minutos.");
      if (!res.ok) throw new AiError("http", `El proveedor de IA respondió ${res.status}.`);
      let data: { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
      try { data = await res.json(); } catch { throw new AiError("bad_response", "El proveedor de IA devolvió una respuesta que no es JSON."); }
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) throw new AiError("bad_response", "El proveedor de IA devolvió una respuesta vacía.");
      return { text, model: data.model ?? cfg.model, usage: { promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens } };
    },
  };
}

/** Proveedor del entorno, o null si no está configurado (el sistema lo dice; nunca simula una respuesta). */
export function providerFromEnv(): AiProvider | null {
  const c = aiConfigFromEnv();
  return c ? createProvider(c) : null;
}
