import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { getBrandAsset } from "@/lib/services/brand";

export const dynamic = "force-dynamic";

/** Logo de la organización; si no subió uno, el de Pibox. La URL lleva ?v=<versión>, así que se puede cachear para siempre. */
export async function GET(req: Request) {
  try {
    const db = await getDb();
    const a = await getBrandAsset(db, await ensureDefaultOrg(db), "logo");
    if (a) {
      return new Response(Buffer.from(a.base64, "base64"), { headers: {
        "content-type": a.mime, "x-content-type-options": "nosniff",
        "cache-control": new URL(req.url).searchParams.has("v") ? "public, max-age=31536000, immutable" : "no-cache",
      } });
    }
  } catch { /* si la base falla, se muestra el logo por defecto */ }
  return Response.redirect(new URL("/brand/pibox-logo.png", req.url), 302);
}
