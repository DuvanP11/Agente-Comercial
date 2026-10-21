import { hasContact, type Connector, type ConnectorResult, type ConnectorStatus, type RawProspect, type SearchCriteria } from "./types";
import { stripAccents } from "../dedup/normalize";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS_DEFAULT = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "pibox-commercial-intelligence/0.1 (hneira@picap.co)";
/** Cada llamada externa tiene tope; la búsqueda completa también, para que Vercel nunca mate la función en silencio. */
// Vercel CORTA toda petición que pase de 60 s (maxDuration): un exceso no devuelve un error legible, rompe la pantalla.
// Presupuesto total de una búsqueda ≈ 44 s de red + unos segundos para guardar, siempre por debajo de 60.
const REQUEST_TIMEOUT_MS = 28_000; // una consulta de Overpass tarda ~35 s cuando está ocupado: pasada esa espera se usa el respaldo
const SEARCH_BUDGET_MS = 30_000;   // tiempo máximo dedicado a Overpass en toda la búsqueda
export const HARD_DEADLINE_MS = 44_000; // tras esto no se inicia ninguna llamada nueva
/** Tiene alguna de estas etiquetas de contacto (con cualquier valor). */
const CONTACT_FILTER = '[~"^(phone|contact:phone|website|contact:website|email|contact:email)$"~"."]';
const ATTRIBUTION = "Datos © colaboradores de OpenStreetMap (licencia ODbL). Completitud variable: pocos negocios traen teléfono o web.";

/** Categoría en español → filtros de etiquetas OSM + frase en inglés que entiende Nominatim (respaldo). Lo que no esté aquí se busca por nombre. */
const TAGS: [string[], string[], string][] = [
  [["ferreter"], ['["shop"="hardware"]', '["shop"="doityourself"]'], "hardware store"],
  [["cosmetic", "perfumer", "belleza", "maquillaje"], ['["shop"="cosmetics"]', '["shop"="perfumery"]', '["shop"="beauty"]'], "cosmetics shop"],
  [["ropa", "moda", "vestuario", "boutique"], ['["shop"="clothes"]', '["shop"="boutique"]', '["shop"="fashion"]'], "clothes shop"],
  [["zapater", "calzado"], ['["shop"="shoes"]'], "shoe shop"],
  [["panader", "pasteler"], ['["shop"="bakery"]', '["shop"="pastry"]'], "bakery"],
  [["farmacia", "droguer"], ['["amenity"="pharmacy"]'], "pharmacy"],
  [["restaurante"], ['["amenity"="restaurant"]'], "restaurant"],
  [["supermercado", "minimercado", "tienda de barrio"], ['["shop"="supermarket"]', '["shop"="convenience"]'], "supermarket"],
  [["papeler"], ['["shop"="stationery"]'], "stationery shop"],
  [["licor", "vinos"], ['["shop"="alcohol"]'], "liquor store"],
  [["mascota", "veterinar"], ['["shop"="pet"]', '["amenity"="veterinary"]'], "pet shop"],
  [["electronic", "tecnolog", "celular", "computador"], ['["shop"="electronics"]', '["shop"="mobile_phone"]', '["shop"="computer"]'], "electronics shop"],
  [["flor"], ['["shop"="florist"]'], "florist"],
  [["joyer", "relojer"], ['["shop"="jewelry"]'], "jewelry shop"],
  [["mueble", "decoraci"], ['["shop"="furniture"]', '["shop"="interior_decoration"]'], "furniture shop"],
  [["libreria"], ['["shop"="books"]'], "book shop"],
  [["optica"], ['["shop"="optician"]'], "optician"],
  [["juguet"], ['["shop"="toys"]'], "toy shop"],
  [["deport"], ['["shop"="sports"]'], "sports shop"],
  [["ferret", "repuesto", "autopart"], ['["shop"="car_parts"]'], "car parts shop"],
  [["lavander"], ['["shop"="laundry"]'], "laundry"],
  [["carnicer", "pescader"], ['["shop"="butcher"]', '["shop"="seafood"]'], "butcher"],
  [["fruver", "verdura", "fruta"], ['["shop"="greengrocer"]'], "greengrocer"],
];

