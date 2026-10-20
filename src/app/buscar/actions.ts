"use server";
import { eq } from "drizzle-orm";
import { getConnectors } from "@/lib/connectors/registry";
import { searchCriteria } from "@/lib/connectors/types";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { searches } from "@/lib/db/schema";
import { ingestProspects, type IngestOutcome } from "@/lib/services/prospects";

export interface SearchState {
  status: "idle" | "ok" | "error";
  message?: string; errors?: string[]; outcomes?: IngestOutcome[];
}

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

export async function runSearch(_: SearchState, fd: FormData): Promise<SearchState> {
  const parsed = searchCriteria.safeParse({
    city: String(fd.get("city") ?? "").trim(),
    zones: list(fd.get("zones")),
    categories: list(fd.get("categories")),
    maxResults: Number(fd.get("maxResults") ?? 20),
    excludeTerms: list(fd.get("excludeTerms")),
  });
  if (!parsed.success) return { status: "error", message: "Revisa los criterios: se requiere ciudad y al menos una categoría." };

  const connector = getConnectors().find((c) => c.id === String(fd.get("connector")));
  if (!connector) return { status: "error", message: "Fuente no disponible." };
  const st = connector.status();
  if (st.state !== "connected") {
    return { status: "error", message: st.state === "not_configured" ? `${connector.label} no está configurada (falta ${st.missing.join(", ")}). ${st.howTo}` : st.message };
  }

  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const [s] = await db.insert(searches).values({
    orgId: org, naturalLanguage: String(fd.get("brief") ?? "") || null, criteria: parsed.data, connector: connector.id, status: "running",
  }).returning();
  try {
    const result = await connector.search(parsed.data);
    const outcomes = await ingestProspects(db, org, result.prospects, s.id);
    await db.update(searches).set({ status: "completed", resultCount: outcomes.length, finishedAt: new Date(), error: result.errors.join(" | ") || null }).where(eq(searches.id, s.id));
    return { status: "ok", outcomes, errors: result.errors, message: `${result.prospects.length} resultados de ${connector.label}; ${outcomes.length} nuevos registros guardados.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(searches).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(searches.id, s.id));
    return { status: "error", message: `La búsqueda falló: ${msg}` };
  }
}
