import { isLocalidad, type InterpretedSearch } from "./agents/searchInterpreter";

export interface FormFields { city: string; zones: string; categories: string; excludeTerms: string; maxResults: string }
export type FieldSource = "ia" | "mantenido" | "vacio";

/**
 * Combina lo que entendió la IA con lo que ya hay en el formulario.
 * Regla: la IA solo reemplaza un campo cuando ENCONTRÓ un valor; si no, se conserva lo que la persona ya había puesto.
 * (Antes, un texto sin zonas borraba la localidad escrita a mano.)
 */
export function mergeInterpretation(cur: FormFields, out: InterpretedSearch): { next: FormFields; source: Record<keyof FormFields, FieldSource> } {
  const pick = (found: string | null, current: string): { value: string; source: FieldSource } =>
    found ? { value: found, source: "ia" } : current.trim() ? { value: current, source: "mantenido" } : { value: "", source: "vacio" };
  const city = pick(out.city, cur.city);
  const zones = pick(out.zones.length ? out.zones.join(", ") : null, cur.zones);
  const categories = pick(out.categories.length ? out.categories.join(", ") : null, cur.categories);
  const excludeTerms = pick(out.excludeTerms.length ? out.excludeTerms.join(", ") : null, cur.excludeTerms);
  const max = pick(out.maxResults !== null ? String(out.maxResults) : null, cur.maxResults);
  return {
    next: { city: city.value, zones: zones.value, categories: categories.value, excludeTerms: excludeTerms.value, maxResults: max.value },
    source: { city: city.source, zones: zones.source, categories: categories.source, excludeTerms: excludeTerms.source, maxResults: max.source },
  };
}


/** Una frase corta y clara con lo que se va a buscar, armada con los campos finales (no con lo que dijo el modelo). */
export function describeSearch(f: FormFields): string {
  const cats = f.categories.split(",").map((c) => c.trim()).filter(Boolean);
  const zones = f.zones.split(",").map((z) => z.trim()).filter(Boolean);
  if (cats.length === 0) return "Falta indicar qué tipo de negocio buscar.";
  const what = cats.map((c) => `«${c}»`).join(" y ");
  const where = [zones.join(", "), f.city.trim()].filter(Boolean).join(", ");
  const max = f.maxResults.trim() ? ` (hasta ${f.maxResults.trim()} resultados)` : "";
  return `Buscaré ${what}${where ? ` en ${where}` : ""}${max}.`;
}

/** Nombres, en lenguaje llano, de los campos que se conservaron del formulario porque el texto no los menciona. */
export function keptFieldNames(source: Record<keyof FormFields, FieldSource>): string[] {
  const names: Record<keyof FormFields, string> = { city: "la ciudad", zones: "las zonas", categories: "los rubros", excludeTerms: "las exclusiones", maxResults: "el máximo de resultados" };
  return (Object.keys(source) as (keyof FormFields)[]).filter((k) => source[k] === "mantenido").map((k) => names[k]);
}


/**
 * Pocos resultados en una zona pequeña (barrio): OpenStreetMap tiene pocos negocios mapeados ahí. Se sugiere ampliar.
 * Devuelve null si no aplica (suficientes resultados, sin zona, o la zona ya es una localidad completa).
 */
export function fewResultsNote(zones: string[], count: number): string | null {
  if (count >= 5 || zones.length === 0) return null;
  if (zones.every((z) => isLocalidad(z))) return null;
  return `Pocos resultados: en una zona pequeña como «${zones.filter((z) => !isLocalidad(z)).join(", ")}» OpenStreetMap tiene pocos negocios mapeados. Prueba con la localidad completa que la contiene, o quita la zona.`;
}
