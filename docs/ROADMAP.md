# Hoja de ruta y estado real

| Fase | Estado | Detalle |
|---|---|---|
| 1. Auditoría y arquitectura | ✅ | `INITIAL_AUDIT.md`, `ARCHITECTURE.md` |
| 2. Base de la aplicación | 🟡 parcial | Hecho: navegación, tokens/temas, contraste, acceso por contraseña compartida. **Falta**: usuarios y roles reales, multi-organización (hoy hay una organización de desarrollo), límites de peticiones. |
| 3. BD y prospectos | ✅ núcleo | Esquema, importación CSV/XLSX con mapeo y vista previa, dedup exacta/probable, revisión humana. **Falta**: fusión/vinculación real de cuentas, borrado/exportación de datos personales, ficha completa. |
| 4. Multiagente | 🟡 parcial | Capa de IA (proveedor compatible con OpenAI, ejecutor con registro, barreras deterministas) y 3 agentes (interpretación de búsqueda, calificación propuesta, redacción borrador) con pruebas con proveedor simulado **y probados contra un modelo real local (llama3.1, qwen3:14b)**; cadena de proveedores con respaldo automático; pantalla Agentes y skills. Conectado y verificado con Groq (`openai/gpt-oss-20b`, 2026-10-20). **Botones de IA activos** en Buscar (interpretar), Analizar (proponer valoración) y Campañas (redactar borrador); la IA solo propone. **Falta**: probar los botones con respuestas reales de Groq, resto de agentes. |
| 5. Investigación y calificación | 🟡 parcial | Importación de prospectos CSV/Excel (sin costo) + Google Places + evidencias + motor de scoring probado. **Inteligencia de mercado**: conteos y embudo por rubro (familias y original), ciudad y fuente, calidad de datos y salud de búsquedas, con periodo y aviso de muestra pequeña. **Falta**: LinkedIn, directorios, web, agente que evalúe criterios, enriquecimiento, tendencias en el tiempo, análisis con IA. |
| 6. Captación | 🟡 parcial | Campañas con plantilla por prospecto, aprobación explícita, WhatsApp (solo abre), estados con historial, seguimientos, **no contactar** (Ley 1581), embudo y metas de reuniones/propuestas/clientes ganados desde datos reales. **Captar clientes**: selección de prospectos listos, plan de acercamiento por reglas (sin IA: resumen de lo que se sabe y lo que no, preguntas de diagnóstico por rubro, objeciones, preparación de reunión, siguiente acción) y envío a campaña. **Falta**: redacción con IA, correo (Gmail), negociación de precios (requiere tarifas oficiales), reactivación, análisis de oportunidades perdidas. |
| 7. Integraciones | ⬜ | Gmail OAuth, WhatsApp Business, mapas embebidos. |
| 8. Entrenamiento | ⬜ | |
| 9. Dashboard | 🟡 parcial | Conteos reales. **Falta**: metas, funnel, costos, finanzas, reportes. |
| 10. Pruebas y despliegue | 🟡 | 268 pruebas unitarias/integración pasan; build pasa. **Sin** pruebas E2E de interfaz; **sin** despliegue. |

## Pendientes que requieren al usuario
- **P-1** Imagen corporativa de PIBOX para fijar la paleta oficial (hoy provisional).
- **P-2** Elegir proveedor de IA (OpenAI / Anthropic / otro) y aportar clave.
- **P-3** Clave de Google Places API y presupuesto de consultas.
- **P-4** Proyecto de Google Cloud para OAuth de Gmail.
- **P-5** Base PostgreSQL gestionada (Neon, Supabase, Vercel Postgres…).
- **P-6** Revisión legal de la política de datos (Ley 1581 de 2012) y del texto de contacto comercial.
