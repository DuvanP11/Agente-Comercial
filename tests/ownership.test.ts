import { describe, expect, it } from "vitest";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { ingestProspects } from "@/lib/services/prospects";
import { assertCampaignAccess, assertProspectAccess, viewerOf, visibleProspectIds } from "@/lib/services/scope";
import { addProspects, campaignDetail, createCampaign, eligibleProspects, listCampaigns } from "@/lib/services/campaigns";
import { captarCandidates, startCaptation } from "@/lib/services/captar";
import { loadMarket } from "@/lib/services/market";
import { assignOwner, assignUnowned } from "@/lib/services/ownership";
import { welcomeStats } from "@/lib/services/welcome";
import { DEFAULT_TEMPLATE } from "@/lib/campaigns";
import type { RawProspect } from "@/lib/connectors/types";

const raw = (o: Partial<RawProspect>): RawProspect => ({
  name: "X", category: null, website: null, phone: null, email: null, address: null, city: "Bogotá",
  sourceName: "t", sourceId: null, sourceUrl: null, consultedAt: new Date(), isDemo: false, ...o,
});
const A = { id: "ana", role: "hunter" }, B = { id: "beto", role: "hunter" }, M = { id: "gina", role: "gerencia" };

async function world() {
  const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
  const a = await ingestProspects(d, o, [raw({ name: "Panadería Uno", phone: "3107778899", sourceId: "a1" }), raw({ name: "Ferretería Dos", phone: "3105550000", sourceId: "a2" })], undefined, viewerOf(A));
  const b = await ingestProspects(d, o, [raw({ name: "Papelería Tres", phone: "3101112222", sourceId: "b1" })], undefined, viewerOf(B));
  const legacy = await ingestProspects(d, o, [raw({ name: "Heredado Cuatro", phone: "3109998877", sourceId: "l1" })]); // sin responsable
  return { d, o, a, b, legacy };
}

