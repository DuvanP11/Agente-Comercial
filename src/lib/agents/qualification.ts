import { z } from "zod";
import { inventedClaims, SYSTEM_RULES, untrusted } from "../ai/guards";
import { safeWebUrl } from "../contact-links";
import { CRITERION_LABELS, DEFAULT_WEIGHTS, type CriterionKey } from "../scoring/score";
import type { AgentDef } from "./core";

const KEYS = Object.keys(DEFAULT_WEIGHTS) as [CriterionKey, ...CriterionKey[]];
/**
 * Solo estos criterios pueden quedar "confirmados": son los que las evidencias que tenemos (rubro, dirección, contacto)
 * pueden demostrar. Necesidad logística, volumen o frecuencia nunca se confirman con datos de directorio.
 */
export const CONFIRMABLE: CriterionKey[] = ["icp_fit", "geo_compatibility"];
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
    value: z.number(),
    evidenceIds: z.array(z.string()).default([]),
    note: z.string().default(""),
  })),
  summary: z.string().default(""),
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
      `usa "inferred" para deducciones razonables y "hypothesis" para suposiciones por validar; si no hay base, "unknown" con value 0. ` +
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
      const ids = a.evidenceIds.filter((id) => validIds.has(id));
      if (ids.length !== a.evidenceIds.length) warnings.push(`${CRITERION_LABELS[key]}: se descartaron evidencias que no existen.`);
      if (kind === "confirmed" && !CONFIRMABLE.includes(key)) { kind = "inferred"; warnings.push(`${CRITERION_LABELS[key]}: no puede confirmarse con datos de directorio; pasó a «inferencia».`); }
      if (kind === "confirmed" && ids.length === 0) { kind = "hypothesis"; warnings.push(`${CRITERION_LABELS[key]}: se marcó «confirmado» sin evidencia; pasó a «hipótesis».`); }

      let note = a.note.trim().slice(0, 300);
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

    const summaryBad = inventedClaims(out.summary, source);
    let summary = out.summary.trim().slice(0, 500);
    if (summaryBad.length) { warnings.push(`El resumen incluía datos que no están en los registros (${summaryBad.join(", ")}); se descartó.`); summary = ""; }
    return { output: { assessments, summary }, warnings };
  },
};