/** Solo letras, números y espacios: lo que escribe el usuario nunca llega crudo a la consulta. */
export function safeTerm(s: string): string {
  return s.replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function filtersFor(category: string): string[] {
  const term = safeTerm(category);
  const flat = stripAccents(term).toLowerCase();
  const hit = TAGS.find(([stems]) => stems.some((s) => flat.includes(s)));
  const byName = `["name"~"${term}",i]`;
  return hit ? hit[1] : [byName];
}

/** Frase de tipo de negocio que Nominatim entiende ("cosmetics shop"); null si la categoría no está mapeada. */
export function phraseFor(category: string): string | null {
  const flat = stripAccents(safeTerm(category)).toLowerCase();
  return TAGS.find(([stems]) => stems.some((x) => flat.includes(x)))?.[2] ?? null;
}

interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }
type Bbox = [number, number, number, number]; // sur, oeste, norte, este

export class OpenStreetMapConnector implements Connector {
  id = "openstreetmap";
  label = "OpenStreetMap (gratis)";
  capabilities = ["business_search", "address", "geocoding"];

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly overpassUrls: string[] = (process.env.OVERPASS_URL || OVERPASS_DEFAULT).split(",").map((u) => u.trim()).filter(Boolean),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly now: () => number = Date.now,
  ) {}

  /** Límite duro de la búsqueda en curso (instante). */
  private hardAt = Infinity;
  /** Tiempo de espera de una llamada: el normal, pero nunca más allá del límite duro de la búsqueda. */
  private timeoutSignal(signal?: AbortSignal): AbortSignal {
    const ms = Math.min(REQUEST_TIMEOUT_MS, Math.max(2_000, this.hardAt - this.now()));
    return signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
  }

  status(): ConnectorStatus { return { state: "connected" }; } // no requiere clave

  private async geocode(place: string, signal?: AbortSignal): Promise<Bbox | null> {
    const url = `${NOMINATIM}?${new URLSearchParams({ q: place, format: "jsonv2", limit: "1", countrycodes: "co" })}`;
    const res = await this.fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: this.timeoutSignal(signal) });
    if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`);
    const rows = (await res.json()) as { boundingbox?: string[] }[];
    const b = rows[0]?.boundingbox?.map(Number);
    if (!b || b.length !== 4 || b.some(Number.isNaN)) return null;
    return [b[0], b[2], b[1], b[3]]; // Nominatim: sur, norte, oeste, este
  }

  private async overpass(query: string, deadline: number, signal?: AbortSignal): Promise<OsmElement[]> {
    let lastError = "sin intentos";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.now() > deadline) { lastError = "se agotó el tiempo máximo de la búsqueda"; break; }
      const url = this.overpassUrls[attempt % this.overpassUrls.length];
      try {
        const res = await this.fetchImpl(url, {
          method: "POST", headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(), signal: this.timeoutSignal(signal),
        });
        if (res.ok) {
          const data = (await res.json()) as { elements?: OsmElement[] };
          return data.elements ?? [];
        }
        lastError = `Overpass respondió ${res.status}`;
      } catch (e) {
        if (signal?.aborted) throw e;
        if (e instanceof Error && e.name === "TimeoutError") lastError = "el servidor tardó demasiado en responder";
        else        lastError = e instanceof Error ? e.message : String(e);
      }
      if (attempt < 2 && this.now() < deadline) await this.sleep(2000 * 2 ** attempt); // el servidor público se satura: espera creciente
    }
    throw new Error(`${lastError} (el servidor público de OpenStreetMap puede estar saturado; reintenta en unos minutos)`);
  }

  /** Respaldo cuando Overpass no responde: búsqueda de texto de Nominatim (máx. 40, sin teléfono/web casi nunca). */
  private async nominatimPlaces(q: string, signal?: AbortSignal) {
    const url = `${NOMINATIM}?${new URLSearchParams({ q, format: "jsonv2", limit: "40", countrycodes: "co", extratags: "1", addressdetails: "1" })}`;
    const res = await this.fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: this.timeoutSignal(signal) });
    if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`);
    const rows = (await res.json()) as { osm_type?: string; osm_id?: number; name?: string; category?: string; extratags?: Record<string, string>; address?: Record<string, string> }[];
    return rows
      .filter((r) => r.osm_type && r.osm_id && r.name && ["shop", "amenity", "office", "craft"].includes(r.category ?? ""))
      .map((r): OsmElement => ({
        type: r.osm_type!, id: r.osm_id!,
        tags: {
          name: r.name!, ...(r.extratags ?? {}),
          ...(r.address?.road ? { "addr:street": r.address.road } : {}),
          ...(r.address?.house_number ? { "addr:housenumber": r.address.house_number } : {}),
        },
      }));
  }

  /** Respaldo cuando Overpass no responde (máx. 40). Primero por TIPO de negocio ("cosmetics shop in …"); si no hay, por texto en el nombre. */
  private async textFallback(category: string, place: string, signal?: AbortSignal): Promise<OsmElement[]> {
    const phrase = phraseFor(category);
    if (phrase) {
      const byType = await this.nominatimPlaces(`${phrase} in ${place}`, signal);
      if (byType.length) return byType;
      await this.sleep(1100); // 1 solicitud por segundo
    }
    return this.nominatimPlaces(`${safeTerm(category)}, ${place}`, signal);
  }

  async search(criteria: SearchCriteria, signal?: AbortSignal): Promise<ConnectorResult> {
    const prospects: RawProspect[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();
    const start = this.now();
    const deadline = start + SEARCH_BUDGET_MS;
    this.hardAt = start + HARD_DEADLINE_MS;
    const outOfTime = () => this.now() > this.hardAt;
    const SKIP = (what: string) => `Se omitió ${what} por falta de tiempo (el servidor corta las búsquedas largas): reintenta con menos zonas o rubros.`;
    const zones = criteria.zones.length ? criteria.zones : [""];

    for (const zone of zones) {
      if (prospects.length >= criteria.maxResults) break;
      if (outOfTime()) { errors.push(SKIP(`la zona «${zone || criteria.city}»`)); continue; }
      const place = [zone, criteria.city, "Colombia"].filter(Boolean).join(", ");
      let bbox: Bbox | null;
      try {
        bbox = await this.geocode(place, signal);
        await this.sleep(1100); // política de Nominatim: máx. 1 solicitud por segundo
      } catch (e) { errors.push(`No se pudo ubicar "${place}": ${e instanceof Error ? e.message : String(e)}`); continue; }
      if (!bbox) { errors.push(`No se encontró la ubicación "${place}" en OpenStreetMap.`); continue; }

      for (const category of criteria.categories) {
        if (safeTerm(category).length < 3) { errors.push(`Categoría "${category}" demasiado corta o inválida.`); continue; }
        if (outOfTime()) { errors.push(SKIP(`«${category}» en ${place}`)); continue; }
        const box = bbox.join(",");
        // Con «solo con contacto», el filtro va DENTRO de la consulta: así el cupo de resultados se llena solo con negocios que lo tienen.
        const parts = filtersFor(category).map((f) => `nwr${f}${criteria.requireContact ? CONTACT_FILTER : ""}(${box});`).join("");
        const query = `[out:json][timeout:35];(${parts});out center tags 400;`;
        let els: OsmElement[] = [];
        let usedFallback = false;
        try {
          els = await this.overpass(query, deadline, signal);
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e);
          try {
            els = await this.textFallback(category, place, signal);
            usedFallback = true;
            await this.sleep(1100);
            errors.push(`"${category}" en ${place}: Overpass no respondió (${why}). Se usó el buscador de texto de OpenStreetMap: resultados menos completos y con nombres a veces genéricos.`);
          } catch (e2) {
            errors.push(`"${category}" en ${place}: ${why}. El respaldo tampoco respondió (${e2 instanceof Error ? e2.message : String(e2)}).`);
          }
        }
        {
          for (const el of els) {
            const t = el.tags ?? {};
            const name = t.name?.trim();
            const key = `osm:${el.type}/${el.id}`;
            if (!name || seen.has(key)) continue;
            if (criteria.excludeTerms.some((x) => name.toLowerCase().includes(x.toLowerCase()))) continue;
            seen.add(key);
            const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
            prospects.push({
              name, category: safeTerm(category), website: t.website ?? t["contact:website"] ?? null,
              phone: t.phone ?? t["contact:phone"] ?? null, email: t.email ?? t["contact:email"] ?? null,
              address: t["addr:full"] ?? (street || null), city: criteria.city,
              sourceName: this.id, sourceId: key, sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
              consultedAt: new Date(), isDemo: false,
              limitations: usedFallback ? `${ATTRIBUTION} Obtenido por búsqueda de texto (respaldo): el tipo de negocio viene de la clasificación de OpenStreetMap o, si no hay, del texto del nombre.` : ATTRIBUTION,
            });
          }
        }
      }
    }

    if (criteria.requireContact) {
      for (let i = prospects.length - 1; i >= 0; i--) if (!hasContact(prospects[i])) prospects.splice(i, 1); // el respaldo de texto no puede filtrar en la consulta
    }

    // Los más completos primero: así maxResults se queda con los más útiles para contactar.
    const score = (p: RawProspect) => (p.phone ? 4 : 0) + (p.email ? 3 : 0) + (p.website ? 2 : 0) + (p.address ? 1 : 0);
    prospects.sort((a, b) => score(b) - score(a));
    return { prospects: prospects.slice(0, criteria.maxResults), errors, estimatedCostUsd: 0 };
  }
}
