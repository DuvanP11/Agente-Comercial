/** Roles y permisos. Puro y seguro para el middleware (sin base de datos). */
export const ROLES = { hunter: "Hunter", admin: "Admin", head: "Head", it: "IT", gerencia: "Gerencia" } as const;
export type Role = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as Role[];
export const isRole = (v: unknown): v is Role => typeof v === "string" && v in ROLES;

/** Quienes pueden crear usuarios, editarlos, cambiar sus roles y restablecer contraseñas. */
export const MANAGER_ROLES: readonly Role[] = ["admin", "gerencia", "head"];
export const canManageUsers = (role: string) => (MANAGER_ROLES as readonly string[]).includes(role);

/** El Hunter solo ve Prospección, Comercial y Reportes. Los demás roles ven todo. */
export const isHunter = (role: string) => role === "hunter";
/** Ven los datos de todos los usuarios (el Hunter solo ve lo suyo). */
export const seesAllData = (role: string) => !isHunter(role);

const HUNTER_PREFIXES = ["/buscar", "/importar", "/analizar", "/captar", "/prospectos", "/clientes", "/campanas", "/metas", "/mercado", "/reportes", "/bienvenida", "/cuenta", "/api/campaigns", "/api/audit", "/api/gmail", "/bix", "/automatizador", "/brand", "/m/"];

/** ¿Puede este rol abrir esta ruta? (el Hunter solo las de su lista; el resto, todas). */
export function canAccessPath(role: string, pathname: string): boolean {
  if (!isRole(role)) return false;
  if (!isHunter(role)) return true;
  return HUNTER_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p.endsWith("/") ? p : p + "/"));
}

/** Pantalla de inicio (la casa del menú): la bienvenida comercial, igual para todos los roles. */
export const homeFor = (_role: string) => "/bienvenida";
/** Dónde cae quien intenta abrir algo que no puede. */
export const fallbackFor = (_role: string) => "/bienvenida";

/** Módulos del menú que ve cada rol (por sección y por módulo suelto). */
const HUNTER_GROUPS = new Set(["Prospección", "Comercial"]);
export function canSeeNavItem(role: string, item: { group?: string; slug: string }): boolean {
  if (!isHunter(role)) return true;
  return HUNTER_GROUPS.has(item.group ?? "") || item.slug === "reportes";
}
