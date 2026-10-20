import { describe, expect, it } from "vitest";
import { byCity, bySector, bySource, groupRows, quality, rate, searchHealth, sinceDate, type MarketRow } from "@/lib/market";

const row = (o: Partial<MarketRow> = {}): MarketRow => ({
  id: Math.random().toString(), category: "cosmética", name: "X", city: "Bogotá", sourceName: "openstreetmap", isDemo: false, status: "new",
  hasPhone: false, hasWeb: false, hasEmail: false, hasAddress: true, priority: null, cpStatus: null, ...o,
});

describe("porcentajes", () => {
  it("sin denominador no hay porcentaje (no 0 %)", () => { expect(rate(0, 0)).toBeNull(); expect(rate(1, 3)).toBe(33); expect(rate(0, 5)).toBe(0); });
});

describe("agrupar", () => {
  const rows = [
    row({ category: "cosmética", cpStatus: "won", status: "qualified", priority: 80, hasPhone: true }),
    row({ category: "perfumería", cpStatus: "meeting", priority: 60 }),
    row({ category: "ropa", name: "Moda", cpStatus: "contacted", city: "Medellín" }),
    row({ category: "ropa", name: "Moda 2", cpStatus: "pending" }),
    row({ category: "astillero", sourceName: "csv_import", city: null }),
  ];
  it("por rubro agrupa familias (cosmética + perfumería = belleza)", () => {
    const s = bySector(rows);
    const b = s.find((x) => x.key === "belleza")!;
    expect(b).toMatchObject({ total: 2, won: 1, meetings: 2, contacted: 2, inCampaign: 2, qualified: 1, avgPriority: 70 });
    expect(s.find((x) => x.key === "moda")).toMatchObject({ total: 2, inCampaign: 2, contacted: 1, meetings: 0 }); // 'pending' no cuenta como contactado
    expect(s.find((x) => x.key === "general")!.total).toBe(1);
  });
  it("embudo acumulado según el estado actual", () => {
    const g = groupRows(rows, () => ({ key: "t", label: "t" }))[0];
    expect(g).toMatchObject({ total: 5, inCampaign: 4, contacted: 3, meetings: 2, won: 1 });
  });
  it("ciudad y fuente; sin ciudad se etiqueta, no se oculta", () => {
    expect(byCity(rows).map((c) => c.label)).toContain("Sin ciudad");
    expect(bySource(rows).find((s) => s.key === "csv_import")!.total).toBe(1);
  });
  it("marca muestras pequeñas", () => {
    expect(bySector(rows)[0].smallSample).toBe(true);
    expect(groupRows(Array.from({ length: 12 }, () => row()), () => ({ key: "a", label: "a" }))[0].smallSample).toBe(false);
  });
  it("sin prioridades el promedio es null, no 0", () => {
    expect(bySector([row()])[0].avgPriority).toBeNull();
  });
  it("ordena por tamaño", () => {
    const t = byCity([row({ city: "A" }), row({ city: "B" }), row({ city: "B" })]);
    expect(t.map((x) => x.label)).toEqual(["B", "A"]);
  });
});

describe("calidad de datos", () => {
  it("porcentajes de teléfono, web, correo y dirección", () => {
    const q = quality([row({ hasPhone: true }), row({ hasPhone: true, hasWeb: true }), row(), row({ hasAddress: false })]);
    expect(q).toEqual({ total: 4, phone: 50, web: 25, email: 0, address: 75 });
  });
  it("vacío = null", () => { expect(quality([])).toEqual({ total: 0, phone: null, web: null, email: null, address: null }); });
});

describe("salud de búsquedas", () => {
  it("cuenta fallidas, con avisos y promedio; el costo es null si nadie lo registró", () => {
    const h = searchHealth([
      { connector: "openstreetmap", status: "completed", error: null, resultCount: 10, costUsd: null },
      { connector: "openstreetmap", status: "completed", error: "Overpass no respondió", resultCount: 5, costUsd: null },
      { connector: "openstreetmap", status: "failed", error: "x", resultCount: 0, costUsd: null },
      { connector: "google_places", status: "completed", error: null, resultCount: 20, costUsd: "0.5" },
    ]);
    const o = h.find((x) => x.connector === "openstreetmap")!;
    expect(o).toMatchObject({ total: 3, completed: 2, failed: 1, withWarnings: 1, avgStored: 7.5, costUsd: null });
    expect(h.find((x) => x.connector === "google_places")!.costUsd).toBe(0.5);
  });
});

describe("periodo", () => {
  it("interpreta días y 'todo'", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    expect(sinceDate("30", now)!.toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(sinceDate("all", now)).toBeNull(); expect(sinceDate(undefined, now)).toBeNull();
    expect(sinceDate("-5", now)).toBeNull(); expect(sinceDate("abc", now)).toBeNull(); expect(sinceDate("99999", now)).toBeNull();
  });
});
