import { NextResponse } from "next/server";
import { allowedOrigins, eventToEntry, verifyAutomatizadorToken } from "@/lib/automatizador-audit";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { clientIp, tooMany } from "@/lib/rate-limit";
import { logActivity } from "@/lib/services/activity";
import { getAutomatizadorUrl } from "@/lib/services/settings";

export const dynamic = "force-dynamic";
const MAX_EVENTS = 20;

const cors = (origin: string) => ({ "access-control-allow-origin": origin, vary: "Origin", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "86400" });
async function allowed(req: Request): Promise<string | null> {
  const origin = req.headers.get("origin"); if (!origin) return null;
  try { const db = await getDb(); const ok = allowedOrigins(await getAutomatizadorUrl(db, await ensureDefaultOrg(db))); return ok.includes(origin) ? origin : null; } catch { return null; }
}

export async function OPTIONS(req: Request) {
  const o = await allowed(req);
  return o ? new Response(null, { status: 204, headers: cors(o) }) : new Response(null, { status: 403 });
}

/**
 * El Automatizador de mensajes informa qué secciones abre la persona y qué acciones hace (solo claves de una lista cerrada, ver automatizador-audit.ts).
 * Exige la firma que esta plataforma le entrega al entrar, viene solo de la dirección configurada y tiene freno por persona.
 */
export async function POST(req: Request) {
  const origin = await allowed(req);
  if (!origin) return new Response(null, { status: 403 });
  const h = cors(origin);
  const auth = req.headers.get("authorization") ?? "";
  const who = auth.startsWith("Bearer ") ? verifyAutomatizadorToken(auth.slice(7).trim()) : null;
  if (!who) return NextResponse.json({ error: "sin permiso" }, { status: 401, headers: h });
  if (tooMany(`autoaudit:${who.userId}`, 240, 60_000) || tooMany(`autoaudit-ip:${clientIp(req.headers)}`, 600, 60_000)) return NextResponse.json({ ok: false }, { status: 429, headers: h });
  let body: { events?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "formato" }, { status: 400, headers: h }); }
  if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > MAX_EVENTS) return NextResponse.json({ error: "eventos" }, { status: 400, headers: h });
  const entries = body.events.map(eventToEntry).filter((e): e is NonNullable<typeof e> => !!e);
  const db = await getDb(), org = await ensureDefaultOrg(db);
  const [u] = await db.select().from(users).where(eq(users.id, who.userId));
  // Una persona desactivada o borrada deja de registrar (y el Automatizador deja de intentarlo).
  if (!u || !u.active || u.orgId !== org) return NextResponse.json({ error: "sin permiso" }, { status: 401, headers: h });
  const ip = clientIp(req.headers), ua = req.headers.get("user-agent");
  for (const e of entries) await logActivity(db, org, { kind: e.kind, label: e.label, path: e.path, detail: { origen: "automatizador" }, ip, userAgent: ua, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  return NextResponse.json({ ok: true, registrados: entries.length }, { headers: h });
}
