/** Tipos de actividad y reglas puras del registro. */
export const KINDS = {
  view: "Pantalla vista", click: "Clic en el menú", download: "Descarga", import: "Importación", search: "Búsqueda",
  action: "Acción", login: "Inicio de sesión", logout: "Cierre de sesión", login_failed: "Intento de acceso fallido", admin: "Administración", probe: "Escaneo bloqueado",
} as const;
export type Kind = keyof typeof KINDS;
export const isKind = (v: unknown): v is Kind => typeof v === "string" && v in KINDS;
/** Lo que el navegador puede reportar por su cuenta (lo demás solo lo registra el servidor). */
export const CLIENT_KINDS: Kind[] = ["view", "click"];

const MODULES: [string, string][] = [
  ["/bienvenida", "Inicio"], ["/buscar", "Buscar clientes"], ["/importar", "Importar prospectos"], ["/analizar", "Analizar clientes"], ["/captar", "Captar clientes"],
  ["/automatizador", "Automatizador de mensajes"], ["/prospectos", "Base de prospectos"], ["/clientes", "Clientes existentes"], ["/campanas", "Campañas"], ["/metas", "Metas"], ["/mercado", "Inteligencia de mercado"],
  ["/agentes", "Agentes y skills"], ["/entrenamiento", "Entrenamiento de IA"], ["/integraciones", "Integraciones"], ["/reportes", "Reportes"], ["/configuracion", "Configuración"],
  ["/apariencia", "Apariencia"], ["/usuarios", "Usuarios"], ["/auditoria", "Auditoría"], ["/cuenta", "Mi cuenta"],
];
/** Nombre del módulo al que pertenece una ruta. */
export function moduleOf(path: string | null | undefined): string {
  if (!path) return "—";
  if (path === "/") return "Dashboard";
  return MODULES.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? "Otros";
}

/** Ruta limpia para guardar: solo el camino (sin parámetros), recortada y sin caracteres raros. null si no es una ruta válida. */
export function cleanPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const p = input.split(/[?#]/)[0];
  return /^\/[A-Za-z0-9/_\-.%]{0,198}$/.test(p) && !p.startsWith("//") && !p.includes("..") ? p : null;
}
/** Los ids (UUID) de las rutas se acortan para agrupar y no llenar el registro de ruido. */
export const shortPath = (p: string) => p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");

export const cleanText = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
