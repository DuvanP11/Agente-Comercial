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

export type GoogleCheckState = "ok" | "api_blocked" | "api_disabled" | "billing" | "invalid_key" | "app_restricted" | "denied" | "quota" | "unreachable" | "error";
export interface GoogleCheck { state: GoogleCheckState; message: string }

/** Traduce la respuesta de error de Google a qué hacer, en español. Nunca incluye la clave. */
export function explainGoogleError(status: number, raw: string): GoogleCheck {
  let reason = "", msg = "", gstatus = "";
  try {
    const j = JSON.parse(raw) as { error?: { status?: string; message?: string; details?: { reason?: string }[] } };
    reason = j.error?.details?.find((d) => d.reason)?.reason ?? ""; msg = j.error?.message ?? ""; gstatus = j.error?.status ?? "";
  } catch { /* respuesta que no es JSON: se usa solo el código HTTP */ }
  const r = reason.toUpperCase(), m = msg.toLowerCase();
  const apiBlocked: GoogleCheck = { state: "api_blocked", message: "La clave existe pero está restringida a otras APIs. En Credenciales → tu clave → Restricciones de API, agrega «Places API (New)»." };
  const appRestricted: GoogleCheck = { state: "app_restricted", message: "La clave tiene una restricción de aplicación (sitio web, IP…). Vercel usa IPs variables: en «Restricciones de aplicación» déjala en «Ninguna» y limita solo por API." };
  const apiDisabled: GoogleCheck = { state: "api_disabled", message: "La API «Places API (New)» no está habilitada en el proyecto de esa clave. Habilítala en APIs y servicios → Biblioteca (debe ser la versión «New»)." };
  const billing: GoogleCheck = { state: "billing", message: "El proyecto no tiene una cuenta de facturación activa vinculada. Places la exige aunque tenga uso gratuito." };
  const invalid: GoogleCheck = { state: "invalid_key", message: "Google dice que la clave no es válida: revisa que esté completa, sin espacios ni comillas, y que sea la clave de este proyecto." };
  if (status === 429 || gstatus === "RESOURCE_EXHAUSTED") return { state: "quota", message: "Se alcanzó la cuota de solicitudes. Revisa los límites en Google Cloud → APIs y servicios → Places API (New) → Cuotas." };
  // 1) Lo que dice el código de motivo manda; el texto del mensaje se parece entre casos distintos («… are blocked»).
  if (/API_KEY_SERVICE_BLOCKED|API_TARGET_BLOCKED/.test(r)) return apiBlocked;
  if (/REFERRER|REFERER|IP_ADDRESS|ANDROID|IOS_BUNDLE/.test(r)) return appRestricted;
  if (/SERVICE_DISABLED/.test(r)) return apiDisabled;
  if (/BILLING/.test(r)) return billing;
  if (/API_KEY_INVALID|API_KEY_NOT_FOUND|API_KEY_EXPIRED/.test(r)) return invalid;
  // 2) Sin código de motivo: se interpreta el texto, mirando primero el caso más específico.
  if (/requests from (referer|referrer|ip|android|ios)|requests from this (android|ios)/.test(m)) return appRestricted;
  if (/requests to this api .*(are|is) blocked|api .*blocked/.test(m)) return apiBlocked;
  if (/has not been used in project|is disabled|not enabled|service_disabled/.test(m)) return apiDisabled;
  if (/billing/.test(m)) return billing;
  if (/api key not valid|invalid api key|api_key_invalid/.test(m) || (status === 400 && /key/.test(m))) return invalid;
  if (status === 403 || gstatus === "PERMISSION_DENIED") return { state: "denied", message: "Permiso denegado. Puede deberse a una política de la organización o a un rol que falta: pide al administrador de Google Cloud que revise el rol de uso de Places API." };
  return { state: "error", message: `Google respondió ${status}${gstatus ? ` (${gstatus})` : ""}.` };
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

  /**
   * Prueba la clave con la consulta MÁS BARATA posible: pide 1 resultado y solo el id (sin teléfono ni web, que son de tarifa superior).
   * Sirve para saber si la clave, la API y la facturación funcionan antes de gastar en búsquedas reales.
   */
  async check(): Promise<GoogleCheck> {
    if (!this.apiKey) return { state: "invalid_key", message: "Falta GOOGLE_PLACES_API_KEY en las variables de entorno del servidor." };
    try {
      const res = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": "places.id" },
        body: JSON.stringify({ textQuery: "ferretería Bogotá", languageCode: "es", regionCode: "CO", pageSize: 1 }),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) return { state: "ok", message: "La clave funciona: la API respondió. (Consulta de prueba mínima, solo el identificador del lugar.)" };
      return explainGoogleError(res.status, await res.text());
    } catch (e) {
      return { state: "unreachable", message: e instanceof Error && e.name === "TimeoutError" ? "Google no respondió a tiempo." : "No se pudo conectar con Google." };
    }
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
