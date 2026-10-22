# Seguridad y privacidad

## Implementado
- Usuarios individuales: solo el administrador (entra con `ADMIN_EMAIL` + `APP_PASSWORD`) crea usuarios con correos de `pibox.app`, `picap.app`, `picap.io` o `softlab.app`, los edita, desactiva y restablece sus contraseñas (temporal de un solo uso, obliga a cambiarla). Contraseñas con scrypt; bloqueo de 15 min tras 5 fallos; cookie HttpOnly firmada (HMAC-SHA256) con versión de sesión (restablecer o desactivar cierra sesiones); fail-closed en producción. No hay registro público ni recuperación por correo.
- Validación con Zod en criterios de búsqueda y temas; consultas parametrizadas (Drizzle).
- Subidas: solo `.csv`/`.xlsx`, máx. 5 MB y 20.000 filas; `exceljs` en lugar de `xlsx` (vulnerable).
- Secretos solo en variables de servidor; ninguna `NEXT_PUBLIC_*`.
- `audit_log` para importaciones, ingestas y decisiones de duplicados.

- IA: la clave solo en variables de entorno; el estado de la integración nunca la expone; errores del proveedor se muestran sin detalles internos; no se envían teléfonos ni correos al modelo; datos de terceros viajan marcados como no confiables y la salida se valida con reglas deterministas (ver `AGENTS_AND_SKILLS.md`).

- Errores de pantalla: `error.tsx` y `global-error.tsx` muestran una pantalla de recuperación con detalle técnico recortado (sin secretos) en vez de «Application error».
- `PGLITE_LOCAL_E2E=1` (solo pruebas locales de `e2e/`): permite la base local con el build de producción. No debe definirse en Vercel; sin él, producción exige `DATABASE_URL`.

## NO implementado (obligatorio antes de usar con datos reales en producción)
- Aislamiento por organización (hoy una sola org) y roles más finos que administrador/usuario.
- Límite de peticiones (el login sí tiene bloqueo por cuenta).
- Cifrado de tokens de integraciones (aún no existen).
- Procedimiento de eliminación/exportación de datos personales y registro de "no contactar".
- Política de tratamiento de datos conforme a la **Ley 1581 de 2012**: requiere revisión legal; el texto no está redactado.
- Cabeceras de seguridad (CSP) y copias de seguridad.

Que un dato sea público no implica que pueda usarse sin restricciones. No se hace envío masivo; WhatsApp solo abre el chat para que la persona decida.
