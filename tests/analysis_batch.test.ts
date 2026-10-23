import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import type { AiProvider } from "@/lib/ai/provider";
import { AiError, createFailoverProvider, createProvider, humanWait, parseResetDuration, retryAfterFrom, waitFromMessage } from "@/lib/ai/provider";
import { AI_ACTOR, analyzeAndSaveBatch, isAiScore } from "@/lib/services/analysis-batch";
import { saveAssessment, setQualification, type StoredScore } from "@/lib/services/analysis";
import { ingestProspects } from "@/lib/services/prospects";
import type { RawProspect } from "@/lib/connectors/types";

const raw = (o: Partial<RawProspect>): RawProspect => ({ name: "X", category: "veterinaria", website: null, phone: null, email: null, address: null, city: "Bogotá", sourceName: "openstreetmap", sourceId: null, sourceUrl: null, consultedAt: new Date(), isDemo: false, ...o });
const GOOD = JSON.stringify({ assessments: [
  { criterion: "icp_fit", kind: "inferred", value: 0.8, evidenceIds: [], note: "Clínica veterinaria en Bogotá" },
  { criterion: "geo_compatibility", kind: "inferred", value: 0.9, evidenceIds: [], note: "Está en Bogotá" },
  { criterion: "logistics_need", kind: "hypothesis", value: 0.6, evidenceIds: [], note: "Podría necesitar mensajería" },
  { criterion: "delivery_volume", kind: "unknown", value: 0, evidenceIds: [], note: "" },
], summary: "Clínica veterinaria" });
function ai(...replies: (string | Error)[]) { let n = 0; const p: AiProvider = { model: "fake", async complete() { const r = replies[Math.min(n++, replies.length - 1)]; if (r instanceof Error) throw r; return { text: r, promptTokens: 1, completionTokens: 1 } as never; } } as AiProvider; return { p, get calls() { return n; } }; }

async function world(n = 3) {
  const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
  const names = ["Clínica Uno", "Veterinaria Dos", "Pet Tres", "Animal Cuatro"];
  const out = await ingestProspects(d, o, Array.from({ length: n }, (_, i) => raw({ name: names[i], phone: `31055500${i}0`, address: `Calle ${i + 1} # 1-1`, sourceId: `s${i}` })));
  return { d, o, ids: out.map((x) => x.prospectId) };
}
const score = async (d: Awaited<ReturnType<typeof world>>["d"], id: string) => (await d.select().from(prospects).where(eq(prospects.id, id)))[0].scoreJson as StoredScore | null;

describe("analizar en lote con IA", () => {
  it("analiza a todos y guarda cada valoración marcada «IA (sin revisar)», con prioridad", async () => {
    const { d, o, ids } = await world(3); const f = ai(GOOD);
    const r = await analyzeAndSaveBatch(d, o, ids, f.p);
    expect(r).toMatchObject({ saved: 3, skipped: 0, failed: 0 }); expect(f.calls).toBe(3);
    for (const id of ids) { const s = await score(d, id); expect(isAiScore(s)).toBe(true); expect(s!.assessedBy).toBe(AI_ACTOR); expect(s!.assessments.delivery_volume).toBeUndefined(); for (const k of ["icp_fit", "geo_compatibility", "logistics_need"] as const) expect(s!.assessments[k]!.kind).not.toBe("confirmed"); /* la IA nunca confirma; solo las reglas del código pueden (p. ej. contacto) */ }
  });
  it("no pisa las valoraciones existentes salvo que se pida", async () => {
    const { d, o, ids } = await world(2);
    await saveAssessment(d, o, ids[0], { icp_fit: { kind: "inferred", value: 0.2, evidenceIds: [], note: "mía" } }, "Ana (persona)");
    const f = ai(GOOD);
    const r1 = await analyzeAndSaveBatch(d, o, ids, f.p);
    expect(r1).toMatchObject({ saved: 1, skipped: 1 }); expect(f.calls).toBe(1);
    expect((await score(d, ids[0]))!.assessedBy).toBe("Ana (persona)");
    const r2 = await analyzeAndSaveBatch(d, o, [ids[0]], f.p, { includeRated: true });
    expect(r2.saved).toBe(1); expect((await score(d, ids[0]))!.assessedBy).toBe(AI_ACTOR);
  });
  it("una valoración de la IA no permite calificar hasta que una persona la revisa y la guarda", async () => {
    const { d, o, ids } = await world(1);
    await analyzeAndSaveBatch(d, o, ids, ai(GOOD).p);
    expect((await score(d, ids[0]))!.priority).not.toBeNull();
    await expect(setQualification(d, o, ids[0], true, "t")).rejects.toThrow(/la hizo la IA y nadie la ha revisado/);
    const s = await score(d, ids[0]);
    await saveAssessment(d, o, ids[0], s!.assessments, "Ana (persona)");
    await expect(setQualification(d, o, ids[0], true, "t")).resolves.toBeUndefined();
    expect((await d.select().from(prospects).where(eq(prospects.id, ids[0])))[0].status).toBe("qualified");
  });
  it("omite «No contactar», duplicados y los no encontrados", async () => {
    const { d, o, ids } = await world(2);
    await d.update(prospects).set({ doNotContact: true }).where(eq(prospects.id, ids[0]));
    const f = ai(GOOD);
    const r = await analyzeAndSaveBatch(d, o, [...ids, "00000000-0000-0000-0000-000000000000"], f.p);
    expect(r.saved).toBe(1); expect(r.items.map((x) => x.reason ?? x.state).join("|")).toMatch(/No contactar.*No encontrado|No encontrado.*No contactar/s);
  });
  it("un error de la IA no frena al resto; el límite de uso detiene el lote", async () => {
    const { d, o, ids } = await world(4);
    const f = ai("esto no es json", GOOD);
    const r = await analyzeAndSaveBatch(d, o, ids.slice(0, 2), f.p);
    expect(r.failed + r.saved).toBe(2); expect(r.saved).toBeGreaterThanOrEqual(1);
    const lim = ai(new AiError("rate_limit", "límite de uso"));
    const w = await world(3); const r2 = await analyzeAndSaveBatch(w.d, w.o, w.ids, lim.p);
    expect(r2.stopped).toMatch(/límite de uso/); expect(lim.calls).toBeLessThanOrEqual(2); expect(r2.saved).toBe(0);
    expect(r2.failed).toBe(0); expect(r2.remaining).toHaveLength(3); // no es culpa de los prospectos: todos quedan pendientes
  });
  it("sin IA configurada no simula nada; respeta el tope por llamada", async () => {
    const { d, o, ids } = await world(3);
    const r = await analyzeAndSaveBatch(d, o, ids, null);
    expect(r.stopped).toMatch(/no está configurada/); expect(r.saved).toBe(0); expect(await score(d, ids[0])).toBeNull();
    const f = ai(GOOD);
    const r2 = await analyzeAndSaveBatch(d, o, ids, f.p, { max: 2 });
    expect(r2.saved).toBe(2); expect(r2.pending).toBe(1); expect(f.calls).toBe(2);
  });
});

