import { describe, expect, it } from "vitest";
import { GooglePlacesConnector, explainGoogleError } from "@/lib/connectors/google-places";
import { searchCriteria } from "@/lib/connectors/types";

const criteria = searchCriteria.parse({ city: "Bogotá", categories: ["cosméticos"], zones: ["Chapinero"], maxResults: 5 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("GooglePlacesConnector", () => {
  it("sin clave: no configurado y search falla en vez de inventar", async () => {
    const c = new GooglePlacesConnector(undefined);
    expect(c.status().state).toBe("not_configured");
    await expect(c.search(criteria)).rejects.toThrow(/no está configurado/);
  });
  it("normaliza, no inventa correo y deja null lo que falta", async () => {
    const c = new GooglePlacesConnector("k", (async () => json({ places: [
      { id: "a", displayName: { text: "Rosa" }, formattedAddress: "Cra 7 #1", businessStatus: "OPERATIONAL" },
    ] })) as typeof fetch);
    const r = await c.search(criteria);
    expect(r.prospects).toHaveLength(1);
    expect(r.prospects[0]).toMatchObject({ email: null, phone: null, website: null, isDemo: false, sourceName: "google_places", sourceId: "a" });
  });
  it("HTTP 403 se reporta como error, sin resultados falsos", async () => {
    const c = new GooglePlacesConnector("k", (async () => json({ error: "denied" }, 403)) as typeof fetch);
    const r = await c.search(criteria);
    expect(r.prospects).toEqual([]);
    expect(r.errors[0]).toMatch(/403/);
  });
  it("timeout/red caída se reporta", async () => {
    const c = new GooglePlacesConnector("k", (async () => { throw new Error("ETIMEDOUT"); }) as typeof fetch);
    const r = await c.search(criteria);
    expect(r.errors[0]).toMatch(/ETIMEDOUT/);
  });
  it("ignora negocios cerrados, duplicados de place_id y respuesta malformada", async () => {
    const c = new GooglePlacesConnector("k", (async () => json({ places: [
      { id: "a", displayName: { text: "A" }, businessStatus: "OPERATIONAL" },
      { id: "a", displayName: { text: "A otra vez" }, businessStatus: "OPERATIONAL" },
      { id: "b", displayName: { text: "Cerrada" }, businessStatus: "CLOSED_PERMANENTLY" },
      { id: "c" },
    ] })) as typeof fetch);
    const r = await c.search(criteria);
    expect(r.prospects.map((p) => p.sourceId)).toEqual(["a"]);
  });
  it("respeta maxResults", async () => {
    const places = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, displayName: { text: `N${i}` }, businessStatus: "OPERATIONAL" }));
    const c = new GooglePlacesConnector("k", (async () => json({ places })) as typeof fetch);
    expect((await c.search({ ...criteria, maxResults: 3 })).prospects).toHaveLength(3);
  });
  it("con «solo con contacto» deja fuera lo que no trae teléfono ni web", async () => {
    const c = new GooglePlacesConnector("k", (async () => json({ places: [
      { id: "a", displayName: { text: "Con tel" }, nationalPhoneNumber: "601 555 1234", businessStatus: "OPERATIONAL" },
      { id: "b", displayName: { text: "Con web" }, websiteUri: "https://x.co", businessStatus: "OPERATIONAL" },
      { id: "c", displayName: { text: "Sin nada" }, businessStatus: "OPERATIONAL" },
    ] })) as typeof fetch);
    expect((await c.search({ ...criteria, requireContact: true })).prospects.map((p) => p.name)).toEqual(["Con tel", "Con web"]);
    expect((await c.search(criteria)).prospects).toHaveLength(3);
  });
});


const gerr = (status: string, message: string, reason?: string) => JSON.stringify({ error: { code: 403, message, status, details: reason ? [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason }] : [] } });

