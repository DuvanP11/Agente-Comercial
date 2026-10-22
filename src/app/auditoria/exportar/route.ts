import Papa from "papaparse";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { isKind, KINDS, moduleOf } from "@/lib/activity";
import { isHunter } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { listActivity } from "@/lib/services/activity";
import { track } from "@/lib/track";
import { sanitizeCell } from "@/lib/services/tabular";

export const dynamic = "force-dynamic";
const day = (s: string | null, end: boolean) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${end ? "23:59:59" : "00:00:00"}-05:00`) : undefined);

/** CSV del registro con los mismos filtros de la pantalla. La descarga también queda registrada. */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || isHunter(me.role)) return new Response("Sin permiso", { status: 403 });
  const q = new URL(req.url).searchParams;
  const db = await getDb();
  const rows = await listActivity(db, await ensureDefaultOrg(db), { userId: q.get("u") || undefined, kind: isKind(q.get("k")) ? (q.get("k") as string) : undefined, q: q.get("q") ?? undefined, from: day(q.get("d"), false), to: day(q.get("h"), true), limit: 5000 });
  await track("download", "Descargó el registro de auditoría (CSV)", { filas: rows.length }, "/auditoria");
  const csv = Papa.unparse({
    fields: ["Fecha (Bogotá)", "Persona", "Correo", "Rol", "Tipo", "Qué hizo", "Módulo", "Detalle", "IP"],
    data: rows.map((r) => [r.createdAt.toLocaleString("es-CO", { timeZone: "America/Bogota" }), r.userName ?? "", r.userEmail ?? "", r.role ?? "", KINDS[r.kind as keyof typeof KINDS] ?? r.kind, r.label, moduleOf(r.path), r.detail ? JSON.stringify(r.detail) : "", r.ip ?? ""].map((v) => sanitizeCell(String(v)))),
  });
  return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
