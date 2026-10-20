import { z } from "zod";
import { inventedClaims, SYSTEM_RULES, untrusted } from "../ai/guards";
import { approvalBlockers } from "../campaigns";
import { AgentRejected, type AgentDef } from "./core";

const input = z.object({
  prospect: z.object({ name: z.string(), city: z.string().nullable(), category: z.string().nullable() }),
  campaign: z.object({ objective: z.string().nullable(), valueProposition: z.string().nullable(), baseMessage: z.string() }),
  channel: z.literal("whatsapp"),
  revisionRequest: z.string().max(300).nullable(),
});
export type DraftingInput = z.infer<typeof input>;
const output = z.object({ body: z.string() });

export const MAX_DRAFT_CHARS = 600;

export const draftingAgent: AgentDef<DraftingInput, { body: string }> = {
  id: "drafting",
  label: "Redacción comercial (borrador)",
  description: "Redacta un borrador de mensaje de WhatsApp para un prospecto. Siempre queda como BORRADOR: tú lo editas y lo apruebas; nunca se envía solo.",
  allowedTools: [],
  inputSchema: input,
  outputSchema: output,
  build: (i) => ({
    system: `${SYSTEM_RULES} Tarea: redactar UN mensaje corto de WhatsApp en español para iniciar conversación con un negocio. ` +
      `Devuelve {"body":string}. Tono cordial y sin presión; habla en plural ("nosotros", PIBOX Mensajería). ` +
      `Incluye: saludo con el nombre del negocio, una razón concreta basada SOLO en los datos entregados y una pregunta abierta. ` +
      `PROHIBIDO: precios, descuentos, garantías, tiempos de entrega, porcentajes, cifras y enlaces que no estén en los datos; decir que algo ya se envió; presionar. ` +
      `Máximo 500 caracteres. Si hay revisionRequest, aplícalo sin añadir hechos nuevos.`,
    user: untrusted(i),
  }),
  validate: (inp, out) => {
    const body = out.body.trim();
    const warnings: string[] = [];
    const blockers = approvalBlockers(body);
    if (blockers.length) throw new AgentRejected(blockers.join(" "));
    if (body.length > MAX_DRAFT_CHARS) throw new AgentRejected(`El mensaje tiene ${body.length} caracteres; el máximo es ${MAX_DRAFT_CHARS}.`);
    // Lo único que el modelo puede afirmar es lo que vino en los datos de entrada.
    const allowed = [inp.prospect.name, inp.prospect.city, inp.prospect.category, inp.campaign.objective, inp.campaign.valueProposition, inp.campaign.baseMessage, inp.revisionRequest].filter(Boolean).join(" ");
    const bad = inventedClaims(body, allowed);
    if (bad.length) throw new AgentRejected(`El borrador incluía datos que no están en tu información (${bad.join(", ")}).`);
    if (/\b(ya (te |les )?(envi|mand)\w+|te enviamos|les enviamos)\b/i.test(body)) throw new AgentRejected("El borrador afirma que algo ya se envió.");
    if (!body.toLowerCase().includes(inp.prospect.name.toLowerCase().slice(0, 8))) warnings.push("El mensaje no menciona el nombre del negocio: revisa que esté dirigido a la empresa correcta.");
    return { output: { body }, warnings };
  },
};
