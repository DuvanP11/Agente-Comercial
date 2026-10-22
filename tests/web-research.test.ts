import { describe, expect, it } from "vitest";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { evidence } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { contactLinks, extractContacts, isBlockedHost, isPrivateIp, parseRobots, robotsAllows } from "@/lib/web-research";
import { applyWebFinding, researchWebsite } from "@/lib/services/web-research";
import { ingestProspects } from "@/lib/services/prospects";
import type { RawProspect } from "@/lib/connectors/types";

const HOME = `<html><body><a href="/contacto">Contáctanos</a><a href="https://otra.com/contacto">Otra</a><a href="/nosotros">Quiénes somos</a><a href="/catalogo.pdf">contacto pdf</a>
  <p>Escríbenos a <a href="mailto:ventas@laespiga.co?subject=Hola">ventas@laespiga.co</a> o a info@laespiga.co. Imagen: logo@2x.png. NIT 900123456789</p>
  <a href="tel:+57 310 555 1234">Llámanos</a> <p>Fijo: (601) 555 1234 · Celular 311-555-0000</p>
  <a href="https://wa.me/573105551234?text=Hola">WhatsApp</a><script>var x="spam@example.com 3001234567"</script></body></html>`;

describe("lectura de una página pública", () => {
  it("extrae correos, teléfonos válidos y WhatsApp; ignora imágenes, scripts, ejemplos e ids largos", () => {
    const r = extractContacts(HOME, "https://laespiga.co/");
    expect(r.emails.map((e) => e.display).sort()).toEqual(["info@laespiga.co", "ventas@laespiga.co"]);
    expect(r.phones.map((p) => p.display)).toEqual(expect.arrayContaining(["+573105551234", "+576015551234", "+573115550000"]));
    expect(r.phones.every((p) => !p.display.includes("900123456"))).toBe(true);              // el NIT no se toma por teléfono
    expect(r.whatsapp.map((w) => w.display)).toEqual(["+573105551234"]);
    expect(JSON.stringify(r)).not.toContain("spam@example.com");                                // el script se descarta
  });
  it("enlaces de contacto: solo del mismo sitio, sin archivos, máximo 3", () => {
    const l = contactLinks(HOME, "https://laespiga.co/");
    expect(l).toEqual(["https://laespiga.co/contacto", "https://laespiga.co/nosotros"]);
  });
  it("robots.txt: el agente propio manda sobre «*»; gana la regla más específica", () => {
    const t = "User-agent: *\nDisallow: /privado\nDisallow: /\nAllow: /contacto\n\nUser-agent: PiboxCommercialBot\nDisallow: /admin\n";
    const generic = parseRobots(t, "OtroBot"), own = parseRobots(t, "PiboxCommercialBot/1.0");
    expect(robotsAllows(generic, "/contacto")).toBe(true); expect(robotsAllows(generic, "/inicio")).toBe(false);
    expect(robotsAllows(own, "/contacto")).toBe(true); expect(robotsAllows(own, "/admin/x")).toBe(false); expect(robotsAllows(own, "/privado")).toBe(true);
    expect(robotsAllows(parseRobots("", "x"), "/lo-que-sea")).toBe(true);
  });
  it("no se consultan redes internas", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "172.31.255.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "::ffff:10.0.0.1", "999.1.1.1", "abc"]) expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "181.49.1.1", "172.32.0.1", "2800:3f0:4001::1"]) expect(isPrivateIp(ip), ip).toBe(false);
    for (const h of ["localhost", "app.localhost", "servidor.local", "db.internal", "192.168.1.1", "[::1]", "x:80"]) expect(isBlockedHost(h), h).toBe(true);
    expect(isBlockedHost("laespiga.co")).toBe(false);
  });
});

const resp = (body: string, status = 200, type = "text/html", headers: Record<string, string> = {}) => new Response(body, { status, headers: { "content-type": type, ...headers } });
const pub = async () => ["181.49.1.1"];

