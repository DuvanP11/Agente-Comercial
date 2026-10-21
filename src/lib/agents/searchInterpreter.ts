import { z } from "zod";
import { appearsIn, lenientStrings, SYSTEM_RULES, untrusted } from "../ai/guards";
import { safeTerm } from "../connectors/openstreetmap";
import { stripAccents } from "../dedup/normalize";
import { AgentRejected, type AgentDef } from "./core";

const input = z.object({ text: z.string().trim().min(5, "Escribe una descripción de lo que buscas.").max(1000) });
const output = z.object({
  city: z.string().nullish().transform((v) => v ?? null),
  zones: lenientStrings,
  categories: lenientStrings,
  maxResults: z.number().nullish().transform((v) => v ?? null),
  excludeTerms: lenientStrings,
  notes: z.string().nullish().transform((v) => v ?? null),
});
export type InterpretedSearch = { city: string | null; zones: string[]; categories: string[]; maxResults: number | null; excludeTerms: string[]; notes: string | null };

/** Palabras que indican una frase y no un rubro o un nombre: con ellas no se usa el texto como categoría. */
const FILLER = new Set(["busco", "buscar", "quiero", "necesito", "algo", "cosas", "cosa", "negocios", "negocio", "empresas", "empresa", "clientes", "cliente", "por", "favor", "en", "de", "del", "la", "el", "los", "las", "un", "una", "y", "o", "con", "para", "que", "hola", "me", "dame", "mostrar", "muestra"]);

/** Un texto corto sin palabras de relleno ("Tecnología", "MLT Racores") se puede usar tal cual como rubro o nombre. */
export function usableAsCategory(text: string): string | null {
  const t = text.trim();
  const words = t.split(/\s+/);
  if (words.length === 0 || words.length > 3 || t.length > 40) return null;
  if (words.some((w) => FILLER.has(stripAccents(w).toLowerCase()))) return null;
  const clean = safeTerm(t);
  return clean.length >= 3 ? clean : null;
}

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
      `notes: lo que no puedas convertir en criterios (por ejemplo, "con presencia digital"). ` +
      `Si el texto es solo un sector o rubro (p. ej. "Tecnología", "ferretería") o el nombre de un negocio, úsalo tal cual como única categoría; no devuelvas categories vacío.`,
    user: untrusted({ peticion: text }),
  }),
  validate: ({ text }, o) => {
    const warnings: string[] = [];
    const seen = new Set<string>();
    const categories = o.categories.map(safeTerm).filter((c) => c.length >= 3).filter((c) => (seen.has(c.toLowerCase()) ? false : (seen.add(c.toLowerCase()), true))).slice(0, 6);
    if (categories.length === 0) {
      // El modelo no sacó rubros. Si tu texto es corto y claro (un sector o un nombre), se usa tal cual: no depende de que el modelo acierte.
      const asIs = usableAsCategory(text);
      if (!asIs) throw new AgentRejected("No se pudo identificar ningún rubro de negocio en tu texto. Escríbelo de forma más concreta.");
      categories.push(asIs);
      warnings.push(`La IA no identificó un rubro; se usó tu texto «${asIs}» tal cual (como rubro o como nombre de negocio). Si buscas un tipo de negocio, descríbelo, p. ej. «tiendas de tecnología en Suba».`);
    }
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
