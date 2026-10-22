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

import { funnelInsight, priorityInsight, trendInsight, rankInsight, qualityInsight } from "@/lib/dashboard-insights";
import { suggestProspectMapping } from "@/lib/services/prospect-import";

describe("lecturas del dashboard: dicen lo que de verdad muestran los datos", () => {
  it("tendencia: avisa cuando casi todo se cargó en una semana", () => {
    expect(trendInsight([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toMatch(/una sola semana.*no un ritmo constante/);
    expect(trendInsight(Array(12).fill(0), Array(12).fill(0))).toMatch(/No hay actividad/);
    expect(trendInsight([5, 5, 5, 5, 5, 5, 5, 5, 10, 10, 10, 10], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toMatch(/\+100 %/);
  });
  it("embudo: señala la primera etapa vacía como cuello de botella", () => {
    expect(funnelInsight([{ label: "Descubiertos", value: 100 }, { label: "Con contacto", value: 50 }, { label: "Calificados", value: 0 }])).toMatch(/50 %.*«Calificados».*cuello de botella/);
    expect(funnelInsight([{ label: "A", value: 0 }])).toMatch(/Sin prospectos/);
  });
  it("prioridad y calidad: lenguaje claro, sin confundir 'sin prioridad' con 'baja'", () => {
    expect(priorityInsight([0, 0, 0, 0, 0], 10)).toMatch(/falta información/);
    expect(priorityInsight([1, 1, 1, 2, 3], 4)).toMatch(/5 están en 60 o más/);
    expect(qualityInsight({ total: 10, phone: 6, web: 20, email: 3, address: 50 })).toMatch(/lo más escaso es correo \(3 %\)/);
  });
  it("rankings: cobertura solo entre grupos con muestra suficiente", () => {
    const g = (label: string, total: number, withPhone: number) => ({ key: label, label, total, withPhone, qualified: 0, withWeb: 0, withEmail: 0, inCampaign: 0, contacted: 0, meetings: 0, won: 0, avgPriority: null, smallSample: total < 10 });
    expect(rankInsight([g("Bogotá", 30, 3), g("Cali", 2, 2)], "ciudades")).toMatch(/Bogotá lidera con 30.*Bogotá \(10 %\)/);
  });
});

describe("importar: lo que dice la ayuda coincide con lo que reconoce el importador", () => {
  it("los nombres alternativos documentados se mapean solos", () => {
    const m = suggestProspectMapping(["Razón social", "Actividad", "Celular", "E-mail", "Sitio", "Direccion", "Municipio"]);
    expect(m).toEqual({ name: "Razón social", category: "Actividad", phone: "Celular", email: "E-mail", website: "Sitio", address: "Direccion", city: "Municipio" });
    expect(suggestProspectMapping(["Nombre", "Categoría", "Teléfono", "Correo", "Web", "Dirección", "Ciudad"])).toMatchObject({ name: "Nombre", phone: "Teléfono", website: "Web", address: "Dirección" });
  });
});
