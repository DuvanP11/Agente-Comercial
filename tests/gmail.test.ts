import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, ensureDefaultOrg, type Db } from "@/lib/db/client";
import { activities, campaignAttachments, campaignProspects, gmailConnections } from "@/lib/db/schema";
import { addProspects, approveMessage, createCampaign, saveDraft, setDoNotContact } from "@/lib/services/campaigns";
import { ingestProspects } from "@/lib/services/prospects";
import { connectGmail, disconnectGmail, getConnection, sendCampaignBatch, sendCampaignEmail, sendableRecipients, sentToday } from "@/lib/services/gmail";
import { buildMime, cleanHeader, encodeHeaderText, textToHtml } from "@/lib/mime";
import { open, seal } from "@/lib/secret-box";
import { safeReturn, signState, verifyState } from "@/lib/google-oauth";
import { DEFAULT_TEMPLATE } from "@/lib/campaigns";
import type { RawProspect } from "@/lib/connectors/types";

process.env.AUTH_SECRET = "0123456789abcdef0123456789abcdef";
process.env.GOOGLE_OAUTH_CLIENT_ID = "id.apps.googleusercontent.com";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secreto-de-prueba";

const raw = (o: Partial<RawProspect>): RawProspect => ({
  name: "X", category: null, website: null, phone: null, email: null, address: null, city: "Bogotá",
  sourceName: "t", sourceId: null, sourceUrl: null, consultedAt: new Date(), isDemo: false, ...o,
});
const decodeRaw = (raw: string) => Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

