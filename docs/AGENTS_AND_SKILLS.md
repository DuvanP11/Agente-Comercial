# Agentes y skills

**Estado:** la capa de agentes con IA existe (`src/lib/agents`, `src/lib/ai`) con tres agentes y sus pruebas; los tres tienen su botón en pantalla (Buscar → «Interpretar con IA», Analizar → «Proponer con IA», Campañas → «Redactar con IA»), activo cuando hay un proveedor configurado. El catálogo con el estado real de los 12 agentes está en la pantalla **Agentes y skills**.

Diseño previsto: cada agente = función con entrada/salida validada con Zod, herramientas autorizadas, límite de ejecución y registro en `audit_log`. Un agente **no** puede enviar mensajes ni modificar datos críticos; esas acciones pasan por servicios con aprobación humana. Se empezará por: calificación (evalúa criterios → `scoreProspect`), análisis de oportunidad y redacción. No se crearán agentes sin responsabilidad real.

Las 13 skills comerciales se implementarán como módulos independientes con pruebas (fase 6).

## Skills comerciales implementadas sin IA (`src/lib/skills/approach.ts`)
Reglas fijas sobre datos reales del prospecto; todo lo no registrado se declara "por verificar".

| Skill | Estado |
|---|---|
| Investigación previa a la negociación | Parcial: resume lo registrado (con fuente) y lo desconocido |
| Preguntas de diagnóstico | Hecha: por rubro + generales (volumen, frecuencia, zonas, sedes, proveedor actual, decisor) |
| Manejo de objeciones | Hecha con base provisional editable más adelante; advierte no inventar tarifas, coberturas ni tiempos |
| Preparación de reuniones | Hecha: lista de verificación |
| Resumen para el equipo comercial | Parcial: resumen del plan de acercamiento |
| Apertura de negociación | Parcial: mensaje base por plantilla |
| Seguimiento comercial | Parcial: seguimientos con fecha en campañas |
| Identificación de necesidades · Propuesta de valor · Presentación de servicios · Negociación de precios · Reactivación · Análisis de oportunidades perdidas | Pendientes (necesitan IA y/o tarifas y servicios oficiales de PIBOX) |


## Capa de agentes con IA

Contrato (`AgentDef` en `src/lib/agents/core.ts`): entrada y salida con Zod, prompt, **barrera determinista** sobre la salida y lista de herramientas permitidas (hoy vacía: ningún agente envía mensajes, escribe datos ni llama servicios por su cuenta).

`runAgent` valida la entrada, llama al proveedor, reintenta una vez si el JSON viene mal, valida la salida y deja todo en `agent_runs`. Nunca lanza hacia afuera ni simula una respuesta si la IA no está configurada.

| Agente | Qué hace la IA | Qué garantiza el código |
|---|---|---|
| Interpretación de búsqueda | Texto → ciudad, zonas, rubros | Rubros limpios (sin caracteres de consulta), máx. 6, aviso si la ciudad o zona no aparece en tu texto, rechazo si no hay rubros |
| Calificación (propuesta) | Propone valoración de criterios | `confirmed` solo con evidencia real y solo en `icp_fit`/`geo_compatibility`; descarta ids inventados, criterios repetidos y notas con cifras no presentes; el canal de contacto lo decide el código; **no guarda nada** |
| Redacción (borrador) | Borrador de WhatsApp | Rechaza precios, descuentos, garantías, cifras, enlaces o "ya se envió" que no estén en tus datos; máx. 600 caracteres; queda sin aprobar; nunca para «No contactar» |

Datos no confiables (nombres, textos del prospecto) se envían entre `<datos>…</datos>`, neutralizando intentos de cerrar la etiqueta, y el sistema indica al modelo que son información y no instrucciones. Privacidad: no se envían teléfonos ni correos al proveedor.
