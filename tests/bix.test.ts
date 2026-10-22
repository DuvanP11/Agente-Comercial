import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, ensureDefaultOrg, type Db } from "@/lib/db/client";
import type { AiProvider } from "@/lib/ai/provider";
import { bixAgent } from "@/lib/agents/bix";
import { bixConversations, bixMessages, prospects, users } from "@/lib/db/schema";
import { buildLeadMessage, interestRange, postToChat, validateChatWebhook } from "@/lib/google-chat";
import { classifyWaError, parseWebhook, sendText, verifySignature, WaError, type WaConfig } from "@/lib/whatsapp-cloud";
import { bixStats, eligibleHunters, handleInbound, handleStatus, isOptOut, launchLeads, launchable, nextHunter, readiness, saveChatWebhook, setBixReady, getChatWebhook, bixState, listConversations } from "@/lib/services/bix";
import { updateUser } from "@/lib/services/users";
import { saveTraining } from "@/lib/services/settings";
import { ingestProspects } from "@/lib/services/prospects";
import type { RawProspect } from "@/lib/connectors/types";

process.env.AUTH_SECRET = "0123456789abcdef0123456789abcdef";
const HOOK = "https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t";
const CFG: WaConfig = { token: "tok", phoneId: "123", verifyToken: "v", appSecret: "sec", template: "saludo_pibox", templateLang: "es" };

const raw = (o: Partial<RawProspect>): RawProspect => ({ name: "X", category: "tienda", website: null, phone: null, email: null, address: null, city: "Bogotá", sourceName: "t", sourceId: null, sourceUrl: null, consultedAt: new Date(), isDemo: false, ...o });
const out = (reply: string, extra: Record<string, unknown> = {}) => JSON.stringify({ reply, stage: "filtro", outcome: "continue", interest: 0, answers: [], ...extra });
function ai(...replies: string[]): AiProvider { let i = 0; return { model: "fake", async complete() { return { text: replies[Math.min(i++, replies.length - 1)], promptTokens: 1, completionTokens: 1 } as never; } } as AiProvider; }

