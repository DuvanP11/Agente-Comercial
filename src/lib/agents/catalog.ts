/** Catálogo honesto de los 12 agentes del plan y de las skills: qué existe de verdad y qué no. */
export type Maturity = "ready" | "logic" | "partial" | "pending";
export const MATURITY_LABEL: Record<Maturity, string> = {
  ready: "Funciona", logic: "Lógica lista, falta conectarlo a la pantalla", partial: "Parcial", pending: "Pendiente",
};

export interface CatalogItem { n: number; name: string; how: string; status: Maturity; detail: string; ai: boolean }

export const AGENTS: CatalogItem[] = [
  { n: 1, name: "Investigación de mercado", how: "Reglas", status: "partial", ai: false, detail: "Inteligencia de mercado: conteos y embudo por rubro, ciudad y fuente. Sin análisis con IA." },
  { n: 2, name: "Búsqueda geográfica", how: "Conectores", status: "ready", ai: false, detail: "OpenStreetMap (gratis) y Google Places (con clave)." },
  { n: 3, name: "Fuentes profesionales (LinkedIn)", how: "Asistido por la persona", status: "partial", ai: false, detail: "LinkedIn no permite extraer sus datos automáticamente ni tiene API pública de búsqueda. En Buscar clientes se generan los enlaces de búsqueda y se capturan a mano las empresas que encuentres (con su enlace como fuente). Sales Navigator: exporta y usa Importar." },
  { n: 4, name: "Directorios empresariales", how: "Conector", status: "ready", ai: false, detail: "Registro Mercantil (RUES, datos abiertos de Confecámaras): empresas con matrícula activa por actividad y ciudad, con NIT. No trae teléfono ni correo. Páginas Amarillas y otros directorios: no se usan porque sus condiciones no permiten extraer datos." },
  { n: 5, name: "Enriquecimiento de datos", how: "Manual + lectura de la web", status: "partial", ai: false, detail: "Completar contacto a mano en la ficha o con «Buscar contacto en su sitio web» (lee la página pública del negocio, respeta robots.txt y guarda el origen como evidencia). Enriquecimiento masivo automático: pendiente." },
  { n: 6, name: "Deduplicación", how: "Reglas", status: "ready", ai: false, detail: "Motor determinista: exacta y probable, con revisión humana." },
  { n: 7, name: "Calificación comercial", how: "IA propone + código valida", status: "ready", ai: true, detail: "Botón «Proponer con IA» en Analizar. La IA propone la valoración; el código degrada lo no demostrable y decide el canal de contacto. Nada se guarda sin tu aprobación." },
  { n: 8, name: "Análisis de oportunidades", how: "Reglas", status: "partial", ai: false, detail: "Plan de acercamiento por reglas. Versión con IA: pendiente." },
  { n: 9, name: "Estrategia de negociación", how: "Reglas", status: "partial", ai: false, detail: "Objeciones y preguntas de diagnóstico. Precios: requieren tarifas oficiales." },
  { n: 10, name: "Redacción comercial", how: "IA + barreras", status: "ready", ai: true, detail: "Botón «Redactar con IA» en Campañas. Borrador de WhatsApp; se rechaza todo precio, cifra, promesa o enlace que no esté en tus datos. Siempre queda sin aprobar." },
  { n: 11, name: "Seguimiento", how: "Reglas", status: "partial", ai: false, detail: "Seguimientos con fecha en campañas. Sugerencias con IA: pendientes." },
  { n: 12, name: "Análisis gerencial", how: "Reglas", status: "partial", ai: false, detail: "Dashboard, metas y mercado con datos reales. Interpretación con IA: pendiente." },
];

export const EXTRA_AGENTS: CatalogItem[] = [
  { n: 13, name: "Interpretación de búsqueda", how: "IA propone + código valida", status: "ready", ai: true, detail: "Botón «Interpretar con IA» en Buscar. Convierte tu petición en criterios (ciudad, zonas, rubros). Tú los revisas antes de buscar." },
];

export const SKILLS: { name: string; status: Maturity; detail: string }[] = [
  { name: "Apertura de negociación", status: "partial", detail: "Mensaje base por plantilla; con IA: lógica lista." },
  { name: "Investigación previa", status: "partial", detail: "Qué se sabe y qué no, con la fuente de cada dato." },
  { name: "Identificación de necesidades", status: "pending", detail: "Necesita IA y datos de conversaciones." },
  { name: "Preguntas de diagnóstico", status: "ready", detail: "Por rubro más generales." },
  { name: "Propuesta de valor", status: "pending", detail: "Hoy la escribes tú en la campaña." },
  { name: "Presentación de servicios logísticos", status: "pending", detail: "Requiere el catálogo oficial de servicios de PIBOX." },
  { name: "Manejo de objeciones", status: "ready", detail: "Seis objeciones con advertencias; base provisional." },
  { name: "Negociación de precios y condiciones", status: "pending", detail: "Requiere tarifas oficiales; no se inventan." },
  { name: "Seguimiento comercial", status: "partial", detail: "Fechas y notas por prospecto." },
  { name: "Reactivación de prospectos", status: "pending", detail: "—" },
  { name: "Preparación de reuniones", status: "ready", detail: "Lista de verificación en el plan de acercamiento." },
  { name: "Análisis de oportunidades perdidas", status: "pending", detail: "Necesita más historial de campañas." },
  { name: "Resúmenes para el equipo comercial", status: "partial", detail: "Resumen del plan de acercamiento." },
];
