import { sql } from "drizzle-orm";
import {
  customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, boolean, numeric,
} from "drizzle-orm/pg-core";

/** Archivos binarios (adjuntos de campañas) como bytea. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

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
  /** Gestión de contacto: pending | contacted | no_answer | interested | not_interested. («Sin datos» y «agotado» se derivan, no se guardan.) */
  contactOutcome: text("contact_outcome").notNull().default("pending"),
  /** Veces que el equipo intentó contactarlo (cada WhatsApp abierto o intento registrado). */
  contactAttempts: integer("contact_attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  outcomeNote: text("outcome_note"),
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
  /** Imagen de portada de la campaña (PNG/JPEG/WebP, ya reducida) en base64. */
  coverData: text("cover_data"),
  coverMime: text("cover_mime"),
  createdAt: ts("created_at"),
});

/** Archivos que acompañan a una campaña (imagen, video, PDF, Word). WhatsApp no deja adjuntar por enlace: se descargan o copian para pegarlos en el chat. */
export const campaignAttachments = pgTable("campaign_attachments", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  /** image | video | pdf | doc */
  kind: text("kind").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  createdAt: ts("created_at"),
}, (t) => [index("campaign_attachments_idx").on(t.campaignId)]);

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
  /** Reglas de contacto (máximo de intentos antes de dar el prospecto por agotado). */
  contactRules: jsonb("contact_rules"),
  updatedAt: ts("updated_at"),
});

/** Logo e ícono de pestaña de la organización (imágenes PNG/JPEG/WebP en base64). Si no hay, se usan los de Pibox. */
export const brandAssets = pgTable("brand_assets", {
  orgId: text("org_id").primaryKey().references(() => organizations.id),
  logoData: text("logo_data"),
  logoMime: text("logo_mime"),
  iconData: text("icon_data"),
  iconMime: text("icon_mime"),
  /** true = el logo se pinta con el color principal del tema (solo sirve con fondo transparente y un solo color). */
  tint: boolean("tint").notNull().default(true),
  /** Lo mismo para el ícono de la pestaña. */
  iconTint: boolean("icon_tint").notNull().default(true),
  updatedAt: ts("updated_at"),
});

/** Usuarios de la plataforma. Solo el administrador los crea y gestiona; no hay registro público ni recuperación por correo. */
export const users = pgTable("users", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  emailKey: text("email_key").notNull(),
  username: text("username").notNull(),
  usernameKey: text("username_key").notNull(),
  name: text("name").notNull(),
  /** admin | user */
  role: text("role").notNull().default("user"),
  /** scrypt$N$sal$hash. null = el administrador de arranque, que entra con APP_PASSWORD. */
  passwordHash: text("password_hash"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  active: boolean("active").notNull().default(true),
  /** Se sube al restablecer la contraseña o desactivar: las sesiones anteriores dejan de valer. */
  sessionVersion: integer("session_version").notNull().default(0),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  resetRequestedAt: timestamp("reset_requested_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: ts("created_at"),
}, (t) => [uniqueIndex("users_email_uq").on(t.emailKey), uniqueIndex("users_username_uq").on(t.usernameKey)]);
