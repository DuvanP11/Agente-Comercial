import { NextResponse } from "next/server";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { sameOrigin } from "@/lib/rate-limit";
import { addAttachment } from "@/lib/services/campaign-media";

export const dynamic = "force-dynamic";

/** Sube un archivo a la campaña (multipart/form-data, campo «file»). El contenido se verifica por sus bytes, no por el nombre. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req.headers)) return NextResponse.json({ error: "Petición no permitida." }, { status: 403 });
  try {
    const { id } = await params;
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File)) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    const db = await getDb();
    const a = await addAttachment(db, await ensureDefaultOrg(db), id, f.name, new Uint8Array(await f.arrayBuffer()), "usuario");
    return NextResponse.json({ ok: true, attachment: a });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo subir el archivo." }, { status: 400 });
  }
}
