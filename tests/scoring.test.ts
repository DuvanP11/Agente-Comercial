import { describe, expect, it } from "vitest";
import { scoreProspect, type CriterionAssessment } from "@/lib/scoring/score";
import { findContradictions, validateClaim } from "@/lib/evidence/types";

const a = (value: number, kind: CriterionAssessment["kind"] = "inferred", evidenceIds: string[] = []): CriterionAssessment =>
  ({ value, kind, evidenceIds });

describe("scoring", () => {
  it("sin información no hay prioridad (lo desconocido no se vuelve positivo)", () => {
    const r = scoreProspect({});
    expect(r.priority).toBeNull();
    expect(r.coverage).toBe(0);
  });
  it("cobertura baja → prioridad nula aunque lo poco conocido sea 100%", () => {
    const r = scoreProspect({ icp_fit: a(1) });
    expect(r.priority).toBeNull();
  });
  it("criterios desconocidos no suman ni restan", () => {
    const r = scoreProspect({ icp_fit: a(1), logistics_need: a(1), delivery_volume: a(1), contact_channel: a(0, "unknown") });
    expect(r.priority).toBe(100);
    expect(r.unknownCriteria).toContain("contact_channel");
  });
  it("es reproducible", () => {
    const input = { icp_fit: a(0.5), logistics_need: a(0.8), delivery_volume: a(0.2), delivery_frequency: a(0.4) };
    expect(scoreProspect(input)).toEqual(scoreProspect(input));
  });
  it("respaldo por evidencia solo cuenta datos confirmados con evidencia", () => {
    const r = scoreProspect({
      icp_fit: a(1, "confirmed", ["e1"]), logistics_need: a(1, "inferred"),
      delivery_volume: a(1, "confirmed", []), delivery_frequency: a(1, "confirmed", ["e2"]),
    });
    expect(r.evidenceBacked).toBeCloseTo((20 + 10) / (20 + 20 + 15 + 10));
  });
  it("los pesos se pueden modificar", () => {
    const base = { icp_fit: a(1), logistics_need: a(0), delivery_volume: a(0.5) };
    const w = { icp_fit: 1, logistics_need: 100, delivery_volume: 1, delivery_frequency: 0, geo_compatibility: 0, operational_viability: 0, contact_channel: 0, evidence_quality: 0 };
    expect(scoreProspect(base, w).priority).toBeLessThan(scoreProspect(base).priority!);
  });
});

describe("evidencias", () => {
  it("dato confirmado sin evidencia es inválido", () => {
    expect(validateClaim("confirmed", [])).not.toBeNull();
    expect(validateClaim("inferred", [])).toBeNull();
  });
  it("detecta contradicciones entre fuentes", () => {
    const c = findContradictions([
      { field: "phone", value: "3001234567", sourceName: "google_places" },
      { field: "phone", value: "3109999999", sourceName: "web" },
      { field: "city", value: "Bogotá", sourceName: "web" },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].field).toBe("phone");
  });
});
