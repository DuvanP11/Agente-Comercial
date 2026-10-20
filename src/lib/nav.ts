export type ModuleStatus = "ready" | "partial" | "pending";

export interface NavItem {
  slug: string; label: string; href: string; status: ModuleStatus; phase: string; note?: string;
}

export const NAV: NavItem[] = [
  { slug: "dashboard", label: "Dashboard gerencial", href: "/", status: "partial", phase: "9", note: "Conteos reales de la base; metas y finanzas pendientes." },
  { slug: "buscar", label: "Buscar clientes", href: "/buscar", status: "partial", phase: "5", note: "Google Places listo (requiere clave). LinkedIn, directorios y web pendientes." },
  { slug: "analizar", label: "Analizar clientes", href: "/m/analizar", status: "pending", phase: "5", note: "El motor de scoring existe y está probado; falta el agente que evalúa y la ficha." },
  { slug: "captar", label: "Captar clientes", href: "/m/captar", status: "pending", phase: "6" },
  { slug: "prospectos", label: "Base de prospectos", href: "/prospectos", status: "ready", phase: "3" },
  { slug: "clientes", label: "Clientes existentes", href: "/clientes", status: "ready", phase: "3" },
  { slug: "campanas", label: "Campañas comerciales", href: "/m/campanas", status: "pending", phase: "6" },
  { slug: "metas", label: "Metas y rendimiento", href: "/m/metas", status: "pending", phase: "9" },
  { slug: "mercado", label: "Inteligencia de mercado", href: "/m/mercado", status: "pending", phase: "5" },
  { slug: "agentes", label: "Agentes y skills", href: "/m/agentes", status: "pending", phase: "4" },
  { slug: "entrenamiento", label: "Entrenamiento de IA", href: "/m/entrenamiento", status: "pending", phase: "8" },
  { slug: "integraciones", label: "Integraciones", href: "/integraciones", status: "partial", phase: "7" },
  { slug: "reportes", label: "Reportes", href: "/m/reportes", status: "pending", phase: "9" },
  { slug: "configuracion", label: "Configuración", href: "/m/configuracion", status: "pending", phase: "2" },
  { slug: "apariencia", label: "Apariencia y marca", href: "/apariencia", status: "ready", phase: "2" },
];
