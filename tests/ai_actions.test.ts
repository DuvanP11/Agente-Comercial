import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { AiProvider } from "@/lib/ai/provider";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ai/provider", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/provider")>()), providerFromEnv: () => (globalThis as { __prov?: AiProvider | null }).__prov ?? null }));

import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { messages, prospects } from "@/lib/db/schema";
import { ingestProspects } from "@/lib/services/prospects";
import { addProspects, campaignDetail, createCampaign } from "@/lib/services/campaigns";
import { analyzeResultsAction, interpretAction } from "@/app/buscar/actions";
import { proposeAction } from "@/app/analizar/[id]/actions";
import { aiDraftAction } from "@/app/campanas/actions";

const use = (reply: string | null) => { (globalThis as { __prov?: AiProvider | null }).__prov = reply === null ? null : { model: "fake", async complete() { return { text: reply, model: "fake" }; } }; };
let pid: string, cpId: string;

beforeAll(async () => {
  const db = await getDb(); const org = await ensureDefaultOrg(db);
  const out = await ingestProspects(db, org, [{ name: "Glam House", category: "cosmética", website: null, phone: "3107778899", email: null, address: "Carrera 90", city: "Bogotá", sourceName: "openstreetmap", sourceId: "1", sourceUrl: null, consultedAt: new Date(), isDemo: false }]);
  pid = out[0].prospectId;
  const c = await createCampaign(db, org, { name: "Belleza", objective: "Captar tiendas", valueProposition: "Entregas urbanas el mismo día", template: "Hola {empresa}, somos PIBOX." }, "t");
  await addProspects(db, org, c.id, [pid], "t");
  cpId = (await campaignDetail(db, org, c.id)).items[0].cp.id;
  (globalThis as { __camp?: string }).__camp = c.id;
});
afterAll(async () => { (await import("node:fs")).rmSync(".pglite", { recursive: true, force: true }); });

describe("botón: Interpretar con IA (Buscar)", () => {
  it("sin IA configurada responde un error claro, sin simular", async () => {
    use(null);
    const r = await interpretAction("ferreterías en Suba, Bogotá");
    expect(r.ok).toBe(false); expect(r.error).toMatch(/IA no está configurada/);
  });
  it("devuelve los criterios para llenar el formulario", async () => {
    use('{"city":"Bogotá","zones":["Suba"],"categories":["ferretería"],"maxResults":15,"excludeTerms":[],"notes":null}');
    const r = await interpretAction("ferreterías en Suba, Bogotá, máximo 15");
    expect(r.ok).toBe(true); expect(r.output).toMatchObject({ city: "Bogotá", zones: ["Suba"], categories: ["ferretería"], maxResults: 15 });
  });
  it("si el modelo contesta mal, falla con mensaje y no lanza", async () => {
    use("no soy JSON");
    const r = await interpretAction("ferreterías en Suba, Bogotá");
    expect(r.ok).toBe(false); expect(r.error).toBeTruthy();
  });
});

describe("botón: Proponer con IA (Analizar)", () => {
  it("devuelve la propuesta y NO guarda nada en el prospecto", async () => {
    use('{"assessments":[{"criterion":"logistics_need","kind":"inferred","value":0.6,"evidenceIds":[],"note":"Vende productos físicos."}],"summary":""}');
    const r = await proposeAction(pid);
    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.proposal!.assessments.map((a) => [a.criterion, a]));
    expect(by.logistics_need.kind).toBe("inferred"); expect(by.contact_channel.origin).toBe("rule");
    const db = await getDb();
    expect((await db.select().from(prospects).where(eq(prospects.id, pid)))[0].scoreJson).toBeNull();
  });
  it("sin IA configurada, error claro", async () => {
    use(null); expect((await proposeAction(pid)).error).toMatch(/IA no está configurada/);
  });
});

