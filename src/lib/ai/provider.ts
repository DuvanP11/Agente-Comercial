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

export interface FailedAttempt { label: string; code: AiErrorCode }
export interface Completion {
  text: string; model: string; usage?: { promptTokens?: number; completionTokens?: number };
  /** Presente cuando respondió una cadena de proveedores: quién respondió y a quiénes se intentó antes. */
  via?: { label: string; attempted: FailedAttempt[] };
}
export interface AiProvider {
  readonly model: string;
  complete(req: { system: string; user: string; temperature?: number; signal?: AbortSignal }): Promise<Completion>;
}

/** Orden de la cadena: AI_* (principal), AI2_* (respaldo 1), AI3_* (respaldo 2). */
const PREFIXES = ["AI", "AI2", "AI3"] as const;

function readConfig(env: Record<string, string | undefined>, prefix: string): AiConfig | null {
  const baseUrl = env[`${prefix}_BASE_URL`]?.trim(), apiKey = env[`${prefix}_API_KEY`]?.trim(), model = env[`${prefix}_MODEL`]?.trim();
  if (!baseUrl || !model) return null;
  // Ollama local no exige clave; los demás sí.
  if (!apiKey && !isLocalUrl(baseUrl)) return null;
  const t = Number(env[`${prefix}_TIMEOUT_MS`]);
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey: apiKey ?? "", model, timeoutMs: Number.isFinite(t) && t >= 5_000 && t <= 120_000 ? t : 45_000 };
}

export const isLocalUrl = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u);
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return ""; } };

/** Compatibilidad: el proveedor principal. */
export function aiConfigFromEnv(env: Record<string, string | undefined> = process.env): AiConfig | null {
  return readConfig(env, "AI");
}

/** Todos los proveedores configurados, en orden de preferencia. Los incompletos se omiten (y se avisa en el estado). */
export function aiConfigsFromEnv(env: Record<string, string | undefined> = process.env): AiConfig[] {
  return PREFIXES.map((p) => readConfig(env, p)).filter((c): c is AiConfig => c !== null);
}

export interface ProviderInfo { role: "principal" | "respaldo 1" | "respaldo 2"; host: string; model: string; local: boolean }
export type AiStatus =
  | { state: "connected"; model: string; host: string; providers: ProviderInfo[]; warnings: string[] }
  | { state: "not_configured"; missing: string[]; howTo: string; warnings: string[] };

const ROLES: ProviderInfo["role"][] = ["principal", "respaldo 1", "respaldo 2"];

