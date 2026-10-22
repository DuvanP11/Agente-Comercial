import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, ensureDefaultOrg, type Db } from "@/lib/db/client";
import { activities, campaignProspects, messages, prospects } from "@/lib/db/schema";
import { approvalBlockers, DEFAULT_TEMPLATE, followUpFromDate, followUpState, funnel, renderTemplate } from "@/lib/campaigns";
import {
  addProspects, approveMessage, campaignDetail, createCampaign, eligibleProspects, followUps, generateDraft, listCampaigns,
  openWhatsApp, saveDraft, setCpStatus, setDoNotContact, setFollowUp,
} from "@/lib/services/campaigns";
import { createGoal, listGoalsWithProgress } from "@/lib/services/goals";
import { ingestProspects } from "@/lib/services/prospects";
import type { RawProspect } from "@/lib/connectors/types";

const raw = (o: Partial<RawProspect>): RawProspect => ({
  name: "X", category: null, website: null, phone: null, email: null, address: null, city: "Bogotá",
  sourceName: "t", sourceId: null, sourceUrl: null, consultedAt: new Date(), isDemo: false, ...o,
});

describe("plantillas y reglas puras", () => {
  it("reemplaza variables y avisa de las vacías y las desconocidas", () => {
    const r = renderTemplate("Hola {empresa} de {ciudad}, rubro {categoria}. {foo}", { empresa: "Glam House", ciudad: "Bogotá", categoria: "" });
    expect(r.text).toBe("Hola Glam House de Bogotá, rubro. {foo}");
    expect(r.empty).toEqual(["categoria"]);
    expect(r.unknown).toEqual(["foo"]);
  });
  it("no se puede aprobar con variables sin resolver ni vacío", () => {
    expect(approvalBlockers("Hola {empresa}")[0]).toMatch(/sin resolver/);
    expect(approvalBlockers("   ")[0]).toMatch(/vacío/);
    expect(approvalBlockers("Hola equipo")).toEqual([]);
  });
  it("seguimientos: vencido, hoy, próximo y cerrado, en hora de Colombia", () => {
    const now = new Date("2026-10-20T15:00:00Z"); // 10:00 en Bogotá
    expect(followUpState("contacted", followUpFromDate("2026-10-19"), now)).toBe("overdue");
    expect(followUpState("contacted", followUpFromDate("2026-10-20"), now)).toBe("today");
    expect(followUpState("contacted", followUpFromDate("2026-10-21"), now)).toBe("upcoming");
    expect(followUpState("contacted", null, now)).toBe("none");
    expect(followUpState("won", followUpFromDate("2026-10-19"), now)).toBe("closed");
    expect(followUpFromDate("20/10/2026")).toBeNull();
    // 23:30 en Bogotá del 20 sigue siendo "hoy" aunque en UTC ya sea el 21
    expect(followUpState("contacted", followUpFromDate("2026-10-20"), new Date("2026-10-21T04:30:00Z"))).toBe("today");
  });
  it("embudo cuenta por estado", () => {
    expect(funnel(["pending", "pending", "won"])).toMatchObject({ pending: 2, won: 1, lost: 0 });
  });
});

