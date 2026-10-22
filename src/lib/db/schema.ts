import { sql } from "drizzle-orm";
import {
  index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, boolean, numeric,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().default(sql`gen_random_uuid()::text`);
const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  createdAt: ts("created_at"),
});

/** Empresas ya clientes de PIBOX, cargadas por el usuario (CSV/Excel). */
export const clients = pgTable("clients", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  externalId: text("external_id"),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  nit: text("nit"),
  website: text("website"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  commercialStatus: text("commercial_status"),
  accountOwner: text("account_owner"),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  // Claves normalizadas para deduplicar (calculadas al guardar).
  nameKey: text("name_key").notNull().default(""),
  nitKey: text("nit_key").notNull().default(""),
  domainKey: text("domain_key").notNull().default(""),
  phoneKey: text("phone_key").notNull().default(""),
  emailKey: text("email_key").notNull().default(""),
  importBatchId: text("import_batch_id"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: ts("created_at"),
}, (t) => [
  index("clients_org_idx").on(t.orgId),
  index("clients_nit_idx").on(t.orgId, t.nitKey),
  index("clients_domain_idx").on(t.orgId, t.domainKey),
  index("clients_phone_idx").on(t.orgId, t.phoneKey),
]);

export const prospects = pgTable("prospects", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  searchId: text("search_id"),
  name: text("name").notNull(),
  category: text("category"),
  website: text("website"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  sourceName: text("source_name").notNull(),   // google_places | csv_import | ...
  sourceId: text("source_id"),                 // place_id u otro id externo
  isDemo: boolean("is_demo").notNull().default(false),
  /** new | excluded_duplicate | needs_review | qualified | contacted | archived */
  status: text("status").notNull().default("new"),
  nameKey: text("name_key").notNull().default(""),
  domainKey: text("domain_key").notNull().default(""),
  phoneKey: text("phone_key").notNull().default(""),
  emailKey: text("email_key").notNull().default(""),
  scoreJson: jsonb("score_json"),              // ScoreResult reproducible
  /** Quien pidió no recibir comunicaciones: bloquea campañas y WhatsApp (Ley 1581 de 2012). */
  doNotContact: boolean("do_not_contact").notNull().default(false),
  doNotContactReason: text("do_not_contact_reason"),
  doNotContactAt: timestamp("do_not_contact_at", { withTimezone: true }),
  consultedAt: timestamp("consulted_at", { withTimezone: true }).notNull(),
  createdAt: ts("created_at"),
}, (t) => [
  index("prospects_org_idx").on(t.orgId),
  uniqueIndex("prospects_source_uq").on(t.orgId, t.sourceName, t.sourceId),
]);

export const evidence = pgTable("evidence", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  field: text("field").notNull(),
  observedValue: text("observed_value").notNull(),
  sourceRef: text("source_ref").notNull(),
  sourceName: text("source_name").notNull(),
  method: text("method").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  verification: text("verification").notNull(),
  limitations: text("limitations"),
  createdAt: ts("created_at"),
}, (t) => [index("evidence_entity_idx").on(t.entityType, t.entityId)]);

/** Resultado de revisar un posible duplicado: conserva la decisión y su rastro. */
export const duplicateReviews = pgTable("duplicate_reviews", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  prospectId: text("prospect_id").notNull().references(() => prospects.id),
  referenceType: text("reference_type").notNull(),   // client | prospect
  referenceId: text("reference_id").notNull(),
  level: text("level").notNull(),                    // exact | probable
  reasons: jsonb("reasons").notNull(),
  /** pending | excluded | linked | not_duplicate */
  decision: text("decision").notNull().default("pending"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: ts("created_at"),
}, (t) => [index("dup_prospect_idx").on(t.prospectId)]);

export const searches = pgTable("searches", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  naturalLanguage: text("natural_language"),
  criteria: jsonb("criteria").notNull(),
  connector: text("connector").notNull(),
  /** running | completed | failed */
  status: text("status").notNull(),
  error: text("error"),
  resultCount: integer("result_count").notNull().default(0),
  /** Foto de lo que se mostró al usuario (mensaje, avisos y filas) para poder volver a ella desde una ficha. */
  snapshot: jsonb("snapshot"),
  costUsd: numeric("cost_usd", { precision: 12, scale: 4 }),
  createdAt: ts("created_at"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const activities = pgTable("activities", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  prospectId: text("prospect_id"),
  /** whatsapp_opened | email_draft | email_sent | note | call | status_change */
  type: text("type").notNull(),
  detail: jsonb("detail"),
  actor: text("actor"),
  createdAt: ts("created_at"),
});

export const messages = pgTable("messages", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  prospectId: text("prospect_id").notNull(),
  campaignId: text("campaign_id"),
  channel: text("channel").notNull(),       // whatsapp | email
  subject: text("subject"),
  body: text("body").notNull(),
  /** draft | pending_approval | approved | rejected | sent | failed */
  status: text("status").notNull().default("draft"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  providerResult: jsonb("provider_result"),
  createdAt: ts("created_at"),
});

export const themeSettings = pgTable("theme_settings", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  tokens: jsonb("tokens").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: ts("created_at"),
});

export const goals = pgTable("goals", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  metric: text("metric").notNull(),   // leads | contacts | meetings | proposals | new_clients | revenue | margin
  scope: text("scope").notNull().default("org"),
  scopeValue: text("scope_value"),
  target: numeric("target", { precision: 18, scale: 2 }).notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: ts("created_at"),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  orgId: text("org_id"),
  actor: text("actor"),
  action: text("action").notNull(),
  entity: text("entity"),
  detail: jsonb("detail"),
  createdAt: ts("created_at"),
});


export const campaigns = pgTable("campaigns", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  objective: text("objective"),
  valueProposition: text("value_proposition"),
  channel: text("channel").notNull().default("whatsapp"),
  /** Plantilla con {empresa}, {ciudad}, {categoria}. */
  template: text("template").notNull(),
  /** active | closed */
  status: text("status").notNull().default("active"),
  createdAt: ts("created_at"),
});

export const campaignProspects = pgTable("campaign_prospects", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  prospectId: text("prospect_id").notNull().references(() => prospects.id),
  /** pending | contacted | replied | meeting | proposal | won | lost | not_interested | do_not_contact */
  status: text("status").notNull().default("pending"),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: ts("created_at"),
}, (t) => [uniqueIndex("campaign_prospect_uq").on(t.campaignId, t.prospectId), index("cp_org_idx").on(t.orgId)]);


/** Registro de cada ejecución de un agente de IA: qué recibió, qué devolvió, si falló y por qué. */
export const agentRuns = pgTable("agent_runs", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  agent: text("agent").notNull(),
  /** running | completed | failed */
  status: text("status").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  input: jsonb("input"),
  output: jsonb("output"),
  warnings: jsonb("warnings"),
  error: text("error"),
  model: text("model"),
  attempts: integer("attempts").notNull().default(0),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  durationMs: integer("duration_ms"),
  actor: text("actor"),
  startedAt: ts("started_at"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [index("agent_runs_org_idx").on(t.orgId, t.startedAt)]);

/** Ajustes por organización (hoy: pesos de los criterios y cobertura mínima para mostrar prioridad). */
export const orgSettings = pgTable("org_settings", {
  orgId: text("org_id").primaryKey().references(() => organizations.id),
  scoring: jsonb("scoring"),
  /** Guía de la empresa para los agentes de IA (módulo Entrenamiento). No reentrena ningún modelo. */
  training: jsonb("training"),
  updatedAt: ts("updated_at"),
});
