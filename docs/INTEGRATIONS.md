# Integraciones

| Integración | Estado | Configuración |
|---|---|---|
| OpenStreetMap (Overpass + Nominatim) | Implementada y probada con servidor simulado; **probada en vivo el 2026-10-20**: con Overpass saturado, el respaldo (búsqueda de texto de Nominatim, máx. 40) devolvió 15 resultados reales en 42 s | Gratis, sin clave. Opcional `OVERPASS_URL` (una o varias URL separadas por coma, se alternan en los reintentos) para usar otros servidores. El servidor público se satura con frecuencia (502 / tiempos agotados): buscar por zona pequeña ayuda; para uso constante conviene un servidor propio o un plan de pago. Respeta política de uso (User-Agent, 1 consulta/s a Nominatim). Atribución obligatoria: © colaboradores de OpenStreetMap (ODbL). Datos colaborativos: en una muestra de ferreterías de Bogotá, 89 % traía nombre, 71 % calle, 2 % teléfono, 0 % web/correo. |
| Google Places API (New) | Implementada, **sin probar contra la API real** (no hay clave) | `GOOGLE_PLACES_API_KEY`, restringida a Places API. Cobra por solicitud: revisar tarifas y fijar presupuesto. Places no devuelve correos. |
| LinkedIn | No implementada | Solo con integración autorizada por LinkedIn; mientras tanto flujo asistido por el usuario. |
| Gmail | No implementada | OAuth 2.0, permiso mínimo `gmail.send`/`gmail.compose`; tokens cifrados en servidor. |
| WhatsApp | Solo enlace `wa.me` (abre el chat, no envía) | WhatsApp Business Platform requiere plantillas aprobadas y consentimiento. |
| Proveedor de IA (compatible con OpenAI) | Capa implementada y probada con proveedor simulado; **sin probar contra un proveedor real** (no hay clave) | `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` (no necesaria con Ollama local), `AI_TIMEOUT_MS` opcional. Sirve OpenAI, Groq, OpenRouter, Gemini (endpoint compatible), Ollama… Verifica condiciones vigentes y plan gratuito de cada proveedor, y que permitan enviar información de negocios. |

La pantalla **Integraciones** calcula el estado desde el entorno real: “Clave presente (no probada)” nunca se presenta como “conectado y funcionando”.


## Cadena de proveedores de IA con respaldo (2026-10-20)

`AI_*` es el principal; `AI2_*` y `AI3_*` son respaldos en orden. Si el actual falla (límite de uso, tiempo agotado, red caída, error del servidor o clave rechazada) se pasa al siguiente y la ejecución queda registrada con un aviso. Un proveedor que falló se salta unos minutos (límite de uso: 5 min; clave rechazada: 30 min; red o tiempo agotado: 2 min) para no perder segundos en cada consulta; si todos están en pausa, se intentan igual.

**Recomendación de arranque:** principal con plan gratuito en la nube (p. ej. Groq: `https://api.groq.com/openai/v1`; elige un modelo de su lista en la consola) y respaldo con Ollama local.

**Límites reales a tener en cuenta**
- Los planes gratuitos limitan por modelo y por minuto; al pasarse devuelven 429 (Groq no cobra en su plan gratuito). Las cifras exactas se ven en la consola de tu cuenta y cambian: no las asumas.
- Gemini en plan gratuito: Google puede usar lo enviado para mejorar sus productos, con posible revisión humana. Para información de negocios pesa en contra.
- **Ollama es local**: Vercel no puede alcanzar `localhost`. El respaldo local solo funciona al ejecutar la app en tu computador (`npm run dev` con `.env.local`). Para que haya respaldo también en Vercel, usa como `AI2_*` otro proveedor en la nube con plan gratuito.
- Modelos locales probados el 2026-10-20 en un M1 Pro de 16 GB: `llama3.1` (8B) responde en 3–20 s; `qwen3:14b` en ~30 s y escribe su razonamiento entre `<think>`, que el lector ignora.

**Lo aprendido con modelos reales (y ya corregido en el código)**
- Un modelo local marcó «hipótesis con valor 0» criterios sobre los que decía no tener información → ahora se tratan como desconocidos.
- Marcó «confirmado» la compatibilidad geográfica por estar en Bogotá → la IA ya no puede dejar nada «confirmado».
- Devolvió `"value": null` para «no sé» → ahora se acepta.
- Las respuestas varían entre ejecuciones; por eso todo es propuesta que una persona revisa.


## Búsqueda «solo con teléfono, correo o web» (2026-10-21)
Casilla en Buscar clientes. En OpenStreetMap el filtro va **dentro de la consulta** de Overpass (`[~"^(phone|contact:phone|website|contact:website|email|contact:email)$"~"."]`), de modo que el cupo de resultados se llena solo con negocios que tienen contacto; en el respaldo de texto y en Google Places se filtra después. Además, una barrera común impide guardar en la base cualquier resultado sin contacto cuando la casilla está activa. Probado en vivo: ferreterías de Chapinero → 20 resultados sin filtro (4 con contacto) vs 4 con filtro (los 4 con contacto).

**Tiempos medidos:** una consulta de Overpass tarda ~35 s cuando el servidor público está ocupado; por eso la espera por consulta es de 38 s y el presupuesto total de 40 s (deja margen para el respaldo y guardar dentro del tope de 60 s de la página).


## Límite de 60 s del servidor (2026-10-21)
Vercel **corta toda petición que pase de 60 s** y el navegador recibe una respuesta inesperada («Application error: a client-side exception»). El conector de OpenStreetMap ahora respeta un presupuesto: Overpass hasta 30 s en total, ninguna llamada nueva después de 44 s (lo omitido se avisa en pantalla) y cada espera está acotada por ese límite. Medido en vivo: 3 zonas × 2 rubros = 34 s. Además, la pantalla captura el fallo de la petición y muestra un mensaje en vez de romperse, y las búsquedas que el servidor cortó a medias se marcan como «Interrumpida» pasados 3 minutos.
