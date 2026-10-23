import { createHmac, timingSafeEqual } from "node:crypto";
import type { Kind } from "./activity";

/**
 * Registro de lo que se hace en el Automatizador de mensajes (otra web, sin servidor ni inicio de sesión) dentro de la Auditoría de esta plataforma.
 * PRIVACIDAD POR DISEÑO: el Automatizador NO manda texto libre. Manda una clave de una lista cerrada (y a lo sumo un número de cuántos),
 * y aquí se convierte en la frase. Así es imposible que viajen nombres, teléfonos, correos o mensajes de clientes.
 */
export const SECTIONS: Record<string, string> = {
  generador: "Generador de mensajes", comunicados: "Comunicados", clientes: "Clientes y contactos", plantillas: "Plantillas",
  seguimiento: "Seguimiento comercial", informes: "Informes gerenciales", configuracion: "Configuración", tutorial: "Tutorial", ideas: "Buzón de ideas",
};

/** clave → tipo de actividad y frase ({n} = cuántos, si se informó). */
export const ACTIONS: Record<string, { kind: Kind; label: string; withCount?: string }> = {
  wa_open: { kind: "action", label: "Abrió WhatsApp con un mensaje del Generador" },
  msg_copy: { kind: "action", label: "Copió un mensaje del Generador" },
  bc_save: { kind: "action", label: "Guardó un comunicado" },
  bc_prepare: { kind: "action", label: "Preparó una cola de comunicado", withCount: "{n} cliente(s)" },
  bc_wa_open: { kind: "action", label: "Abrió WhatsApp desde un comunicado" },
  bc_export: { kind: "download", label: "Descargó el resultado de un comunicado (CSV)" },
  clients_import: { kind: "import", label: "Importó clientes", withCount: "{n} fila(s) aplicada(s)" },
  contacts_import: { kind: "import", label: "Importó teléfonos de contacto", withCount: "{n} contacto(s)" },
  import_undo: { kind: "action", label: "Deshizo la última importación" },
  client_create: { kind: "action", label: "Creó un cliente" },
  client_edit: { kind: "action", label: "Editó un cliente" },
  client_delete: { kind: "action", label: "Eliminó un cliente" },
  clients_assign: { kind: "action", label: "Asignó clientes a un comercial", withCount: "{n} cliente(s)" },
  followup_update: { kind: "action", label: "Actualizó el seguimiento de un cliente" },
  tpl_save: { kind: "action", label: "Guardó una plantilla" },
  tpl_delete: { kind: "action", label: "Eliminó una plantilla" },
  report_download: { kind: "download", label: "Descargó el informe en Excel" },
  config_save: { kind: "action", label: "Guardó la configuración" },
  backup_download: { kind: "download", label: "Descargó un respaldo" },
  backup_restore: { kind: "action", label: "Restauró un respaldo" },
  data_wipe: { kind: "action", label: "Borró todos los datos de su navegador" },
  idea_save: { kind: "action", label: "Guardó una idea en el buzón" },
  idea_send: { kind: "action", label: "Envió las ideas por correo" },
};

export interface AutoEntry { kind: Kind; label: string; path: string }

/** Convierte un evento del Automatizador en una línea del registro. Devuelve null si no es exactamente un evento conocido. */
export function eventToEntry(ev: unknown): AutoEntry | null {
  if (!ev || typeof ev !== "object") return null;
  const e = ev as { t?: unknown; s?: unknown; a?: unknown; n?: unknown };
  if (e.t === "view" && typeof e.s === "string" && Object.hasOwn(SECTIONS, e.s)) return { kind: "view", label: `Abrió ${SECTIONS[e.s]} (Automatizador de mensajes)`, path: `/automatizador/${e.s}` };
  if (e.t === "action" && typeof e.a === "string" && Object.hasOwn(ACTIONS, e.a)) {
    const a = ACTIONS[e.a];
    const n = typeof e.n === "number" && Number.isFinite(e.n) ? Math.max(0, Math.min(100_000, Math.trunc(e.n))) : null;
    const extra = a.withCount && n !== null ? ` — ${a.withCount.replace("{n}", String(n))}` : "";
    return { kind: a.kind, label: `${a.label}${extra} (Automatizador de mensajes)`, path: "/automatizador" };
  }
  return null;
}

// ---- Token de quien entra al Automatizador desde esta plataforma ----
export const TOKEN_TTL_MS = 12 * 3600_000;
const secret = () => { const s = process.env.AUTH_SECRET; if (!s || s.length < 24) throw new Error("Falta AUTH_SECRET."); return s; };
const sig = (body: string) => createHmac("sha256", secret()).update(`automatizador-audit:v1:${body}`).digest("base64url");

/** Firma «esta persona entró desde el Agente Comercial». Solo lleva el id y la caducidad; el nombre y el rol se leen del servidor al registrar. */
export function signAutomatizadorToken(userId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ u: userId, e: now + TOKEN_TTL_MS })).toString("base64url");
  return `${body}.${sig(body)}`;
}
export function verifyAutomatizadorToken(token: string, now = Date.now()): { userId: string } | null {
  try {
    const [body, s] = token.split("."); if (!body || !s) return null;
    const good = Buffer.from(sig(body)), given = Buffer.from(s);
    if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: unknown; e?: unknown };
    return typeof p.u === "string" && typeof p.e === "number" && p.e > now ? { userId: p.u } : null;
  } catch { return null; }
}

/** Orígenes del Automatizador que pueden mandar eventos: el de la dirección configurada (y, solo en desarrollo, localhost). */
export function allowedOrigins(configuredUrl: string | null, env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = [];
  try { if (configuredUrl) out.push(new URL(configuredUrl).origin); } catch { /* dirección inválida */ }
  for (const o of (env.AUTOMATIZADOR_ORIGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean)) { try { out.push(new URL(o).origin); } catch { /* ignorar */ } }
  return [...new Set(out)];
}
