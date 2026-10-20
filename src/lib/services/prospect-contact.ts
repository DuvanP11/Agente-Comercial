import { and, eq } from "drizzle-orm";
import { findDuplicates } from "../dedup/match";
import { normalizeDomain, normalizeEmail, normalizePhone } from "../dedup/normalize";
import { safeWebUrl } from "../contact-links";
import type { Db } from "../db/client";
import { auditLog, evidence, prospects } from "../db/schema";
import { loadReferences } from "./prospects";

export interface ContactInput { phone?: string; website?: string; email?: string }
export interface ContactResult { changed: string[]; warnings: string[] }

const FIELD_LABEL = { phone: "teléfono", website: "web", email: "correo" } as const;

/**
 * El usuario completa el contacto de un prospecto. Se guarda como dato "ingresado por el usuario"
 * (con su evidencia), no como dato de la fuente. Vacío = borrar el dato. Nada se fusiona solo:
 * si el nuevo dato coincide con otro registro, se AVISA.
 */
export async function updateContact(db: Db, orgId: string, prospectId: string, input: ContactInput, actor: string): Promise<ContactResult> {
  const [p] = await db.select().from(prospects).where(and(eq(prospects.id, prospectId), eq(prospects.orgId, orgId)));
  if (!p) throw new Error("Prospecto no encontrado.");

  const phone = (input.phone ?? p.phone ?? "").trim();
  const website = (input.website ?? p.website ?? "").trim();
  const email = (input.email ?? p.email ?? "").trim();

  if (phone && !normalizePhone(phone)) throw new Error("Teléfono no reconocido. Usa un número colombiano, p. ej. 310 123 4567 o 601 555 1234.");
  if (website && !safeWebUrl(website)) throw new Error("La web no es válida. Usa una dirección como https://tienda.com o tienda.com.");
  if (email && !normalizeEmail(email)) throw new Error("El correo no tiene un formato válido.");

  const next = { phone: phone || null, website: website || null, email: email || null };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => (next[k] ?? "") !== ((p[k] ?? "").trim()));
  if (changed.length === 0) return { changed: [], warnings: [] };

  await db.update(prospects).set({
    ...next,
    phoneKey: normalizePhone(phone), domainKey: normalizeDomain(website), emailKey: normalizeEmail(email),
  }).where(eq(prospects.id, prospectId));

  const now = new Date();
  const added = changed.filter((k) => next[k]);
  if (added.length) {
    await db.insert(evidence).values(added.map((k) => ({
      orgId, entityType: "prospect", entityId: prospectId, field: k === "website" ? "website" : k, observedValue: next[k]!,
      sourceRef: `usuario:${actor}`, sourceName: "user_input", method: "user_input", observedAt: now,
      verification: "user_confirmed", limitations: "Ingresado manualmente por el usuario; no verificado de forma independiente.",
    })));
  }
  await db.insert(auditLog).values({ orgId, actor, action: "prospect.contact_updated", entity: prospectId, detail: { changed } });

  // ¿El dato nuevo coincide con otro cliente/prospecto? Solo se avisa.
  const refs = await loadReferences(db, orgId);
  const matches = findDuplicates({
    id: prospectId, origin: "prospect", name: p.name, website: next.website, phone: next.phone, email: next.email,
    address: p.address, city: p.city, sourceId: p.sourceId,
  }, refs);
  const warnings = matches.flatMap((m) =>
    m.reasons.filter((r) => r.field === "phone" || r.field === "domain" || r.field === "email").map((r) => {
      const t = refs.find((x) => x.id === m.reference.id)!.refType === "client" ? "un cliente existente" : "otro prospecto";
      return `El ${r.field === "domain" ? "sitio web" : FIELD_LABEL[r.field as "phone" | "email"]} coincide con ${t}: "${m.reference.name}". Revisa si es el mismo negocio.`;
    }));
  return { changed, warnings };
}
