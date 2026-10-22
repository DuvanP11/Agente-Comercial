import { NextResponse } from "next/server";
import { cleanPath, cleanText, CLIENT_KINDS, isKind, moduleOf, shortPath } from "@/lib/activity";
import { clientIp, sameOrigin, tooMany } from "@/lib/rate-limit";
import { track } from "@/lib/track";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** El navegador reporta qué pantalla abrió y en qué opción del menú hizo clic. Solo con sesión; solo esos dos tipos; con freno por persona. */
export async function POST(req: Request) {
  if (!sameOrigin(req.headers)) return NextResponse.json({ error: "no permitido" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });
  if (tooMany(`audit:${user.id}`, 240, 60_000)) return NextResponse.json({ ok: false }, { status: 429 });
  let body: { kind?: unknown; path?: unknown; label?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "formato" }, { status: 400 }); }
  if (!isKind(body.kind) || !CLIENT_KINDS.includes(body.kind)) return NextResponse.json({ error: "tipo" }, { status: 400 });
  const path = cleanPath(body.path);
  if (!path) return NextResponse.json({ error: "ruta" }, { status: 400 });
  const label = body.kind === "click" ? cleanText(body.label, 80) || moduleOf(path) : moduleOf(path);
  await track(body.kind, body.kind === "click" ? `Clic en «${label}»` : `Abrió ${label}`, undefined, shortPath(path));
  return NextResponse.json({ ok: true });
}
