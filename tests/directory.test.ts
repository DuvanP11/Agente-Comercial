import { describe, expect, it } from "vitest";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { clients } from "@/lib/db/schema";
import { BusinessDirectoryConnector, chambersFor, ciiuFor, norm } from "@/lib/connectors/business-directory";
import { searchCriteria } from "@/lib/connectors/types";
import { googleLinkedinUrl, linkedinSearchUrl, parseLinkedinCompanyUrl } from "@/lib/linkedin";
import { ingestProspects } from "@/lib/services/prospects";

const crit = (o: object = {}) => searchCriteria.parse({ city: "Bogotá", categories: ["panadería"], ...o });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const rows = [
  { codigo_camara: "04", camara_comercio: "BOGOTA", matricula: "123", razon_social: "PANADERIA LA ESPIGA", cod_ciiu_act_econ_pri: "1081", nit_propietario: "900123456", digito_verificacion: "7", ultimo_ano_renovado: "2026" },
  { codigo_camara: "04", camara_comercio: "BOGOTA", matricula: "124", razon_social: "PANADERIA LA ESPIGA", cod_ciiu_act_econ_pri: "1081", nit_propietario: "900123456", digito_verificacion: "7", ultimo_ano_renovado: "2026" }, // repetida
  { codigo_camara: "04", camara_comercio: "BOGOTA", matricula: "125", razon_social: "Pan & Café Don José", cod_ciiu_act_econ_pri: "1081", nit_propietario: "800555111", ultimo_ano_renovado: "2025" },
];
const now = () => new Date("2026-10-22T12:00:00Z");

describe("directorio empresarial (RUES)", () => {
  it("cámaras: Bogotá, ciudades que dependen de otra cámara y las que no se reconocen", () => {
    expect(chambersFor("Bogotá")).toEqual(["BOGOTA"]); expect(chambersFor("Bogotá D.C.")).toEqual(["BOGOTA"]);
    expect(chambersFor("Medellín")).toEqual(["MEDELLIN PARA ANTIOQUIA"]); expect(chambersFor("Envigado")).toEqual(["ABURRA SUR"]);
    expect(chambersFor("Neiva")).toEqual(["HUILA"]); expect(chambersFor("Cali")).toEqual(["CALI"]);
    expect(chambersFor("Narnia")).toEqual([]); expect(chambersFor("ab")).toEqual([]);
    expect(norm("Chocó  (centro)")).toBe("CHOCO CENTRO");
  });
  it("rubros → CIIU comprobados; rubros raros no inventan código", () => {
    expect(ciiuFor("panadería")).toEqual(["1081"]); expect(ciiuFor("ferretería")).toEqual(["4752"]); expect(ciiuFor("papelería")).toEqual(["4761"]);
    expect(ciiuFor("cosmética y perfumería")).toEqual(["4773"]); expect(ciiuFor("tienda de ropa")).toEqual(expect.arrayContaining(["4771"]));
    expect(ciiuFor("peluquería")).toEqual(["9602"]); expect(ciiuFor("astrofísica cuántica")).toEqual([]);
  });
  it("arma la consulta con estado activo, renovación reciente, cámara, CIIU y exclusiones; sin comillas sueltas", async () => {
    let url = "";
    const f = (async (u: string) => { url = decodeURIComponent(String(u).replace(/\+/g, " ")); return json(rows); }) as unknown as typeof fetch;
    const r = await new BusinessDirectoryConnector(f, now).search(crit({ excludeTerms: ["o'brien"] }));
    expect(url).toContain("estado_matricula='ACTIVA'"); expect(url).toContain("ultimo_ano_renovado >= '2025'");
    expect(url).toContain("camara_comercio in ('BOGOTA')"); expect(url).toContain("cod_ciiu_act_econ_pri in ('1081')");
    expect(url).toContain("not like '%O BRIEN%'"); expect(url).not.toContain("O'BRIEN"); // la comilla nunca llega a la consulta
    expect(r.errors).toEqual([]);
  });
  it("normaliza: sin repetidos, nombre legible, NIT con dígito, fuente y salvedad; sin contacto ni dirección", async () => {
    const f = (async () => json(rows)) as unknown as typeof fetch;
    const r = await new BusinessDirectoryConnector(f, now).search(crit());
    expect(r.prospects).toHaveLength(2);
    expect(r.prospects[0]).toMatchObject({ name: "Panaderia La Espiga", category: "panadería", city: "Bogotá", phone: null, email: null, website: null, address: null, nit: "900123456-7", sourceName: "rues_datos_abiertos", sourceId: "04-123" });
    expect(r.prospects[0].limitations).toMatch(/No trae teléfono.*CC BY-SA 4\.0/);
    expect(r.prospects[1].name).toBe("Pan & Café Don José");           // lo que ya tiene minúsculas no se toca
    expect(r.notes!.join(" ")).toMatch(/Confecámaras/);
  });
  it("avisos honestos: zonas no aplican, «solo con contacto» no tiene sentido, ciudad o rubro desconocidos, servicio caído", async () => {
    const f = (async () => json(rows)) as unknown as typeof fetch;
    const c = new BusinessDirectoryConnector(f, now);
    expect((await c.search(crit({ zones: ["Chapinero"] }))).notes!.join(" ")).toMatch(/zonas no se pueden aplicar/);
    expect((await c.search(crit({ requireContact: true }))).errors[0]).toMatch(/no trae teléfono/);
    expect((await c.search(crit({ city: "Narnia" }))).errors[0]).toMatch(/No se reconoce una Cámara/);
    expect((await c.search(crit({ categories: ["xy"] }))).errors[0]).toMatch(/No pude relacionar/);
    expect((await c.search(crit({ categories: ["astrofísica"] }))).notes!.join(" ")).toMatch(/palabras en el nombre/); // sin CIIU: busca por nombre y lo avisa
    const down = (async () => json({}, 503)) as unknown as typeof fetch;
    expect((await new BusinessDirectoryConnector(down, now).search(crit())).errors[0]).toMatch(/503/);
    const mix = await c.search(crit({ categories: ["panadería", "origami"] }));
    expect(mix.notes!.join(" ")).toMatch(/Sin actividad económica asociada para «origami»/);
  });
  it("el NIT detecta que ya es cliente aunque el nombre sea distinto, y queda como evidencia", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    await d.insert(clients).values({ orgId: o, name: "Industrias Espiga S.A.S.", nit: "900.123.456-7", nameKey: "industrias espiga sas", nitKey: "900123456" });
    const f = (async () => json(rows)) as unknown as typeof fetch;
    const r = await new BusinessDirectoryConnector(f, now).search(crit());
    const out = await ingestProspects(d, o, r.prospects);
    expect(out[0].status).toBe("excluded_duplicate"); expect(out[0].matchedWith?.type).toBe("client");
    expect(out[1].status).toBe("new");
  });
});

