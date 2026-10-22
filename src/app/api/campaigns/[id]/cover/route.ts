import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { getCover } from "@/lib/services/campaign-media";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const c = await getCover(db, await ensureDefaultOrg(db), id);
  if (!c) return new Response("Sin portada", { status: 404 });
  return new Response(new Uint8Array(c.bytes), { headers: { "content-type": c.mime, "x-content-type-options": "nosniff", "cache-control": new URL(req.url).searchParams.has("v") ? "private, max-age=31536000, immutable" : "private, no-cache" } });
}
