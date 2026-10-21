import type { InterpretedSearch } from "./agents/searchInterpreter";

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