describe("botón: Redactar con IA (Campañas)", () => {
  const camp = () => (globalThis as { __camp?: string }).__camp!;
  it("deja un borrador SIN aprobar y devuelve el texto", async () => {
    use('{"body":"Hola equipo de Glam House, en PIBOX Mensajería ofrecemos entregas urbanas el mismo día. ¿Cómo gestionan hoy sus envíos?"}');
    const r = await aiDraftAction(camp(), cpId, "");
    expect(r.error).toBeUndefined(); expect(r.text).toMatch(/Glam House/); expect(r.ok).toMatch(/Borrador generado con IA/);
    const db = await getDb();
    expect((await db.select().from(messages).where(eq(messages.prospectId, pid)))[0]).toMatchObject({ status: "draft", approvedBy: null });
  });
  it("rechaza un borrador con precios inventados y conserva el anterior", async () => {
    use('{"body":"Hola Glam House, entregamos por $5.000 con 20% de descuento."}');
    const r = await aiDraftAction(camp(), cpId, "más corto");
    expect(r.text).toBeUndefined(); expect(r.error).toMatch(/rechazada/i);
    const db = await getDb();
    expect((await db.select().from(messages).where(eq(messages.prospectId, pid)))[0].body).toMatch(/entregas urbanas el mismo día/);
  });
  it("el pedido de ajuste viaja al modelo como dato", async () => {
    let seen = "";
    (globalThis as { __prov?: AiProvider }).__prov = { model: "fake", async complete(req) { seen = req.user; return { text: '{"body":"Hola Glam House, ofrecemos entregas urbanas el mismo día. ¿Hablamos?"}', model: "fake" }; } };
    await aiDraftAction(camp(), cpId, "más corto");
    expect(seen).toContain("más corto"); expect(seen).toMatch(/^<datos>/);
  });
  it("sin IA configurada, error claro", async () => {
    use(null); expect((await aiDraftAction(camp(), cpId, "")).error).toMatch(/IA no está configurada/);
  });
});


describe("botón: Analizar resultados con IA (Buscar)", () => {
  const reply = '{"assessments":[{"criterion":"logistics_need","kind":"inferred","value":0.7,"evidenceIds":[],"note":"Vende productos físicos."}],"summary":"Tienda de belleza."}';
  it("devuelve la lectura de cada resultado y no guarda ninguna valoración", async () => {
    use(reply);
    const r = await analyzeResultsAction([pid]);
    expect(r.error).toBeUndefined(); expect(r.readings).toHaveLength(1);
    // Una prueba anterior ya pidió la propuesta de este prospecto: se REUTILIZA (cached) en vez de gastar otra llamada.
    expect(r.readings[0]).toMatchObject({ prospectId: pid, state: expect.stringMatching(/analyzed|cached/) });
    expect(r.readings[0].headline).toBeTruthy();
    const db = await getDb();
    expect((await db.select().from(prospects).where(eq(prospects.id, pid)))[0].scoreJson).toBeNull();
  });
  it("sin IA configurada, lo dice sin llamar a nadie", async () => {
    use(null);
    const r = await analyzeResultsAction([pid]);
    expect(r.stopped).toMatch(/no está configurada/); expect(r.analyzed).toBe(0);
  });
  it("ignora entradas raras en vez de fallar", async () => {
    use(reply);
    expect((await analyzeResultsAction(null as unknown as string[])).readings).toEqual([]);
    expect((await analyzeResultsAction([123 as unknown as string, "no-existe"])).readings.every((x) => x.state === "skipped")).toBe(true);
  });
});

describe("mensaje cuando el texto no tiene un rubro", () => {
  it("se muestra como indicación, no como «Respuesta rechazada»", async () => {
    use('{"city":"Bogotá","zones":[],"categories":[],"maxResults":null,"excludeTerms":[],"notes":null}');
    const r = await interpretAction("busco algo por favor");
    expect(r.ok).toBe(false); expect(r.error).toMatch(/^No se pudo identificar ningún rubro/); expect(r.error).not.toMatch(/Respuesta rechazada/);
  });
});
