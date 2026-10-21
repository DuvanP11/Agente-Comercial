import { z } from "zod";
import { appearsIn, lenientStrings, SYSTEM_RULES, untrusted } from "../ai/guards";
import { detectSector, type Sector } from "../skills/approach";
import { safeTerm } from "../connectors/openstreetmap";
import { stripAccents } from "../dedup/normalize";
import { AgentRejected, type AgentDef } from "./core";

const input = z.object({ text: z.string().trim().min(3, "Escribe una descripción de lo que buscas (al menos 3 letras).").max(1000) });
const output = z.object({
  city: z.string().nullish().transform((v) => v ?? null),
  zones: lenientStrings,
  categories: lenientStrings,
  maxResults: z.number().nullish().transform((v) => v ?? null),
  excludeTerms: lenientStrings,
  notes: z.string().nullish().transform((v) => v ?? null),
  suggestions: lenientStrings,
});
export type InterpretedSearch = { city: string | null; zones: string[]; categories: string[]; maxResults: number | null; excludeTerms: string[]; notes: string | null; suggestions: string[] };

/** Las 20 localidades de Bogotá. Si el modelo devuelve una como «ciudad», en realidad es una zona de Bogotá. */
export const BOGOTA_LOCALIDADES = ["usaquen", "chapinero", "santa fe", "san cristobal", "usme", "tunjuelito", "bosa", "kennedy", "fontibon", "engativa", "suba", "barrios unidos", "teusaquillo", "los martires", "antonio narino", "puente aranda", "la candelaria", "rafael uribe uribe", "ciudad bolivar", "sumapaz"];
const isLocalidad = (x: string) => BOGOTA_LOCALIDADES.includes(stripAccents(x).toLowerCase().trim());

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

/** Rubros de cada familia de negocio que la plataforma ya sabe buscar; sirven de respaldo si el modelo sugiere poco. */
const SECTOR_SUGGESTIONS: Partial<Record<Sector, string[]>> = {
  belleza: ["tienda de cosméticos", "perfumería", "salón de belleza", "peluquería"],
  moda: ["tienda de ropa", "zapatería", "boutique", "tienda de uniformes", "tienda de carteras"],
  alimentos: ["restaurante", "panadería", "supermercado", "fruver", "carnicería", "tienda de licores"],
  salud: ["droguería", "farmacia", "óptica", "veterinaria"],
  ferreteria: ["ferretería", "tienda de pinturas", "tienda de repuestos", "cerrajería"],
  tecnologia: ["tienda de electrónica", "tienda de celulares", "tienda de computadores", "papelería", "librería"],
};

/** Palabras demasiado genéricas: no sirven para decir que dos rubros se parecen ("tienda de ropa" ≠ "tienda de gafas"). */
const GENERIC = new Set(["tienda", "tiendas", "centro", "centros", "local", "locales", "negocio", "negocios", "servicio", "servicios", "venta", "ventas", "para", "casa"]);
const tokens = (t: string) => stripAccents(t).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC.has(w));
/** ¿Comparten alguna palabra (por raíz de 5 letras)? "tienda de ropa" ~ "Ropa", "tecnología" ~ "tecnológicos". */
export function shareWord(a: string, b: string): boolean {
  const tb = tokens(b).map((w) => w.slice(0, 5));
  return tokens(a).some((w) => tb.includes(w.slice(0, 5)));
}

/** ¿Un rubro devuelto por el modelo se relaciona con lo que escribió la persona? Por palabra común o por misma familia de negocio. */
export function relatedToText(category: string, text: string): boolean {
  if (shareWord(category, text) || appearsIn(category, text)) return true;
  const sector = detectSector(category);
  return sector !== "general" && sector === detectSector(text);
}

/**
 * Sugerencias del modelo que SÍ son del mismo tipo de negocio que lo buscado: misma familia de rubro
 * (belleza, moda, salud…) o que comparten una palabra. Lo demás se descarta (el modelo a veces sugiere cosas sin relación).
 */
