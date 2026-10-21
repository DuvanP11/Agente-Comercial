# Pruebas de extremo a extremo (Chrome real)

Abren el Chrome instalado en el computador (vía `puppeteer-core`, sin descargar navegador) y hacen lo que haría una persona.

```bash
npm run build
PGLITE_LOCAL_E2E=1 APP_PASSWORD=prueba-local AUTH_SECRET=0123456789abcdef0123456789abcdef npx next start -p 3184 &
BASE=http://localhost:3184 node e2e/buscar.mjs       # buscar varias categorías seguidas
BASE=http://localhost:3184 node e2e/restaurar.mjs    # recargar, abrir una ficha y volver, buscar desde la restaurada
```

- `PGLITE_LOCAL_E2E=1` permite usar la base local (PGlite) con el build de producción. **Solo para pruebas en un computador; nunca se define en Vercel.**
- Las búsquedas usan servidores públicos reales (Nominatim/Overpass): pueden tardar hasta ~45 s y a veces devolver menos resultados.
- `pestana-vieja.mjs` simula una pestaña abierta antes de un despliegue (necesita reconstruir y reiniciar el servidor mientras corre; ver el encabezado del archivo).
