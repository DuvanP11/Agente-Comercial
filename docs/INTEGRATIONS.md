# Integraciones

| Integración | Estado | Configuración |
|---|---|---|
| OpenStreetMap (Overpass + Nominatim) | Implementada y probada con servidor simulado; **probada en vivo el 2026-10-20**: con Overpass saturado, el respaldo (búsqueda de texto de Nominatim, máx. 40) devolvió 15 resultados reales en 42 s | Gratis, sin clave. Opcional `OVERPASS_URL` (una o varias URL separadas por coma, se alternan en los reintentos) para usar otros servidores. El servidor público se satura con frecuencia (502 / tiempos agotados): buscar por zona pequeña ayuda; para uso constante conviene un servidor propio o un plan de pago. Respeta política de uso (User-Agent, 1 consulta/s a Nominatim). Atribución obligatoria: © colaboradores de OpenStreetMap (ODbL). Datos colaborativos: en una muestra de ferreterías de Bogotá, 89 % traía nombre, 71 % calle, 2 % teléfono, 0 % web/correo. |
| Google Places API (New) | Implementada, **sin probar contra la API real** (no hay clave) | `GOOGLE_PLACES_API_KEY`, restringida a Places API. Cobra por solicitud: revisar tarifas y fijar presupuesto. Places no devuelve correos. |
| LinkedIn | Asistida (sin conexión automática) | LinkedIn no tiene API pública de búsqueda de empresas y prohíbe extraer sus datos. En Buscar clientes se generan los enlaces de búsqueda y el usuario guarda a mano cada empresa (URL validada de página `/company/`, fuente `linkedin_manual`). Sales Navigator: exportar e importar. |
| Directorio empresarial (RUES) | Funciona | Datos abiertos de Confecámaras en datos.gov.co, conjunto `nb3d-v3n7` (Establecimientos – Agencias – Sucursales), licencia CC BY-SA 4.0 (citar la fuente). Filtra matrícula ACTIVA renovada el año pasado o este, por Cámara de Comercio y actividad CIIU (códigos comprobados contra el conjunto). Trae razón social, CIIU, NIT del propietario; NO trae teléfono, correo, web ni dirección. Opcional `SOCRATA_APP_TOKEN` para subir el límite de consultas. Páginas Amarillas y similares no se usan: sus condiciones no permiten extraer datos. |
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


## Zonas, rubros equivalentes y avisos (2026-10-21)
- **Ubicar la zona:** Nominatim devuelve varios candidatos; se elige el *área* más grande de tipo zona/lugar (límite administrativo, barrio, uso de suelo), no el primer punto. «Paloquemao» se resolvía como una estación de bus de ~100 m → 0 resultados; ahora usa el complejo de ~0,9 km. Toda zona se amplía, centrada, a un mínimo de ~1,3 km.
- **Respaldo de texto:** busca dentro del recuadro de la zona (`viewbox` + `bounded=1`), no con el nombre de la zona en la frase. Mismo escenario: 0 → 20 resultados.
- **Rubros equivalentes:** los que hacen la misma consulta («ferretería», «artículos de ferretería», «ferretería de bricolaje») se buscan una sola vez y se avisa. El intérprete de IA solo devuelve hasta 3 rubros como búsqueda principal; el resto pasa a sugerencias.
- **Avisos consolidados:** una línea por causa (no una por rubro). Si una zona pequeña da pocos resultados se sugiere ampliar a la localidad.


## Google Places: prueba de clave y avisos (2026-10-21)
Integraciones → «Probar clave de Google Places» (solo si hay clave): consulta de 1 resultado con `places.id` como único campo y traduce los errores de Google (API restringida, API no habilitada, facturación, clave inválida, restricción de aplicación, permiso, cuota). Buscar muestra cuántas consultas cobradas hará la búsqueda. Pendiente de confirmar con legal: términos de almacenamiento de datos de Places (ver `GUIA_GOOGLE_CLOUD.md`).

| Investigación web (sitio del prospecto) | Funciona | Lee la página pública del propio negocio (inicio y páginas de contacto, máx. 4 páginas, 500 KB y 8 s cada una), respeta robots.txt, no entra a redes internas (IP privadas, localhost) ni sigue redirecciones a otro sitio; sugiere teléfono, correo y WhatsApp y guarda el origen como evidencia (`source_observed`). No guarda nada sin que la persona pulse «Usar». |
| Correo asistido | Funciona | «Abrir correo» en la campaña abre `mailto:` con el mensaje aprobado; cuenta como intento por correo. El envío lo hace la persona. |
| Gmail API / WhatsApp Business Platform | Pendiente | Requieren cliente OAuth / cuenta de Meta Business verificada y plantillas aprobadas (administrador). Ver pasos en la pantalla Integraciones. |
