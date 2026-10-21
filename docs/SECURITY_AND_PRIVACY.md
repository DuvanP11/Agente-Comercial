# Seguridad y privacidad

## Implementado
- Acceso por contraseña compartida con cookie HttpOnly firmada (HMAC-SHA256), comparación en tiempo constante; fail-closed en producción.
- Validación con Zod en criterios de búsqueda y temas; consultas parametrizadas (Drizzle).
- Subidas: solo `.csv`/`.xlsx`, máx. 5 MB y 20.000 filas; `exceljs` en lugar de `xlsx` (vulnerable).
- Secretos solo en variables de servidor; ninguna `NEXT_PUBLIC_*`.
- `audit_log` para importaciones, ingestas y decisiones de duplicados.

- IA: la clave solo en variables de entorno; el estado de la integración nunca la expone; errores del proveedor se muestran sin detalles internos; no se envían teléfonos ni correos al modelo; datos de terceros viajan marcados como no confiables y la salida se valida con reglas deterministas (ver `AGENTS_AND_SKILLS.md`).

- Errores de pantalla: `error.tsx` y `global-error.tsx` muestran una pantalla de recuperación con detalle técnico recortado (sin secretos) en vez de «Application error».
- `PGLITE_LOCAL_E2E=1` (solo pruebas locales de `e2e/`): permite la base local con el build de producción. No debe definirse en Vercel; sin él, producción exige `DATABASE_URL`.

## NO implementado (obligatorio antes de usar con datos reales en producción)
- Usuarios individuales, roles y aislamiento por organización (hoy: una contraseña compartida y una org).
- Límite de intentos de login y de peticiones.
- Cifrado de tokens de integraciones (aún no existen).
- Procedimiento de eliminación/exportación de datos personales y registro de "no contactar".
- Política de tratamiento de datos conforme a la **Ley 1581 de 2012**: requiere revisión legal; el texto no está redactado.
- Cabeceras de seguridad (CSP) y copias de seguridad.

Que un dato sea público no implica que pueda usarse sin restricciones. No se hace envío masivo; WhatsApp solo abre el chat para que la persona decida.
