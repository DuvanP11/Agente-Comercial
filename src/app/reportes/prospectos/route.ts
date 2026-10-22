import Papa from "papaparse";
import { getCurrentUser } from "@/lib/session";
import { prospectVisible, viewerOf } from "@/lib/services/scope";
import { and, desc, eq } from "drizzle-orm";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { track } from "@/lib/track";
import { sanitizeCell } from "@/lib/services/tabular";
import type { StoredScore } from "@/lib/services/analysis";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return new Response("Sin sesión", { status: 401 });
  const db = await getDb();
  // El Hunter descarga solo sus prospectos; los demás roles, todos.
  const rows = await db.select().from(prospects).where(and(eq(prospects.orgId, await ensureDefaultOrg(db)), prospectVisible(viewerOf(me)))).orderBy(desc(prospects.createdAt));
  await track("download", "Descargó el reporte de prospectos (CSV)", { filas: rows.length });
  const csv = Papa.unparse({
    fields: ["Empresa", "Categoría", "Ciudad", "Dirección", "Teléfono", "Sitio web", "Fuente", "Consultado", "Estado", "Prioridad", "Cobertura %", "Demo"],
    data: rows.map((p) => {
      const s = p.scoreJson as StoredScore | null;
      return [p.name, p.category, p.city, p.address, p.phone, p.website, p.sourceName, p.consultedAt.toISOString().slice(0, 10), p.status,
        s ? (s.priority ?? "información insuficiente") : "sin valorar", s ? Math.round(s.coverage * 100) : "", p.isDemo ? "sí" : "no"]
        .map((v) => sanitizeCell(String(v ?? "")));
    }),
  });
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="prospectos-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
