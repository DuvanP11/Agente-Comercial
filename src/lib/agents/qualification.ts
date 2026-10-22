import { z } from "zod";
import { inventedClaims, looksEnglish, lenientNumber, lenientString, lenientStrings, SYSTEM_RULES, untrusted } from "../ai/guards";
import { safeWebUrl } from "../contact-links";
import { CRITERION_LABELS, DEFAULT_WEIGHTS, type CriterionKey } from "../scoring/score";
import type { AgentDef } from "./core";

const KEYS = Object.keys(DEFAULT_WEIGHTS) as [CriterionKey, ...CriterionKey[]];
/**
 * Criterios que la IA puede dejar "confirmados": NINGUNO por ahora. Con datos de directorio solo se demuestra que el negocio
 * existe en un rubro y una dirección; "ajuste al cliente ideal" y "compatibilidad geográfica" dependen de cómo PIBOX define
 * su cliente ideal y su cobertura, que aún no están configurados (módulo Configuración, pendiente). Probado con un modelo
 * real: marcó "confirmado" la compatibilidad solo porque el negocio "se encuentra en Bogotá". La IA propone hasta
 * "inferencia"; confirmar con evidencia lo hace la persona en Analizar clientes.
 */
export const CONFIRMABLE: CriterionKey[] = [];

/** Frases con las que un modelo dice "no sé": eso es DESCONOCIDO, nunca un valor bajo (contaría como dato malo). */
const NO_INFO = /no se dispone|sin informaci[oó]n|no hay (datos|informaci[oó]n)|desconoc|no (es|est[aá]) posible (determinar|evaluar)|no se puede (determinar|evaluar|saber)|informaci[oó]n insuficiente|no (hay|existe) (evidencia|base)/i;
/** Los decide el código, no el modelo. */
const DETERMINISTIC: CriterionKey[] = ["contact_channel", "evidence_quality"];

const input = z.object({
  prospect: z.object({
    name: z.string(), category: z.string().nullable(), city: z.string().nullable(), address: z.string().nullable(),
    hasPhone: z.boolean(), hasEmail: z.boolean(), website: z.string().nullable(),
  }),
  evidence: z.array(z.object({ id: z.string(), field: z.string(), value: z.string(), source: z.string(), verification: z.string() })).max(40),
});
export type QualificationInput = z.infer<typeof input>;

const output = z.object({
  assessments: z.array(z.object({
    criterion: z.string(),
    kind: z.enum(["confirmed", "inferred", "hypothesis", "unknown"]),
    value: lenientNumber,
    evidenceIds: lenientStrings,
    note: lenientString,
  })),
  summary: lenientString,
});

export interface ProposedAssessment { criterion: CriterionKey; kind: "confirmed" | "inferred" | "hypothesis" | "unknown"; value: number; evidenceIds: string[]; note: string; origin: "model" | "rule" }
export interface QualificationProposal { assessments: ProposedAssessment[]; summary: string }

