import { describe, expect, it } from "vitest";
import { HARD_DEADLINE_MS, MIN_ZONE_DEG, OVERPASS_MIRRORS, OpenStreetMapConnector, categoryKey, ensureMinSize, pickBestArea, filtersFor, phraseFor, safeTerm } from "@/lib/connectors/openstreetmap";
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
    expect(urls.some((u) => u.includes("q=cosmetics shop&") && u.includes("bounded=1") && u.includes("viewbox="))).toBe(true); // por tipo, restringido al recuadro de la zona
    expect(urls.some((u) => u.includes("q=cosmética&"))).toBe(false); // ya hubo resultados: no hace falta el texto
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
    expect(qs[0]).toMatch(/q=cosmetics shop&/); expect(qs[1]).toMatch(/q=cosmética&/); expect(qs[2]).toMatch(/q=astillero&/);
    for (const q of qs) expect(q).toMatch(/viewbox=.*&bounded=1/); // siempre dentro del recuadro de la zona
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
    expect(r.errors.join(" ")).toMatch(/Se omiti(ó|eron) .*por falta de tiempo/);
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


describe("rubros equivalentes y avisos consolidados (caso real: 5-6 rubros casi iguales)", () => {
  it("rubros que hacen la misma consulta tienen la misma clave", () => {
    expect(categoryKey("ferretería")).toBe(categoryKey("artículos de ferretería"));
    expect(categoryKey("ferretería")).toBe(categoryKey("Ferretería de bricolaje"));
    expect(categoryKey("ferretería")).not.toBe(categoryKey("tienda de repuestos")); // otro tipo de negocio
    expect(categoryKey("materiales de construcción")).not.toBe(categoryKey("suministros de construcción")); // por nombre: solo iguales si son iguales
    expect(categoryKey("Astillero")).toBe(categoryKey("astillero"));
  });
  it("se busca UNA vez y se avisa de lo unificado", async () => {
    const m = mock(() => json({ elements: [el(1, { name: "A", phone: "3001112222" })] }));
    const r = await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria({ categories: ["ferretería", "artículos de ferretería", "ferretería de bricolaje", "ferretería de herramientas"] }));
    expect(m.calls()).toBe(1); // antes: 4 consultas iguales
    expect(r.notes!.join(" ")).toMatch(/unificados.*«artículos de ferretería» → «ferretería»/);
    expect(r.prospects).toHaveLength(1);
  });
  it("los rubros realmente distintos siguen siendo búsquedas distintas", async () => {
    const m = mock(() => json({ elements: [] }));
    await new OpenStreetMapConnector(m.f, ["u"], noSleep).search(criteria({ categories: ["ferretería", "droguería", "materiales de construcción"] }));
    expect(m.calls()).toBe(3);
  });
  it("los avisos se juntan: una línea por causa, no una por rubro", async () => {
    const row = (id: number, name: string) => ({ osm_type: "node", osm_id: id, name, category: "shop", extratags: {}, address: {} });
    const f = (async (url: string) => {
      const u = String(url);
      if (u.includes("limit=40")) return json([row(Math.floor(Math.random() * 1e6), "X")]);
      if (u.includes("nominatim")) return json([NOMINATIM_OK]);
      return new Response("c", { status: 502 });
    }) as unknown as typeof fetch;
    const r = await new OpenStreetMapConnector(f, ["u"], noSleep).search(criteria({ categories: ["ferretería", "droguería", "panadería", "ropa", "papelería"] }));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/Overpass no respondió.*para 5 búsquedas/);
    for (const c of ["ferretería", "droguería", "panadería", "ropa", "papelería"]) expect(r.errors[0]).toContain(c);
  });
  it("con un solo rubro el aviso conserva su forma de siempre", async () => {
    const f = (async (url: string) => (String(url).includes("limit=40") ? json([]) : String(url).includes("nominatim") ? json([NOMINATIM_OK]) : new Response("c", { status: 502 }))) as unknown as typeof fetch;
    const r = await new OpenStreetMapConnector(f, ["u"], noSleep).search(criteria());
    expect(r.errors[0]).toMatch(/^«ferretería» en Bogotá, Colombia: Overpass no respondió/);
  });
});


