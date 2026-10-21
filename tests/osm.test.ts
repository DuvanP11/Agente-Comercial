import { describe, expect, it } from "vitest";
import { HARD_DEADLINE_MS, OpenStreetMapConnector, filtersFor, phraseFor, safeTerm } from "@/lib/connectors/openstreetmap";
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

describe("respaldo con búsqueda de texto", () => {
  const row = (id: number, name: string, extra = {}) => ({ osm_type: "node", osm_id: id, name, category: "amenity", extratags: {}, address: { road: "Carrera 7" }, ...extra });
  const mk = (rows: unknown[]) => (async (url: string) => {
    const u = String(url);
    if (u.includes("nominatim") && u.includes("limit=40")) return json(rows);
    if (u.includes("nominatim")) return json([NOMINATIM_OK]);
    return new Response("capacity", { status: 502 });
  }) as unknown as typeof fetch;

  it("si Overpass cae, usa Nominatim, lo avisa y marca la salvedad en cada dato", async () => {
    const r = await new OpenStreetMapConnector(mk([row(1, "Droguería La 7", { extratags: { phone: "+57 1 555 0000" } }), row(2, "Parque", { category: "leisure" })]), ["u"], noSleep).search(criteria({ categories: ["droguería"] }));
    expect(r.prospects.map((p) => p.name)).toEqual(["Droguería La 7"]); // el parque se descarta por tipo
    expect(r.prospects[0]).toMatchObject({ phone: "+57 1 555 0000", address: "Carrera 7", sourceId: "osm:node/1" });
    expect(r.prospects[0].limitations).toMatch(/respaldo/);
    expect(r.errors[0]).toMatch(/Overpass no respondió.*buscador de texto/);
  });
  it("si también falla el respaldo, informa ambos errores y no inventa", async () => {
    const f = (async (url: string) => (String(url).includes("limit=40") ? new Response("x", { status: 503 }) : String(url).includes("nominatim") ? json([NOMINATIM_OK]) : new Response("c", { status: 502 }))) as unknown as typeof fetch;
    const r = await new OpenStreetMapConnector(f, ["u"], noSleep).search(criteria());
    expect(r.prospects).toEqual([]); expect(r.errors[0]).toMatch(/respaldo tampoco respondió/);
  });
});

describe("solo con teléfono, correo o web", () => {
  it("el filtro va DENTRO de la consulta de Overpass cuando se pide", async () => {
    const m = mock(() => json({ elements: [el(1, { name: "A", phone: "3001112222" })] }));
    await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria({ requireContact: true }));
    const q = decodeURIComponent(m.bodies[0].replace(/\+/g, " "));
    expect(q).toContain('[~"^(phone|contact:phone|website|contact:website|email|contact:email)$"~"."]');
    expect(q).toMatch(/\["shop"="hardware"\]\[~/); // el filtro de contacto se aplica a cada etiqueta del rubro
  });
  it("sin la opción, la consulta NO lleva el filtro", async () => {
    const m = mock(() => json({ elements: [] }));
    await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria());
    expect(decodeURIComponent(m.bodies[0])).not.toContain("contact:phone");
  });
  it("además filtra los resultados sin contacto (respaldo de texto, que no puede filtrar en la consulta)", async () => {
    const row = (id: number, name: string, extra = {}) => ({ osm_type: "node", osm_id: id, name, category: "shop", extratags: {}, address: {}, ...extra });
    const f = (async (url: string) => {
      const u = String(url);
      if (u.includes("limit=40")) return json([row(1, "Con teléfono", { extratags: { phone: "+57 601 555 1234" } }), row(2, "Sin nada"), row(3, "Con web", { extratags: { website: "https://a.co" } }), row(4, "Con correo", { extratags: { "contact:email": "a@b.co" } })]);
      if (u.includes("nominatim")) return json([NOMINATIM_OK]);
      return new Response("c", { status: 502 });
    }) as unknown as typeof fetch;
    const r = await new OpenStreetMapConnector(f, ["u"], noSleep).search(criteria({ requireContact: true }));
    expect(r.prospects.map((p) => p.name).sort()).toEqual(["Con correo", "Con teléfono", "Con web"]);
    const sin = await new OpenStreetMapConnector(f, ["u"], noSleep).search(criteria());
    expect(sin.prospects.map((p) => p.name)).toContain("Sin nada");
  });
});

