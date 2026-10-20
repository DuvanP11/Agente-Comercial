# PIBOX Commercial Intelligence

Plataforma de investigación de mercado, prospección y seguimiento comercial B2B para PIBOX Mensajería (Colombia).

> **Estado: fase 3 de 10 (ver [docs/ROADMAP.md](docs/ROADMAP.md)).** Funciona de verdad: importación de clientes existentes, búsqueda con Google Places (requiere clave), deduplicación, evidencias, apariencia personalizable, dashboard con datos reales y apertura de WhatsApp. **Todavía no existe**: agentes de IA, LinkedIn/directorios/web, Gmail, entrenamiento, metas y finanzas. Esos módulos aparecen marcados como *Pendiente* en la interfaz.

## Requisitos
Node 20+ y npm. No hace falta instalar PostgreSQL para desarrollar (usa PGlite).

## Instalación
```bash
npm install
cp .env.example .env.local   # completa APP_PASSWORD y AUTH_SECRET (opcional en desarrollo)
npm run dev                  # http://localhost:3000
```
En desarrollo, sin `APP_PASSWORD`/`AUTH_SECRET` el acceso queda abierto. En producción, la app responde 503 hasta configurarlas, y exige `DATABASE_URL`.

## Scripts
| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Pruebas (Vitest; la base de pruebas es PGlite en memoria) |
| `npm run lint` | Chequeo de tipos |
| `npm run db:generate` | Genera una migración nueva a partir de `src/lib/db/schema.ts` |

Las migraciones (`drizzle/`) se aplican solas al primer acceso a la base.

## Estructura
```
src/lib/dedup        normalización y motor de deduplicación (puro, probado)
src/lib/scoring      matriz de puntuación configurable (lo desconocido no suma)
src/lib/evidence     modelo de evidencias y contradicciones
src/lib/connectors   interfaz común + Google Places
src/lib/services     importación, ingesta con dedup
src/lib/theme        design tokens + contraste WCAG
src/lib/db           esquema Drizzle + cliente (Postgres / PGlite)
src/app              interfaz (Next.js App Router)
docs/                arquitectura, auditoría, hoja de ruta, seguridad…
```
