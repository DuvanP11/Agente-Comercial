import { describe, expect, it } from "vitest";
import { funnel, priorityHistogram, weekBuckets } from "@/lib/dashboard";
import type { MarketRow } from "@/lib/market";

const DAY = 86_400_000;
const row = (o: Partial<MarketRow>): MarketRow => ({ id: "x", category: null, name: "n", city: null, sourceName: "osm", isDemo: false, status: "new", hasPhone: false, hasWeb: false, hasEmail: false, hasAddress: false, priority: null, cpStatus: null, ...o });

describe("dashboard: agregados", () => {
  it("semanas: la última termina hoy, lo viejo se descarta y nada se pierde dentro del rango", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const b = weekBuckets([now, new Date(now.getTime() - 3 * DAY), new Date(now.getTime() - 8 * DAY), new Date(now.getTime() - 200 * DAY)], now, 12);
    expect(b).toHaveLength(12);
    expect(b[11].count).toBe(2); expect(b[10].count).toBe(1);
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(3);
    expect(b[0].start.getTime()).toBeLessThan(b[11].start.getTime());
  });
  it("prioridad: franjas de 20; 100 cae en la última; null es «sin prioridad», no cero", () => {
    expect(priorityHistogram([0, 19, 20, 55, 79, 80, 100, null, null])).toEqual({ bands: [2, 1, 1, 1, 2], none: 2 });
  });
  it("embudo: acumulado (quien ganó también fue contactado y respondió) y nunca crece hacia abajo", () => {
    const rows = [row({ hasPhone: true }), row({ hasEmail: true, status: "qualified", cpStatus: "pending" }), row({ cpStatus: "contacted" }), row({ cpStatus: "replied" }), row({ cpStatus: "won" }), row({ cpStatus: "do_not_contact" })];
    const f = Object.fromEntries(funnel(rows).map((s) => [s.label, s.value]));
    expect(f["Prospectos descubiertos"]).toBe(6); expect(f["Con algún dato de contacto"]).toBe(2); expect(f["Calificados"]).toBe(1);
    expect(f["En una campaña"]).toBe(5); expect(f["Contactados"]).toBe(3); expect(f["Respondieron"]).toBe(2); expect(f["Ganados"]).toBe(1);
  });
});