describe("LinkedIn asistido", () => {
  it("solo acepta páginas de EMPRESA de LinkedIn por https y las normaliza", () => {
    expect(parseLinkedinCompanyUrl("https://www.linkedin.com/company/pibox/")).toBe("https://www.linkedin.com/company/pibox");
    expect(parseLinkedinCompanyUrl("linkedin.com/company/pibox-mensajeria?trk=x")).toBe("https://www.linkedin.com/company/pibox-mensajeria");
    expect(parseLinkedinCompanyUrl("https://co.linkedin.com/company/acme")).toBe("https://www.linkedin.com/company/acme");
    for (const bad of ["http://www.linkedin.com/company/x", "https://www.linkedin.com/in/juan-perez", "https://evil.com/company/x", "https://linkedin.com.evil.com/company/x", "javascript:alert(1)", "", "https://www.linkedin.com/company/"]) expect(parseLinkedinCompanyUrl(bad), bad).toBeNull();
  });
  it("arma enlaces de búsqueda codificados (sin extraer nada)", () => {
    expect(linkedinSearchUrl("tienda de ropa", "Bogotá")).toBe("https://www.linkedin.com/search/results/companies/?keywords=tienda%20de%20ropa%20Bogot%C3%A1");
    expect(googleLinkedinUrl("ropa", "Bogotá")).toContain("site%3Alinkedin.com%2Fcompany");
  });
});

import { sourceLabel } from "@/components/OutcomeTable";
describe("texto del enlace a la fuente", () => {
  it("según el sitio, no siempre OpenStreetMap", () => {
    expect(sourceLabel("https://www.openstreetmap.org/node/1")).toBe("Ver en OpenStreetMap");
    expect(sourceLabel("https://www.datos.gov.co/d/nb3d-v3n7")).toBe("Ver registro (datos abiertos)");
    expect(sourceLabel("https://www.linkedin.com/company/pibox")).toBe("Ver en LinkedIn");
    expect(sourceLabel("https://maps.google.com/?cid=1")).toBe("Ver en Google Maps");
    expect(sourceLabel("archivo:clientes.csv")).toBe("Ver fuente");
  });
});