describe("investigación web del sitio de un prospecto", () => {
  it("lee inicio + página de contacto y devuelve candidatos con su página de origen", async () => {
    const seen: string[] = [];
    const f = (async (u: URL | string) => { const url = String(u); seen.push(url); if (url.endsWith("/robots.txt")) return resp("User-agent: *\nDisallow: /privado", 200, "text/plain"); if (url.endsWith("/contacto")) return resp('<a href="tel:6015559999">tel</a>'); return resp(HOME); }) as unknown as typeof fetch;
    const r = await researchWebsite("laespiga.co", { fetchImpl: f, resolve: pub });
    expect(r.pages.filter((p) => p.ok).length).toBeGreaterThanOrEqual(2);
    expect(r.emails.map((e) => e.display)).toContain("ventas@laespiga.co"); expect(r.emails[0].sourceUrl).toMatch(/^https:\/\/laespiga\.co\//);
    expect(r.phones.map((p) => p.display)).toContain("+576015559999");
    expect(r.notes.join(" ")).toMatch(/candidatos/);
  });
  it("respeta robots.txt, rechaza hosts internos y redirecciones a otro sitio", async () => {
    const closed = (async (u: URL | string) => (String(u).endsWith("/robots.txt") ? resp("User-agent: *\nDisallow: /", 200, "text/plain") : resp(HOME))) as unknown as typeof fetch;
    const r1 = await researchWebsite("https://laespiga.co", { fetchImpl: closed, resolve: pub });
    expect(r1.pages[0]).toMatchObject({ ok: false }); expect(r1.pages[0].note).toMatch(/robots\.txt/); expect(r1.emails).toHaveLength(0);
    const never = (async () => { throw new Error("no debía consultarse"); }) as unknown as typeof fetch;
    expect((await researchWebsite("http://localhost:3000", { fetchImpl: never, resolve: pub })).notes.join(" ")).toMatch(/no permitida|válida/i);
    expect((await researchWebsite("https://interno.empresa.co", { fetchImpl: never, resolve: async () => ["10.0.0.7"] })).notes.join(" ")).toMatch(/red interna/);
    const redir = (async (u: URL | string) => (String(u).endsWith("/robots.txt") ? resp("", 404) : resp("", 302, "text/html", { location: "https://evil.com/x" }))) as unknown as typeof fetch;
    const r3 = await researchWebsite("https://laespiga.co", { fetchImpl: redir, resolve: pub });
    expect(r3.pages[0].note).toMatch(/otro sitio/);
    expect((await researchWebsite("no es una web", { fetchImpl: never, resolve: pub })).notes[0]).toMatch(/no es una dirección válida/);
  });
  it("guardar un hallazgo deja evidencia con la página; el correo solo si no hay uno; el teléfono se suma", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    const raw = (n: Partial<RawProspect>): RawProspect => ({ name: "La Espiga", category: null, website: "https://laespiga.co", phone: "3107778899", email: null, address: null, city: "Bogotá", sourceName: "t", sourceId: "w1", sourceUrl: null, consultedAt: new Date(), isDemo: false, ...n });
    const [p] = await ingestProspects(d, o, [raw({})]);
    await applyWebFinding(d, o, "ana", p.prospectId, "phone", "311 555 0000", "https://laespiga.co/contacto");
    await applyWebFinding(d, o, "ana", p.prospectId, "email", "VENTAS@laespiga.co", "https://laespiga.co/");
    await expect(applyWebFinding(d, o, "ana", p.prospectId, "email", "otro@laespiga.co", "https://laespiga.co/")).rejects.toThrow(/ya tiene un correo/);
    await expect(applyWebFinding(d, o, "ana", p.prospectId, "phone", "311 555 0000", "https://laespiga.co/")).rejects.toThrow(/ya está/);
    await expect(applyWebFinding(d, o, "ana", p.prospectId, "phone", "12345", "https://laespiga.co/")).rejects.toThrow(/no válido/);
    await expect(applyWebFinding(d, o, "ana", p.prospectId, "email", "x@y.co", "javascript:alert(1)")).rejects.toThrow(/origen no es válida/);
    const ev = (await d.select().from(evidence).where(eq(evidence.entityId, p.prospectId))).filter((e) => e.method === "web");
    expect(ev.map((e) => `${e.field}:${e.observedValue}`).sort()).toEqual(["email:ventas@laespiga.co", "phone:311 555 0000"]);
    expect(ev.every((e) => e.verification === "source_observed" && e.sourceRef.startsWith("https://laespiga.co"))).toBe(true);
  });
});
