# Reutilización de los cuatro repositorios

Ver el análisis y las licencias en `INITIAL_AUDIT.md`. Resumen:

- **Ningún código de A, B ni D fue copiado** (no tienen licencia). Sus ideas están reimplementadas.
- **C (MIT)**: no se copió código. Si en el futuro se incorpora alguno, debe conservarse el aviso:
  > MIT License — Copyright (c) 2026 Kandarpa Sarkar — https://github.com/kandarpa02/lead_agent
- Capa de integración: cada capacidad vive tras la interfaz `Connector` o un servicio, de modo que se puede sustituir sin tocar la UI.
- Pendiente: revisar `tools/google_places.py` y `serper_search.py` de A (para el diseño de consultas) y el esquema Alembic de C como referencia de modelo; **solo lectura**.
- No se ejecutó ningún script de los repos clonados.
