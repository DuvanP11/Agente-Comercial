# Modelo de datos (`src/lib/db/schema.ts`)

Tablas implementadas: `organizations`, `clients`, `prospects`, `evidence`, `duplicate_reviews`, `searches`, `activities`, `messages`, `theme_settings`, `goals`, `audit_log`.

- Todas las tablas de negocio llevan `org_id` (aislamiento previsto; hoy hay una sola organización de desarrollo).
- IDs: UUID como texto. Fechas: `timestamptz`.
- `clients`/`prospects` guardan **claves normalizadas** (`name_key`, `nit_key`, `domain_key`, `phone_key`, `email_key`) calculadas con `dedup/normalize.ts`, e índices sobre ellas.
- `prospects`: índice único `(org_id, source_name, source_id)` → el mismo `place_id` no se guarda dos veces.
- `evidence`: entidad, campo, valor, fuente, método, fecha, estado de verificación y limitaciones.
- `duplicate_reviews`: nivel, motivos (campos comparados), decisión, quién y cuándo. No se borra nada.

**No creadas aún** (fases posteriores): usuarios, contactos, direcciones, campañas, ejecuciones de agentes, skills y versiones, base de conocimiento, documentos, oportunidades, seguimientos, métricas, integraciones.
