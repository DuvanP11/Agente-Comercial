export type ModuleStatus = "ready" | "partial" | "pending";

export interface NavItem {
  slug: string; label: string; href: string; status: ModuleStatus; phase: string; note?: string;
}

export const NAV: NavItem[] = [
  { slug: "dashboard", label: "Dashboard gerencial", href: "/", status: "partial", phase: "9", note: "Conteos reales de la base; metas y finanzas pendientes." },
  { slug: "buscar", label: "Buscar clientes", href: "/buscar", status: "partial", phase: "5", note: "Google Places listo (requiere clave). LinkedIn, directorios y web pendientes." },
  { slug: "importar", label: "Importar prospectos", href: "/importar", status: "ready", phase: "5" },
  { slug: "analizar", label: "Analizar clientes", href: "/analizar", status: "partial", phase: "5", note: "Valoración manual con evidencias. La propuesta automática con IA está pendiente." },
  { slug: "captar", label: "Captar clientes", href: "/captar", status: "partial", phase: "6", note: "Selección, plan de acercamiento (reglas, sin IA) y envío a campaña. Redacción con IA y negociación de precios: pendientes." },
  { slug: "prospectos", label: "Base de prospectos", href: "/prospectos", status: "ready", phase: "3" },
  { slug: "clientes", label: "Clientes existentes", href: "/clientes", status: "ready", phase: "3" },
  { slug: "campanas", label: "Campañas comerciales", href: "/campanas", status: "partial", phase: "6", note: "Mensajes por plantilla con aprobación, seguimientos y no-contactar. Redacción con IA y correo: pendientes." },
  { slug: "metas", label: "Metas y rendimiento", href: "/metas", status: "partial", phase: "9", note: "Metas editables; avance real solo para prospectos, calificados y contactos." },
  { slug: "mercado", label: "Inteligencia de mercado", href: "/mercado", status: "partial", phase: "5", note: "Conteos y embudo por rubro, ciudad y fuente con datos reales. Tendencias y análisis con IA: pendientes." },
  { slug: "agentes", label: "Agentes y skills", href: "/agentes", status: "partial", phase: "4", note: "Catálogo con estado real, configuración de IA e historial. Botones de IA en las pantallas: al configurar el proveedor." },
  { slug: "entrenamiento", label: "Entrenamiento de IA", href: "/m/entrenamiento", status: "pending", phase: "8" },
  { slug: "integraciones", label: "Integraciones", href: "/integraciones", status: "partial", phase: "7" },
  { slug: "reportes", label: "Reportes", href: "/reportes", status: "partial", phase: "9", note: "Descarga CSV de prospectos; más reportes pendientes." },
  { slug: "configuracion", label: "Configuración", href: "/m/configuracion", status: "pending", phase: "2" },
  { slug: "apariencia", label: "Apariencia y marca", href: "/apariencia", status: "ready", phase: "2" },
];
