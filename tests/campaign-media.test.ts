import { describe, expect, it } from "vitest";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { checkFile, isInline, MAX_FILE_BYTES, MAX_FILES, safeFileName, sniffMedia } from "@/lib/campaign-media";
import { MESSAGE_TEMPLATES, templateVarsUsed } from "@/lib/campaign-templates";
import { approvalBlockers, renderTemplate } from "@/lib/campaigns";
import { campaignFunnel, campaignInsight, campaignNumbers, campaignsOverview } from "@/lib/campaign-stats";
import { createCampaign, listCampaigns, updateCampaign, closeCampaign } from "@/lib/services/campaigns";
import { addAttachment, deleteAttachment, getAttachment, getCover, listAttachments, setCover } from "@/lib/services/campaign-media";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const bytes = (head: number[] | string, len = 64) => { const b = Buffer.alloc(len); (typeof head === "string" ? Buffer.from(head, "latin1") : Buffer.from(head)).copy(b); return new Uint8Array(b); };
const mp4 = () => { const b = Buffer.alloc(64); b.write("ftypisom", 4, "latin1"); return new Uint8Array(b); };
const counts = (o: Partial<Record<string, number>>) => ({ pending: 0, contacted: 0, replied: 0, meeting: 0, proposal: 0, won: 0, lost: 0, not_interested: 0, do_not_contact: 0, ...o }) as never;

describe("archivos de campaña: se verifican por su contenido", () => {
  it("reconoce imagen, video, PDF y Word; rechaza ejecutables y archivos disfrazados", () => {
    expect(sniffMedia(new Uint8Array(PNG), "a.png")).toMatchObject({ kind: "image", mime: "image/png" });
    expect(sniffMedia(bytes([0xff, 0xd8, 0xff, 0xe0]), "a.jpg")?.mime).toBe("image/jpeg");
    expect(sniffMedia(mp4(), "v.mp4")).toMatchObject({ kind: "video" });
    expect(sniffMedia(bytes("%PDF-1.7 ......"), "a.pdf")).toMatchObject({ kind: "pdf" });
    expect(sniffMedia(bytes([0x50, 0x4b, 0x03, 0x04]), "carta.docx")).toMatchObject({ kind: "doc" });
    expect(sniffMedia(bytes([0x50, 0x4b, 0x03, 0x04]), "malware.zip")).toBeNull();        // zip que no es .docx
    expect(sniffMedia(bytes("MZ\u0090\u0000 programa.exe ..."), "foto.png")).toBeNull();   // .exe con nombre de imagen
    expect(sniffMedia(bytes("<svg onload=alert(1)></svg>   "), "logo.svg")).toBeNull();
  });
  it("límites: vacío, tamaño, cantidad, total y nombre seguro", () => {
    expect(checkFile(new Uint8Array(0), "a.png", { count: 0, total: 0 }).error).toMatch(/vacío/);
    expect(checkFile(new Uint8Array(MAX_FILE_BYTES + 1), "a.mp4", { count: 0, total: 0 }).error).toMatch(/máximo por archivo/);
    expect(checkFile(new Uint8Array(PNG), "a.png", { count: MAX_FILES, total: 0 }).error).toMatch(/hasta 12/);
    expect(checkFile(new Uint8Array(PNG), "a.png", { count: 1, total: 20 * 1048576 }).error).toMatch(/20 MB en total/);
    expect(safeFileName('..\\..\\etc/pass"wd<>.pdf')).toBe("passwd.pdf");
    expect(isInline("image")).toBe(true); expect(isInline("pdf")).toBe(false); expect(isInline("doc")).toBe(false);
  });
});

describe("campañas: portada, material y edición", () => {
  it("sube, lista, entrega y borra; la lista no carga la portada pesada", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    const c = await createCampaign(d, o, { name: "Belleza Suba", template: MESSAGE_TEMPLATES[0].body }, "t");
    const a = await addAttachment(d, o, c.id, "Catálogo.png", new Uint8Array(PNG), "t");
    expect(a).toMatchObject({ kind: "image", mime: "image/png", name: "Catálogo.png" });
    await expect(addAttachment(d, o, c.id, "x.png", new Uint8Array(bytes("no soy imagen")), "t")).rejects.toThrow(/Formato no admitido/);
    expect((await listAttachments(d, o, c.id)).map((x) => x.id)).toEqual([a.id]);
    const got = await getAttachment(d, o, c.id, a.id);
    expect(Buffer.from(got!.data).equals(PNG)).toBe(true);
    expect(await getAttachment(d, o, "otra-campaña", a.id)).toBeNull();           // no se puede pedir con el id de otra campaña
    await setCover(d, o, c.id, `data:image/png;base64,${PNG.toString("base64")}`, "t");
    expect((await getCover(d, o, c.id))?.mime).toBe("image/png");
    const list = await listCampaigns(d, o);
    expect(list[0].coverLen).toBeGreaterThan(0); expect("coverData" in list[0]).toBe(false);
    await expect(setCover(d, o, c.id, "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "t")).rejects.toThrow(/PNG, JPG o WebP/);
    await setCover(d, o, c.id, null, "t");
    expect(await getCover(d, o, c.id)).toBeNull();
    await deleteAttachment(d, o, c.id, a.id, "t");
    expect(await listAttachments(d, o, c.id)).toEqual([]);
  });
  it("editar cambia los textos; una campaña cerrada ya no admite cambios ni archivos", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    const c = await createCampaign(d, o, { name: "Original", template: MESSAGE_TEMPLATES[0].body }, "t");
    await updateCampaign(d, o, c.id, { name: "Nuevo nombre", objective: "Otro objetivo", template: MESSAGE_TEMPLATES[3].body }, "t");
    expect((await listCampaigns(d, o))[0]).toMatchObject({ name: "Nuevo nombre", objective: "Otro objetivo", template: MESSAGE_TEMPLATES[3].body });
    await expect(updateCampaign(d, o, c.id, { name: "ab" }, "t")).rejects.toThrow(/al menos 3/);
    await closeCampaign(d, o, c.id, "t");
    await expect(updateCampaign(d, o, c.id, { name: "Otro nombre" }, "t")).rejects.toThrow(/cerrada/);
    await expect(addAttachment(d, o, c.id, "a.png", new Uint8Array(PNG), "t")).rejects.toThrow(/cerrada/);
  });
});

