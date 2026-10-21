import { describe, expect, it } from "vitest";
import { CONTACT_FILTER_LABEL, isContactFilter, matchesContactFilter } from "@/lib/contact-filter";
import { hasContact, searchCriteria } from "@/lib/connectors/types";
import { looksEnglish } from "@/lib/ai/guards";
import { dropEnglish } from "@/lib/services/agents";

const c = (o: Partial<{ phone: string | null; email: string | null; website: string | null }> = {}) => ({ phone: null, email: null, website: null, ...o });

describe("filtro de contacto", () => {
  it("cada opción filtra lo que dice", () => {
    expect(matchesContactFilter(c(), "all")).toBe(true);
    expect(matchesContactFilter(c(), "any")).toBe(false);
    expect(matchesContactFilter(c({ phone: "3001112222" }), "any")).toBe(true);
    expect(matchesContactFilter(c({ phone: "3001112222" }), "phone")).toBe(true);
    expect(matchesContactFilter(c({ phone: "3001112222" }), "email")).toBe(false);
    expect(matchesContactFilter(c({ email: "a@b.co" }), "email")).toBe(true);
    expect(matchesContactFilter(c({ website: "a.co" }), "web")).toBe(true);
    expect(matchesContactFilter(c({ website: "a.co" }), "phone")).toBe(false);
  });
  it("un dato vacío o en blanco no cuenta como contacto", () => {
    expect(matchesContactFilter(c({ phone: "  ", email: "", website: null }), "any")).toBe(false);
    expect(hasContact(c({ phone: "   " }))).toBe(false);
    expect(hasContact(c({ website: "a.co" }))).toBe(true);
  });
  it("valida el valor que llega por la URL", () => {
    expect(isContactFilter("any")).toBe(true); expect(isContactFilter("hack")).toBe(false); expect(isContactFilter(undefined)).toBe(false);
    expect(Object.keys(CONTACT_FILTER_LABEL)).toEqual(["all", "any", "phone", "email", "web"]);
  });
  it("la opción de la búsqueda es falsa por defecto", () => {
    expect(searchCriteria.parse({ city: "Bogotá", categories: ["x"] }).requireContact).toBe(false);
    expect(searchCriteria.parse({ city: "Bogotá", categories: ["x"], requireContact: true }).requireContact).toBe(true);
  });
});

describe("el texto de la IA debe estar en español (caso real: Groq respondió en inglés)", () => {
  it("detecta las frases reales de la captura", () => {
    expect(looksEnglish("Insufficient data to assess prospect.")).toBe(true);
    expect(looksEnglish("Prospect shows potential fit and geographic compatibility, but lacks data on volume, frequency, and operational details.")).toBe(true);
  });
  it("no marca el español, ni textos muy cortos", () => {
    expect(looksEnglish("Sin datos suficientes para valorar los criterios de prospecto.")).toBe(false);
    expect(looksEnglish("Vende productos físicos de belleza con local propio.")).toBe(false);
    expect(looksEnglish("Prospect")).toBe(false);
    expect(looksEnglish("")).toBe(false);
  });
  it("los análisis viejos guardados en inglés se limpian al leerlos", () => {
    const p = dropEnglish({ summary: "Insufficient data to assess prospect.", assessments: [
      { criterion: "icp_fit", kind: "inferred", value: 0.5, evidenceIds: [], note: "Prospect lacks data on the business profile.", origin: "model" },
      { criterion: "logistics_need", kind: "inferred", value: 0.6, evidenceIds: [], note: "Vende productos físicos.", origin: "model" },
    ] });
    expect(p.summary).toBe(""); expect(p.assessments[0].note).toBe(""); expect(p.assessments[1].note).toBe("Vende productos físicos.");
  });
});
