# Agentes y skills

**Estado: no implementados.** Esta fase solo dejó los contratos deterministas que los agentes usarán (scoring, evidencias, dedup, conectores).

Diseño previsto: cada agente = función con entrada/salida validada con Zod, herramientas autorizadas, límite de ejecución y registro en `audit_log`. Un agente **no** puede enviar mensajes ni modificar datos críticos; esas acciones pasan por servicios con aprobación humana. Se empezará por: calificación (evalúa criterios → `scoreProspect`), análisis de oportunidad y redacción. No se crearán agentes sin responsabilidad real.

Las 13 skills comerciales se implementarán como módulos independientes con pruebas (fase 6).