describe("mensajes listos y cifras de campaña", () => {
  it("ninguna plantilla usa variables desconocidas, se puede aprobar y no promete precios ni cifras", () => {
    for (const m of MESSAGE_TEMPLATES) {
      expect(templateVarsUsed(m.body), m.id).toEqual([]);
      const r = renderTemplate(m.body, { empresa: "Glam House", ciudad: "Bogotá", categoria: "cosmética" });
      expect(approvalBlockers(r.text), m.id).toEqual([]);
      expect(m.body, m.id).not.toMatch(/\$|%|\d{3,}|gratis|descuento|garant/i);
    }
  });
  it("cifras acumuladas: quien ganó también fue contactado y respondió", () => {
    const n = campaignNumbers(counts({ pending: 2, contacted: 2, replied: 1, meeting: 1, won: 1, lost: 1 }));
    expect(n).toMatchObject({ total: 8, contacted: 6, replied: 3, meetings: 2, won: 1, contactRate: 75, replyRate: 50 });
    const f = campaignFunnel(counts({ pending: 2, contacted: 2, replied: 1, meeting: 1, won: 1, lost: 1 })).map((s) => s.value);
    expect(f).toEqual([8, 6, 3, 2, 1, 1]);
    for (let i = 1; i < f.length; i++) expect(f[i]).toBeLessThanOrEqual(f[i - 1]);
  });
  it("lecturas claras en cada caso", () => {
    expect(campaignInsight(campaignNumbers(counts({})))).toMatch(/sin prospectos|Todavía no tiene prospectos/i);
    expect(campaignInsight(campaignNumbers(counts({ pending: 3 })))).toMatch(/3 prospecto\(s\) por contactar/);
    expect(campaignInsight(campaignNumbers(counts({ contacted: 4 })))).toMatch(/nadie ha respondido/);
    expect(campaignsOverview([{ name: "A", counts: counts({ contacted: 5, replied: 2 }) }])).toMatch(/«A», 29 %|Mejor respuesta/);
  });
});

import { clamp, COVER_OUT, fitZoom, placeCover, rotatedSize } from "@/lib/cover-geometry";

describe("encuadre de la portada", () => {
  it("zoom 1 cubre el marco justo y queda centrado; ox/oy mueven dentro del margen", () => {
    const p = placeCover(2752, 1536, 1, 0, 0); // imagen apaisada ~1.8:1 en un marco 3:1
    expect(p.dw).toBeCloseTo(COVER_OUT.w); expect(p.dh).toBeGreaterThan(COVER_OUT.h);
    expect(p.dx).toBeCloseTo(0); expect(p.dy).toBeCloseTo((COVER_OUT.h - p.dh) / 2);
    const up = placeCover(2752, 1536, 1, 0, -1), down = placeCover(2752, 1536, 1, 0, 1);
    expect(up.dy).toBeCloseTo(COVER_OUT.h - up.dh); expect(down.dy).toBeCloseTo(0);        // los bordes de la imagen coinciden con los del marco
    expect(placeCover(2752, 1536, 1, 5, 9)).toEqual(placeCover(2752, 1536, 1, 1, 1));       // se limita a [-1, 1]
  });
  it("«ver completa» deja la imagen entera dentro del marco; el zoom se limita", () => {
    const z = fitZoom(2752, 1536), p = placeCover(2752, 1536, z, 0, 0);
    expect(p.dh).toBeCloseTo(COVER_OUT.h); expect(p.dw).toBeLessThanOrEqual(COVER_OUT.w + 0.01);
    expect(placeCover(100, 100, 99, 0, 0).dw).toBeCloseTo(placeCover(100, 100, 4, 0, 0).dw);
    expect(clamp(5, 0, 1)).toBe(1);
  });
  it("girar 90° intercambia ancho y alto (también hacia atrás)", () => {
    expect(rotatedSize(300, 100, 0)).toEqual({ w: 300, h: 100 }); expect(rotatedSize(300, 100, 1)).toEqual({ w: 100, h: 300 });
    expect(rotatedSize(300, 100, -1)).toEqual({ w: 100, h: 300 }); expect(rotatedSize(300, 100, 2)).toEqual({ w: 300, h: 100 });
  });
});
