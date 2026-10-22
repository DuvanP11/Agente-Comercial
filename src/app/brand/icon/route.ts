import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { getBrandAsset } from "@/lib/services/brand";

export const dynamic = "force-dynamic";

/** Ícono de pestaña subido (se usa para mostrarlo en la pantalla de Apariencia). Sin ícono propio, el cubo de Pibox. */
export async function GET(req: Request) {
  try {
    const db = await getDb();
    const a = await getBrandAsset(db, await ensureDefaultOrg(db), "icon");
    if (a) return new Response(Buffer.from(a.base64, "base64"), { headers: { "content-type": a.mime, "x-content-type-options": "nosniff", "cache-control": new URL(req.url).searchParams.has("v") ? "public, max-age=31536000, immutable" : "no-cache" } });
  } catch { /* por defecto */ }
  return Response.redirect(new URL("/brand/pibox-mark.png", req.url), 302);
}
