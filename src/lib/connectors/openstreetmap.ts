import type { Connector, ConnectorResult, ConnectorStatus, RawProspect, SearchCriteria } from "./types";
import { stripAccents } from "../dedup/normalize";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS_DEFAULT = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "pibox-commercial-intelligence/0.1 (hneira@picap.co)";
/** Cada llamada externa tiene tope; la búsqueda completa también, para que Vercel nunca mate la función en silencio. */
const REQUEST_TIMEOUT_MS = 25_000;
const SEARCH_BUDGET_MS = 52_000;
const withTimeout = (signal?: AbortSignal) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS));
const ATTRIBUTION = "Datos © colaboradores de OpenStreetMap (licencia ODbL). Completitud variable: pocos negocios traen teléfono o web.";

/** Categoría en español → filtros de etiquetas OSM. Lo que no esté aquí se busca por nombre. */
const TAGS: [string[], string[]][] = [
  [["ferreter"], ['["shop"="hardware"]', '["shop"="doityourself"]']],
  [["cosmetic", "perfumer", "belleza", "maquillaje"], ['["shop"="cosmetics"]', '["shop"="perfumery"]', '["shop"="beauty"]']],
  [["ropa", "moda", "vestuario", "boutique"], ['["shop"="clothes"]', '["shop"="boutique"]', '["shop"="fashion"]']],
  [["zapater", "calzado"], ['["shop"="shoes"]']],
  [["panader", "pasteler"], ['["shop"="bakery"]', '["shop"="pastry"]']],
  [["farmacia", "droguer"], ['["amenity"="pharmacy"]']],
  [["restaurante"], ['["amenity"="restaurant"]']],
  [["supermercado", "minimercado", "tienda de barrio"], ['["shop"="supermarket"]', '["shop"="convenience"]']],
  [["papeler"], ['["shop"="stationery"]']],
  [["licor", "vinos"], ['["shop"="alcohol"]']],
  [["mascota", "veterinar"], ['["shop"="pet"]', '["amenity"="veterinary"]']],
  [["electronic", "tecnolog", "celular", "computador"], ['["shop"="electronics"]', '["shop"="mobile_phone"]', '["shop"="computer"]']],
  [["flor"], ['["shop"="florist"]']],
  [["joyer", "relojer"], ['["shop"="jewelry"]']],
  [["mueble", "decoraci"], ['["shop"="furniture"]', '["shop"="interior_decoration"]']],
  [["libreria"], ['["shop"="books"]']],
  [["optica"], ['["shop"="optician"]']],
  [["juguet"], ['["shop"="toys"]']],
  [["deport"], ['["shop"="sports"]']],
  [["ferret", "repuesto", "autopart"], ['["shop"="car_parts"]']],
  [["lavander"], ['["shop"="laundry"]']],
  [["carnicer", "pescader"], ['["shop"="butcher"]', '["shop"="seafood"]']],
  [["fruver", "verdura", "fruta"], ['["shop"="greengrocer"]']],
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
  ) {}

  status(): ConnectorStatus { return { state: "connected" }; } // no requiere clave

  private async geocode(place: string, signal?: AbortSignal): Promise<Bbox | null> {
    const url = `${NOMINATIM}?${new URLSearchParams({ q: place, format: "jsonv2", limit: "1", countrycodes: "co" })}`;
    const res = await this.fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: withTimeout(signal) });
    if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`);
    const rows = (await res.json()) as { boundingbox?: string[] }[];
    const b = rows[0]?.boundingbox?.map(Number);
    if (!b || b.length !== 4 || b.some(Number.isNaN)) return null;
    return [b[0], b[2], b[1], b[3]]; // Nominatim: sur, norte, oeste, este
  }

  private async overpass(query: string, deadline: number, signal?: AbortSignal): Promise<OsmElement[]> {
    let lastError = "sin intentos";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (Date.now() > deadline) { lastError = "se agotó el tiempo máximo de la búsqueda"; break; }
      const url = this.overpassUrls[attempt % this.overpassUrls.length];
      try {
        const res = await this.fetchImpl(url, {
          method: "POST", headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(), signal: withTimeout(signal),
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
      if (attempt < 2 && Date.now() < deadline) await this.sleep(2000 * 2 ** attempt); // el servidor público se satura: espera creciente
    }
    throw new Error(`${lastError} (el servidor público de OpenStreetMap puede estar saturado; reintenta en unos minutos)`);
  }

  async search(criteria: SearchCriteria, signal?: AbortSignal): Promise<ConnectorResult> {
    const prospects: RawProspect[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();
    const deadline = Date.now() + SEARCH_BUDGET_MS;
    const zones = criteria.zones.length ? criteria.zones : [""];

    for (const zone of zones) {
      if (prospects.length >= criteria.maxResults) break;
      const place = [zone, criteria.city, "Colombia"].filter(Boolean).join(", ");
      let bbox: Bbox | null;
      try {
        bbox = await this.geocode(place, signal);
        await this.sleep(1100); // política de Nominatim: máx. 1 solicitud por segundo
      } catch (e) { errors.push(`No se pudo ubicar "${place}": ${e instanceof Error ? e.message : String(e)}`); continue; }
      if (!bbox) { errors.push(`No se encontró la ubicación "${place}" en OpenStreetMap.`); continue; }

      for (const category of criteria.categories) {
        if (safeTerm(category).length < 3) { errors.push(`Categoría "${category}" demasiado corta o inválida.`); continue; }
        const box = bbox.join(",");
        const parts = filtersFor(category).map((f) => `nwr${f}(${box});`).join("");
        const query = `[out:json][timeout:20];(${parts});out center tags 400;`;
        try {
          const els = await this.overpass(query, deadline, signal);
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
              consultedAt: new Date(), isDemo: false, limitations: ATTRIBUTION,
            });
          }
        } catch (e) { errors.push(`"${category}" en ${place}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }

    // Los más completos primero: así maxResults se queda con los más útiles para contactar.
    const score = (p: RawProspect) => (p.phone ? 4 : 0) + (p.email ? 3 : 0) + (p.website ? 2 : 0) + (p.address ? 1 : 0);
    prospects.sort((a, b) => score(b) - score(a));
    return { prospects: prospects.slice(0, criteria.maxResults), errors, estimatedCostUsd: 0 };
  }
}
