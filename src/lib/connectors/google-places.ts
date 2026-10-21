import type { Connector, ConnectorResult, ConnectorStatus, RawProspect, SearchCriteria } from "./types";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber",
  "places.internationalPhoneNumber", "places.websiteUri", "places.primaryTypeDisplayName",
  "places.googleMapsUri", "places.businessStatus",
].join(",");

interface PlaceResponse {
  places?: {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    primaryTypeDisplayName?: { text: string };
    googleMapsUri?: string;
    businessStatus?: string;
  }[];
  nextPageToken?: string;
}

/** Google Places API (New) — Text Search. Requiere GOOGLE_PLACES_API_KEY (solo servidor). */
export class GooglePlacesConnector implements Connector {
  id = "google_places";
  label = "Google Places";
  capabilities = ["business_search", "address", "phone", "website"];

  constructor(
    private readonly apiKey = process.env.GOOGLE_PLACES_API_KEY,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  status(): ConnectorStatus {
    if (!this.apiKey) {
      return {
        state: "not_configured",
        missing: ["GOOGLE_PLACES_API_KEY"],
        howTo: "Crea una clave de Places API (New) en Google Cloud, restringida a esta API, y defínela como variable de entorno del servidor.",
      };
    }
    return { state: "connected" };
  }

  async search(criteria: SearchCriteria, signal?: AbortSignal): Promise<ConnectorResult> {
    const st = this.status();
    if (st.state !== "connected") throw new Error(`Google Places no está configurado: falta ${st.state === "not_configured" ? st.missing.join(", ") : ""}`);

    const prospects: RawProspect[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();
    const perQuery = Math.max(1, Math.ceil(criteria.maxResults / criteria.categories.length));

    outer: for (const category of criteria.categories) {
      const zones = criteria.zones.length ? criteria.zones : [""];
      for (const zone of zones) {
        if (prospects.length >= criteria.maxResults) break outer;
        const textQuery = [category, zone, criteria.city].filter(Boolean).join(" en ");
        try {
          const res = await this.fetchImpl(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey!, "X-Goog-FieldMask": FIELD_MASK },
            body: JSON.stringify({ textQuery, languageCode: "es", regionCode: criteria.country, pageSize: Math.min(20, perQuery) }),
            signal,
          });
          if (!res.ok) {
            errors.push(`"${textQuery}": Google respondió ${res.status} ${(await res.text()).slice(0, 200)}`);
            continue;
          }
          const data = (await res.json()) as PlaceResponse;
          for (const p of data.places ?? []) {
            if (!p.displayName?.text || seen.has(p.id)) continue;
            if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
            if (criteria.requireContact && !p.internationalPhoneNumber && !p.nationalPhoneNumber && !p.websiteUri) continue;
            if (criteria.excludeTerms.some((t) => p.displayName!.text.toLowerCase().includes(t.toLowerCase()))) continue;
            seen.add(p.id);
            prospects.push({
              name: p.displayName.text,
              category: p.primaryTypeDisplayName?.text ?? category,
              website: p.websiteUri ?? null,
              phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
              email: null, // Places no entrega correos: se deja vacío, no se inventa
              address: p.formattedAddress ?? null,
              city: criteria.city,
              sourceName: this.id,
              sourceId: p.id,
              sourceUrl: p.googleMapsUri ?? null,
              consultedAt: new Date(),
              isDemo: false,
            });
            if (prospects.length >= criteria.maxResults) break;
          }
        } catch (e) {
          errors.push(`"${textQuery}": ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    // Estimado, no facturado: la tarifa real depende del plan; se deja explícito.
    return { prospects, errors, estimatedCostUsd: undefined };
  }
}
