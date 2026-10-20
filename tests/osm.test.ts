import { describe, expect, it } from "vitest";
import { OpenStreetMapConnector, filtersFor, safeTerm } from "@/lib/connectors/openstreetmap";
import { searchCriteria } from "@/lib/connectors/types";

const criteria = (o = {}) => searchCriteria.parse({ city: "Bogotá", categories: ["ferretería"], maxResults: 10, ...o });
const NOMINATIM_OK = { boundingbox: ["4.46", "4.83", "-74.22", "-74.01"] };
const el = (id: number, tags: Record<string, string>) => ({ type: "node", id, lat: 4.6, lon: -74.1, tags });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const noSleep = async () => {};

function mock(overpass: (n: number, body: string) => Response, geo: unknown[] = [NOMINATIM_OK]) {
  let n = 0; const bodies: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (String(url).includes("nominatim")) return json(geo);
    bodies.push(String(init?.body)); return overpass(++n, String(init?.body));
  }) as unknown as typeof fetch;
  return { f, bodies, calls: () => n };
}

describe("OpenStreetMapConnector", () => {
  it("no requiere clave", () => expect(new OpenStreetMapConnector().status().state).toBe("connected"));
  it("normaliza, deja null lo ausente y cita la fuente con atribución", async () => {
    const m = mock(() => json({ elements: [el(1, { name: "Ferretería Uno", "addr:street": "Carrera 7", "addr:housenumber": "10-20", "contact:phone": "+57 601 555 1234" }), el(2, { shop: "hardware" })] }));
    const r = await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria());
    expect(r.prospects).toHaveLength(1); // el 2º no tiene nombre
    expect(r.prospects[0]).toMatchObject({ name: "Ferretería Uno", address: "Carrera 7 10-20", phone: "+57 601 555 1234", email: null, website: null, sourceId: "osm:node/1", isDemo: false });
    expect(r.prospects[0].sourceUrl).toBe("https://www.openstreetmap.org/node/1");
    expect(r.prospects[0].limitations).toMatch(/OpenStreetMap/);
    expect(r.estimatedCostUsd).toBe(0);
  });
  it("ordena por completitud y respeta maxResults", async () => {
    const m = mock(() => json({ elements: [el(1, { name: "Sin datos" }), el(2, { name: "Con teléfono", phone: "3001112222" }), el(3, { name: "Con calle", "addr:street": "Calle 1" })] }));
    const r = await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria({ maxResults: 2 }));
    expect(r.prospects.map((p) => p.name)).toEqual(["Con teléfono", "Con calle"]);
  });
  it("reintenta ante 502 y se recupera", async () => {
    const m = mock((n) => (n < 3 ? new Response("capacity", { status: 502 }) : json({ elements: [el(1, { name: "A" })] })));
    const r = await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria());
    expect(r.prospects).toHaveLength(1); expect(m.calls()).toBe(3); expect(r.errors).toEqual([]);
  });
  it("si Overpass sigue caído informa el error y NO inventa resultados", async () => {
    const m = mock(() => new Response("capacity", { status: 502 }));
    const r = await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria());
    expect(r.prospects).toEqual([]); expect(r.errors[0]).toMatch(/502/); expect(m.calls()).toBe(3);
  });
  it("zona desconocida se reporta", async () => {
    const m = mock(() => json({ elements: [] }), []);
    const r = await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria({ zones: ["Narnia"] }));
    expect(r.errors[0]).toMatch(/No se encontró la ubicación/);
  });
  it("respuesta malformada se reporta como error", async () => {
    const m = mock(() => new Response("<html>no json</html>", { status: 200 }));
    const r = await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria());
    expect(r.prospects).toEqual([]); expect(r.errors.length).toBe(1);
  });
  it("excluye por término y evita duplicados de id", async () => {
    const m = mock(() => json({ elements: [el(1, { name: "Ferretería Mayorista" }), el(1, { name: "Ferretería Mayorista" }), el(2, { name: "Otra" })] }));
    const r = await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria({ excludeTerms: ["mayorista"] }));
    expect(r.prospects.map((p) => p.name)).toEqual(["Otra"]);
  });
});

describe("límites de tiempo", () => {
  it("un servidor que no responde produce un error legible, no un cuelgue", async () => {
    const f = (async (url: string, init?: RequestInit) => {
      if (String(url).includes("nominatim")) return json([NOMINATIM_OK]);
      const e = new Error("aborted"); e.name = "TimeoutError"; void init; throw e;
    }) as unknown as typeof fetch;
    const r = await new OpenStreetMapConnector(f, ["u"], noSleep).search(criteria());
    expect(r.prospects).toEqual([]); expect(r.errors[0]).toMatch(/tardó demasiado/);
  });
});

describe("seguridad de la consulta", () => {
  it("el texto del usuario no puede romper la consulta Overpass", () => {
    expect(safeTerm('x"]; node(1); out;//')).toBe("x node 1 out");
    expect(filtersFor('zzz"]; out;')).toEqual(['["name"~"zzz out",i]']);
  });
  it("mapea categorías conocidas a etiquetas y usa nombre para las desconocidas", () => {
    expect(filtersFor("Ferretería")).toContain('["shop"="hardware"]');
    expect(filtersFor("tienda de cosméticos")).toContain('["shop"="cosmetics"]');
    expect(filtersFor("astillero")).toEqual(['["name"~"astillero",i]']);
  });
  it("no se envía texto crudo a Overpass", async () => {
    const m = mock(() => json({ elements: [] }));
    await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria({ categories: ['zzz"]; out;'] }));
    expect(decodeURIComponent(m.bodies[0])).not.toContain('"]; out;');
  });
});
