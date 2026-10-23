import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { getBrandInfo } from "@/lib/services/brand";
import { publicTheme } from "@/lib/theme/public";
import { getActiveTheme } from "@/lib/theme/server";

export const dynamic = "force-dynamic";
// Solo colores y formas, sin datos de nadie: cualquier web puede leerlo (el Automatizador vive en otro dominio).
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "cross-origin-resource-policy": "cross-origin" };

export async function GET(req: Request) {
  const theme = await getActiveTheme();
  let brand = { hasLogo: false, hasIcon: false, tint: true, iconTint: true, version: "0" };
  try { const db = await getDb(); brand = await getBrandInfo(db, await ensureDefaultOrg(db)); } catch { /* sin logo propio */ }
  return Response.json(publicTheme(theme, brand, new URL(req.url).origin), { headers: { ...CORS, "cache-control": "public, max-age=30, stale-while-revalidate=300" } });
}
export const OPTIONS = () => new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } });
