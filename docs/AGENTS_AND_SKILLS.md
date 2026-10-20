# Agentes y skills

**Estado: no implementados.** Esta fase solo dejó los contratos deterministas que los agentes usarán (scoring, evidencias, dedup, conectores).

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
