import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditLog, campaignAttachments, campaigns } from "../db/schema";
import { checkFile, MAX_COVER_BYTES, type MediaKind } from "../campaign-media";
import { parseImageDataUrl } from "../brand";

async function loadCampaign(db: Db, orgId: string, id: string) {
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId)));
  if (!c) throw new Error("Campaña no encontrada.");
  return c;
}

export interface AttachmentInfo { id: string; name: string; mime: string; kind: MediaKind; size: number }

export async function listAttachments(db: Db, orgId: string, campaignId: string): Promise<AttachmentInfo[]> {
  const rows = await db.select({ id: campaignAttachments.id, name: campaignAttachments.name, mime: campaignAttachments.mime, kind: campaignAttachments.kind, size: campaignAttachments.size })
    .from(campaignAttachments).where(and(eq(campaignAttachments.campaignId, campaignId), eq(campaignAttachments.orgId, orgId))).orderBy(campaignAttachments.createdAt);
  return rows as AttachmentInfo[];
}

export async function addAttachment(db: Db, orgId: string, campaignId: string, fileName: string, bytes: Uint8Array, actor: string): Promise<AttachmentInfo> {
  const c = await loadCampaign(db, orgId, campaignId);
  if (c.status === "closed") throw new Error("La campaña está cerrada.");
  const [cur] = await db.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${campaignAttachments.size}), 0)::int` }).from(campaignAttachments).where(eq(campaignAttachments.campaignId, campaignId));
  const chk = checkFile(bytes, fileName, { count: cur?.n ?? 0, total: cur?.total ?? 0 });
  if (!chk.ok) throw new Error(chk.error);
  const [row] = await db.insert(campaignAttachments).values({ orgId, campaignId, name: chk.name!, mime: chk.mime!, kind: chk.kind!, size: bytes.length, data: Buffer.from(bytes) }).returning({ id: campaignAttachments.id });
  await db.insert(auditLog).values({ orgId, actor, action: "campaign.attachment.add", entity: campaignId, detail: { name: chk.name, kind: chk.kind, size: bytes.length } });
  return { id: row.id, name: chk.name!, mime: chk.mime!, kind: chk.kind!, size: bytes.length };
}

export async function getAttachment(db: Db, orgId: string, campaignId: string, id: string) {
  const [r] = await db.select().from(campaignAttachments).where(and(eq(campaignAttachments.id, id), eq(campaignAttachments.campaignId, campaignId), eq(campaignAttachments.orgId, orgId)));
  return r ?? null;
}

export async function deleteAttachment(db: Db, orgId: string, campaignId: string, id: string, actor: string) {
  const c = await loadCampaign(db, orgId, campaignId);
  if (c.status === "closed") throw new Error("La campaña está cerrada.");
  const gone = await db.delete(campaignAttachments).where(and(eq(campaignAttachments.id, id), eq(campaignAttachments.campaignId, campaignId), eq(campaignAttachments.orgId, orgId))).returning({ id: campaignAttachments.id });
  if (!gone.length) throw new Error("Archivo no encontrado.");
  await db.insert(auditLog).values({ orgId, actor, action: "campaign.attachment.delete", entity: campaignId, detail: { id } });
}

/** Portada: imagen ya reducida por el navegador (máx. ~300 KB). null la quita. */
export async function setCover(db: Db, orgId: string, campaignId: string, dataUrl: string | null, actor: string) {
  await loadCampaign(db, orgId, campaignId);
  if (dataUrl === null) await db.update(campaigns).set({ coverData: null, coverMime: null }).where(eq(campaigns.id, campaignId));
  else {
    const img = parseImageDataUrl(dataUrl);
    if (img.bytes.length > MAX_COVER_BYTES) throw new Error(`La portada pesa ${Math.round(img.bytes.length / 1024)} KB; el máximo es ${Math.round(MAX_COVER_BYTES / 1024)} KB.`);
    await db.update(campaigns).set({ coverData: img.base64, coverMime: img.mime }).where(eq(campaigns.id, campaignId));
  }
  await db.insert(auditLog).values({ orgId, actor, action: dataUrl === null ? "campaign.cover.remove" : "campaign.cover.set", entity: campaignId });
}

export async function getCover(db: Db, orgId: string, campaignId: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const [c] = await db.select({ d: campaigns.coverData, m: campaigns.coverMime }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)));
  return c?.d && c.m ? { mime: c.m, bytes: Buffer.from(c.d, "base64") } : null;
}