export function aiStatus(env: Record<string, string | undefined> = process.env): AiStatus {
  const warnings: string[] = [];
  const onServerless = !!env.VERCEL || env.NODE_ENV === "production";
  // Avisos por proveedor a medio configurar (para que el usuario no crea que el respaldo está activo).
  PREFIXES.forEach((p, i) => {
    const touched = [`${p}_BASE_URL`, `${p}_MODEL`, `${p}_API_KEY`].some((k) => env[k]?.trim());
    if (touched && !readConfig(env, p)) warnings.push(`${ROLES[i]}: configuración incompleta (${p}_BASE_URL, ${p}_MODEL y ${p}_API_KEY); se ignora.`);
  });
  const providers = PREFIXES.map((p, i) => ({ c: readConfig(env, p), role: ROLES[i] })).filter((x): x is { c: AiConfig; role: ProviderInfo["role"] } => x.c !== null)
    .map(({ c, role }) => ({ role, host: hostOf(c.baseUrl), model: c.model, local: isLocalUrl(c.baseUrl) }));
  for (const p of providers) if (p.local && onServerless) warnings.push(`${p.role} (${p.host}) es local: un servidor en la nube como Vercel no puede alcanzar tu computador. Solo funcionará si ejecutas la app en tu propia máquina.`);
  if (providers.length) return { state: "connected", model: providers[0].model, host: providers[0].host, providers, warnings };
  const missing = ["AI_BASE_URL", "AI_MODEL", "AI_API_KEY"].filter((k) => !env[k]?.trim());
  return { state: "not_configured", missing, howTo: "Define AI_BASE_URL, AI_MODEL y AI_API_KEY (no necesaria con Ollama local) en las variables de entorno del servidor. Respaldos opcionales con AI2_* y AI3_*. Ver docs/INTEGRATIONS.md.", warnings };
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

export interface ChainOptions {
  /** Cuánto se salta un proveedor que acaba de fallar (límite de uso, red, clave). */
  cooldownMs?: number;
  now?: () => number;
}

const COOLDOWN_BY_CODE: Partial<Record<AiErrorCode, number>> = { auth: 30 * 60_000, rate_limit: 5 * 60_000, timeout: 2 * 60_000, network: 2 * 60_000, http: 60_000 };

/**
 * Cadena de proveedores con respaldo automático: prueba en orden y pasa al siguiente si el actual falla
 * (límite de uso, timeout, red caída, error del servidor o clave rechazada). Un proveedor que falló se
 * salta durante un tiempo para no perder segundos en cada consulta; si TODOS están en pausa, se intentan igual.
 * La respuesta indica quién contestó y a quiénes se intentó antes, para dejarlo registrado.
 */
export function createFailoverProvider(chain: { label: string; provider: AiProvider }[], opts: ChainOptions = {}): AiProvider {
  if (chain.length === 0) throw new Error("La cadena de proveedores está vacía.");
  const now = opts.now ?? Date.now;
  const pausedUntil = new Map<string, number>();
  return {
    model: chain[0].provider.model,
    async complete(req) {
      const t = now();
      const active = chain.filter((c) => (pausedUntil.get(c.label) ?? 0) <= t);
      const order = active.length ? active : chain; // todos en pausa: se prueban igual
      const attempted: FailedAttempt[] = [];
      const reasons: string[] = [];
      // Los que se saltaron por pausa también se informan.
      for (const c of chain) if (!order.includes(c)) attempted.push({ label: c.label, code: "rate_limit" });
      for (const c of order) {
        try {
          const done = await c.provider.complete(req);
          return { ...done, via: { label: c.label, attempted } };
        } catch (e) {
          if (req.signal?.aborted) throw e;
          const code: AiErrorCode = e instanceof AiError ? e.code : "network";
          attempted.push({ label: c.label, code });
          reasons.push(`${c.label}: ${e instanceof AiError ? e.message : "error inesperado"}`);
          pausedUntil.set(c.label, now() + (opts.cooldownMs ?? COOLDOWN_BY_CODE[code] ?? 60_000));
        }
      }
      throw new AiError(attempted[attempted.length - 1]?.code ?? "network", `Ningún proveedor de IA respondió. ${reasons.join(" | ")}`);
    },
  };
}

const ROLE_LABEL = ["Principal", "Respaldo 1", "Respaldo 2"];

/** Proveedor del entorno (cadena completa), o null si no hay ninguno (el sistema lo dice; nunca simula una respuesta). */
export function providerFromEnv(): AiProvider | null {
  const cfgs = aiConfigsFromEnv();
  if (cfgs.length === 0) return null;
  const all = PREFIXES.map((p) => readConfig(process.env, p));
  const chain = all.map((c, i) => (c ? { label: `${ROLE_LABEL[i]} (${hostOf(c.baseUrl)})`, provider: createProvider(c) } : null)).filter((x): x is { label: string; provider: AiProvider } => x !== null);
  return chain.length === 1 ? chain[0].provider : createFailoverProvider(chain);
}

export interface ProviderCheck {
  role: ProviderInfo["role"]; host: string; model: string;
  /** ok = el modelo existe · model_not_found = la clave sirve pero ese modelo no · auth = clave rechazada · unreachable = no hay conexión · unknown = el proveedor no lista modelos · error = otro fallo */
  state: "ok" | "model_not_found" | "auth" | "unreachable" | "unknown" | "error";
  message: string;
  /** Modelos que el proveedor dice tener (máx. 40), para elegir uno válido. */
  models: string[];
}

/**
 * Comprueba cada proveedor configurado SIN enviar datos de negocio: solo pide la lista de modelos (GET /models)
 * y verifica que el modelo escrito exista. Nunca devuelve la clave.
 */
export async function checkProviders(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<ProviderCheck[]> {
  const out: ProviderCheck[] = [];
  const entries = PREFIXES.map((p, i) => ({ c: readConfig(env, p), role: ROLES[i] })).filter((x): x is { c: AiConfig; role: ProviderInfo["role"] } => x.c !== null);
  for (const { c, role } of entries) {
    const base = { role, host: hostOf(c.baseUrl), model: c.model };
    try {
      const res = await fetchImpl(`${c.baseUrl}/models`, { headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}, signal: AbortSignal.timeout(10_000) });
      if (res.status === 401 || res.status === 403) { out.push({ ...base, state: "auth", message: "El proveedor rechazó la clave (AI_API_KEY). Revisa que esté completa y vigente.", models: [] }); continue; }
      if (res.status === 404) { out.push({ ...base, state: "unknown", message: "Este proveedor no ofrece la lista de modelos. La conexión no se puede comprobar sin hacer una consulta real.", models: [] }); continue; }
      if (!res.ok) { out.push({ ...base, state: "error", message: `El proveedor respondió ${res.status}.`, models: [] }); continue; }
      const data = (await res.json()) as { data?: { id?: unknown }[]; models?: { name?: unknown }[] };
      const ids = [...(data.data ?? []).map((m) => m.id), ...(data.models ?? []).map((m) => String(m.name ?? "").replace(/^models\//, ""))].filter((x): x is string => typeof x === "string" && x.length > 0);
      const unique = [...new Set(ids)].sort();
      if (unique.length === 0) { out.push({ ...base, state: "unknown", message: "El proveedor no devolvió modelos; no se puede comprobar.", models: [] }); continue; }
      if (unique.includes(c.model)) out.push({ ...base, state: "ok", message: "Conexión correcta y el modelo existe.", models: unique.slice(0, 40) });
      else out.push({ ...base, state: "model_not_found", message: `El modelo «${c.model}» no existe en este proveedor. AI_MODEL debe ser el identificador exacto de un modelo de la lista (no el nombre de la empresa).`, models: unique.slice(0, 40) });
    } catch (e) {
      const timeout = e instanceof Error && e.name === "TimeoutError";
      out.push({ ...base, state: "unreachable", message: timeout ? "El proveedor no respondió a tiempo." : "No se pudo conectar. Revisa AI_BASE_URL (y que el servicio esté encendido, si es local).", models: [] });
    }
  }
  return out;
}
