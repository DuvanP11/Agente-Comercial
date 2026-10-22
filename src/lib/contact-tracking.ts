/** Gestión de contacto de un prospecto: resultado, intentos y regla de «agotado». Lógica pura, sin base de datos. */

export const OUTCOMES = {
  pending: "Por contactar",
  contacted: "Contactado",
  no_answer: "Sin respuesta",
  interested: "Interesado",
  not_interested: "No interesado",
} as const;
export type Outcome = keyof typeof OUTCOMES;
export const OUTCOME_KEYS = Object.keys(OUTCOMES) as Outcome[];
export const isOutcome = (v: unknown): v is Outcome => typeof v === "string" && v in OUTCOMES;

/** Lo que se muestra: los resultados guardados más dos estados que se calculan. */
export const STATE_LABEL = { ...OUTCOMES, no_info: "Sin datos para contactar", exhausted: "Agotado" } as const;
export type ContactStateKey = keyof typeof STATE_LABEL;

export const CHANNELS = { whatsapp: "WhatsApp", call: "Llamada", email: "Correo", visit: "Visita u otro" } as const;
export type Channel = keyof typeof CHANNELS;
export const isChannel = (v: unknown): v is Channel => typeof v === "string" && v in CHANNELS;

export interface ContactRules { maxAttempts: number }
export const DEFAULT_RULES: ContactRules = { maxAttempts: 3 };
export const MIN_ATTEMPTS = 1, MAX_ATTEMPTS = 10;

/** Valida el máximo de intentos (entero entre 1 y 10). Lanza con un mensaje claro. */
export function parseRules(input: unknown): ContactRules {
  const n = (input as { maxAttempts?: unknown } | null)?.maxAttempts;
  if (typeof n !== "number" || !Number.isInteger(n) || n < MIN_ATTEMPTS || n > MAX_ATTEMPTS) throw new Error(`El máximo de intentos debe ser un número entero entre ${MIN_ATTEMPTS} y ${MAX_ATTEMPTS}.`);
  return { maxAttempts: n };
}

export interface ContactInput { outcome: string; attempts: number; hasContactData: boolean }
export interface ContactState {
  key: ContactStateKey; label: string;
  /** ¿Se puede registrar un nuevo intento? */
  canContact: boolean;
  /** Por qué no (si canContact es false). */
  reason?: string;
  attemptsLeft: number;
}

/** Resultados en los que el contacto sigue «vivo»: mientras no haya respuesta clara, cada intento consume uno de los permitidos. */
const OPEN: string[] = ["pending", "contacted", "no_answer"];

export function contactState(i: ContactInput, rules: ContactRules = DEFAULT_RULES): ContactState {
  const outcome = isOutcome(i.outcome) ? i.outcome : "pending";
  const left = Math.max(0, rules.maxAttempts - i.attempts);
  if (outcome === "not_interested") return { key: "not_interested", label: STATE_LABEL.not_interested, canContact: false, reason: "Está marcado como «No interesado».", attemptsLeft: left };
  if (OPEN.includes(outcome) && i.attempts >= rules.maxAttempts) return { key: "exhausted", label: STATE_LABEL.exhausted, canContact: false, reason: `Ya se hicieron ${i.attempts} intentos (el máximo es ${rules.maxAttempts}) sin una respuesta clara. Si quieres insistir, sube el máximo en Configuración.`, attemptsLeft: 0 };
  if (!i.hasContactData && i.attempts === 0 && outcome === "pending") return { key: "no_info", label: STATE_LABEL.no_info, canContact: false, reason: "No tiene teléfono, correo ni web: complétalos en su ficha para poder contactarlo.", attemptsLeft: left };
  return { key: outcome, label: STATE_LABEL[outcome], canContact: true, attemptsLeft: left };
}

/** Qué resultado guardar tras registrar un intento: si estaba por contactar o sin respuesta, pasa a «Contactado»; lo demás se respeta. */
export function outcomeAfterAttempt(current: string): Outcome {
  return current === "pending" || current === "no_answer" || !isOutcome(current) ? "contacted" : current;
}

/** Cambios de resultado que el equipo puede marcar a mano. «Sin respuesta» exige al menos un intento. */
export function outcomeChangeError(next: Outcome, attempts: number): string | null {
  if (next === "no_answer" && attempts < 1) return "Para marcar «Sin respuesta» primero registra al menos un intento de contacto.";
  if (next === "contacted" && attempts < 1) return "Para marcar «Contactado» primero registra el intento de contacto (o abre WhatsApp desde la ficha).";
  if (next === "pending" && attempts > 0) return "Ya tiene intentos registrados: no puede volver a «Por contactar».";
  return null;
}

/** Cómo afecta el avance en una campaña al resultado del prospecto (null = no cambia nada). */
export function outcomeFromCampaign(to: string, current: string): Outcome | null {
  if (to === "not_interested") return "not_interested";
  if ((to === "meeting" || to === "proposal" || to === "won") && current !== "interested") return "interested";
  if (to === "replied" && (current === "pending" || current === "no_answer")) return "contacted";
  return null;
}

export function describeAttempts(attempts: number, max: number): string {
  return `${attempts} de ${max} intento${max === 1 ? "" : "s"}`;
}
