import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { activities, prospects } from "@/lib/db/schema";
import { contactState, outcomeAfterAttempt, outcomeChangeError, outcomeFromCampaign, parseRules } from "@/lib/contact-tracking";
import { registerAttempt, setOutcome } from "@/lib/services/contact-tracking";
import { getContactRules, saveContactRules } from "@/lib/services/settings";
import { addProspects, approveMessage, campaignDetail, createCampaign, generateDraft, openWhatsApp, setCpStatus } from "@/lib/services/campaigns";
import { ingestProspects } from "@/lib/services/prospects";
import { DEFAULT_TEMPLATE } from "@/lib/campaigns";
import type { RawProspect } from "@/lib/connectors/types";

const raw = (o: Partial<RawProspect>): RawProspect => ({
  name: "X", category: null, website: null, phone: null, email: null, address: null, city: "Bogotá",
  sourceName: "t", sourceId: null, sourceUrl: null, consultedAt: new Date(), isDemo: false, ...o,
});
const C = (outcome: string, attempts: number, hasContactData = true) => ({ outcome, attempts, hasContactData });

describe("reglas puras de contacto", () => {
  it("por defecto 3 intentos; el 3.º sin respuesta lo agota; con respuesta clara no", () => {
    expect(contactState(C("pending", 0))).toMatchObject({ key: "pending", canContact: true, attemptsLeft: 3 });
    expect(contactState(C("contacted", 2))).toMatchObject({ key: "contacted", canContact: true, attemptsLeft: 1 });
    expect(contactState(C("contacted", 3))).toMatchObject({ key: "exhausted", canContact: false });
    expect(contactState(C("no_answer", 3))).toMatchObject({ key: "exhausted", canContact: false });
    expect(contactState(C("interested", 5))).toMatchObject({ key: "interested", canContact: true }); // interesado no «muere»
    expect(contactState(C("not_interested", 1))).toMatchObject({ key: "not_interested", canContact: false });
  });
  it("sin teléfono, correo ni web y sin intentos: «sin datos»; el máximo es ajustable", () => {
    expect(contactState(C("pending", 0, false))).toMatchObject({ key: "no_info", canContact: false });
    expect(contactState(C("contacted", 3), { maxAttempts: 5 })).toMatchObject({ key: "contacted", canContact: true, attemptsLeft: 2 });
    expect(contactState(C("contacted", 3), { maxAttempts: 2 }).key).toBe("exhausted");
  });
  it("validación del máximo y transiciones", () => {
    expect(parseRules({ maxAttempts: 4 })).toEqual({ maxAttempts: 4 });
    for (const bad of [0, 11, 2.5, "3", null]) expect(() => parseRules({ maxAttempts: bad })).toThrow(/entero entre 1 y 10/);
    expect(outcomeAfterAttempt("pending")).toBe("contacted"); expect(outcomeAfterAttempt("no_answer")).toBe("contacted"); expect(outcomeAfterAttempt("interested")).toBe("interested");
    expect(outcomeChangeError("no_answer", 0)).toMatch(/al menos un intento/); expect(outcomeChangeError("no_answer", 1)).toBeNull();
    expect(outcomeChangeError("pending", 2)).toMatch(/no puede volver/); expect(outcomeChangeError("interested", 0)).toBeNull();
    expect(outcomeFromCampaign("won", "contacted")).toBe("interested"); expect(outcomeFromCampaign("not_interested", "contacted")).toBe("not_interested");
    expect(outcomeFromCampaign("lost", "contacted")).toBeNull(); expect(outcomeFromCampaign("replied", "pending")).toBe("contacted");
  });
});

