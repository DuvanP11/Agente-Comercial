import { z } from "zod";
import { appearsIn, SYSTEM_RULES, untrusted } from "../ai/guards";
import { safeTerm } from "../connectors/openstreetmap";
import { AgentRejected, type AgentDef } from "./core";

const input = z.object({ text: z.string().trim().min(5, "Escribe una descripción de lo que buscas.").max(1000) });
const output = z.object({
  city: z.string().nullable(),
  zones: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  maxResults: z.number().nullable().default(null),
  excludeTerms: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
});
export type InterpretedSearch = { city: string | null; zones: string[]; categories: string[]; maxResults: number | null; excludeTerms: string[]; notes: string | null };

export const searchInterpreter: AgentDef<z.infer<typeof input>, InterpretedSearch> = {
  id: "search_interpreter",
  label: "Interpretación de búsqueda",
  description: "Convierte una petición en lenguaje natural en criterios de búsqueda (ciudad, zonas, rubros). Solo propone: tú revisas los campos antes de buscar.",
  allowedTools: [],
  inputSchema: input,
  outputSchema: output,
  build: ({ text }) => ({
    system: `${SYSTEM_RULES} Tarea: convertir una petición de búsqueda de negocios en Colombia en criterios estructurados. ` +
      `Devuelve {"city":string|null,"zones":string[],"categories":string[],"maxResults":number|null,"excludeTerms":string[],"notes":string|null}. ` +
      `city: la ciudad principal SOLO si aparece en la petición, si no null. zones: localidades o barrios mencionados. ` +
      `categories: tipos de negocio a buscar, máximo 6, en forma de rubro corto (p. ej. "tienda de ropa", "ferretería"). ` +
      `maxResults: solo si la petición pide una cantidad. excludeTerms: palabras de nombres a excluir si el usuario lo pide. ` +
      `notes: lo que no puedas convertir en criterios (por ejemplo, "con presencia digital").`,
    user: untrusted({ peticion: text }),
  }),
  validate: ({ text }, o) => {
    const warnings: string[] = [];
    const seen = new Set<string>();
    const categories = o.categories.map(safeTerm).filter((c) => c.length >= 3).filter((c) => (seen.has(c.toLowerCase()) ? false : (seen.add(c.toLowerCase()), true))).slice(0, 6);
    if (categories.length === 0) throw new AgentRejected("No se pudo identificar ningún rubro de negocio en tu texto. Escríbelo de forma más concreta.");
    const city = o.city ? safeTerm(o.city) || null : null;
    if (city && !appearsIn(city, text)) warnings.push(`La ciudad «${city}» no aparece en tu texto: verifícala antes de buscar.`);
    if (!city) warnings.push("No se detectó la ciudad: complétala a mano.");
    const zones = o.zones.map(safeTerm).filter(Boolean).slice(0, 10);
    for (const z of zones) if (!appearsIn(z, text)) warnings.push(`La zona «${z}» no aparece en tu texto: verifícala.`);
    for (const c of categories) if (!appearsIn(c.split(" ").pop() ?? c, text)) warnings.push(`El rubro «${c}» es una interpretación del modelo: confirma que es lo que buscas.`);
    let maxResults = o.maxResults;
    if (maxResults !== null && (!Number.isFinite(maxResults) || maxResults < 1)) maxResults = null;
    if (maxResults !== null) maxResults = Math.min(60, Math.round(maxResults));
    return { output: { city, zones, categories, maxResults, excludeTerms: o.excludeTerms.map(safeTerm).filter(Boolean).slice(0, 10), notes: o.notes?.slice(0, 300) ?? null }, warnings };
  },
};
