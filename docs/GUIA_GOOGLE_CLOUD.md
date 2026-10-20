# Guía: crear una clave de API en Google Cloud (paso a paso)

Sirve para cualquier API de Google (Places, Maps, Gmail…). Los nombres de los menús pueden variar un poco; la lógica es siempre la misma:
**proyecto → facturación → habilitar la API → crear clave → restringirla → tope de gasto → pegarla en Vercel.**

Consola: https://console.cloud.google.com

## 1. Proyecto
1. Arriba a la izquierda, junto al logo, pulsa **"Selecciona un proyecto"**.
2. **Proyecto nuevo** → nombre `pibox-commercial` → **Crear**.
3. Espera unos segundos y asegúrate de que ese proyecto quede **seleccionado** arriba (el nombre debe verse en el botón). Todo lo siguiente se hace dentro de él.

## 2. Facturación (obligatoria para Places)
1. Menú ☰ → **Facturación**.
2. Si no tienes cuenta de facturación: **Probar gratis / Crear cuenta** y sigue el asistente (pide tarjeta, aunque haya crédito o uso gratuito).
3. Vincula la cuenta de facturación al proyecto `pibox-commercial`.

## 3. Habilitar la API
1. Menú ☰ → **APIs y servicios → Biblioteca**.
2. Busca **Places API (New)** (debe decir *New*; la antigua "Places API" no sirve para este proyecto).
3. Ábrela → **Habilitar**.

## 4. Crear la clave
1. Menú ☰ → **APIs y servicios → Credenciales**.
2. **+ Crear credenciales → Clave de API**.
3. Copia la clave y guárdala en un gestor de contraseñas. **No la pegues en chats, correos ni en el repo.**

## 5. Restringir la clave (no te saltes esto)
1. En Credenciales, abre la clave (lápiz / nombre).
2. **Restricciones de la API → Restringir clave →** marca solo **Places API (New)** → **Aceptar**.
3. **Restricciones de aplicación:** déjalo en *Ninguna* (Vercel no tiene IP fija).
4. **Guardar**. Puede tardar unos minutos en aplicar.

## 6. Tope de gasto
1. ☰ → **Facturación → Presupuestos y alertas → Crear presupuesto**: define un monto mensual y alertas al 50 % y 90 %. *Las alertas avisan, no frenan el cobro.*
2. Para frenar de verdad: ☰ → **APIs y servicios → Places API (New) → Cuotas y límites del sistema** → edita el límite diario de solicitudes a un número bajo.

## 7. Pegarla en Vercel
1. Vercel → proyecto `agente-comercial` → **Settings → Environment Variables → Add**.
2. Nombre: `GOOGLE_PLACES_API_KEY` · Valor: la clave · Environment: **Production**.
3. **Redeploy** (Deployments → ⋯ → Redeploy). Sin esto la variable no se aplica.

## 8. Comprobar
- App → **Integraciones**: debe decir "Clave presente (no probada)".
- App → **Buscar clientes**: una búsqueda pequeña (1 categoría, máx. 5). Si Google rechaza la clave, el error sale en pantalla.

## Errores típicos
| Mensaje | Causa |
|---|---|
| 403 `API_KEY_SERVICE_BLOCKED` | La clave no tiene marcada Places API (New), o la API no está habilitada. |
| 403 `PERMISSION_DENIED` / billing | Falta vincular facturación al proyecto. |
| 400 `API key not valid` | Clave mal copiada, o aún no se propagó (espera unos minutos). |
| 429 | Llegaste al límite diario que pusiste. |
