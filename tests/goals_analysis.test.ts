import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, ensureDefaultOrg, type Db } from "@/lib/db/client";
import { activities, evidence, prospects } from "@/lib/db/schema";
import { computeProgress, goalInput, periodBounds } from "@/lib/goals";
import { createGoal, listGoalsWithProgress } from "@/lib/services/goals";
import { saveAssessment, setQualification } from "@/lib/services/analysis";
import { ingestProspects } from "@/lib/services/prospects";
import type { RawProspect } from "@/lib/connectors/types";

let db: Db, org: string, pid: string, evId: string;
const raw = (o: Partial<RawProspect>): RawProspect => ({
  name: "X", category: null, website: null, phone: null, email: null, address: null, city: "Bogotá",
  sourceName: "t", sourceId: null, sourceUrl: null, consultedAt: new Date(), isDemo: false, ...o,
});

beforeAll(async () => {
  db = await createPgliteDb();
  org = await ensureDefaultOrg(db);
  const [o] = await ingestProspects(db, org, [raw({ name: "Ferretería Uno", phone: "3001112233", sourceId: "f1" })]);
  pid = o.prospectId;
  evId = (await db.select().from(evidence).where(eq(evidence.entityId, pid)))[0].id;
});

describe("metas", () => {
  it("valida periodo y meta", () => {
    expect(goalInput.safeParse({ metric: "leads", target: 0, periodStart: "2026-10-01", periodEnd: "2026-10-31" }).success).toBe(false);
    expect(goalInput.safeParse({ metric: "leads", target: 5, periodStart: "2026-10-31", periodEnd: "2026-10-01" }).success).toBe(false);
    expect(goalInput.safeParse({ metric: "leads", target: 5, periodStart: "2026-10-01", periodEnd: "2026-10-31" }).success).toBe(true);
  });
  it("periodo en hora de Colombia", () => {
    expect(periodBounds("2026-10-01", "2026-10-01").from.toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });
  it("sin fuente de datos el avance es null, no cero", () => {
    expect(computeProgress(10, null).pct).toBeNull();
    expect(computeProgress(10, 0).pct).toBe(0);
    expect(computeProgress(10, 5).pct).toBe(50);
  });
  it("cuenta prospectos reales y excluye demo y duplicados", async () => {
    await ingestProspects(db, org, [
      raw({ name: "Demo SA", sourceId: "d1", isDemo: true }),
      raw({ name: "Otra Ferretería", phone: "+57 300 111 2233", sourceId: "f2" }), // duplicado de Uno por teléfono
    ]);
    await createGoal(db, org, { metric: "leads", target: 10, periodStart: "2020-01-01", periodEnd: "2099-12-31" }, "t");
    await createGoal(db, org, { metric: "revenue", target: 1000, periodStart: "2020-01-01", periodEnd: "2099-12-31" }, "t");
    const list = await listGoalsWithProgress(db, org);
    expect(list.find((g) => g.metric === "leads")!.progress.actual).toBe(1);
    expect(list.find((g) => g.metric === "revenue")!.progress.actual).toBeNull();
  });
  it("cuenta contactos distintos por WhatsApp abierto", async () => {
    await db.insert(activities).values([{ orgId: org, prospectId: pid, type: "whatsapp_opened" }, { orgId: org, prospectId: pid, type: "whatsapp_opened" }]);
    await createGoal(db, org, { metric: "contacts", target: 3, periodStart: "2020-01-01", periodEnd: "2099-12-31" }, "t");
    expect((await listGoalsWithProgress(db, org)).find((g) => g.metric === "contacts")!.progress.actual).toBe(1);
  });
});

describe("análisis manual", () => {
  const ok = { value: 1, kind: "inferred", evidenceIds: [] };
  it("rechaza 'confirmado' sin evidencia", async () => {
    await expect(saveAssessment(db, org, pid, { icp_fit: { value: 1, kind: "confirmed", evidenceIds: [] } }, "t")).rejects.toThrow(/evidencia/);
  });
  it("rechaza evidencia ajena", async () => {
    await expect(saveAssessment(db, org, pid, { icp_fit: { value: 1, kind: "confirmed", evidenceIds: ["no-existe"] } }, "t")).rejects.toThrow(/no pertenece/);
  });
  it("no se puede calificar sin información suficiente", async () => {
    await saveAssessment(db, org, pid, { icp_fit: ok }, "t");
    await expect(setQualification(db, org, pid, true, "t")).rejects.toThrow(/información suficiente/);
  });
  it("con cobertura suficiente calcula, califica y deja rastro", async () => {
    const s = await saveAssessment(db, org, pid, {
      icp_fit: { value: 1, kind: "confirmed", evidenceIds: [evId] }, logistics_need: ok, delivery_volume: { value: 0.5, kind: "hypothesis", evidenceIds: [] },
    }, "t");
    expect(s.priority).not.toBeNull();
    await setQualification(db, org, pid, true, "t");
    expect((await db.select().from(prospects).where(eq(prospects.id, pid)))[0].status).toBe("qualified");
    const goal = (await listGoalsWithProgress(db, org));
    await createGoal(db, org, { metric: "qualified", target: 1, periodStart: "2020-01-01", periodEnd: "2099-12-31" }, "t");
    expect((await listGoalsWithProgress(db, org)).find((g) => g.metric === "qualified")!.progress.actual).toBe(1);
    expect(goal.length).toBeGreaterThan(0);
  });
  it("un duplicado excluido no se califica", async () => {
    const [dup] = await db.select().from(prospects).where(eq(prospects.status, "excluded_duplicate"));
    await expect(saveAssessment(db, org, dup.id, { icp_fit: ok }, "t")).rejects.toThrow(/duplicado/);
  });
});