describe("campañas con base de datos", () => {
  let db: Db, org: string, camp: string, p1: string, p2: string, p3: string, cp1: string, cp2: string;

  beforeAll(async () => {
    db = await createPgliteDb();
    org = await ensureDefaultOrg(db);
    const out = await ingestProspects(db, org, [
      raw({ name: "Glam House", category: "cosmética", phone: "3107778899", sourceId: "a" }),
      raw({ name: "Esencia Belleza", phone: "3105550000", sourceId: "b" }),
      raw({ name: "Sin Teléfono Ltda", sourceId: "c" }),
      raw({ name: "Esencia Belleza Sur", phone: "+57 310 555 0000", sourceId: "d" }), // duplicado exacto de Esencia
    ]);
    [p1, p2, p3] = [out[0].prospectId, out[1].prospectId, out[2].prospectId];
    camp = (await createCampaign(db, org, { name: "Belleza Suba", template: DEFAULT_TEMPLATE, objective: "Captar tiendas" }, "t")).id;
  });

  it("valida la campaña", async () => {
    await expect(createCampaign(db, org, { name: "ab", template: DEFAULT_TEMPLATE }, "t")).rejects.toThrow(/al menos 3/);
    await expect(createCampaign(db, org, { name: "Válida", template: "corta" }, "t")).rejects.toThrow(/muy corta/);
  });
  it("solo ofrece prospectos elegibles (sin duplicados excluidos)", async () => {
    const el = await eligibleProspects(db, org, camp);
    expect(el.map((p) => p.name).sort()).toEqual(["Esencia Belleza", "Glam House", "Sin Teléfono Ltda"]);
  });
  it("agrega, y no repite ni acepta no elegibles", async () => {
    const dupId = (await db.select().from(prospects).where(eq(prospects.name, "Esencia Belleza Sur")))[0].id;
    const r = await addProspects(db, org, camp, [p1, p2, p3, p1, dupId], "t");
    expect(r.added).toBe(3);
    expect(r.skipped.map((s) => s.id)).toEqual([dupId]);
    expect((await addProspects(db, org, camp, [p1], "t")).added).toBe(0);
    const d = await campaignDetail(db, org, camp);
    cp1 = d.items.find((i) => i.p.id === p1)!.cp.id; cp2 = d.items.find((i) => i.p.id === p3)!.cp.id;
    expect(d.funnel.pending).toBe(3);
  });
  it("genera borrador desde la plantilla y no deja abrir WhatsApp sin aprobar", async () => {
    const r = await generateDraft(db, org, cp1);
    expect(r.text).toContain("Glam House"); expect(r.text).toContain("Bogotá");
    await expect(openWhatsApp(db, org, cp1, "t")).rejects.toThrow(/aprobar el mensaje/);
  });
  it("aprobar exige mensaje sin variables sueltas; editar retira la aprobación", async () => {
    await saveDraft(db, org, cp1, "Hola {empresa} y {otra}");
    await expect(approveMessage(db, org, cp1, "dperilla")).rejects.toThrow(/sin resolver/);
    await saveDraft(db, org, cp1, "Hola equipo de Glam House, ¿hablamos?");
    await approveMessage(db, org, cp1, "dperilla");
    let [m] = await db.select().from(messages).where(eq(messages.prospectId, p1));
    expect(m).toMatchObject({ status: "approved", approvedBy: "dperilla" });
    await saveDraft(db, org, cp1, "Hola equipo de Glam House, ¿hablamos mañana?");
    [m] = await db.select().from(messages).where(eq(messages.prospectId, p1));
    expect(m.status).toBe("draft"); expect(m.approvedBy).toBeNull();
    expect((await db.select().from(messages).where(eq(messages.prospectId, p1)))).toHaveLength(1); // un solo mensaje vigente
  });
  it("abre WhatsApp solo aprobado y con teléfono válido; registra 'abierto'; pide confirmar el repetido", async () => {
    await approveMessage(db, org, cp1, "dperilla");
    const r = await openWhatsApp(db, org, cp1, "dperilla");
    expect(r.url).toMatch(/^https:\/\/wa\.me\/573107778899\?text=/);
    const acts = await db.select().from(activities).where(eq(activities.type, "whatsapp_opened"));
    expect(acts).toHaveLength(1);
    const again = await openWhatsApp(db, org, cp1, "dperilla");
    expect(again.url).toBeUndefined(); expect(again.repeatWarning).toMatch(/Ya abriste WhatsApp/);
    expect((await openWhatsApp(db, org, cp1, "dperilla", true)).url).toBeDefined();
  });
  it("sin teléfono válido no abre WhatsApp", async () => {
    await generateDraft(db, org, cp2); await approveMessage(db, org, cp2, "t");
    await expect(openWhatsApp(db, org, cp2, "t")).rejects.toThrow(/teléfono válido/);
  });
  it("cambios de estado quedan en el historial y alimentan las metas", async () => {
    await setCpStatus(db, org, cp1, "contacted", "t");
    await setCpStatus(db, org, cp1, "replied", "t");
    await setCpStatus(db, org, cp1, "meeting", "t");
    await setCpStatus(db, org, cp1, "proposal", "t");
    await setCpStatus(db, org, cp1, "won", "t");
    const hist = await db.select().from(activities).where(eq(activities.type, "campaign_status"));
    expect(hist.map((h) => (h.detail as { to: string }).to)).toEqual(["contacted", "replied", "meeting", "proposal", "won"]);
    for (const metric of ["meetings", "proposals", "new_clients"]) await createGoal(db, org, { metric, target: 5, periodStart: "2020-01-01", periodEnd: "2099-12-31" }, "t");
    const g = await listGoalsWithProgress(db, org);
    for (const metric of ["meetings", "proposals", "new_clients"]) expect(g.find((x) => x.metric === metric)!.progress.actual).toBe(1);
  });
  it("volver al mismo estado no duplica el historial; estado inválido se rechaza", async () => {
    await setCpStatus(db, org, cp1, "won", "t");
    expect((await db.select().from(activities).where(eq(activities.type, "campaign_status")))).toHaveLength(5);
    await expect(setCpStatus(db, org, cp1, "inventado", "t")).rejects.toThrow(/no válido/);
  });
  it("seguimientos: se programan, se listan y un estado cerrado los limpia", async () => {
    const d = await campaignDetail(db, org, camp);
    const cpEsencia = d.items.find((i) => i.p.name === "Esencia Belleza")!.cp.id;
    await setFollowUp(db, org, cpEsencia, "2099-01-01", "llamar a gerencia");
    expect((await followUps(db, org)).map((f) => f.p.name)).toEqual(["Esencia Belleza"]);
    await expect(setFollowUp(db, org, cp1, "2099-01-01", null)).rejects.toThrow(/cerrada/); // cp1 ya está ganado
    await setCpStatus(db, org, cpEsencia, "lost", "t");
    expect(await followUps(db, org)).toEqual([]);
    const [row] = await db.select().from(campaignProspects).where(eq(campaignProspects.id, cpEsencia));
    expect(row.nextFollowUpAt).toBeNull();
  });
  it("NO CONTACTAR bloquea aprobar, abrir WhatsApp, cambiar de estado y entrar a campañas", async () => {
    const d = await campaignDetail(db, org, camp);
    const cpSin = d.items.find((i) => i.p.name === "Sin Teléfono Ltda")!;
    await setCpStatus(db, org, cpSin.cp.id, "do_not_contact", "t");
    const [p] = await db.select().from(prospects).where(eq(prospects.id, cpSin.p.id));
    expect(p.doNotContact).toBe(true); expect(p.doNotContactReason).toMatch(/no ser contactado/i);
    await expect(approveMessage(db, org, cpSin.cp.id, "t")).rejects.toThrow(/no ser contactado/);
    await expect(openWhatsApp(db, org, cpSin.cp.id, "t")).rejects.toThrow(/no ser contactado/);
    await expect(setCpStatus(db, org, cpSin.cp.id, "contacted", "t")).rejects.toThrow(/no ser contactado/);
    const camp2 = (await createCampaign(db, org, { name: "Otra campaña", template: DEFAULT_TEMPLATE }, "t")).id;
    expect((await addProspects(db, org, camp2, [cpSin.p.id], "t")).skipped).toHaveLength(1);
    await setDoNotContact(db, org, cpSin.p.id, false, null, "t"); // se puede revertir y queda en auditoría
    expect((await db.select().from(prospects).where(eq(prospects.id, cpSin.p.id)))[0].doNotContact).toBe(false);
  });
  it("lista campañas con su embudo", async () => {
    const l = await listCampaigns(db, org);
    const c = l.find((x) => x.id === camp)!;
    expect(c.total).toBe(3); expect(c.funnel.won).toBe(1);
  });
});

