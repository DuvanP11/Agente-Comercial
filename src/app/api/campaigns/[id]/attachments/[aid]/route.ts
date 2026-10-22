import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { isInline, safeFileName } from "@/lib/campaign-media";
import { getAttachment } from "@/lib/services/campaign-media";

export const dynamic = "force-dynamic";

/** Entrega un archivo de la campaña (solo con sesión iniciada: el middleware protege /api). Imagen y video se ven en la página; PDF y Word se descargan. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = await params;
  const db = await getDb();
  const a = await getAttachment(db, await ensureDefaultOrg(db), id, aid);
  if (!a) return new Response("No encontrado", { status: 404 });
  const download = new URL(req.url).searchParams.has("download") || !isInline(a.kind);
  return new Response(new Uint8Array(a.data), { headers: {
    "content-type": a.mime, "content-length": String(a.size), "x-content-type-options": "nosniff",
    "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(safeFileName(a.name))}`,
    "cache-control": "private, max-age=3600", "content-security-policy": "sandbox; default-src 'none'",
  } });
}
