import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, ensureDefaultOrg, type Db } from "@/lib/db/client";
import { evidence, prospects, duplicateReviews } from "@/lib/db/schema";
import { commitImport, previewImport, suggestMapping } from "@/lib/services/clients";
import { ingestProspects, resolveReview } from "@/lib/services/prospects";
import { parseTable } from "@/lib/services/tabular";
import type { RawProspect } from "@/lib/connectors/types";

let db: Db, org: string;
const raw = (o: Partial<RawProspect>): RawProspect => ({
  name: "X", category: null, website: null, phone: null, email: null, address: null, city: "Bogotá",
  sourceName: "test", sourceId: null, sourceUrl: null, consultedAt: new Date(), isDemo: true, ...o,
});
const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

beforeAll(async () => {
  db = await createPgliteDb();
  org = await ensureDefaultOrg(db);
  const csv = "Nombre Comercial,NIT,Teléfono,Sitio web,Ciudad\nCosmeticos La Rosa SAS,900.123.456-7,300 123 4567,https://www.larosa.co,Bogotá\n,111,,,\nModa Norte,,,modanorte.com,Bogotá";
  const table = await parseTable("clientes.csv", enc(csv));
  const mapping = suggestMapping(table.headers);
  const preview = previewImport(table.rows, mapping);
  const res = await commitImport(db, org, preview, "test");
  expect(res.imported).toBe(2);
  expect(res.skipped).toHaveLength(1); // fila sin nombre
});

describe("importación", () => {
  it("rechaza formatos no soportados y archivos vacíos", async () => {
    await expect(parseTable("a.pdf", enc("x"))).rejects.toThrow(/Formato/);
    await expect(parseTable("a.csv", enc("solo,encabezado"))).rejects.toThrow(/filas/);
  });
  it("mapea columnas con tildes y variantes", () => {
    const m = suggestMapping(["Nombre Comercial", "NIT", "Teléfono", "Sitio web", "Ciudad"]);
    expect(m).toMatchObject({ name: "Nombre Comercial", nit: "NIT", phone: "Teléfono", website: "Sitio web", city: "Ciudad" });
  });
});

describe("ingesta con deduplicación", () => {
  it("excluye un prospecto que ya es cliente (por dominio) y deja el rastro", async () => {
    const [o] = await ingestProspects(db, org, [raw({ name: "La Rosa Cosmética", website: "larosa.co", sourceId: "p1" })]);
    expect(o.status).toBe("excluded_duplicate");
    expect(o.message).toMatch(/ya está registrado/);
    expect(o.matchedWith?.type).toBe("client");
    expect(o.matchedWith?.name).toBe("Cosmeticos La Rosa SAS"); // con quién coincide, visible
    expect(o.website).toBe("larosa.co"); // y los datos del propio resultado viajan hasta la pantalla
    const revs = await db.select().from(duplicateReviews).where(eq(duplicateReviews.prospectId, o.prospectId));
    expect(revs[0].decision).toBe("excluded");
  });
  it("marca como revisión una variante de nombre, sin fusionar", async () => {
    const [o] = await ingestProspects(db, org, [raw({ name: "Moda Norte S.A.S.", sourceId: "p2" })]);
    expect(o.status).toBe("needs_review");
    expect(o.message).toMatch(/Posible duplicado/);
  });
  it("prospecto nuevo queda como nuevo y con evidencias de lo observado", async () => {
    const [o] = await ingestProspects(db, org, [raw({ name: "Tienda Zeta", phone: "310 555 0000", address: "Calle 9 # 8-7", sourceId: "p3" })]);
    expect(o.status).toBe("new");
    expect(o).toMatchObject({ phone: "310 555 0000", address: "Calle 9 # 8-7" });
    const ev = await db.select().from(evidence).where(eq(evidence.entityId, o.prospectId));
    expect(ev.map((e) => e.field).sort()).toEqual(["address", "name", "phone"]);
    expect(ev.every((e) => e.verification === "source_observed")).toBe(true);
  });
  it("el mismo id de fuente no se guarda dos veces", async () => {
    const again = await ingestProspects(db, org, [raw({ name: "Tienda Zeta", sourceId: "p3" })]);
    expect(again).toHaveLength(1); // se informa, no se oculta
    expect(again[0].status).toBe("already_stored");
    expect(again[0].message).toMatch(/Ya estaba guardado/);
    expect((await db.select().from(prospects).where(eq(prospects.name, "Tienda Zeta")))).toHaveLength(1); // y no se duplicó
  });
  it("detecta duplicados entre prospectos de la misma búsqueda", async () => {
    const out = await ingestProspects(db, org, [raw({ name: "Eco Pack", phone: "3201112222", sourceId: "p4" }), raw({ name: "Ecopack Colombia", phone: "+57 320 111 2222", sourceId: "p5" })]);
    expect(out[0].status).toBe("new");
    expect(out[1].status).toBe("excluded_duplicate");
  });
  it("resolver un falso positivo lo devuelve a 'new' y conserva la decisión", async () => {
    const [rev] = await db.select().from(duplicateReviews).where(eq(duplicateReviews.decision, "pending"));
    await resolveReview(db, rev.id, "not_duplicate", "tester");
    const [p] = await db.select().from(prospects).where(eq(prospects.id, rev.prospectId));
    expect(p.status).toBe("new");
    const [after] = await db.select().from(duplicateReviews).where(eq(duplicateReviews.id, rev.id));
    expect(after.decidedBy).toBe("tester");
  });
});