describe("ubicar bien la zona (caso real: «Paloquemao» se resolvía como una estación de bus de 100 m)", () => {
  const row = (cat: string, s: number, n: number, w: number, e: number) => ({ category: cat, boundingbox: [String(s), String(n), String(w), String(e)] });
  const paloquemao = [row("amenity", 4.6163297, 4.6172463, -74.0900581, -74.0892961), row("landuse", 4.612, 4.620, -74.094, -74.086)];

  it("entre varios candidatos elige el ÁREA más grande de tipo zona, no la estación", () => {
    const [s, w, n, e] = pickBestArea(paloquemao)!;
    expect(n - s).toBeGreaterThan(0.007); // el complejo (~0,9 km), no los ~100 m de la estación
    expect(e - w).toBeGreaterThan(0.007);
  });
  it("prefiere límites administrativos y barrios a puntos de interés", () => {
    const b = pickBestArea([row("amenity", 4.6, 4.9, -74.3, -73.9), row("place", 4.62, 4.64, -74.07, -74.05)])!; // el amenity es enorme pero NO es una zona
    expect(b[0]).toBeCloseTo(4.62, 3);
  });
  it("si ningún candidato es una zona, usa el primero", () => {
    const b = pickBestArea([row("highway", 4.60, 4.61, -74.10, -74.09), row("shop", 4.70, 4.71, -74.00, -73.99)])!;
    expect(b[0]).toBeLessThan(4.62);
  });
  it("una zona minúscula se amplía, centrada, al tamaño mínimo", () => {
    const [s, w, n, e] = ensureMinSize([4.6163, -74.0900, 4.6172, -74.0893]);
    expect(n - s).toBeGreaterThanOrEqual(MIN_ZONE_DEG - 1e-6); expect(e - w).toBeGreaterThanOrEqual(MIN_ZONE_DEG - 1e-6);
    expect((s + n) / 2).toBeCloseTo((4.6163 + 4.6172) / 2, 4); // sigue centrada donde estaba
  });
  it("una zona ya grande no se toca", () => {
    expect(ensureMinSize([4.46, -74.22, 4.83, -74.01])).toEqual([4.46, -74.22, 4.83, -74.01]);
  });
  it("sin candidatos o con datos rotos devuelve null", () => {
    expect(pickBestArea([])).toBeNull();
    expect(pickBestArea([{ boundingbox: ["x", "y", "z", "w"] }, { category: "place" }])).toBeNull();
  });
  it("el recuadro que usa Overpass ya viene ampliado", async () => {
    const bodies: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("nominatim") && !u.includes("limit=40")) return json(paloquemao);
      if (u.includes("nominatim")) return json([]);
      bodies.push(decodeURIComponent(String(init?.body).replace(/\+/g, " "))); return json({ elements: [] });
    }) as unknown as typeof fetch;
    await new OpenStreetMapConnector(f, ["u"], noSleep).search(criteria({ zones: ["Paloquemao"] }));
    const m = bodies[0].match(/\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/)!;
    expect(Number(m[3]) - Number(m[1])).toBeGreaterThan(0.007); // la zona NO quedó de 100 m
  });
});


describe("varios servidores de Overpass (caso real: «algunas veces Overpass no responde»)", () => {
  const A = "https://rapido.test/api", B = "https://oficial.test/api";
  function twoMirrors(behave: Record<string, () => Response | Promise<Response>>) {
    const hit: string[] = []; let sleeps = 0;
    const f = (async (url: string) => {
      const u = String(url);
      if (u.includes("nominatim")) return json([NOMINATIM_OK]);
      hit.push(u); return (behave[u] ?? (() => new Response("x", { status: 502 })))();
    }) as unknown as typeof fetch;
    return { f, hit, sleeps: () => sleeps, sleep: async () => { sleeps++; } };
  }
  const els = () => json({ elements: [el(1, { name: "Ferretería Uno", phone: "3001112222" })] });

  it("el servidor rápido responde: no se toca el otro", async () => {
    const m = twoMirrors({ [A]: els });
    const r = await new OpenStreetMapConnector(m.f, [A, B], m.sleep).search(criteria());
    expect(m.hit).toEqual([A]); expect(r.prospects).toHaveLength(1); expect(r.errors).toEqual([]);
  });
  it("si el primero da 502, pasa al segundo AL INSTANTE (sin esperar) y recupera los datos", async () => {
    const m = twoMirrors({ [A]: () => new Response("capacity", { status: 502 }), [B]: els });
    const r = await new OpenStreetMapConnector(m.f, [A, B], m.sleep).search(criteria());
    expect(m.hit).toEqual([A, B]);
    expect(r.prospects).toHaveLength(1); expect(r.errors).toEqual([]); // sin avisos: se resolvió con Overpass, no con el respaldo de texto
    expect(m.sleeps()).toBe(1 + 0); // solo la pausa de 1,1 s de Nominatim; ninguna entre espejos
  });
  it("si el primero se agota por tiempo, también pasa al segundo", async () => {
    const m = twoMirrors({ [A]: () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; }, [B]: els });
    const r = await new OpenStreetMapConnector(m.f, [A, B], m.sleep).search(criteria());
    expect(m.hit).toEqual([A, B]); expect(r.prospects).toHaveLength(1);
  });
  it("si caen los dos, hace una segunda pasada (con espera) y luego usa el respaldo", async () => {
    const m = twoMirrors({});
    const r = await new OpenStreetMapConnector(m.f, [A, B], m.sleep).search(criteria());
    expect(m.hit).toEqual([A, B, A, B]);
    expect(r.errors.join(" ")).toMatch(/Overpass no respondió.*502.*servidores públicos/);
  });
  it("por defecto usa primero el servidor rápido medido en vivo y el oficial de respaldo", () => {
    expect(OVERPASS_MIRRORS[0]).toBe("https://overpass.openstreetmap.fr/api/interpreter");
    expect(OVERPASS_MIRRORS).toContain("https://overpass-api.de/api/interpreter");
  });
});
