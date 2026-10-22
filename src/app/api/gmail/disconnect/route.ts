import { NextResponse } from "next/server";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { sameOrigin } from "@/lib/rate-limit";
import { disconnectGmail } from "@/lib/services/gmail";
import { getCurrentUser } from "@/lib/session";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req.headers)) return NextResponse.json({ error: "no permitido" }, { status: 403 });
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "sin sesión" }, { status: 401 });
  const db = await getDb();
  await disconnectGmail(db, await ensureDefaultOrg(db), me.id);
  await track("admin", "Desconectó su Gmail", undefined, "/integraciones");
  return NextResponse.json({ ok: true });
}
