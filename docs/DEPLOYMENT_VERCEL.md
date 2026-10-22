# Despliegue

**No se ha desplegado nada.**

1. Crear una base PostgreSQL gestionada y copiar su cadena en `DATABASE_URL`.
2. En Vercel > Settings > Environment Variables definir: `DATABASE_URL`, `APP_PASSWORD`, `AUTH_SECRET`, `GOOGLE_PLACES_API_KEY` y, recomendado, `ADMIN_EMAIL` (ver `.env.example`). El administrador entra con `ADMIN_EMAIL` (o «admin») y `APP_PASSWORD`; desde ahí crea los demás usuarios en **Usuarios**.
3. Importar el repo; framework Next.js; comandos por defecto.
4. Las migraciones se aplican solas en el primer acceso. Revisa el primer arranque.
5. Sin `APP_PASSWORD`/`AUTH_SECRET` la app responde 503 a propósito.

Los límites de duración de funciones cambian según plan: consultar la documentación vigente de Vercel. Tareas largas → worker externo (ver `ARCHITECTURE.md`).
