import { describe, expect, it } from "vitest";
import { detectSector, OBJECTIONS, prepareApproach, type ApproachInput } from "@/lib/skills/approach";

const base = (o: Partial<ApproachInput> = {}): ApproachInput => ({
  name: "Glam House", category: "cosmética", city: "Bogotá", phone: "3107778899", website: null, email: null, address: "Carrera 90",
  score: { priority: 70, coverage: 0.6, unknownCriteria: ["delivery_volume"] }, evidence: [], history: [], doNotContact: false, status: "new", ...o,
});

describe("detectSector", () => {
  it("reconoce rubros con tildes y variantes", () => {
    expect(detectSector("cosmética")).toBe("belleza");
    expect(detectSector("Droguería")).toBe("salud");
    expect(detectSector("tienda de ropa")).toBe("moda");
    expect(detectSector("Ferretería")).toBe("ferreteria");
    expect(detectSector(null, "Restaurante El Sol")).toBe("alimentos");
    expect(detectSector("astillero")).toBe("general");
  });
});

describe("prepareApproach", () => {
  it("'qué sabemos' contiene SOLO datos presentes, con su fuente", () => {
    const a = prepareApproach(base({ evidence: [{ field: "address", observedValue: "Carrera 90", sourceName: "openstreetmap", verification: "source_observed" }] }));
    const k = a.known.join(" ");
    expect(k).toContain("Carrera 90 (OpenStreetMap)");
    expect(k).toContain("3107778899");
    expect(k).not.toMatch(/sitio web|correo/i); // no hay web ni correo: no se menciona como dato
  });
  it("lo que falta aparece como desconocido y nunca como hecho", () => {
    const a = prepareApproach(base());
    expect(a.unknown.join(" ")).toMatch(/Sitio web/); expect(a.unknown.join(" ")).toMatch(/Correo/);
    expect(a.unknown.join(" ")).toMatch(/Volumen y frecuencia/);
  });
  it("criterios desconocidos del scoring pasan a 'por verificar'", () => {
    expect(prepareApproach(base()).toVerify.join(" ")).toMatch(/Volumen potencial de entregas: desconocido/);
    expect(prepareApproach(base({ score: null })).toVerify[0]).toMatch(/no se han valorado/);
    expect(prepareApproach(base({ score: { priority: null, coverage: 0.2, unknownCriteria: [] } })).toVerify[0]).toMatch(/Información insuficiente.*20 %/);
  });
  it("preguntas: las del rubro primero y las generales después", () => {
    const q = prepareApproach(base()).diagnosticQuestions;
    expect(q[0]).toMatch(/Instagram|WhatsApp/); expect(q.join(" ")).toMatch(/envíos o entregas hacen a la semana/);
  });
  it("las objeciones advierten no inventar tarifas, coberturas ni tiempos", () => {
    expect(OBJECTIONS.find((o) => /caro/.test(o.objection))!.caution).toMatch(/No des tarifas/);
    expect(OBJECTIONS.find((o) => /no confío/i.test(o.objection))!.caution).toMatch(/No prometas/);
  });
  it("siguiente acción según el estado real", () => {
    expect(prepareApproach(base({ doNotContact: true })).nextAction.code).toBe("blocked");
    expect(prepareApproach(base({ status: "needs_review" })).nextAction.code).toBe("resolve_duplicate");
    expect(prepareApproach(base({ phone: null })).nextAction.code).toBe("complete_contact");
    expect(prepareApproach(base({ score: null })).nextAction.code).toBe("assess");
    expect(prepareApproach(base()).nextAction.code).toBe("add_to_campaign");
    expect(prepareApproach(base({ history: [{ type: "campaign_status", to: "contacted", at: new Date() }] })).nextAction.code).toBe("follow_up");
  });
  it("no contactar gana sobre cualquier otra acción", () => {
    expect(prepareApproach(base({ doNotContact: true, status: "needs_review", phone: null, score: null })).nextAction.code).toBe("blocked");
  });
  it("el mensaje de apertura usa los datos del prospecto", () => {
    expect(prepareApproach(base()).opening).toContain("Glam House");
  });
});