describe("cada Hunter ve y trabaja solo lo suyo", () => {
  it("acceso por prospecto: lo propio sí, lo de otro o sin responsable no (y sin revelar que existe); los demás roles ven todo", async () => {
    const { d, o, a, b, legacy } = await world();
    await expect(assertProspectAccess(d, o, viewerOf(A), a[0].prospectId)).resolves.toBeUndefined();
    await expect(assertProspectAccess(d, o, viewerOf(A), b[0].prospectId)).rejects.toThrow(/Prospecto no encontrado/);
    await expect(assertProspectAccess(d, o, viewerOf(A), legacy[0].prospectId)).rejects.toThrow(/no encontrado/);
    for (const id of [a[0].prospectId, b[0].prospectId, legacy[0].prospectId]) await expect(assertProspectAccess(d, o, viewerOf(M), id)).resolves.toBeUndefined();
    expect(await visibleProspectIds(d, o, viewerOf(A), [a[0].prospectId, a[1].prospectId, b[0].prospectId, "inventado"])).toEqual(expect.arrayContaining([a[0].prospectId, a[1].prospectId]));
    expect((await visibleProspectIds(d, o, viewerOf(A), [b[0].prospectId])).length).toBe(0);
    expect((await visibleProspectIds(d, o, viewerOf(M), [b[0].prospectId, "x"])).length).toBe(2);   // quien ve todo no se filtra
  });
  it("el duplicado sigue siendo global, pero lo ajeno no se revela: ni ficha, ni teléfono, ni motivos", async () => {
    const { d, o, a } = await world();
    const again = await ingestProspects(d, o, [raw({ name: "Panadería Uno", phone: "3107778899", address: "Calle 9 # 8-7", sourceId: "otro" })], undefined, viewerOf(B));
    expect(again[0]).toMatchObject({ status: "excluded_duplicate", foreign: true });
    expect(again[0].matchedWith).toEqual({ type: "prospect", id: "", name: "Panadería Uno" });      // solo el nombre
    expect(again[0].reasons).toBeUndefined(); expect(again[0].message).toMatch(/asignado a otra persona/);
    const same = await ingestProspects(d, o, [raw({ name: "Panadería Uno", phone: "3107778899", sourceId: "a1" })], undefined, viewerOf(B)); // misma fuente e id
    expect(same[0]).toMatchObject({ status: "already_stored", foreign: true }); expect(same[0].message).toMatch(/otra persona/);
    const mine = await ingestProspects(d, o, [raw({ name: "Panadería Uno", phone: "3107778899", sourceId: "a1" })], undefined, viewerOf(A));
    expect(mine[0]).toMatchObject({ status: "already_stored", foreign: false, prospectId: a[0].prospectId });
    const mgr = await ingestProspects(d, o, [raw({ name: "Panadería Uno", phone: "3107778899", sourceId: "z" })], undefined, viewerOf(M));
    expect(mgr[0].foreign).toBe(false); expect(mgr[0].matchedWith?.id).toBe(a[0].prospectId);   // quien ve todo sí ve la coincidencia
  });
  it("captación, campañas y mercado: cada Hunter solo trabaja con lo suyo", async () => {
    const { d, o, a, b } = await world();
    const names = async (v: ReturnType<typeof viewerOf>) => (await captarCandidates(d, o, v)).map((c) => c.p.name).sort();
    expect(await names(viewerOf(A))).toEqual(["Ferretería Dos", "Panadería Uno"]);
    expect(await names(viewerOf(B))).toEqual(["Papelería Tres"]);
    expect((await names(viewerOf(M))).length).toBe(4);
    const campA = (await createCampaign(d, o, { name: "Campaña de Ana", template: DEFAULT_TEMPLATE }, "t", A.id)).id;
    const campB = (await createCampaign(d, o, { name: "Campaña de Beto", template: DEFAULT_TEMPLATE }, "t", B.id)).id;
    expect((await listCampaigns(d, o, viewerOf(A))).map((c) => c.name)).toEqual(["Campaña de Ana"]);
    expect((await listCampaigns(d, o, viewerOf(M))).length).toBe(2);
    await expect(campaignDetail(d, o, campB, viewerOf(A))).rejects.toThrow(/Campaña no encontrada/);
    await expect(assertCampaignAccess(d, o, viewerOf(A), campB)).rejects.toThrow();
    await expect(addProspects(d, o, campB, [b[0].prospectId], "t", viewerOf(A))).rejects.toThrow(/Campaña no encontrada/);
    // Ana intenta meter un prospecto de Beto en su campaña: se rechaza como no elegible
    const r = await addProspects(d, o, campA, [a[0].prospectId, b[0].prospectId], "t", viewerOf(A));
    expect(r.added).toBe(1); expect(r.skipped).toHaveLength(1);
    expect((await eligibleProspects(d, o, campA, viewerOf(A))).map((p) => p.name)).toEqual(["Ferretería Dos"]);
    const cap = await startCaptation(d, o, { prospectIds: [a[1].prospectId, b[0].prospectId], newName: "Captación Ana" }, "t", viewerOf(A));
    expect(cap.added).toBe(1);                                                        // el de Beto se ignora
    await expect(startCaptation(d, o, { prospectIds: [b[0].prospectId], newName: "Robada" }, "t", viewerOf(A))).rejects.toThrow(/Marca al menos un prospecto/);
    await expect(startCaptation(d, o, { prospectIds: [a[0].prospectId], campaignId: campB }, "t", viewerOf(A))).rejects.toThrow(/no existe/);   // tampoco puede usar la campaña de otro
    const mk = async (v: ReturnType<typeof viewerOf>) => (await loadMarket(d, o, { since: null, includeDemo: true, viewer: v })).rows.length;
    expect(await mk(viewerOf(A))).toBe(2); expect(await mk(viewerOf(B))).toBe(1); expect(await mk(viewerOf(M))).toBe(4);
  });
  it("asignar: un gestor pasa prospectos a una persona activa; los sin responsable se reparten de una vez", async () => {
    const { d, o, a, legacy } = await world();
    const [u1] = await d.insert(users).values({ orgId: o, email: "beto@pibox.app", emailKey: "beto@pibox.app", username: "beto", usernameKey: "beto", name: "Beto", role: "hunter" }).returning();
    const [off] = await d.insert(users).values({ orgId: o, email: "off@pibox.app", emailKey: "off@pibox.app", username: "off", usernameKey: "off", name: "Off", role: "hunter", active: false }).returning();
    await assignOwner(d, o, "gina", legacy[0].prospectId, u1.id);
    await expect(assertProspectAccess(d, o, { id: u1.id, seesAll: false }, legacy[0].prospectId)).resolves.toBeUndefined();
    await expect(assignOwner(d, o, "gina", a[0].prospectId, off.id)).rejects.toThrow(/desactivada/);
    await expect(assignOwner(d, o, "gina", "no-existe", u1.id)).rejects.toThrow(/no encontrado/);
    await ingestProspects(d, o, [raw({ name: "Otro Heredado", phone: "3100001111", sourceId: "l2" })]);
    expect(await assignUnowned(d, o, "gina", u1.id)).toBe(1);
    expect(await assignUnowned(d, o, "gina", u1.id)).toBe(0);
  });
  it("la bienvenida cuenta solo lo propio para el Hunter y todo para los demás", async () => {
    const { d, o } = await world();
    expect(await welcomeStats(d, o, A)).toMatchObject({ scope: "own", total: 2 });
    expect(await welcomeStats(d, o, B)).toMatchObject({ scope: "own", total: 1 });
    expect(await welcomeStats(d, o, M)).toMatchObject({ scope: "all", total: 4 });
  });
});
