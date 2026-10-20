import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { clients, prospects } from "@/lib/db/schema";
import { backfillPhoneKeys } from "@/lib/services/maintenance";

describe("recalcular claves de teléfono vacías", () => {
  it("corrige las que tienen teléfono válido (incl. varios), no toca las demás y es idempotente", async () => {
    const db = await createPgliteDb(); const org = await ensureDefaultOrg(db);
    const base = { orgId: org, sourceName: "t", consultedAt: new Date() };
    const [doble] = await db.insert(prospects).values({ ...base, name: "MLT Racores", phone: "+57 601 5471740;+57 601 5471744", phoneKey: "" }).returning();
    const [ok] = await db.insert(prospects).values({ ...base, name: "Ya tenía clave", phone: "310 555 0000", phoneKey: "+573105550000" }).returning();
    const [malo] = await db.insert(prospects).values({ ...base, name: "Teléfono inválido", phone: "123", phoneKey: "" }).returning();
    const [sin] = await db.insert(prospects).values({ ...base, name: "Sin teléfono", phone: null, phoneKey: "" }).returning();
    const [cli] = await db.insert(clients).values({ orgId: org, name: "Cliente doble", phone: "601 5471740 / 3105550000", phoneKey: "" }).returning();

    expect(await backfillPhoneKeys(db)).toEqual({ prospects: 1, clients: 1 });
    const get = async (id: string) => (await db.select().from(prospects).where(eq(prospects.id, id)))[0].phoneKey;
    expect(await get(doble.id)).toBe("+576015471740");
    expect(await get(ok.id)).toBe("+573105550000");
    expect(await get(malo.id)).toBe("");
    expect(await get(sin.id)).toBe("");
    expect((await db.select().from(clients).where(eq(clients.id, cli.id)))[0].phoneKey).toBe("+576015471740");
    expect(await backfillPhoneKeys(db)).toEqual({ prospects: 0, clients: 0 }); // idempotente
  });
});