export const qualificationAgent: AgentDef<QualificationInput, QualificationProposal> = {
  id: "qualification",
  label: "Calificación comercial (propuesta)",
  description: "Propone la valoración de los criterios de un prospecto con base en sus datos y evidencias. Es una PROPUESTA: nada se guarda hasta que tú la revisas y la aplicas.",
  allowedTools: [],
  inputSchema: input,
  outputSchema: output as unknown as z.ZodType<QualificationProposal>,
  build: (i) => ({
    system: `${SYSTEM_RULES} Tarea: proponer cómo valorar a un prospecto frente a estos criterios: ` +
      KEYS.filter((k) => !DETERMINISTIC.includes(k)).map((k) => `${k} (${CRITERION_LABELS[k]})`).join("; ") + ". " +
      `Devuelve {"assessments":[{"criterion":string,"kind":"confirmed"|"inferred"|"hypothesis"|"unknown","value":0..1,"evidenceIds":string[],"note":string}],"summary":string}. ` +
      `Reglas: usa "confirmed" SOLO si citas ids de la lista de evidencias que lo demuestren (y solo para icp_fit y geo_compatibility); ` +
      `usa "inferred" para deducciones razonables y "hypothesis" para suposiciones por validar; si no hay base para valorar un criterio, usa "unknown" (NUNCA "hypothesis" con value 0: un valor bajo no es lo mismo que no saber). ` +
      `No supongas volumen, frecuencia ni necesidad logística como hechos. Cada note: máximo 200 caracteres y sin cifras que no estén en los datos.`,
    user: untrusted(i),
  }),
  validate: (inp, out) => {
    const warnings: string[] = [];
    const validIds = new Set(inp.evidence.map((e) => e.id));
    const source = JSON.stringify(inp);
    const seen = new Set<string>();
    const assessments: ProposedAssessment[] = [];

    for (const a of out.assessments) {
      if (!KEYS.includes(a.criterion as CriterionKey)) { warnings.push(`Criterio desconocido «${a.criterion}»: descartado.`); continue; }
      const key = a.criterion as CriterionKey;
      if (DETERMINISTIC.includes(key)) { warnings.push(`«${CRITERION_LABELS[key]}» lo calcula el sistema, no el modelo: se ignoró la propuesta.`); continue; }
      if (seen.has(key)) { warnings.push(`Criterio repetido «${key}»: se conservó solo el primero.`); continue; }
      seen.add(key);

      let kind = a.kind;
      // "No hay información" dicho como hipótesis de valor 0 se trata como lo que es: desconocido.
      if (kind !== "unknown" && NO_INFO.test(a.note)) { kind = "unknown"; warnings.push(`${CRITERION_LABELS[key]}: el modelo dijo no tener información; se trató como «desconocido», no como un valor bajo.`); }
      const ids = a.evidenceIds.filter((id) => validIds.has(id));
      if (ids.length !== a.evidenceIds.length) warnings.push(`${CRITERION_LABELS[key]}: se descartaron evidencias que no existen.`);
      if (kind === "confirmed" && !CONFIRMABLE.includes(key)) { kind = "inferred"; warnings.push(`${CRITERION_LABELS[key]}: la IA no puede dejarlo «confirmado» (eso lo decide una persona con evidencia); pasó a «inferencia».`); }
      if (kind === "confirmed" && ids.length === 0) { kind = "hypothesis"; warnings.push(`${CRITERION_LABELS[key]}: se marcó «confirmado» sin evidencia; pasó a «hipótesis».`); }

      let note = a.note.trim().slice(0, 300);
      if (note && looksEnglish(note)) { warnings.push(`${CRITERION_LABELS[key]}: el modelo escribió la nota en inglés; se descartó.`); note = ""; }
      const bad = inventedClaims(note, source);
      if (bad.length) { warnings.push(`${CRITERION_LABELS[key]}: la nota incluía datos que no están en los registros (${bad.join(", ")}); se descartó.`); note = ""; }

      const value = kind === "unknown" || !Number.isFinite(a.value) ? 0 : Math.min(1, Math.max(0, a.value));
      assessments.push({ criterion: key, kind, value, evidenceIds: kind === "unknown" ? [] : ids, note, origin: "model" });
    }

    // Canal de contacto: lo decide el código a partir de lo que realmente hay registrado.
    const phoneEv = inp.evidence.filter((e) => e.field === "phone").map((e) => e.id);
    const web = safeWebUrl(inp.prospect.website);
    if (inp.prospect.hasPhone) assessments.push({ criterion: "contact_channel", kind: phoneEv.length ? "confirmed" : "inferred", value: 1, evidenceIds: phoneEv, note: "Tiene teléfono registrado.", origin: "rule" });
    else if (inp.prospect.hasEmail || web) assessments.push({ criterion: "contact_channel", kind: "inferred", value: 0.6, evidenceIds: [], note: "Solo tiene correo o web, sin teléfono.", origin: "rule" });
    else assessments.push({ criterion: "contact_channel", kind: "inferred", value: 0, evidenceIds: [], note: "Sin canal de contacto registrado.", origin: "rule" });

    // Calidad de la evidencia: cuántos datos clave tienen evidencia registrada. La calcula el código con tus datos, nunca el modelo.
    const SLOTS: string[][] = [["name"], ["address"], ["phone"], ["website", "email"]]; // nombre, dirección, teléfono, web o correo
    const used: string[] = [];
    for (const fields of SLOTS) { const ev = inp.evidence.find((e) => fields.includes(e.field)); if (ev) used.push(ev.id); }
    if (used.length > 0) {
      assessments.push({ criterion: "evidence_quality", kind: "confirmed", value: used.length / SLOTS.length, evidenceIds: used, note: `${used.length} de ${SLOTS.length} datos clave (nombre, dirección, teléfono, web o correo) tienen evidencia registrada.`, origin: "rule" });
    }

    const summaryBad = inventedClaims(out.summary, source);
    let summary = out.summary.trim().slice(0, 500);
    if (summary && looksEnglish(summary)) { warnings.push("El modelo escribió el resumen en inglés; se descartó."); summary = ""; }
    if (summaryBad.length) { warnings.push(`El resumen incluía datos que no están en los registros (${summaryBad.join(", ")}); se descartó.`); summary = ""; }
    return { output: { assessments, summary }, warnings };
  },
};