describe("gestión de contacto con base de datos", () => {
  it("3 intentos y el siguiente se rechaza; subir el máximo lo reabre; queda el historial", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    const [a] = await ingestProspects(d, o, [raw({ name: "Glam House", phone: "3107778899", sourceId: "a" })]);
    for (let i = 1; i <= 3; i++) {
      const st = await registerAttempt(d, o, a.prospectId, { channel: i === 2 ? "call" : "whatsapp", note: `n${i}` }, "t");
      expect(st.attemptsLeft).toBe(3 - i);
    }
    const [p] = await d.select().from(prospects).where(eq(prospects.id, a.prospectId));
    expect(p).toMatchObject({ contactAttempts: 3, contactOutcome: "contacted" });
    await expect(registerAttempt(d, o, a.prospectId, { channel: "call" }, "t")).rejects.toThrow(/Ya se hicieron 3 intentos/);
    await saveContactRules(d, o, { maxAttempts: 4 }, "t");
    expect((await getContactRules(d, o)).maxAttempts).toBe(4);
    expect((await registerAttempt(d, o, a.prospectId, { channel: "call" }, "t")).key).toBe("exhausted");
    const acts = await d.select().from(activities).where(eq(activities.prospectId, a.prospectId));
    expect(acts.filter((x) => x.type === "contact_attempt")).toHaveLength(4);
  });
  it("dos intentos simultáneos con un solo cupo: solo entra uno (el contador es atómico)", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    const [a] = await ingestProspects(d, o, [raw({ name: "Carrera", phone: "3107778899", sourceId: "a" })]);
    await saveContactRules(d, o, { maxAttempts: 1 }, "t");
    const r = await Promise.allSettled([registerAttempt(d, o, a.prospectId, { channel: "call" }, "t"), registerAttempt(d, o, a.prospectId, { channel: "call" }, "t")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const [p] = await d.select().from(prospects).where(eq(prospects.id, a.prospectId));
    expect(p.contactAttempts).toBe(1);
  });
  it("resultados: sin respuesta exige intento; no interesado bloquea; «no contactar» manda sobre todo", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    const [a, b] = await ingestProspects(d, o, [raw({ name: "Uno", phone: "3107778899", sourceId: "a" }), raw({ name: "Dos", phone: "3105550000", sourceId: "b" })]);
    await expect(setOutcome(d, o, a.prospectId, "no_answer", null, "t")).rejects.toThrow(/al menos un intento/);
    await registerAttempt(d, o, a.prospectId, { channel: "call" }, "t");
    expect((await setOutcome(d, o, a.prospectId, "no_answer", "no contestó", "t")).key).toBe("no_answer");
    expect((await setOutcome(d, o, a.prospectId, "interested", null, "t")).key).toBe("interested");
    expect((await setOutcome(d, o, a.prospectId, "not_interested", "ya tienen proveedor", "t")).canContact).toBe(false);
    await expect(registerAttempt(d, o, a.prospectId, { channel: "call" }, "t")).rejects.toThrow(/No interesado/);
    await expect(setOutcome(d, o, a.prospectId, "inventado", null, "t")).rejects.toThrow(/no válido/);
    await d.update(prospects).set({ doNotContact: true }).where(eq(prospects.id, b.prospectId));
    await expect(registerAttempt(d, o, b.prospectId, { channel: "call" }, "t")).rejects.toThrow(/no ser contactado/);
  });
  it("WhatsApp desde una campaña cuenta como intento, se frena al agotar y el avance de la campaña actualiza el resultado", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    const [a] = await ingestProspects(d, o, [raw({ name: "Glam House", category: "cosmética", phone: "3107778899", sourceId: "a" })]);
    const camp = (await createCampaign(d, o, { name: "Belleza Suba", template: DEFAULT_TEMPLATE }, "t")).id;
    await addProspects(d, o, camp, [a.prospectId], "t");
    const cp = (await campaignDetail(d, o, camp)).items[0].cp.id;
    await saveContactRules(d, o, { maxAttempts: 2 }, "t");
    await generateDraft(d, o, cp); await approveMessage(d, o, cp, "t");
    expect((await openWhatsApp(d, o, cp, "t")).url).toBeDefined();
    expect((await openWhatsApp(d, o, cp, "t", true)).url).toBeDefined();
    await expect(openWhatsApp(d, o, cp, "t", true)).rejects.toThrow(/Ya se hicieron 2 intentos/);
    const [p] = await d.select().from(prospects).where(eq(prospects.id, a.prospectId));
    expect(p.contactAttempts).toBe(2);
    await setCpStatus(d, o, cp, "meeting", "t");
    expect((await d.select().from(prospects).where(eq(prospects.id, a.prospectId)))[0].contactOutcome).toBe("interested");
  });
});

import { openEmail } from "@/lib/services/campaigns";
describe("correo asistido desde una campaña", () => {
  it("abre el correo con el mensaje aprobado, cuenta como intento por correo y exige correo válido, aprobación y cupo", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    const [a, b] = await ingestProspects(d, o, [raw({ name: "Con Correo", email: "ventas@concorreo.co", sourceId: "e1" }), raw({ name: "Sin Correo", phone: "3107778899", sourceId: "e2" })]);
    const camp = (await createCampaign(d, o, { name: "Correos", template: DEFAULT_TEMPLATE }, "t")).id;
    await addProspects(d, o, camp, [a.prospectId, b.prospectId], "t");
    const items = (await campaignDetail(d, o, camp)).items;
    const cpA = items.find((i) => i.p.name === "Con Correo")!.cp.id, cpB = items.find((i) => i.p.name === "Sin Correo")!.cp.id;
    await expect(openEmail(d, o, cpA, "t")).rejects.toThrow(/aprobar el mensaje/);
    await generateDraft(d, o, cpA); await approveMessage(d, o, cpA, "t");
    const r = await openEmail(d, o, cpA, "t");
    expect(r.url).toMatch(/^mailto:ventas@concorreo\.co\?subject=Correos&body=%C2%A1Hola%2C%20equipo%20de%20Con%20Correo/);
    expect((await openEmail(d, o, cpA, "t")).repeatWarning).toMatch(/Ya abriste el correo/);       // dentro de 24 h pide confirmación
    const [p] = await d.select().from(prospects).where(eq(prospects.id, a.prospectId));
    expect(p).toMatchObject({ contactAttempts: 1, contactOutcome: "contacted" });
    const acts = await d.select().from(activities).where(eq(activities.prospectId, a.prospectId));
    expect(acts.some((x) => x.type === "email_opened") && acts.some((x) => x.type === "contact_attempt")).toBe(false); // el intento lo cuenta la apertura, sin duplicar actividad
    await generateDraft(d, o, cpB); await approveMessage(d, o, cpB, "t");
    await expect(openEmail(d, o, cpB, "t")).rejects.toThrow(/no tiene un correo válido/);
  });
});