/** WhatsApp + Google Chat simulados. */
function net(o: { waFail?: { status: number; code: number }; chatStatus?: number } = {}) {
  const wa: { to: string; type: string; body?: string; template?: string }[] = []; const chat: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("graph.facebook.com")) {
      if (o.waFail) return new Response(JSON.stringify({ error: { code: o.waFail.code } }), { status: o.waFail.status });
      const b = JSON.parse(String(init?.body)); wa.push({ to: b.to, type: b.type, body: b.text?.body, template: b.template?.name });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${wa.length}` }] }), { status: 200 });
    }
    if (u.includes("chat.googleapis.com")) { if ((o.chatStatus ?? 200) !== 200) return new Response("{}", { status: o.chatStatus }); chat.push(JSON.parse(String(init?.body)).text); return new Response("{}", { status: 200 }); }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, wa, chat, sleep: async () => {}, wa_: CFG };
}

async function world(opts: { hunters?: number; ready?: boolean } = {}) {
  const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
  const hs: string[] = [];
  for (let i = 0; i < (opts.hunters ?? 2); i++) {
    const [h] = await d.insert(users).values({ orgId: o, email: `h${i}@pibox.app`, emailKey: `h${i}@pibox.app`, username: `h${i}`, usernameKey: `h${i}`, name: ["Yuly González", "Natalia Olivera", "Camilo Ruiz"][i], role: "hunter", phone: `57300000000${i}`, chatUserId: `10000${i}`, receivesLeads: true, createdAt: new Date(2026, 0, 1 + i) }).returning();
    hs.push(h.id);
  }
  await saveChatWebhook(d, o, "t", HOOK);
  await saveTraining(d, o, { company: "PIBOX presta mensajería urbana para empresas." }, "t");
  if (opts.ready !== false) await setBixReady(d, o, { id: "t", name: "Duvan" }, true, ai("x"));
  const ing = await ingestProspects(d, o, [raw({ name: "Panadería Uno", phone: "3154051883", email: "uno@x.co", sourceId: "1" }), raw({ name: "Ferretería Dos", phone: "3105550000", sourceId: "2" }), raw({ name: "Papelería Tres", phone: "3101112222", sourceId: "3" }), raw({ name: "Sin Teléfono Cuatro", sourceId: "4" })]);
  return { d, o, hs, pids: ing.map((x) => x.prospectId) };
}
const conv = async (d: Db, pid: string) => (await d.select().from(bixConversations).where(eq(bixConversations.prospectId, pid)))[0];

describe("Google Chat", () => {
  it("solo acepta webhooks de espacios de Google Chat", () => {
    expect(validateChatWebhook(HOOK)).toContain("chat.googleapis.com");
    for (const bad of ["http://chat.googleapis.com/v1/spaces/A", "https://evil.com/v1/spaces/A", "https://chat.googleapis.com/otra", "no es url"]) expect(() => validateChatWebhook(bad)).toThrow();
  });
  it("el aviso trae rango, nombre, teléfono, correo, respuestas y arroba al Hunter", () => {
    const t = buildLeadMessage({ interest: 82, name: "Jaime", business: "Librería X", phone: "573154051883", email: "j@x.co", city: "Bogotá", category: "librería", answers: [{ q: "¿Envían pedidos?", a: "sí, 20 al día" }], hunter: { name: "Yuly González", chatUserId: "100001" } });
    expect(t).toMatch(/Interés \*ALTO\* \(82\/100\)/); expect(t).toContain("<users/100001>"); expect(t).toContain("+573154051883"); expect(t).toContain("j@x.co"); expect(t).toContain("sí, 20 al día");
    expect(buildLeadMessage({ interest: 10, name: "A", business: "A", phone: "57300", email: null, city: null, category: null, answers: [], hunter: { name: "Natalia", chatUserId: null } })).toMatch(/\*Natalia\*/);
    expect([interestRange(70), interestRange(69), interestRange(40), interestRange(39)]).toEqual(["Alto", "Medio", "Medio", "Bajo"]);
  });
  it("un fallo del webhook se informa", async () => { await expect(postToChat(HOOK, "x", net({ chatStatus: 404 }).fetchImpl)).rejects.toThrow(/rechazó el webhook/); });
});

describe("WhatsApp Cloud", () => {
  it("firma: válida, alterada y sin firma", () => {
    const body = '{"a":1}', sig = "sha256=" + createHmac("sha256", "sec").update(body).digest("hex");
    expect(verifySignature(body, sig, "sec")).toBe(true); expect(verifySignature(body + " ", sig, "sec")).toBe(false); expect(verifySignature(body, null, "sec")).toBe(false); expect(verifySignature(body, sig, "")).toBe(false);
  });
  it("lee mensajes de texto y estados; ignora audios", () => {
    const e = parseWebhook({ entry: [{ changes: [{ value: { messages: [{ from: "57315", id: "w1", type: "text", text: { body: " Hola " } }, { from: "57315", id: "w2", type: "audio" }], statuses: [{ id: "w0", status: "failed", recipient_id: "57315", errors: [{ code: 131026 }] }] } }] }] });
    expect(e.messages).toEqual([{ from: "57315", id: "w1", text: "Hola" }]); expect(e.unsupported).toHaveLength(1); expect(e.statuses[0]).toMatchObject({ status: "failed", code: 131026 });
    expect(parseWebhook(null).messages).toEqual([]);
  });
  it("clasifica los errores de Meta", async () => {
    expect([classifyWaError(400, 131026), classifyWaError(400, 131047), classifyWaError(401, undefined), classifyWaError(429, undefined), classifyWaError(500, 1)]).toEqual(["not_found", "window", "auth", "rate", "other"]);
    await expect(sendText(CFG, "57315", "hola", net({ waFail: { status: 400, code: 131026 } }).fetchImpl)).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("agente Bix: barreras", () => {
  const base = { scenario: { business: "La Espiga", category: null, city: "Bogotá" }, history: [{ role: "agent" as const, text: "Hola, soy Bix de PIBOX. ¿Envían pedidos?" }, { role: "prospect" as const, text: "Sí, enviamos varios pedidos a clientes en Chapinero" }], guidance: null, minAnswers: 2 };
  const v = (o: object, inp = base) => bixAgent.validate(inp as never, { reply: "Gracias, ¿con qué frecuencia envían?", stage: "filtro", outcome: "continue", interest: 50, answers: [], ...o } as never);
  it("rechaza teléfonos, enlaces y precios en lo que dice Bix", () => {
    for (const bad of ["Escríbale al 3001234567", "Mire https://pibox.co", "Cobramos $9.000 por envío", "Le damos 20 % de descuento"]) expect(() => v({ reply: bad }), bad).toThrow();
  });
  it("descarta respuestas inventadas y conserva las que sí dijo el cliente", () => {
    const r = v({ answers: [{ q: "¿Envían pedidos?", a: "Sí, varios pedidos a clientes" }, { q: "¿Volumen?", a: "Cien millones mensuales" }] });
    expect(r.output.answers).toHaveLength(1); expect(r.warnings.join(" ")).toMatch(/descartaron/);
  });
  it("sin respuestas del cliente no hay interés ni «interesado»; el rechazo baja el interés", () => {
    const sinRespuesta = { ...base, history: [{ role: "agent" as const, text: "Hola, soy Bix" }] };
    expect(v({ outcome: "interested", interest: 90 }, sinRespuesta).output).toMatchObject({ outcome: "continue", interest: 0 });
    expect(v({ outcome: "not_interested", interest: 80 }).output.interest).toBeLessThanOrEqual(15);
    expect(v({ interest: 500 }).output.interest).toBe(100);
  });
});

describe("Bix: lista de verificación y «listo»", () => {
  it("no se puede marcar listo sin webhook, hunters ni entrenamiento", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    await expect(setBixReady(d, o, { id: "t", name: "D" }, true, ai("x"))).rejects.toThrow(/Todavía no está listo/);
    const r = await readiness(d, o, null);
    expect(r.canMarkReady).toBe(false); expect(r.items.find((i) => i.key === "whatsapp")?.needed).toBe("send");
  });
  it("con todo conectado se marca y se apaga; el webhook queda cifrado", async () => {
    const { d, o } = await world({ ready: false });
    await setBixReady(d, o, { id: "t", name: "Duvan" }, true, ai("x")); expect(await bixState(d, o)).toMatchObject({ ready: true, readyBy: "Duvan" });
    await setBixReady(d, o, { id: "t", name: "Duvan" }, false, null); expect((await bixState(d, o)).ready).toBe(false);
    expect(await getChatWebhook(d, o)).toBe(HOOK);
    await expect(saveChatWebhook(d, o, "t", "https://evil.com/x")).rejects.toThrow();
  });
});

describe("Bix: usuarios en la rotación", () => {
  it("valida WhatsApp y el ID de Chat, y exige teléfono para recibir leads", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    const [adm] = await d.insert(users).values({ orgId: o, email: "a@pibox.app", emailKey: "a@pibox.app", username: "adm", usernameKey: "adm", name: "Adm", role: "admin" }).returning();
    const [h] = await d.insert(users).values({ orgId: o, email: "h@pibox.app", emailKey: "h@pibox.app", username: "hh", usernameKey: "hh", name: "Hunter", role: "hunter" }).returning();
    await expect(updateUser(d, o, adm.id, h.id, { receivesLeads: true })).rejects.toThrow(/WhatsApp/);
    await expect(updateUser(d, o, adm.id, h.id, { phone: "123" })).rejects.toThrow(/válido/);
    await expect(updateUser(d, o, adm.id, h.id, { chatUserId: "abc" })).rejects.toThrow(/números/);
    const u = await updateUser(d, o, adm.id, h.id, { phone: "300 123 4567", chatUserId: "users/112233445566", receivesLeads: true });
    expect(u).toMatchObject({ phone: "+573001234567", chatUserId: "112233445566", receivesLeads: true });
    await expect(updateUser(d, o, adm.id, h.id, { phone: "" })).rejects.toThrow(/rotación/);
    expect((await eligibleHunters(d, o)).map((x) => x.id)).toEqual([h.id]);
  });
});

describe("Bix: entregar leads", () => {
  it("apagado o sin WhatsApp no escribe a nadie", async () => {
    const w = await world({ ready: false }); const n = net();
    await expect(launchLeads(w.d, w.o, { id: "t", name: "D" }, [w.pids[0]], ai("x"), { ...n, wa: CFG })).rejects.toThrow(/no está marcado como listo/);
    await setBixReady(w.d, w.o, { id: "t", name: "D" }, true, ai("x"));
    await expect(launchLeads(w.d, w.o, { id: "t", name: "D" }, [w.pids[0]], ai("x"), { ...n, wa: null })).rejects.toThrow(/WhatsApp Business no está conectado/);
    expect(n.wa).toHaveLength(0);
  });
  it("primer contacto con plantilla; no repite; salta sin teléfono y No contactar; «no encontrado» y tope diario", async () => {
    const w = await world(); const n = net();
    await w.d.update(prospects).set({ doNotContact: true }).where(eq(prospects.id, w.pids[2]));
    const r = await launchLeads(w.d, w.o, { id: "t", name: "D" }, [w.pids[0], w.pids[0], w.pids[2], w.pids[3]], ai("x"), { ...n, wa: CFG });
    expect(r.filter((x) => x.ok)).toHaveLength(1); expect(n.wa[0]).toMatchObject({ to: "573154051883", type: "template", template: "saludo_pibox" });
    expect((await conv(w.d, w.pids[0])).status).toBe("sent");
    expect((await launchLeads(w.d, w.o, { id: "t", name: "D" }, [w.pids[0]], ai("x"), { ...n, wa: CFG }))[0].error).toMatch(/ya tiene una conversación/);
    const nf = net({ waFail: { status: 400, code: 131026 } });
    const r2 = await launchLeads(w.d, w.o, { id: "t", name: "D" }, [w.pids[1]], ai("x"), { ...nf, wa: CFG });
    expect(r2[0]).toMatchObject({ ok: false, error: expect.stringMatching(/no tiene WhatsApp/) }); expect((await conv(w.d, w.pids[1])).status).toBe("not_found");
    expect((await launchable(w.d, w.o)).map((x) => x.id)).toEqual([]); // ya no quedan: uno enviado, otro no encontrado, uno bloqueado, uno sin teléfono
    process.env.BIX_DAILY_CAP = "1";
    try { const w2 = await world(); const r3 = await launchLeads(w2.d, w2.o, { id: "t", name: "D" }, [w2.pids[0], w2.pids[1]], ai("x"), { ...net(), wa: CFG }); expect(r3.map((x) => x.ok)).toEqual([true, false]); expect(r3[1].error).toMatch(/tope diario/); }
    finally { delete process.env.BIX_DAILY_CAP; }
  });
  it("sin plantilla, Bix escribe el saludo con IA", async () => {
    const w = await world(); const n = net();
    await launchLeads(w.d, w.o, { id: "t", name: "D" }, [w.pids[0]], ai(out("Hola, equipo de Panadería Uno. Soy Bix, de PIBOX Mensajería. ¿Envían pedidos a domicilio?", { stage: "saludo" })), { ...n, wa: { ...CFG, template: null } });
    expect(n.wa[0]).toMatchObject({ type: "text", body: expect.stringMatching(/Soy Bix/) });
  });
});

describe("Bix: conversar, traspasar y medir", () => {
  async function started() { const w = await world(); const n = net(); await launchLeads(w.d, w.o, { id: "t", name: "D" }, [w.pids[0], w.pids[1], w.pids[2]], ai("x"), { ...n, wa: CFG }); n.wa.length = 0; return { ...w, n }; }
  const say = (w: Awaited<ReturnType<typeof started>>, from: string, text: string, id: string, p: AiProvider) => handleInbound(w.d, { from, id, text }, p, { ...w.n, wa: CFG });

  it("continúa la conversación, ignora reenvíos y no responde a números desconocidos", async () => {
    const w = await started();
    const p = ai(out("Gracias, ¿con qué frecuencia envían esos pedidos?"));
    expect((await say(w, "573154051883", "Hola, sí enviamos pedidos", "m1", p)).note).toBe("continúa");
    expect((await say(w, "573154051883", "Hola, sí enviamos pedidos", "m1", p)).note).toBe("reenvío ignorado");
    expect((await say(w, "573999999999", "hola", "m9", p)).handled).toBe(false);
    expect(w.n.wa).toHaveLength(1); expect((await conv(w.d, w.pids[0])).status).toBe("talking");
  });
  it("interesado: traspasa al siguiente Hunter en rotación, le da su WhatsApp al cliente y avisa en Chat con @mención", async () => {
    const w = await started(); const filt = [{ q: "¿Envían pedidos?", a: "enviamos 20 pedidos al día" }];
    for (let i = 0; i < 2; i++) {
      const phone = ["573154051883", "573105550000"][i];
      await say(w, phone, "enviamos 20 pedidos al día, me interesa que me contacten", `m${i}`, ai(out("Perfecto, gracias por la información. Un ejecutivo del equipo comercial lo atenderá en breve.", { outcome: "interested", interest: 85, answers: filt, stage: "cierre" })));
    }
    const [c1, c2] = [await conv(w.d, w.pids[0]), await conv(w.d, w.pids[1])];
    expect([c1.assignedName, c2.assignedName]).toEqual(["Yuly González", "Natalia Olivera"]);          // primero Yuly, luego Natalia
    expect(c1).toMatchObject({ status: "interested", interest: 85 }); expect(c1.chatNotifiedAt).not.toBeNull();
    expect(w.n.wa[0].body).toContain("https://wa.me/573000000000"); expect(w.n.wa[1].body).toContain("https://wa.me/573000000001"); // redirige al contacto del Hunter
    expect(w.n.wa[0].body).not.toContain("3154051883");                                                // jamás el contacto del cliente
    expect(w.n.chat[0]).toContain("<users/100000>"); expect(w.n.chat[1]).toContain("<users/100001>"); expect(w.n.chat[0]).toContain("enviamos 20 pedidos al día");
    expect((await nextHunter(w.d, w.o))?.name).toBe("Yuly González");                                    // la rotación vuelve a empezar
    expect((await say(w, "573154051883", "gracias", "m5", ai("x"))).note).toBe("conversación cerrada"); // ya lo atiende el Hunter
  });
  it("si Chat falla el lead igual se traspasa y el aviso se puede reintentar", async () => {
    const w = await world(); const n = net({ chatStatus: 500 });
    await launchLeads(w.d, w.o, { id: "t", name: "D" }, [w.pids[0]], ai("x"), { ...n, wa: CFG });
    await handleInbound(w.d, { from: "573154051883", id: "z1", text: "me interesa, llámenme" }, ai(out("Gracias, un ejecutivo lo atenderá.", { outcome: "interested", interest: 90, stage: "cierre" })), { ...n, wa: CFG });
    const c = await conv(w.d, w.pids[0]); expect(c.status).toBe("interested"); expect(c.chatNotifiedAt).toBeNull(); expect(c.chatError).toMatch(/Google Chat/);
  });
  it("«no me escriban» marca No contactar sin pasar por la IA; un «no interesa» lo cierra", async () => {
    const w = await started(); let called = 0; const spy: AiProvider = { model: "f", async complete() { called++; return { text: out("Entendido, gracias por su tiempo.", { outcome: "not_interested", interest: 5 }) } as never; } } as AiProvider;
    expect(isOptOut("por favor no me escriban más")).toBe(true); expect(isOptOut("no, solo enviamos aquí en Bogotá")).toBe(false);
    await say(w, "573154051883", "no me escriban más por favor", "o1", spy);
    expect(called).toBe(0); expect((await conv(w.d, w.pids[0])).status).toBe("not_interested");
    expect((await w.d.select().from(prospects).where(eq(prospects.id, w.pids[0])))[0].doNotContact).toBe(true);
    await say(w, "573105550000", "no gracias, no nos interesa", "o2", spy);
    expect((await conv(w.d, w.pids[1])).status).toBe("not_interested"); expect(called).toBe(1);
  });
  it("sin respuesta de la IA no inventa nada: lo deja anotado", async () => {
    const w = await started();
    await say(w, "573154051883", "hola", "e1", ai("esto no es json", "tampoco"));
    const c = await conv(w.d, w.pids[0]); expect(c.lastError).toBeTruthy(); expect(w.n.wa).toHaveLength(0);
  });
  it("estadísticas: contactado, interesado, sin respuesta, no interesado y no encontrado; el Hunter ve solo lo suyo", async () => {
    const w = await started(); const spy = ai(out("Entendido, gracias.", { outcome: "not_interested", interest: 5 }));
    await say(w, "573154051883", "no gracias", "s1", spy);
    await handleStatus(w.d, { id: (await w.d.select().from(bixMessages).where(eq(bixMessages.conversationId, (await conv(w.d, w.pids[1])).id)))[0].waId!, status: "failed", code: 131026 });
    const s = await bixStats(w.d, w.o);
    expect(s).toMatchObject({ contacted: 2, interested: 0, noResponse: 1, notInterested: 1, notFound: 1 });
    await w.d.update(bixConversations).set({ ownerId: "otro" }).where(eq(bixConversations.prospectId, w.pids[2]));
    expect((await listConversations(w.d, w.o, { id: "otro", seesAll: false })).map((c) => c.prospectId)).toEqual([w.pids[2]]);
    expect((await bixStats(w.d, w.o, { id: "nadie", seesAll: false })).contacted).toBe(0);
  });
});
