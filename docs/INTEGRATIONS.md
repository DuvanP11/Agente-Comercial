# Integraciones

| Integración | Estado | Configuración |
|---|---|---|
| OpenStreetMap (Overpass + Nominatim) | Implementada y probada con servidor simulado; **búsqueda real aún sin comprobar de punta a punta** (el servidor público estaba saturado) | Gratis, sin clave. Opcional `OVERPASS_URL` (una o varias URL separadas por coma, se alternan en los reintentos) para usar otros servidores. El servidor público se satura con frecuencia (502 / tiempos agotados): buscar por zona pequeña ayuda; para uso constante conviene un servidor propio o un plan de pago. Respeta política de uso (User-Agent, 1 consulta/s a Nominatim). Atribución obligatoria: © colaboradores de OpenStreetMap (ODbL). Datos colaborativos: en una muestra de ferreterías de Bogotá, 89 % traía nombre, 71 % calle, 2 % teléfono, 0 % web/correo. |
| Google Places API (New) | Implementada, **sin probar contra la API real** (no hay clave) | `GOOGLE_PLACES_API_KEY`, restringida a Places API. Cobra por solicitud: revisar tarifas y fijar presupuesto. Places no devuelve correos. |
| LinkedIn | No implementada | Solo con integración autorizada por LinkedIn; mientras tanto flujo asistido por el usuario. |
| Gmail | No implementada | OAuth 2.0, permiso mínimo `gmail.send`/`gmail.compose`; tokens cifrados en servidor. |
| WhatsApp | Solo enlace `wa.me` (abre el chat, no envía) | WhatsApp Business Platform requiere plantillas aprobadas y consentimiento. |
| Proveedor de IA | No seleccionado | Pendiente P-2. |

La pantalla **Integraciones** calcula el estado desde el entorno real: “Clave presente (no probada)” nunca se presenta como “conectado y funcionando”.
