import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, auditLog, prospects } from "../db/schema";
import {
  contactState, isChannel, isOutcome, outcomeAfterAttempt, outcomeChangeError, outcomeFromCampaign, type Channel, type ContactState,
} from "../contact-tracking";
import { getContactRules } from "./settings";

type ProspectRow = typeof prospects.$inferSelect;

export const hasContactData = (p: Pick<ProspectRow, "phoneKey" | "emailKey" | "domainKey">) => !!(p.phoneKey || p.emailKey || p.domainKey);

async function load(db: Db, orgId: string, prospectId: string) {
  const [p] = await db.select().from(prospects).where(and(eq(prospects.id, prospectId), eq(prospects.orgId, orgId)));
  if (!p) throw new Error("Prospecto no encontrado.");
  return p;
}

export async function stateOf(db: Db, orgId: string, p: ProspectRow): Promise<ContactState> {
  return contactState({ outcome: p.contactOutcome, attempts: p.contactAttempts, hasContactData: hasContactData(p) }, await getContactRules(db, orgId));
}

/** Lanza si el prospecto no se puede contactar (no interesado, agotado, sin datos o «no contactar»). Lo usan los flujos de WhatsApp. */
export async function assertCanContact(db: Db, orgId: string, p: ProspectRow): Promise<ContactState> {
  if (p.doNotContact) throw new Error("Este prospecto pidió no ser contactado.");
  const st = await stateOf(db, orgId, p);
  // «Sin datos» no bloquea un WhatsApp: si hay un teléfono válido el flujo de WhatsApp ya lo comprueba aparte.
  if (!st.canContact && st.key !== "no_info") throw new Error(st.reason ?? "No se puede contactar.");
  return st;
}

/**
 * Suma un intento de contacto. El incremento es atómico (dos clics a la vez no se pisan) y se vuelve a validar contra el máximo
 * en la misma sentencia. `activity: false` cuando el flujo ya dejó su propia actividad (p. ej. «WhatsApp abierto»).
 */
export async function registerAttempt(
  db: Db, orgId: string, prospectId: string, opts: { channel: Channel; note?: string | null; activity?: boolean }, actor: string,
): Promise<ContactState> {
  if (!isChannel(opts.channel)) throw new Error("Canal no válido.");
  const p = await load(db, orgId, prospectId);
  await assertCanContact(db, orgId, p);
  const rules = await getContactRules(db, orgId);
  const open = ["pending", "contacted", "no_answer"].includes(p.contactOutcome);
  const nextOutcome = outcomeAfterAttempt(p.contactOutcome);
  const updated = await db.update(prospects).set({
    contactAttempts: sql`${prospects.contactAttempts} + 1`, lastAttemptAt: new Date(), contactOutcome: nextOutcome,
  }).where(and(eq(prospects.id, prospectId), open ? sql`${prospects.contactAttempts} < ${rules.maxAttempts}` : sql`true`)).returning({ n: prospects.contactAttempts });
  if (!updated.length) throw new Error(`Se alcanzó el máximo de ${rules.maxAttempts} intentos.`);
  if (opts.activity !== false) {
    await db.insert(activities).values({ orgId, prospectId, type: "contact_attempt", actor, detail: { channel: opts.channel, n: updated[0].n, note: opts.note?.trim().slice(0, 500) || null } });
  }
  return stateOf(db, orgId, await load(db, orgId, prospectId));
}

export async function setOutcome(db: Db, orgId: string, prospectId: string, outcome: string, note: string | null, actor: string): Promise<ContactState> {
  if (!isOutcome(outcome)) throw new Error("Resultado no válido.");
  const p = await load(db, orgId, prospectId);
  if (p.doNotContact && outcome !== "not_interested") throw new Error("Este prospecto pidió no ser contactado.");
  const err = outcomeChangeError(outcome, p.contactAttempts);
  if (err) throw new Error(err);
  await db.update(prospects).set({ contactOutcome: outcome, outcomeNote: note?.trim().slice(0, 500) || null }).where(eq(prospects.id, prospectId));
  await db.insert(activities).values({ orgId, prospectId, type: "contact_outcome", actor, detail: { from: p.contactOutcome, to: outcome, note: note?.trim().slice(0, 500) || null } });
  await db.insert(auditLog).values({ orgId, actor, action: "prospect.contact_outcome", entity: prospectId, detail: { to: outcome } });
  return stateOf(db, orgId, await load(db, orgId, prospectId));
}

/** El avance en una campaña actualiza el resultado del prospecto (no cuenta como intento). */
export async function syncOutcomeFromCampaign(db: Db, orgId: string, prospectId: string, campaignStatus: string) {
  const p = await load(db, orgId, prospectId);
  const next = outcomeFromCampaign(campaignStatus, p.contactOutcome);
  if (next && next !== p.contactOutcome) await db.update(prospects).set({ contactOutcome: next }).where(eq(prospects.id, prospectId));
}