/** Google simulado: token, perfil y envío. */
function fakeGoogle(o: { scope?: string; refresh?: string | null; email?: string; sendStatus?: number; refreshError?: string } = {}) {
  const sent: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) {
      const body = String(init?.body ?? "");
      if (body.includes("refresh_token=") && o.refreshError) return new Response(JSON.stringify({ error: o.refreshError }), { status: 400 });
      return new Response(JSON.stringify({ access_token: "acc", refresh_token: o.refresh === null ? undefined : o.refresh ?? "ref-123", expires_in: 3000, scope: o.scope ?? "openid email https://www.googleapis.com/auth/gmail.send" }), { status: 200 });
    }
    if (u.includes("userinfo")) return new Response(JSON.stringify({ email: o.email ?? "ana@pibox.app", email_verified: true }), { status: 200 });
    if (u.includes("messages/send")) {
      const st = o.sendStatus ?? 200;
      if (st !== 200) return new Response(JSON.stringify({ error: { status: "X" } }), { status: st });
      sent.push(decodeRaw(JSON.parse(String(init?.body)).raw));
      return new Response(JSON.stringify({ id: `g${sent.length}` }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, sent, sleep: async () => {} };
}

const NAMES = ["Panadería Uno", "Ferretería Dos", "Papelería Tres"];
const ANA = { id: "ana", email: "ana@pibox.app", name: "Ana Pérez", role: "hunter" };
async function world(n = 2) {
  const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
  const camp = await createCampaign(d, o, { name: "Oferta {ciudad}", objective: "Probar", valueProposition: "Entregas rápidas", template: DEFAULT_TEMPLATE }, "ana");
  const ing = await ingestProspects(d, o, Array.from({ length: n }, (_, i) => raw({ name: NAMES[i], email: `n${i}@empresa.co`, phone: `31055500${i}0`, sourceId: `s${i}` })));
  await addProspects(d, o, camp.id, ing.map((x) => x.prospectId), "ana");
  const cps = await d.select().from(campaignProspects);
  for (const cp of cps) { await saveDraft(d, o, cp.id, "Hola, somos PIBOX. Le podemos ayudar con sus envíos."); await approveMessage(d, o, cp.id, "ana"); }
  return { d, o, camp, cps };
}

describe("MIME", () => {
  it("encabezados: sin inyección, con tildes codificadas, y multipart con adjunto", () => {
    expect(cleanHeader("Hola\r\nBcc: x@y.com")).toBe("Hola Bcc: x@y.com");
    expect(encodeHeaderText("Oferta ñandú")).toMatch(/^=\?UTF-8\?B\?/);
    const m = buildMime({ from: "a@b.co", to: "c@d.co", subject: "Asunto\r\nBcc: z@z.co", text: "Hola ñ", html: textToHtml("Hola <b>ñ</b>"), attachments: [{ name: "oferta.pdf", mime: "application/pdf", bytes: new Uint8Array([1, 2, 3]) }] });
    expect(m).not.toMatch(/^Bcc:/mi);
    expect(() => buildMime({ from: "a@b.co", to: "c@d.co\r\nBcc: z@z.co", subject: "s", text: "t" })).toThrow(/no válida/);
    expect(m).toMatch(/Content-Type: multipart\/mixed/i);
    expect(m).toMatch(/filename="?oferta\.pdf/i);
    expect(textToHtml("<script>x</script>")).not.toContain("<script>");
  });
  it("imagen en línea usa cid y multipart/related", () => {
    const m = buildMime({ from: "a@b.co", to: "c@d.co", subject: "s", text: "t", html: '<img src="cid:i0@pibox">', attachments: [{ name: "a.png", mime: "image/png", bytes: new Uint8Array([1]), inlineCid: "i0@pibox" }] });
    expect(m).toMatch(/multipart\/related/i); expect(m).toMatch(/Content-ID: <i0@pibox>/i);
  });
  it("rechaza correos que superan el tope de Gmail", () => {
    expect(() => buildMime({ from: "a@b.co", to: "c@d.co", subject: "s", text: "t", attachments: [{ name: "g.bin", mime: "application/octet-stream", bytes: new Uint8Array(23 * 1024 * 1024) }] })).toThrow();
  });
});

describe("secretos y estado OAuth", () => {
  it("cifra y descifra; lo alterado o con otra clave da null", () => {
    const s = seal("token-secreto"); expect(s).not.toContain("token-secreto"); expect(open(s)).toBe("token-secreto");
    expect(open(s.slice(0, -2) + "xx")).toBeNull(); expect(open("basura")).toBeNull();
  });
  it("state: válido, alterado, vencido; solo vuelve a rutas internas", () => {
    const st = signState("ana", "/campanas/abc");
    expect(verifyState(st)).toEqual({ userId: "ana", returnTo: "/campanas/abc" });
    expect(verifyState((st[0] === "e" ? "f" : "e") + st.slice(1))).toBeNull();
    expect(verifyState(st, Date.now() + 11 * 60_000)).toBeNull();
    expect(safeReturn("https://malo.com")).toBe("/integraciones"); expect(safeReturn("//malo.com")).toBe("/integraciones");
  });
});

describe("conexión con Gmail", () => {
  let d: Db, o: string;
  beforeAll(async () => { d = await createPgliteDb(); o = await ensureDefaultOrg(d); });
  afterEach(async () => { await d.delete(gmailConnections); });
  it("conecta con la cuenta correcta y guarda el token cifrado", async () => {
    expect(await connectGmail(d, o, ANA, "code", "https://x/cb", fakeGoogle())).toBe("ana@pibox.app");
    const [row] = await d.select().from(gmailConnections); expect(row.refreshTokenEnc).not.toContain("ref-123");
    expect((await getConnection(d, "ana"))?.email).toBe("ana@pibox.app");
    await disconnectGmail(d, o, "ana"); expect(await getConnection(d, "ana")).toBeNull();
  });
  it("rechaza otra cuenta (salvo admin), sin permiso permanente y sin el permiso de enviar", async () => {
    await expect(connectGmail(d, o, ANA, "c", "r", fakeGoogle({ email: "otro@pibox.app" }))).rejects.toThrow(/Conectaste otro@pibox.app/);
    await expect(connectGmail(d, o, { ...ANA, role: "admin" }, "c", "r", fakeGoogle({ email: "otro@pibox.app" }))).resolves.toBe("otro@pibox.app");
    await expect(connectGmail(d, o, ANA, "c", "r", fakeGoogle({ refresh: null }))).rejects.toThrow(/permiso permanente/);
    await expect(connectGmail(d, o, ANA, "c", "r", fakeGoogle({ scope: "openid email" }))).rejects.toThrow(/permiso de enviar/);
  });
});

describe("envío de campañas", () => {
  it("envía el mensaje aprobado con asunto, adjunto y pie de baja; registra intento y actividad", async () => {
    const { d, o, camp, cps } = await world(1); const g = fakeGoogle();
    await connectGmail(d, o, ANA, "c", "r", g);
    await d.insert(campaignAttachments).values({ orgId: o, campaignId: camp.id, name: "catalogo.pdf", mime: "application/pdf", kind: "pdf", size: 3, data: Buffer.from([1, 2, 3]) });
    const [att] = await d.select().from(campaignAttachments);
    const r = await sendCampaignEmail(d, o, ANA, cps[0].id, { attachmentIds: [att.id] }, g);
    expect(r).toEqual({ cpId: cps[0].id, ok: true });
    expect(g.sent).toHaveLength(1);
    expect(g.sent[0]).toMatch(/^To: n0@empresa\.co/m); expect(g.sent[0]).toMatch(/catalogo\.pdf/); const subj = /^Subject: =\?UTF-8\?B\?(.+?)\?=/m.exec(g.sent[0]); expect(Buffer.from(subj![1], "base64").toString("utf8")).toBe("Oferta Bogotá");
    expect(await sentToday(d, ANA.email)).toBe(1);
    const [cp] = await d.select().from(campaignProspects); expect(cp.status).toBe("contacted");
    expect((await d.select().from(activities)).some((a) => a.type === "email_sent")).toBe(true);
  });
  it("no repite en 24 h salvo que se pida; respeta «No contactar» y mensaje sin aprobar", async () => {
    const { d, o, cps } = await world(2); const g = fakeGoogle(); await connectGmail(d, o, ANA, "c", "r", g);
    expect((await sendCampaignEmail(d, o, ANA, cps[0].id, {}, g)).ok).toBe(true);
    const again = await sendCampaignEmail(d, o, ANA, cps[0].id, {}, g); expect(again).toMatchObject({ ok: false, skipped: true });
    expect((await sendCampaignEmail(d, o, ANA, cps[0].id, { allowRepeat: true }, g)).ok).toBe(true);
    const [cp1] = await d.select().from(campaignProspects).where(eq(campaignProspects.id, cps[1].id));
    await setDoNotContact(d, o, cp1.prospectId, true, "pidió", "ana");
    expect(await sendCampaignEmail(d, o, ANA, cps[1].id, {}, g)).toMatchObject({ ok: false, error: expect.stringMatching(/no ser contactado/i) });
    await saveDraft(d, o, cps[0].id, "Nuevo texto sin aprobar"); // vuelve a borrador
    expect(await sendCampaignEmail(d, o, ANA, cps[0].id, { allowRepeat: true }, g)).toMatchObject({ ok: false, error: expect.stringMatching(/no está aprobado/) });
  });
  it("sin conexión no envía; errores de Google se traducen y revocación borra la conexión", async () => {
    const { d, o, cps } = await world(1);
    expect((await sendCampaignEmail(d, o, ANA, cps[0].id, {}, fakeGoogle())).error).toMatch(/Conectar mi Gmail/);
    await connectGmail(d, o, ANA, "c", "r", fakeGoogle());
    expect((await sendCampaignEmail(d, o, ANA, cps[0].id, {}, fakeGoogle({ sendStatus: 429 }))).error).toMatch(/esperar/);
    expect((await sendCampaignEmail(d, o, ANA, cps[0].id, {}, fakeGoogle({ sendStatus: 403 }))).error).toMatch(/Gmail API/);
    expect((await sendCampaignEmail(d, o, ANA, cps[0].id, {}, fakeGoogle({ refreshError: "invalid_grant" }))).error).toMatch(/venció o fue revocada/);
    expect(await getConnection(d, "ana")).toBeNull();
    expect(await sentToday(d, ANA.email)).toBe(0);
  });
  it("tope diario: no envía más allá y la tanda se detiene", async () => {
    process.env.GMAIL_DAILY_CAP = "1";
    try {
      const { d, o, camp, cps } = await world(3); const g = fakeGoogle(); await connectGmail(d, o, ANA, "c", "r", g);
      const out = await sendCampaignBatch(d, o, ANA, camp.id, cps.map((c) => c.id), {}, g);
      expect(out.filter((r) => r.ok)).toHaveLength(1); expect(g.sent).toHaveLength(1);
      expect(out.slice(1).every((r) => !r.ok && /tope diario|No se intentó/.test(r.error ?? ""))).toBe(true);
    } finally { delete process.env.GMAIL_DAILY_CAP; }
  });
  it("tanda: envía a todos con pausa, ignora ids de otra campaña y lista los destinatarios listos", async () => {
    const { d, o, camp, cps } = await world(3); const g = fakeGoogle(); await connectGmail(d, o, ANA, "c", "r", g);
    expect(await sendableRecipients(d, o, camp.id)).toHaveLength(3);
    let pausas = 0; g.sleep = async () => { pausas++; };
    const out = await sendCampaignBatch(d, o, ANA, camp.id, [...cps.map((c) => c.id), "otra-campana"], {}, g);
    expect(out.filter((r) => r.ok)).toHaveLength(3); expect(out.at(-1)).toMatchObject({ ok: false, error: expect.stringMatching(/No pertenece/) });
    expect(pausas).toBeGreaterThanOrEqual(2);
  });
});
