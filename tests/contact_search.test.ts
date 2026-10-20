import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, ensureDefaultOrg, type Db } from "@/lib/db/client";
import { auditLog, evidence, prospects, searches } from "@/lib/db/schema";
import { updateContact } from "@/lib/services/prospect-contact";
import { ingestProspects, resolveReview } from "@/lib/services/prospects";
import { loadSearch, saveSnapshot } from "@/lib/services/searches";
import type { RawProspect } from "@/lib/connectors/types";

let db: Db, org: string, a: string, b: string;
const raw = (o: Partial<RawProspect>): RawProspect => ({
  name: "X", category: null, website: null, phone: null, email: null, address: null, city: "Bogotá",
  sourceName: "t", sourceId: null, sourceUrl: null, consultedAt: new Date(), isDemo: false, ...o,
});

beforeAll(async () => {
  db = await createPgliteDb();
  org = await ensureDefaultOrg(db);
  const out = await ingestProspects(db, org, [raw({ name: "Glam House", sourceId: "g1" }), raw({ name: "Esencia Belleza", phone: "3105550000", sourceId: "g2" })]);
  a = out[0].prospectId; b = out[1].prospectId;
});

describe("completar contacto a mano", () => {
  it("guarda, recalcula claves y deja evidencia 'ingresado por el usuario'", async () => {
    const r = await updateContact(db, org, a, { phone: "310 777 8899", website: "https://www.glamhouse.co", email: "ventas@glamhouse.co" }, "dperilla");
    expect(r.changed.sort()).toEqual(["email", "phone", "website"]);
    const [p] = await db.select().from(prospects).where(eq(prospects.id, a));
    expect(p).toMatchObject({ phone: "310 777 8899", phoneKey: "+573107778899", domainKey: "glamhouse.co", emailKey: "ventas@glamhouse.co" });
    const ev = (await db.select().from(evidence).where(eq(evidence.entityId, a))).filter((e) => e.method === "user_input");
    expect(ev.map((e) => e.field).sort()).toEqual(["email", "phone", "website"]);
    expect(ev.every((e) => e.verification === "user_confirmed" && /manualmente/.test(e.limitations!))).toBe(true);
    expect((await db.select().from(auditLog).where(eq(auditLog.action, "prospect.contact_updated"))).length).toBe(1);
  });
  it("rechaza datos inválidos sin tocar nada", async () => {
    await expect(updateContact(db, org, a, { phone: "123" }, "t")).rejects.toThrow(/Teléfono no reconocido/);
    await expect(updateContact(db, org, a, { website: "javascript:alert(1)" }, "t")).rejects.toThrow(/web no es válida/);
    await expect(updateContact(db, org, a, { email: "sin-arroba" }, "t")).rejects.toThrow(/correo/);
    const [p] = await db.select().from(prospects).where(eq(prospects.id, a));
    expect(p.phone).toBe("310 777 8899");
  });
  it("sin cambios no escribe evidencia nueva", async () => {
    const before = (await db.select().from(evidence).where(eq(evidence.entityId, a))).length;
    const r = await updateContact(db, org, a, { phone: "310 777 8899" }, "t");
    expect(r.changed).toEqual([]);
    expect((await db.select().from(evidence).where(eq(evidence.entityId, a))).length).toBe(before);
  });
  it("avisa (sin fusionar) si el teléfono ya lo tiene otro prospecto", async () => {
    const r = await updateContact(db, org, a, { phone: "+57 310 555 0000" }, "t"); // el de Esencia
    expect(r.warnings.join(" ")).toMatch(/teléfono coincide con otro prospecto: "Esencia Belleza"/);
    const [other] = await db.select().from(prospects).where(eq(prospects.id, b));
    expect(other.status).toBe("new"); // nada cambió en el otro registro
  });
  it("se puede borrar un dato dejándolo vacío", async () => {
    await updateContact(db, org, a, { email: "" }, "t");
    const [p] = await db.select().from(prospects).where(eq(prospects.id, a));
    expect(p.email).toBeNull(); expect(p.emailKey).toBe("");
  });
});

describe("volver a una búsqueda guardada", () => {
  it("recupera criterios y filas, y refresca el estado desde la base", async () => {
    const [s] = await db.insert(searches).values({ orgId: org, criteria: { city: "Bogotá", zones: ["Suba"], categories: ["cosmética"], maxResults: 20, excludeTerms: [] }, connector: "openstreetmap", status: "completed", naturalLanguage: "belleza" }).returning();
    const items = (await ingestProspects(db, org, [raw({ name: "Mi Tienda Belleza", phone: "3201112222", sourceId: "s1" }), raw({ name: "Mi Tienda Belleza Sur", phone: "3201112222", sourceId: "s2" })], s.id));
    await saveSnapshot(db, s.id, { message: "2 resultados", errors: ["aviso"], items });
    expect(items[1].status).toBe("excluded_duplicate");

    const loaded = await loadSearch(db, org, s.id);
    expect(loaded!.criteria).toMatchObject({ city: "Bogotá", zones: ["Suba"], categories: ["cosmética"] });
    expect(loaded!.brief).toBe("belleza");
    expect(loaded!.snapshot!.items.map((i) => i.name)).toEqual(["Mi Tienda Belleza", "Mi Tienda Belleza Sur"]);

    // el usuario resuelve el duplicado en la ficha → al volver aparece resuelto, no el estado viejo
    const { duplicateReviews } = await import("@/lib/db/schema");
    const [rev] = await db.select().from(duplicateReviews).where(eq(duplicateReviews.prospectId, items[1].prospectId));
    await resolveReview(db, rev.id, "not_duplicate", "t");
    await updateContact(db, org, items[0].prospectId, { website: "mitienda.co" }, "t");
    const again = await loadSearch(db, org, s.id);
    expect(again!.snapshot!.items[1].status).toBe("new");
    expect(again!.snapshot!.items[0].website).toBe("mitienda.co"); // y lo que completaste a mano
  });
  it("rechaza ids inválidos y de otra organización", async () => {
    expect(await loadSearch(db, org, "no-es-uuid")).toBeNull();
    expect(await loadSearch(db, org, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await loadSearch(db, "otra-org", "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
