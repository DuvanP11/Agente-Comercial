# Arquitectura

## Decisión
Aplicación **Next.js (App Router) + TypeScript** con Server Actions, **PostgreSQL** vía Drizzle ORM. Un solo lenguaje y un solo despliegue para la primera versión.

**Por qué no FastAPI desde el inicio:** los cuatro repos son Python, pero su valor reutilizable era conceptual (y tres no tienen licencia). Un servicio Python añadiría un segundo despliegue sin beneficio hoy. Se introducirá un worker aparte **solo si** una tarea lo exige (ver abajo).

## Capas
```
UI (src/app)  →  Server Actions  →  services (src/lib/services)  →  Drizzle  →  Postgres
                                         ↑ usa
              dedup · scoring · evidence · theme   (lógica pura, sin I/O, probada)
              connectors (interfaz común)          → APIs externas
```
La lógica determinista (dedup, scoring, contraste, métricas) está separada de la IA: **la IA propondrá, el código valida y calcula**.

## Base de datos
Producción: `DATABASE_URL` (Postgres). Desarrollo/pruebas: PGlite (Postgres en WASM), mismo dialecto y mismas migraciones. Ver `DATA_MODEL.md`.

## Tareas largas y Vercel
Las funciones serverless de Vercel tienen límite de duración y no sirven para procesos persistentes. **Verificar los límites vigentes de tu plan en la documentación de Vercel antes de decidir.** Decisión:
- Búsquedas pequeñas (decenas de resultados) corren dentro de una Server Action.
- Investigación masiva, enriquecimiento web y agentes con muchos pasos: **worker externo** (cola + proceso largo) escribiendo en la misma base. Hoy no existe; la tabla `searches` ya modela estado `running/completed/failed`.

## Conectores
`Connector` (`src/lib/connectors/types.ts`): `status()`, `search()`, capacidades. Cada uno devuelve `RawProspect` normalizado con fuente y fecha, `null` donde no hay dato, y errores parciales explícitos. `isDemo` distingue demostración de real.

## Reglas de integridad aplicadas en código
- Lo desconocido no puntúa (`scoring`), y la cobertura se reporta aparte.
- Un dato "confirmado" exige evidencia (`validateClaim`).
- Teléfono/correo con formato válido ≠ verificado: la evidencia guarda `source_observed`, nunca "verificado".
- Dedup exacta excluye pero conserva el registro; la probable nunca se fusiona sola.
- WhatsApp: se registra "abierto", nunca "enviado".
