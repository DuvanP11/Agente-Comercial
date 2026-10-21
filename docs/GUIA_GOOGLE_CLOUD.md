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


---

# Cuenta corporativa de Google Cloud (organización)

Con una cuenta de empresa, lo que puedes hacer depende de los **roles** que te dieron y de las **políticas de la organización**.

## Qué permisos hacen falta
| Para… | Se necesita (nombres aproximados; si no coinciden, pide el permiso por su función) |
|---|---|
| Habilitar «Places API (New)» en el proyecto | Rol de administración de *Service Usage* |
| Crear y restringir la clave | Rol de administración de *claves de API* |
| Ver facturación y poner presupuesto | Rol de *facturación* de la cuenta |

**Si no puedes crear la clave:** pide al administrador que la cree, ya **restringida a «Places API (New)»**, y que te la entregue por un canal seguro (nunca por chat o correo abierto). Tú solo la pegas en Vercel.

**Si la organización prohíbe las claves de API** (política de la organización), este método no sirve. Habría que usar una cuenta de servicio, que la plataforma aún **no** soporta.

## Paso a paso
1. Entra a `console.cloud.google.com` con tu **cuenta corporativa** y elige arriba el **proyecto que te asignaron** (no crees uno nuevo salvo que te lo indiquen).
2. Confirma que ese proyecto tiene **facturación vinculada** (Facturación). Places la exige.
3. **APIs y servicios → Biblioteca →** «Places API (New)» → **Habilitar** (debe decir *New*).
4. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**. Copia la clave a un gestor de contraseñas.
5. Abre la clave y en **Restricciones de API** marca **solo «Places API (New)»**. En «Restricciones de aplicación» deja **Ninguna** (Vercel usa IPs variables). Guarda; puede tardar unos minutos.
6. **Presupuesto y límite diario:** Facturación → Presupuestos y alertas (avisa, no frena); y en Places API (New) → Cuotas, baja el límite diario de solicitudes (esto sí frena).
7. **Vercel → Environment Variables → Add:** `GOOGLE_PLACES_API_KEY` = la clave, **Production**, activa **Sensitive**. Luego **Redeploy**.
8. En la plataforma: **Integraciones → «Probar clave de Google Places»**. Hace la consulta más barata posible (1 resultado, solo el id) y, si falla, dice en español qué falta.
9. **Buscar clientes →** elige la fuente «Google Places», una búsqueda pequeña (1 rubro, 1 zona) y revisa teléfonos y webs.

## Errores que explica el botón de prueba
| Estado | Causa | Qué hacer |
|---|---|---|
| Clave restringida a otras APIs | La clave no incluye Places API (New) | Credenciales → clave → Restricciones de API |
| API no habilitada | «Places API (New)» no está habilitada en ese proyecto | Biblioteca → Habilitar |
| Sin facturación | Proyecto sin cuenta de facturación | Vincular facturación |
| Clave inválida | Mal copiada, con comillas o de otro proyecto | Copiarla de nuevo |
| Restricción de aplicación | La clave limita por IP o sitio web | Dejar «Ninguna» |
| Permiso denegado | Política de la organización o rol faltante | Pedir al administrador |
| Cuota | Se llegó al límite diario | Revisar Cuotas |

## Costos
- Se cobra **por consulta**; cada búsqueda en la plataforma hace una consulta por zona y rubro (hasta 20 resultados cada una). La pantalla de Buscar lo muestra antes de buscar.
- **Teléfono y web son campos de una tarifa superior** a los datos básicos. El precio exacto y el nivel de cada campo se ven en la página «Place Data Fields (New)» y en «Usage and Billing» de Google, que cambian; no los asumas.
- La prueba de la clave usa solo el campo `places.id`, la consulta más barata.

## ⚠ Almacenamiento de los datos de Google
Los *Google Maps Platform Service Specific Terms* limitan cómo se pueden guardar los datos de Places. Lo único que se pudo confirmar al escribir esto es que el `place_id` se puede guardar y que las coordenadas solo temporalmente (una versión archivada dice hasta 30 días). **No se pudo confirmar qué dicen sobre nombres, direcciones, teléfonos y webs**, y esta plataforma los guarda como prospectos. **Antes de usarla en serio, confirma con el área legal o el administrador de Google Cloud que ese uso está permitido para tu cuenta.** Si no lo está, habrá que cambiar el diseño (p. ej. guardar solo el `place_id` y consultar el resto al momento de mostrarlo, o borrar los datos de Google pasado un plazo).
