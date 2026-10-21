import { describe, expect, it } from "vitest";
import { GooglePlacesConnector } from "@/lib/connectors/google-places";
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
