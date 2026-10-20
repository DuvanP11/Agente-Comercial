import { and, eq, isNull } from "drizzle-orm";
import { findDuplicates, type CompanyRecord, duplicateMessage } from "../dedup/match";
import { normalizeDomain, normalizeEmail, normalizeName, normalizePhone } from "../dedup/normalize";
import type { Db } from "../db/client";
import { auditLog, clients, duplicateReviews, evidence, prospects } from "../db/schema";
import type { RawProspect } from "../connectors/types";

export interface IngestOutcome {
  prospectId: string;
  name: string;
  category?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  sourceUrl?: string | null;
  status: "new" | "excluded_duplicate" | "needs_review" | "already_stored";
  message?: string;
  matchedWith?: { type: "client" | "prospect"; id: string; name: string; address?: string | null; phone?: string | null; website?: string | null };
  reasons?: unknown;
}

export type Reference = CompanyRecord & { refType: "client" | "prospect" };

/** Clientes y prospectos contra los que se compara cualquier candidato. */
export async function loadReferences(db: Db, orgId: string): Promise<Reference[]> {
  const clientRows = await db.select().from(clients).where(and(eq(clients.orgId, orgId), isNull(clients.archivedAt)));
  const prospectRows = await db.select().from(prospects).where(eq(prospects.orgId, orgId));

  return [
    ...clientRows.map((c) => ({
      refType: "client" as const, id: c.id, origin: "existing_client" as const, name: c.name, legalName: c.legalName,
      nit: c.nit, website: c.website, phone: c.phone, email: c.email, address: c.address, city: c.city,
    })),
    ...prospectRows.map((p) => ({
      refType: "prospect" as const, id: p.id,
      origin: (p.status === "contacted" ? "contacted" : p.status === "archived" ? "archived" : "prospect") as CompanyRecord["origin"],
      name: p.name, website: p.website, phone: p.phone, email: p.email, address: p.address, city: p.city, sourceId: p.sourceId,
    })),
  ];

}

/**
 * Inserta prospectos de un conector comparándolos antes con clientes y prospectos previos.
 * - Coincidencia exacta  → se guarda con estado excluded_duplicate (queda el rastro, no se pierde).
 * - Coincidencia probable → needs_review; NO se fusiona nada automáticamente.
 */
export async function ingestProspects(db: Db, orgId: string, raws: RawProspect[], searchId?: string): Promise<IngestOutcome[]> {
  const refs = await loadReferences(db, orgId);
  const outcomes: IngestOutcome[] = [];
  const shown = (raw: RawProspect) => ({ category: raw.category, address: raw.address, phone: raw.phone, website: raw.website, email: raw.email, sourceUrl: raw.sourceUrl });
  for (const raw of raws) {
    const candidate: CompanyRecord = {
      id: "candidate", origin: "prospect", name: raw.name, website: raw.website, phone: raw.phone,
      email: raw.email, address: raw.address, city: raw.city, sourceId: raw.sourceId,
    };
    const matches = findDuplicates(candidate, refs);
    const top = matches[0];
    const status = !top ? "new" : top.level === "exact" ? "excluded_duplicate" : "needs_review";

    const [row] = await db.insert(prospects).values({
      orgId, searchId, name: raw.name, category: raw.category, website: raw.website, phone: raw.phone,
      email: raw.email, address: raw.address, city: raw.city, sourceName: raw.sourceName, sourceId: raw.sourceId,
      isDemo: raw.isDemo, status, consultedAt: raw.consultedAt,
      nameKey: normalizeName(raw.name), domainKey: normalizeDomain(raw.website),
      phoneKey: normalizePhone(raw.phone), emailKey: normalizeEmail(raw.email),
    }).onConflictDoNothing().returning();
    if (!row) {
      // Mismo id de fuente ya guardado antes: no se duplica, pero se informa para que el usuario lo vea.
      const [existing] = raw.sourceId
        ? await db.select().from(prospects).where(and(eq(prospects.orgId, orgId), eq(prospects.sourceName, raw.sourceName), eq(prospects.sourceId, raw.sourceId))).limit(1)
        : [];
      if (existing) outcomes.push({ prospectId: existing.id, name: existing.name, ...shown(raw), status: "already_stored", message: "Ya estaba guardado de una búsqueda anterior; no se duplicó." });
      continue;
    }

    // Evidencia por cada dato que el conector sí entregó. "Observado en la fuente", no "verificado".
    const ref = raw.sourceUrl ?? `${raw.sourceName}:${raw.sourceId ?? ""}`;
    const observed = ([["name", raw.name], ["address", raw.address], ["phone", raw.phone], ["website", raw.website]] as const)
      .filter(([, v]) => !!v);
    await db.insert(evidence).values(observed.map(([field, value]) => ({
      orgId, entityType: "prospect", entityId: row.id, field, observedValue: value!, sourceRef: ref,
      sourceName: raw.sourceName, method: raw.method ?? "api", observedAt: raw.consultedAt, verification: "source_observed",
      limitations: raw.limitations ?? (raw.isDemo ? "Dato de demostración" : raw.method === "csv_import" ? "Dato tomado de un archivo cargado por el usuario; no verificado de forma independiente." : "Dato publicado por la fuente; no verificado de forma independiente."),
    })));

    // Los siguientes elementos del mismo lote también se comparan contra este.
    refs.push({
      refType: "prospect", id: row.id, origin: "prospect", name: raw.name, website: raw.website,
      phone: raw.phone, email: raw.email, address: raw.address, city: raw.city, sourceId: raw.sourceId,
    });

    if (top) {
      const refInfo = refs.find((r) => r.id === top.reference.id)!;
      await db.insert(duplicateReviews).values({
        orgId, prospectId: row.id, referenceType: refInfo.refType, referenceId: refInfo.id,
        level: top.level, reasons: top.reasons,
        decision: top.level === "exact" ? "excluded" : "pending",
        decidedBy: top.level === "exact" ? "system:auto-exact" : null,
        decidedAt: top.level === "exact" ? new Date() : null,
      });
    }
    const matchRef = top ? refs.find((r) => r.id === top.reference.id)! : undefined;
    outcomes.push({
      prospectId: row.id, name: raw.name, ...shown(raw), status,
      message: top ? duplicateMessage(top.level, matchRef!.refType) : undefined,
      matchedWith: matchRef ? { type: matchRef.refType, id: matchRef.id, name: matchRef.name, address: matchRef.address, phone: matchRef.phone, website: matchRef.website } : undefined,
      reasons: top?.reasons,
    });
  }
  await db.insert(auditLog).values({ orgId, actor: "system", action: "prospects.ingest", entity: searchId, detail: { received: raws.length, stored: outcomes.length } });
  return outcomes;
}

/** Decisión humana sobre un posible duplicado. No borra: cambia estado y deja rastro. */
export async function resolveReview(db: Db, reviewId: string, decision: "excluded" | "linked" | "not_duplicate", actor: string) {
  const [rev] = await db.update(duplicateReviews)
    .set({ decision, decidedBy: actor, decidedAt: new Date() })
    .where(eq(duplicateReviews.id, reviewId)).returning();
  if (!rev) throw new Error("Revisión no encontrada.");
  const status = decision === "not_duplicate" ? "new" : "excluded_duplicate";
  await db.update(prospects).set({ status }).where(eq(prospects.id, rev.prospectId));
  await db.insert(auditLog).values({ orgId: rev.orgId, actor, action: `duplicate.${decision}`, entity: rev.prospectId });
  return rev;
}
