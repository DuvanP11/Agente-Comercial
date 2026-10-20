# Integraciones

| Integración | Estado | Configuración |
|---|---|---|
| Google Places API (New) | Implementada, **sin probar contra la API real** (no hay clave) | `GOOGLE_PLACES_API_KEY`, restringida a Places API. Cobra por solicitud: revisar tarifas y fijar presupuesto. Places no devuelve correos. |
| LinkedIn | No implementada | Solo con integración autorizada por LinkedIn; mientras tanto flujo asistido por el usuario. |
| Gmail | No implementada | OAuth 2.0, permiso mínimo `gmail.send`/`gmail.compose`; tokens cifrados en servidor. |
| WhatsApp | Solo enlace `wa.me` (abre el chat, no envía) | WhatsApp Business Platform requiere plantillas aprobadas y consentimiento. |
| Proveedor de IA | No seleccionado | Pendiente P-2. |

La pantalla **Integraciones** calcula el estado desde el entorno real: “Clave presente (no probada)” nunca se presenta como “conectado y funcionando”.
