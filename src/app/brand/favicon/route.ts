import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { DEFAULT_MARK_BASE64 } from "@/lib/brand-defaults";
import { faviconSvg } from "@/lib/favicon";
import { getBrandAsset, getBrandInfo } from "@/lib/services/brand";
import { getActiveTheme } from "@/lib/theme/server";
import { resolveTheme } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

/** Ícono de la pestaña: el subido (o el cubo de Pibox) pintado con el color principal del tema, para que cambie con el diseño. */
export async function GET() {
  let base64 = DEFAULT_MARK_BASE64, mime = "image/png", tint = true;
  try {
    const db = await getDb(), org = await ensureDefaultOrg(db);
    const [info, icon] = await Promise.all([getBrandInfo(db, org), getBrandAsset(db, org, "icon")]);
    tint = info.tint;
    if (icon) { base64 = icon.base64; mime = icon.mime; }
  } catch { /* se queda el ícono por defecto */ }
  const { light, dark } = resolveTheme(await getActiveTheme());
  const svg = faviconSvg({ base64, mime, tint, light: light.primary, dark: dark?.primary });
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-cache", "x-content-type-options": "nosniff" } });
}
