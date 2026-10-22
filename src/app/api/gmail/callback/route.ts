import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { redirectUri, safeReturn, verifyState } from "@/lib/google-oauth";
import { connectGmail } from "@/lib/services/gmail";
import { getCurrentUser } from "@/lib/session";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

/** Vuelta de Google: valida que quien regresa es quien inició la conexión, canjea el código y guarda el permiso (cifrado). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(new URL("/login", req.url));
  const st = verifyState(url.searchParams.get("state") ?? "");
  const back = safeReturn(st?.returnTo ?? "/integraciones");
  const go = (q: string) => NextResponse.redirect(new URL(`${back}?${q}`, req.url));
  if (!st || st.userId !== me.id) return go("gmail=estado-invalido");
  if (url.searchParams.get("error")) return go("gmail=cancelado");
  const code = url.searchParams.get("code");
  if (!code) return go("gmail=sin-codigo");
  try {
    const db = await getDb();
    const email = await connectGmail(db, await ensureDefaultOrg(db), me, code, redirectUri(await headers()));
    await track("admin", `Conectó su Gmail (${email})`, undefined, "/integraciones");
    return go("gmail=ok");
  } catch (e) {
    return go(`gmail=error&motivo=${encodeURIComponent((e instanceof Error ? e.message : "No se pudo conectar").slice(0, 200))}`);
  }
}
