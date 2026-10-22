export type ModuleStatus = "ready" | "partial" | "pending";

export interface NavItem {
  slug: string; label: string; href: string; status: ModuleStatus; phase: string; note?: string;
  /** Sección del menú lateral e ícono. */
  group?: string; icon?: string;
}

export const NAV: NavItem[] = [
  { slug: "dashboard", label: "Dashboard gerencial", href: "/", status: "partial", phase: "9", note: "Cifras reales, gráficos y lecturas. Falta: ingresos, costos y margen (requieren cargar datos financieros).", group: "Principal", icon: "dashboard" },
  { slug: "buscar", label: "Buscar clientes", href: "/buscar", status: "partial", phase: "5", note: "Funcionan OpenStreetMap, el Registro Mercantil (RUES) y LinkedIn asistido. Falta: Google Places (espera la clave y la facturación de Google Cloud) e investigación web.", group: "Prospección", icon: "search" },
  { slug: "importar", label: "Importar prospectos", href: "/importar", status: "ready", phase: "5", group: "Prospección", icon: "upload" },
  { slug: "analizar", label: "Analizar clientes", href: "/analizar", status: "ready", phase: "5", note: "Valoración con evidencias, propuesta con IA, gráficos y prioridad configurable.", group: "Prospección", icon: "analyze" },
  { slug: "captar", label: "Captar clientes", href: "/captar", status: "partial", phase: "6", note: "Selección, plan de acercamiento por reglas y envío a campaña. Falta: negociación con IA y precios (requieren las tarifas oficiales de PIBOX).", group: "Prospección", icon: "target" },
  { slug: "prospectos", label: "Base de prospectos", href: "/prospectos", status: "ready", phase: "3", group: "Prospección", icon: "database" },
  { slug: "clientes", label: "Clientes existentes", href: "/clientes", status: "ready", phase: "3", group: "Prospección", icon: "building" },
  { slug: "campanas", label: "Campañas comerciales", href: "/campanas", status: "partial", phase: "6", note: "Mensajes con aprobación, portada, material adjunto, seguimientos y no-contactar; WhatsApp solo se abre. Falta: correo (Gmail) y envío automático (WhatsApp Business).", group: "Comercial", icon: "megaphone" },
  { slug: "metas", label: "Metas y rendimiento", href: "/metas", status: "partial", phase: "9", note: "Metas editables; avance real solo de prospectos, calificados y contactos. Falta: metas de ingresos (datos financieros).", group: "Comercial", icon: "flag" },
  { slug: "mercado", label: "Inteligencia de mercado", href: "/mercado", status: "partial", phase: "5", note: "Conteos, embudo y gráficos con datos reales. Falta: tendencias en el tiempo y análisis con IA.", group: "Comercial", icon: "chart" },
  { slug: "agentes", label: "Agentes y skills", href: "/agentes", status: "partial", phase: "4", note: "Catálogo con estado real, configuración de IA e historial. Varios agentes aún funcionan solo con reglas.", group: "Inteligencia", icon: "bot" },
  { slug: "entrenamiento", label: "Entrenamiento de IA", href: "/entrenamiento", status: "partial", phase: "8", note: "Guía escrita por el equipo para redacción y calificación. Falta: aprender de resultados reales (qué mensajes funcionaron).", group: "Inteligencia", icon: "sparkles" },
  { slug: "integraciones", label: "Integraciones", href: "/integraciones", status: "partial", phase: "7", note: "Estado real de cada conexión. Falta: Gmail, WhatsApp Business e investigación web.", group: "Sistema", icon: "plug" },
  { slug: "reportes", label: "Reportes", href: "/reportes", status: "partial", phase: "9", note: "Descarga CSV de prospectos. Falta: reportes gerenciales en Excel o PDF por campaña y mercado.", group: "Sistema", icon: "file" },
  { slug: "configuracion", label: "Configuración", href: "/configuracion", status: "partial", phase: "2", note: "Pesos del puntaje, cobertura mínima y reglas de contacto. Falta: usuarios y roles (hoy hay una sola contraseña compartida).", group: "Sistema", icon: "settings" },
  { slug: "apariencia", label: "Apariencia y marca", href: "/apariencia", status: "ready", phase: "2", group: "Sistema", icon: "palette" },
  { slug: "auditoria", label: "Auditoría", href: "/auditoria", status: "ready", phase: "2", group: "Sistema", icon: "eye", note: "Quién hizo qué: accesos, pantallas, descargas, importaciones y acciones (Admin, Head, IT y Gerencia)." },
  { slug: "usuarios", label: "Usuarios", href: "/usuarios", status: "ready", phase: "2", group: "Sistema", icon: "users", note: "Crear, editar y desactivar usuarios, cambiar roles y restablecer contraseñas (Admin, Gerencia y Head; IT solo lee)." },
];