describe("límite del proveedor de IA: cuánto esperar", () => {
  it("lee los encabezados del proveedor (retry-after y x-ratelimit-reset-*)", () => {
    const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
    expect(retryAfterFrom(h({ "retry-after": "30" }))).toBe(30);
    expect(retryAfterFrom(h({ "retry-after": "Wed, 21 Oct 2026 07:28:30 GMT" }), Date.parse("Wed, 21 Oct 2026 07:28:00 GMT"))).toBe(30);
    expect(retryAfterFrom(h({ "x-ratelimit-reset-tokens": "7.66s" }))).toBe(8);
    expect(retryAfterFrom(h({ "x-ratelimit-reset-requests": "2m59.56s", "x-ratelimit-reset-tokens": "1.5s" }))).toBe(180);
    expect(retryAfterFrom(h({ "retry-after": "999999999" }))).toBe(86_400);
    expect(retryAfterFrom(h({}))).toBeUndefined(); expect(retryAfterFrom(h({ "retry-after": "basura" }))).toBeUndefined();
    expect([parseResetDuration("1h2m3s"), parseResetDuration("450ms"), parseResetDuration("nada"), parseResetDuration("")]).toEqual([3723, 0.45, null, null]);
    expect([humanWait(30), humanWait(120), humanWait(7200)]).toEqual(["30 s", "2 min", "2 h"]);
    expect([waitFromMessage("x. Reintenta en 45 s."), waitFromMessage("Reintenta en 3 min. Reintenta en 2 h."), waitFromMessage("Reintenta en unos minutos."), waitFromMessage(null)]).toEqual([45, 7200, null, null]);
  });
  it("un 429 real del proveedor trae cuánto esperar en el mensaje", async () => {
    const f = (async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } })) as typeof fetch;
    const prov = createProvider({ baseUrl: "http://x", apiKey: "k", model: "m", timeoutMs: 1000 }, f);
    const e = await prov.complete({ system: "s", user: "u", temperature: 0 } as never).catch((x) => x);
    expect(e).toMatchObject({ code: "rate_limit", retryAfterSec: 20 }); expect(e.message).toMatch(/Reintenta en 20 s/);
  });
  it("con varios proveedores solo se espera si TODOS dijeron cuánto; se toma el menor", async () => {
    const lim = (sec?: number): AiProvider => ({ model: "m", async complete() { throw new AiError("rate_limit", "límite de uso", sec); } });
    const a = await createFailoverProvider([{ label: "A", provider: lim(60) }, { label: "B", provider: lim(25) }]).complete({} as never).catch((x) => x);
    expect(a.retryAfterSec).toBe(25); expect(a.message).toMatch(/Reintenta en 25 s\.$/);
    const b = await createFailoverProvider([{ label: "A", provider: lim(60) }, { label: "B", provider: lim(undefined) }]).complete({} as never).catch((x) => x);
    expect(b.retryAfterSec).toBeUndefined();
  });
  it("el lote devuelve cuánto esperar y qué quedó pendiente, para continuar justo ahí", async () => {
    const w = await world(4); let n = 0;
    const p: AiProvider = { model: "f", async complete() { n++; if (n === 3) throw new AiError("rate_limit", "El proveedor de IA alcanzó su límite de uso. Reintenta en 30 s.", 30); return { text: GOOD, promptTokens: 1, completionTokens: 1 } as never; } } as AiProvider;
    const r = await analyzeAndSaveBatch(w.d, w.o, w.ids, p);
    expect(r.saved).toBe(2); expect(r.retryAfterSec).toBe(30); expect(r.stopped).toMatch(/límite de uso/);
    expect(r.remaining).toEqual(w.ids.slice(2)); expect(r.failed).toBe(0);
    const again = await analyzeAndSaveBatch(w.d, w.o, r.remaining!, p);        // continúa solo con los pendientes
    expect(again.saved).toBe(2); expect(again.remaining).toEqual([]);
  });
});
