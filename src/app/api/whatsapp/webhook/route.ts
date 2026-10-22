import { after, NextResponse } from "next/server";
import { providerFromEnv } from "@/lib/ai/provider";
import { getDb } from "@/lib/db/client";
import { logError } from "@/lib/log";
import { handleInbound, handleStatus } from "@/lib/services/bix";
import { parseWebhook, verifySignature } from "@/lib/whatsapp-cloud";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const NO_STORE = { "cache-control": "no-store" };

/** Verificación del webhook que pide Meta al registrarlo (hub.challenge). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (token && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === token) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain", ...NO_STORE } });
  }
  return new Response("Forbidden", { status: 403, headers: NO_STORE });
}

/** Mensajes y estados que envía WhatsApp. SIN sesión: la autenticidad se prueba con la firma de Meta (X-Hub-Signature-256). */
export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim() ?? "";
  const raw = await req.text();
  if (!secret || !verifySignature(raw, req.headers.get("x-hub-signature-256"), secret)) return new Response("Forbidden", { status: 403, headers: NO_STORE });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400, headers: NO_STORE }); }
  const evt = parseWebhook(body);
  // Se responde 200 enseguida (Meta reintenta si tarda) y la conversación se procesa después.
  after(async () => {
    try {
      const db = await getDb(); const provider = providerFromEnv();
      for (const s of evt.statuses) await handleStatus(db, s);
      for (const m of evt.messages) await handleInbound(db, m, provider);
    } catch (e) { logError("whatsapp.webhook", e); }
  });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
