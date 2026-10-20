# Auditoría inicial (2026-10-20)

## Repositorio principal — `DuvanP11/Agente-Comercial`
- **Estaba vacío**: sin commits, sin ramas, sin archivos. Se clonó en `~/dev/Agente-Comercial` y se creó la rama `main` localmente.
- No había nada que proteger, reutilizar ni que pudiera romperse. Todo el código es nuevo.
- Entorno: Node 26, npm 11. **No hay Docker ni PostgreSQL local** → se eligió PGlite para desarrollo/pruebas.

## Los cuatro repositorios de referencia
| Repo | Licencia | Archivos | Veredicto |
|---|---|---|---|
| A. kushalsamani/AI-Sales-Agent-Team | **Ninguna** | 17 | Solo ideas. Sin licencia rige "todos los derechos reservados": **no se copia código**. |
| B. mudassar-automation/Lead-Generation-Workflow | **Ninguna** | 4 (JSON de n8n) | Igual. Además depende de Apify + n8n; no se importan los flujos. |
| C. kandarpa02/lead_agent | **MIT** (Kandarpa Sarkar, 2026) | 34 | Reutilizable con aviso de licencia. Se tomó el *concepto* (evidencia + aprobación humana); el código se reescribió. |
| D. farhankhoso/AI-Agency-Lead-Generator | **Ninguna** | 4 | Solo ideas. Depende de Streamlit + scraping de Google Maps con Playwright. |

### Hallazgos técnicos
1. **Tres de cuatro no tienen licencia.** Reutilizar su código sería infracción. Se reimplementan las capacidades desde cero a partir de su comportamiento descrito públicamente.
2. **El scoring de C fabrica positivos** (`scoring.py`): `good_product_or_service=True` fijo y `growth_potential=... or True`; además da puntos por palabras sueltas ("years", "clients"). Contradice la regla de no convertir lo desconocido en hecho → **no se reutiliza**; el scoring propio excluye los criterios desconocidos y reporta cobertura aparte.
3. **D scrapea Google Maps con Playwright**: contrario a las condiciones de Google. Se sustituye por Google Places API (oficial).
4. **B envía correos automáticos en cascada** (formulario → scraping → Gmail). Incompatible con la exigencia de aprobación explícita; no se adopta ese flujo.
5. **A y C ya validan con LLM y deduplican por dominio**; la idea de deduplicar por dominio normalizado se conservó y se amplió (NIT, teléfono, correo corporativo, nombre+dirección).
6. **n8n no es necesario**: los tres flujos de B se cubren con conectores propios.

### Decisión de arquitectura por capacidad (canónica)
| Capacidad | Origen de la idea | Implementación propia |
|---|---|---|
| Descubrimiento geográfico | A, D | `GooglePlacesConnector` (API oficial) |
| Evidencias y aprobación humana | C | `evidence`, `messages`, estados de aprobación |
| Calificación | C (corregida) | `scoring/score.ts` |
| Deduplicación | A | `dedup/` |
| Borradores WhatsApp/Email | D, B | Plantilla + enlace `wa.me`; IA pendiente |

## Riesgos detectados durante la construcción
- `xlsx` (SheetJS en npm) tiene vulnerabilidades altas sin parche → sustituido por `exceljs`.
- `npm audit` aún marca: `postcss` (anidado en Next, solo en build), `esbuild` y `uuid` (herramientas de desarrollo / dependencia transitiva de exceljs). Pendiente de revisar al actualizar Next.
- TypeScript 7 (port nativo) rompe `next.config.ts` en Next 15 → fijado TypeScript 5.9.
