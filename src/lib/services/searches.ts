import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { prospects, searches } from "../db/schema";
import type { IngestOutcome } from "./prospects";

export interface SearchSnapshot { message: string; errors: string[]; items: IngestOutcome[] }

export const SEARCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveSnapshot(db: Db, searchId: string, snap: SearchSnapshot) {
  await db.update(searches).set({ snapshot: snap }).where(eq(searches.id, searchId));
}

/**
 * Recupera una búsqueda anterior: sus criterios y lo que se mostró. El estado de cada fila se refresca
 * desde la base (si resolviste un duplicado en la ficha, aquí ya aparece resuelto).
 */
export async function loadSearch(db: Db, orgId: string, searchId: string) {
  if (!SEARCH_ID.test(searchId)) return null;
  const [s] = await db.select().from(searches).where(and(eq(searches.id, searchId), eq(searches.orgId, orgId)));
  if (!s) return null;
  const snap = s.snapshot as SearchSnapshot | null;
  let items = snap?.items ?? [];
  if (items.length) {
    const live = await db.select({ id: prospects.id, status: prospects.status, phone: prospects.phone, website: prospects.website, email: prospects.email })
      .from(prospects).where(inArray(prospects.id, items.map((i) => i.prospectId)));
    const byId = new Map(live.map((l) => [l.id, l]));
    items = items.map((i) => {
      const l = byId.get(i.prospectId);
      if (!l) return i;
      return {
        ...i, phone: l.phone, website: l.website, email: l.email, // también datos que completaste a mano
        status: i.status === "already_stored" ? i.status : (l.status as IngestOutcome["status"]),
      };
    });
  }
  return {
    id: s.id, connector: s.connector, brief: s.naturalLanguage,
    criteria: s.criteria as { city: string; zones: string[]; categories: string[]; maxResults: number; excludeTerms: string[] },
    snapshot: snap ? { ...snap, items } : null,
  };
}