describe("explicar errores de Google en español (sin clave en el texto)", () => {
  it("API restringida: la clave no incluye Places API (New)", () => {
    const r = explainGoogleError(403, gerr("PERMISSION_DENIED", "Requests to this API places.googleapis.com are blocked.", "API_KEY_SERVICE_BLOCKED"));
    expect(r.state).toBe("api_blocked"); expect(r.message).toMatch(/Restricciones de API.*Places API \(New\)/);
  });
  it("API sin habilitar en el proyecto", () => {
    const r = explainGoogleError(403, gerr("PERMISSION_DENIED", "Places API (New) has not been used in project 123 before or it is disabled.", "SERVICE_DISABLED"));
    expect(r.state).toBe("api_disabled"); expect(r.message).toMatch(/Biblioteca/);
  });
  it("sin facturación", () => { expect(explainGoogleError(403, gerr("PERMISSION_DENIED", "This API method requires billing to be enabled.", "BILLING_DISABLED")).state).toBe("billing"); });
  it("clave inválida", () => {
    expect(explainGoogleError(400, gerr("INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", "API_KEY_INVALID")).state).toBe("invalid_key");
  });
  it("restricción de aplicación (IP o referente)", () => {
    const r = explainGoogleError(403, gerr("PERMISSION_DENIED", "Requests from referer <empty> are blocked.", "API_KEY_HTTP_REFERRER_BLOCKED"));
    expect(r.state).toBe("app_restricted"); expect(r.message).toMatch(/Ninguna/);
  });
  it("sin código de motivo, distingue por el texto: «Requests from referer» ≠ «Requests to this API»", () => {
    expect(explainGoogleError(403, gerr("PERMISSION_DENIED", "Requests from referer <empty> are blocked.")).state).toBe("app_restricted");
    expect(explainGoogleError(403, gerr("PERMISSION_DENIED", "Requests to this API places.googleapis.com method X are blocked.")).state).toBe("api_blocked");
  });
  it("cuota agotada", () => { expect(explainGoogleError(429, gerr("RESOURCE_EXHAUSTED", "Quota exceeded.")).state).toBe("quota"); });
  it("permiso denegado genérico (política de la organización) y respuestas que no son JSON", () => {
    expect(explainGoogleError(403, gerr("PERMISSION_DENIED", "The caller does not have permission")).state).toBe("denied");
    expect(explainGoogleError(502, "<html>bad gateway</html>")).toEqual({ state: "error", message: "Google respondió 502." });
  });
});

describe("probar la clave con la consulta más barata", () => {
  it("pide 1 resultado y SOLO el id (sin teléfono ni web), y responde ok", async () => {
    let seen: { body: any; mask: string | null } | undefined;
    const f = (async (_u: string, init: RequestInit) => { seen = { body: JSON.parse(String(init.body)), mask: new Headers(init.headers).get("x-goog-fieldmask") }; return json({ places: [{ id: "x" }] }); }) as unknown as typeof fetch;
    const r = await new GooglePlacesConnector("k", f).check();
    expect(r.state).toBe("ok");
    expect(seen!.mask).toBe("places.id"); expect(seen!.body.pageSize).toBe(1);
  });
  it("traduce el error de Google y no filtra la clave", async () => {
    const f = (async () => new Response(gerr("PERMISSION_DENIED", "blocked", "API_KEY_SERVICE_BLOCKED"), { status: 403 })) as unknown as typeof fetch;
    const r = await new GooglePlacesConnector("CLAVE-SECRETA-XYZ", f).check();
    expect(r.state).toBe("api_blocked"); expect(JSON.stringify(r)).not.toContain("CLAVE-SECRETA-XYZ");
  });
  it("sin clave, sin conexión y tiempo agotado", async () => {
    expect((await new GooglePlacesConnector(undefined).check()).state).toBe("invalid_key");
    expect((await new GooglePlacesConnector("k", (async () => { throw new Error("x"); }) as unknown as typeof fetch).check()).state).toBe("unreachable");
    const t = (async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; }) as unknown as typeof fetch;
    const r = await new GooglePlacesConnector("k", t).check(); expect(r.state).toBe("unreachable"); expect(r.message).toMatch(/a tiempo/);
  });
});
