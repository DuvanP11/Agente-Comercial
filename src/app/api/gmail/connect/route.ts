import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { authUrl, oauthConfig, redirectUri, safeReturn, signState } from "@/lib/google-oauth";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Inicia la conexión del Gmail de la persona que tiene sesión: la manda a Google a dar permiso de enviar. */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(new URL("/login", req.url));
  const cfg = oauthConfig();
  const back = safeReturn(new URL(req.url).searchParams.get("volver") ?? "/integraciones");
  if (!cfg) return NextResponse.redirect(new URL(`${back}?gmail=sin-configurar`, req.url));
  const url = authUrl(cfg, redirectUri(await headers()), signState(me.id, back), me.email.includes("@") && !me.email.endsWith(".local") ? me.email : undefined);
  return NextResponse.redirect(url);
}