export function relatedSuggestions(suggestions: string[], categories: string[], max = 5): string[] {
  const catSectors = new Set(categories.map((c) => detectSector(c)).filter((s) => s !== "general"));
  const taken = [...categories];
  const norm = (x: string) => stripAccents(x).toLowerCase();
  // Lo que da el modelo solo se descarta si es IGUAL a algo ya elegido («tienda de ropa infantil» sí vale aunque la búsqueda sea «ropa»).
  const exactDup = (sug: string) => taken.some((t) => norm(t) === norm(sug));
  // El respaldo es más estricto: no repite rubros que ya se parecen a lo elegido.
  const nearDup = (sug: string) => taken.some((t) => norm(t) === norm(sug) || shareWord(t, sug));
  const out: string[] = [];
  for (const raw of suggestions) {
    const sug = safeTerm(raw);
    if (sug.length < 3 || exactDup(sug)) continue;
    const sector = detectSector(sug);
    const related = (sector !== "general" && catSectors.has(sector)) || categories.some((c) => shareWord(c, sug));
    if (related) { out.push(sug); taken.push(sug); }
    if (out.length >= max) return out;
  }
  // Si el modelo dio pocas o ninguna, se completa con rubros de la misma familia que la plataforma sabe buscar.
  for (const sector of catSectors) {
    for (const sug of SECTOR_SUGGESTIONS[sector] ?? []) {
      if (out.length >= max) return out;
      if (!nearDup(sug)) { out.push(sug); taken.push(sug); }
    }
  }
  return out;
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
      `Devuelve {"city":string|null,"zones":string[],"categories":string[],"maxResults":number|null,"excludeTerms":string[],"notes":string|null,"suggestions":string[]}. ` +
      `city: la ciudad principal SOLO si aparece en la petición, si no null. zones: localidades o barrios mencionados. ` +
      `categories: tipos de negocio a buscar, máximo 6, en forma de rubro corto (p. ej. "tienda de ropa", "ferretería"). ` +
      `maxResults: solo si la petición pide una cantidad. excludeTerms: palabras de nombres a excluir si el usuario lo pide. ` +
      `notes: lo que no puedas convertir en criterios (por ejemplo, "con presencia digital"). ` +
      `suggestions: hasta 5 rubros RELACIONADOS con lo que busca (del mismo tipo de negocio) que la persona podría querer añadir, en forma de rubro corto como "tienda de ropa infantil"; no repitas los de categories. ` +
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
    // Texto corto y claro ("Ropa") pero el modelo devolvió algo sin relación ("Gafas"): se usa lo que escribiste.
    const asWritten = usableAsCategory(text);
    if (asWritten && categories.length && categories.every((c) => !relatedToText(c, text))) {
      warnings.push(`La IA devolvió «${categories.join(", ")}», que no se parece a lo que escribiste; se usó tu texto «${asWritten}».`);
      categories.splice(0, categories.length, asWritten);
    }
    let city = o.city ? safeTerm(o.city) || null : null;
    const zonesIn = o.zones.map(safeTerm).filter(Boolean);
    // «Suba» o «Chapinero» no son ciudades: son localidades de Bogotá. Se mueven a zonas y la ciudad pasa a ser Bogotá.
    if (city && isLocalidad(city)) {
      warnings.push(`«${city}» es una localidad de Bogotá: se tomó como zona y la ciudad como Bogotá.`);
      if (!zonesIn.some((z) => stripAccents(z).toLowerCase() === stripAccents(city!).toLowerCase())) zonesIn.unshift(city);
      city = "Bogotá";
    }
    if (city && !appearsIn(city, text) && !(city === "Bogotá" && zonesIn.some(isLocalidad))) warnings.push(`La ciudad «${city}» no aparece en tu texto: verifícala antes de buscar.`);
    if (!city) warnings.push("No se detectó la ciudad: complétala a mano.");
    const zones = zonesIn.slice(0, 10);
    for (const z of zones) if (!appearsIn(z, text)) warnings.push(`La zona «${z}» no aparece en tu texto: verifícala.`);
    for (const c of categories) if (!relatedToText(c, text)) warnings.push(`El rubro «${c}» es una interpretación del modelo: confirma que es lo que buscas.`);
    let maxResults = o.maxResults;
    if (maxResults !== null && (!Number.isFinite(maxResults) || maxResults < 1)) maxResults = null;
    if (maxResults !== null) maxResults = Math.min(60, Math.round(maxResults));
    return { output: { city, zones, categories, maxResults, excludeTerms: o.excludeTerms.map(safeTerm).filter(Boolean).slice(0, 10), notes: o.notes?.slice(0, 300) ?? null, suggestions: relatedSuggestions(o.suggestions, categories) }, warnings };
  },
};
