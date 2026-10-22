import { NextResponse } from "next/server";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { cleanText } from "@/lib/activity";
import { logActivity } from "@/lib/services/activity";

export const dynamic = "force-dynamic";

async function expectedKey(): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.AUTH_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("probe")))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/** Solo la llama el propio middleware (con una clave derivada de AUTH_SECRET). Para cualquier otro, la ruta «no existe». */
export async function POST(req: Request) {
  const given = req.headers.get("x-probe-key") ?? "";
  if (!process.env.AUTH_SECRET || !same(given, await expectedKey())) return new NextResponse("Not found", { status: 404 });
  try {
    const b = (await req.json()) as { path?: unknown; ip?: unknown; ua?: unknown; blocked?: unknown };
    const db = await getDb();
    await logActivity(db, await ensureDefaultOrg(db), {
      kind: "probe", label: `Escaneo bloqueado: ${cleanText(b.path, 120)}${b.blocked ? " (IP bloqueada 1 h)" : ""}`, path: null, detail: { ruta: cleanText(b.path, 120) },
      ip: cleanText(b.ip, 64), userAgent: cleanText(b.ua, 160),
    });
  } catch { /* nunca falla hacia afuera */ }
  return NextResponse.json({ ok: true });
}
export const GET = () => new NextResponse("Not found", { status: 404 });
