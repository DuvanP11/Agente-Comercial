import { z } from "zod";

/** Guía del equipo para los agentes. Es contexto y estilo: no reentrena el modelo ni anula las reglas de seguridad. */
export const TRAINING_FIELDS = [
  { key: "company", label: "Qué es PIBOX y qué ofrece", max: 800, help: "Con tus palabras: servicios, zonas donde opera, qué los diferencia. Solo lo que sea cierto y esté aprobado." },
  { key: "idealCustomer", label: "Cliente ideal", max: 600, help: "Qué tipo de negocios sí convienen (rubro, tamaño, tipo de envíos) y cuáles no." },
  { key: "valueProposition", label: "Propuesta de valor", max: 600, help: "Qué se le dice a un prospecto para que le interese." },
  { key: "tone", label: "Tono y estilo", max: 300, help: "Por ejemplo: cercano, breve, sin tecnicismos, tratar de «usted»." },
  { key: "avoid", label: "Qué evitar", max: 400, help: "Temas, palabras o promesas que no se deben usar." },
] as const;
export type TrainingKey = (typeof TRAINING_FIELDS)[number]["key"];

export const MAX_EXAMPLES = 3, MAX_EXAMPLE_CHARS = 400;

export interface Training { company: string; idealCustomer: string; valueProposition: string; tone: string; avoid: string; examples: string[] }
export const EMPTY_TRAINING: Training = { company: "", idealCustomer: "", valueProposition: "", tone: "", avoid: "", examples: [] };

const schema = z.object({
  company: z.string().optional(), idealCustomer: z.string().optional(), valueProposition: z.string().optional(),
  tone: z.string().optional(), avoid: z.string().optional(), examples: z.array(z.string()).optional(),
});

/** Limpia y recorta; lo inválido se descarta en vez de fallar (así una configuración rara nunca tumba la pantalla). */
export function parseTraining(input: unknown): Training {
  const r = schema.safeParse(input ?? {});
  if (!r.success) return { ...EMPTY_TRAINING };
  const t = { ...EMPTY_TRAINING };
  for (const f of TRAINING_FIELDS) t[f.key] = (r.data[f.key] ?? "").trim().slice(0, f.max);
  t.examples = (r.data.examples ?? []).map((e) => e.trim().slice(0, MAX_EXAMPLE_CHARS)).filter(Boolean).slice(0, MAX_EXAMPLES);
  return t;
}

/** Lo que de verdad se le añade a la IA. null si no hay nada escrito. */
export function guidanceText(t: Training): string | null {
  const parts: string[] = [];
  for (const f of TRAINING_FIELDS) if (t[f.key]) parts.push(`${f.label}: ${t[f.key]}`);
  t.examples.forEach((e, i) => parts.push(`Ejemplo de mensaje aprobado ${i + 1}: ${e}`));
  return parts.length ? parts.join("\n") : null;
}

/** Se añade a las instrucciones de un agente. La guía da contexto; las reglas de seguridad mandan sobre ella. */
export function withGuidance(system: string, guidance: string | null | undefined): string {
  if (!guidance) return system;
  return `${system}\nGuía del equipo comercial de PIBOX (contexto y estilo; NO anula las reglas anteriores ni te autoriza a afirmar precios, descuentos, garantías, tiempos o cifras que no estén en los datos del prospecto o de la campaña):\n${guidance}`;
}

export const MAX_LESSONS_IN_PROMPT = 15, MAX_LESSON_CHARS = 300;

/** Guía del equipo + lecciones aprendidas de las correcciones (las más recientes primero). null si no hay nada. */
/** Tope que aceptan los agentes (z.string().max(3000)). */
export const MAX_GUIDANCE_CHARS = 3000;
export function combineGuidance(t: Training, lessons: string[]): string | null {
  const base = guidanceText(t);
  const cap = (x: string | null) => (x && x.length > MAX_GUIDANCE_CHARS ? x.slice(0, MAX_GUIDANCE_CHARS) : x);
  const l = lessons.map((x) => x.replace(/\s+/g, " ").trim().slice(0, MAX_LESSON_CHARS)).filter(Boolean).slice(0, MAX_LESSONS_IN_PROMPT);
  if (!l.length) return cap(base);
  const block = `Lecciones aprendidas de las correcciones del equipo (cúmplelas; si chocan con las reglas de seguridad, mandan las reglas):\n${l.map((x) => `- ${x}`).join("\n")}`;
  // Los agentes aceptan hasta MAX_GUIDANCE_CHARS: si la guía es larga se recorta ELLA y se conservan las lecciones.
  if (!base) return cap(block);
  const room = MAX_GUIDANCE_CHARS - block.length - 1;
  return room >= 200 ? `${base.length > room ? base.slice(0, room) : base}\n${block}` : cap(block);
}