describe("respaldo por tipo de negocio", () => {
  it("busca por tipo ('cosmetics shop in …') antes que por texto", async () => {
    const urls: string[] = [];
    const f = (async (url: string) => {
      const u = decodeURIComponent(String(url).replace(/\+/g, " ")); urls.push(u);
      if (u.includes("limit=40")) return json([{ osm_type: "node", osm_id: 7, name: "Glam House", category: "shop", extratags: {}, address: {} }]);
      if (u.includes("nominatim")) return json([NOMINATIM_OK]);
      return new Response("c", { status: 502 });
    }) as unknown as typeof fetch;
    const r = await new OpenStreetMapConnector(f, ["u"], noSleep).search(criteria({ categories: ["cosmética"] }));
    expect(r.prospects.map((p) => p.name)).toEqual(["Glam House"]);
    expect(urls.some((u) => u.includes("q=cosmetics shop in Bogotá"))).toBe(true);
    expect(urls.some((u) => u.includes("q=cosmética,"))).toBe(false); // ya hubo resultados: no hace falta el texto
  });
  it("si por tipo no hay nada, prueba por texto; las categorías sin mapear van directo al texto", async () => {
    const qs: string[] = [];
    const f = (async (url: string) => {
      const u = decodeURIComponent(String(url).replace(/\+/g, " "));
      if (u.includes("limit=40")) { qs.push(u); return json([]); }
      if (u.includes("nominatim")) return json([NOMINATIM_OK]);
      return new Response("c", { status: 502 });
    }) as unknown as typeof fetch;
    await new OpenStreetMapConnector(f, ["u"], noSleep).search(criteria({ categories: ["cosmética", "astillero"] }));
    expect(qs).toHaveLength(3); // cosmética: tipo + texto; astillero: solo texto
    expect(qs[0]).toMatch(/q=cosmetics shop in/); expect(qs[1]).toMatch(/q=cosmética,/); expect(qs[2]).toMatch(/q=astillero,/);
  });
  it("phraseFor", () => {
    expect(phraseFor("Ferretería")).toBe("hardware store");
    expect(phraseFor("tienda de ropa")).toBe("clothes shop");
    expect(phraseFor("astillero")).toBeNull();
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


describe("tope de tiempo: el servidor corta todo lo que pase de 60 s", () => {
  /** Reloj simulado: cada llamada «tarda» lo que se indique. */
  function clocked(tookMs: number) {
    let t = 0; const calls: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const u = String(url); calls.push(u.includes("nominatim") ? (u.includes("limit=40") ? "fallback" : "geocode") : "overpass");
      t += tookMs;
      if (u.includes("nominatim")) return u.includes("limit=40") ? json([{ osm_type: "node", osm_id: calls.length, name: `N${calls.length}`, category: "shop", extratags: {}, address: {} }]) : json([NOMINATIM_OK]);
      void init; return new Response("capacity", { status: 502 });
    }) as unknown as typeof fetch;
    return { f, now: () => t, calls };
  }

  it("la suma de esperas de una búsqueda con muchas zonas y rubros no pasa del límite duro", async () => {
    const c = clocked(20_000); // cada llamada de red «tarda» 20 s
    const conn = new OpenStreetMapConnector(c.f, ["u"], async () => {}, c.now);
    const r = await conn.search(criteria({ zones: ["Suba", "Usaquén", "Chapinero"], categories: ["ferretería", "droguería", "ropa"], maxResults: 60 }));
    expect(c.now()).toBeLessThan(HARD_DEADLINE_MS + 3 * 20_000 + 1); // nunca se inicia nada nuevo pasado el límite (a lo sumo termina la que ya estaba en curso)
    expect(r.errors.join(" ")).toMatch(/Se omitió .* por falta de tiempo/);
    expect(c.calls.length).toBeLessThan(3 * 3 * 3); // no se hicieron todas las llamadas posibles
  });
  it("sin retrasos, hace todo el trabajo y no omite nada", async () => {
    const c = clocked(10);
    const r = await new OpenStreetMapConnector(c.f, ["u"], async () => {}, c.now).search(criteria({ zones: ["Suba", "Chapinero"], categories: ["ferretería", "droguería"], maxResults: 60 }));
    expect(r.errors.join(" ")).not.toMatch(/falta de tiempo/);
  });
  it("lo ya encontrado se conserva aunque se omita el resto", async () => {
    const c = clocked(25_000);
    const r = await new OpenStreetMapConnector(c.f, ["u"], async () => {}, c.now).search(criteria({ zones: ["Suba", "Usaquén"], categories: ["ferretería", "droguería"], maxResults: 60 }));
    expect(r.prospects.length).toBeGreaterThan(0);
  });
  it("el límite duro es menor que el máximo de la página (60 s) con margen para guardar", () => {
    expect(HARD_DEADLINE_MS).toBeLessThanOrEqual(45_000);
  });
});
