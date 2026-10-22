import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditLog, brandAssets } from "../db/schema";
import { parseImageDataUrl, type BrandKind, type BrandMime } from "../brand";

export interface BrandInfo { hasLogo: boolean; hasIcon: boolean; tint: boolean; iconTint: boolean; version: string }

/** Solo metadatos (no trae las imágenes): para saber qué mostrar y para invalidar cachés cuando cambian. */
export async function getBrandInfo(db: Db, orgId: string): Promise<BrandInfo> {
  const [r] = await db.select({ logo: brandAssets.logoMime, icon: brandAssets.iconMime, tint: brandAssets.tint, iconTint: brandAssets.iconTint, at: brandAssets.updatedAt }).from(brandAssets).where(eq(brandAssets.orgId, orgId));
  return { hasLogo: !!r?.logo, hasIcon: !!r?.icon, tint: r?.tint ?? true, iconTint: r?.iconTint ?? true, version: r ? String(r.at.getTime()) : "0" };
}

export async function getBrandAsset(db: Db, orgId: string, kind: BrandKind): Promise<{ mime: BrandMime; base64: string } | null> {
  const [r] = await db.select().from(brandAssets).where(eq(brandAssets.orgId, orgId));
  const data = kind === "logo" ? r?.logoData : r?.iconData, mime = kind === "logo" ? r?.logoMime : r?.iconMime;
  return data && mime ? { mime: mime as BrandMime, base64: data } : null;
}

export async function saveBrandAsset(db: Db, orgId: string, kind: BrandKind, dataUrl: string, actor: string) {
  const img = parseImageDataUrl(dataUrl);
  const set = kind === "logo" ? { logoData: img.base64, logoMime: img.mime } : { iconData: img.base64, iconMime: img.mime };
  const now = new Date();
  await db.insert(brandAssets).values({ orgId, ...set, updatedAt: now }).onConflictDoUpdate({ target: brandAssets.orgId, set: { ...set, updatedAt: now } });
  await db.insert(auditLog).values({ orgId, actor, action: `brand.${kind}.save`, entity: orgId, detail: { bytes: img.bytes.length, mime: img.mime } });
}

export async function removeBrandAsset(db: Db, orgId: string, kind: BrandKind, actor: string) {
  const set = kind === "logo" ? { logoData: null, logoMime: null } : { iconData: null, iconMime: null };
  const now = new Date();
  await db.insert(brandAssets).values({ orgId, ...set, updatedAt: now }).onConflictDoUpdate({ target: brandAssets.orgId, set: { ...set, updatedAt: now } });
  await db.insert(auditLog).values({ orgId, actor, action: `brand.${kind}.remove`, entity: orgId });
}

export async function setBrandTint(db: Db, orgId: string, kind: BrandKind, tint: boolean, actor: string) {
  const now = new Date();
  const set = kind === "logo" ? { tint } : { iconTint: tint };
  await db.insert(brandAssets).values({ orgId, ...set, updatedAt: now }).onConflictDoUpdate({ target: brandAssets.orgId, set: { ...set, updatedAt: now } });
  await db.insert(auditLog).values({ orgId, actor, action: "brand.tint", entity: orgId, detail: { kind, tint } });
}