import { approachFor, captarCandidates, startCaptation } from "@/lib/services/captar";
import { saveAssessment, setQualification } from "@/lib/services/analysis";
import { evidence as evidenceTable } from "@/lib/db/schema";

describe("captar clientes", () => {
  let db: Db, org: string, ids: Record<string, string>;
  beforeAll(async () => {
    db = await createPgliteDb(); org = await ensureDefaultOrg(db);
    const out = await ingestProspects(db, org, [
      raw({ name: "Glam House", category: "cosmética", phone: "3107778899", sourceId: "1" }),
      raw({ name: "Natural Beauty", category: "cosmética", sourceId: "2" }),
      raw({ name: "Moda Norte Ltda", category: "ropa", phone: "3201112222", sourceId: "3" }),
      raw({ name: "Natural Beauty Dos", category: "cosmética", sourceId: "4" }),
    ]);
    ids = Object.fromEntries(out.map((o) => [o.name, o.prospectId]));
    const ev = (await db.select().from(evidenceTable).where(eq(evidenceTable.entityId, ids["Glam House"])))[0].id;
    await saveAssessment(db, org, ids["Glam House"], {
      icp_fit: { value: 1, kind: "confirmed", evidenceIds: [ev] }, logistics_need: { value: 0.8, kind: "inferred", evidenceIds: [] }, delivery_volume: { value: 0.5, kind: "hypothesis", evidenceIds: [] },
    }, "t");
    await setQualification(db, org, ids["Glam House"], true, "t");
  });

  it("ordena: calificados primero y luego por contacto; excluye no contactar y duplicados", async () => {
    await setDoNotContact(db, org, ids["Natural Beauty Dos"], true, null, "t");
    const c = await captarCandidates(db, org);
    expect(c[0].p.name).toBe("Glam House"); // calificado
    expect(c.map((x) => x.p.name)).not.toContain("Natural Beauty Dos");
    expect(c.findIndex((x) => x.p.name === "Moda Norte Ltda")).toBeLessThan(c.findIndex((x) => x.p.name === "Natural Beauty")); // con teléfono antes
  });
  it("inicia captación con campaña nueva y exige nombre", async () => {
    await expect(startCaptation(db, org, { prospectIds: [ids["Glam House"]] }, "t")).rejects.toThrow(/Ponle un nombre/);
    await expect(startCaptation(db, org, { prospectIds: [], newName: "X campaña" }, "t")).rejects.toThrow(/al menos un prospecto/);
    const r = await startCaptation(db, org, { prospectIds: [ids["Glam House"], ids["Moda Norte Ltda"]], newName: "Captación octubre" }, "t");
    expect(r.added).toBe(2);
    const d = await campaignDetail(db, org, r.campaignId);
    expect(d.campaign.template).toContain("{empresa}"); expect(d.items).toHaveLength(2);
  });
  it("los prospectos ya en una campaña activa dejan de ser candidatos", async () => {
    const c = await captarCandidates(db, org);
    expect(c.map((x) => x.p.name)).toEqual(["Natural Beauty"]);
  });
  it("puede sumar a una campaña existente, y no a una cerrada ni a una inexistente", async () => {
    const camp = (await listCampaigns(db, org))[0];
    expect((await startCaptation(db, org, { prospectIds: [ids["Natural Beauty"]], campaignId: camp.id }, "t")).added).toBe(1);
    await expect(startCaptation(db, org, { prospectIds: [ids["Natural Beauty"]], campaignId: "00000000-0000-0000-0000-000000000000" }, "t")).rejects.toThrow(/no existe o está cerrada/);
  });
  it("plan de acercamiento con datos reales: sabe lo que hay, declara lo que falta y refleja el historial", async () => {
    const { approach, score } = await approachFor(db, org, ids["Glam House"]);
    expect(score!.priority).not.toBeNull();
    expect(approach.sector).toBe("belleza");
    expect(approach.known.join(" ")).toContain("3107778899");
    expect(approach.known.join(" ")).not.toMatch(/Sitio web/);
    expect(approach.toVerify.join(" ")).toMatch(/desconocido/); // criterios sin valorar
    expect(approach.nextAction.code).toBe("add_to_campaign");
    await expect(approachFor(db, org, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/no encontrado/);
  });
});

import { stripEmoji, whatsappLink } from "@/lib/contact-links";
describe("enlace de WhatsApp sin emojis", () => {
  it("quita emojis y deja el texto limpio", () => {
    expect(stripEmoji("¡Hola, Jaime! 👋💜 Somos *PIBOX* 🚚📦. ¿Hablamos? 🤝")).toBe("¡Hola, Jaime! Somos *PIBOX*. ¿Hablamos?");
    expect(decodeURIComponent(whatsappLink("573154051883", "Hola 👋🏽 amigo ❤️")!.split("text=")[1])).toBe("Hola amigo");
  });
});

describe("negrita al quitar emojis", () => {
  it("no deja espacios dentro de los asteriscos", () => {
    expect(stripEmoji("Somos *PIBOX Mensajería 🚚📦* y ayudamos")).toBe("Somos *PIBOX Mensajería* y ayudamos");
    expect(stripEmoji("Somos *🚚 PIBOX* hoy")).toBe("Somos *PIBOX* hoy");
  });
});
