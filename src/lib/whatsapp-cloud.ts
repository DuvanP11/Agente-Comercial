import { createHmac, timingSafeEqual } from "node:crypto";

/** Adaptador de la API oficial de WhatsApp (Meta Cloud API). Sin las variables de entorno no envía nada. */
export interface WaConfig { token: string; phoneId: string; verifyToken: string; appSecret: string; template: string | null; templateLang: string }
const GRAPH = "https://graph.facebook.com/v25.0";

export function waConfig(env: Record<string, string | undefined> = process.env): WaConfig | null {
  const token = env.WHATSAPP_TOKEN?.trim(), phoneId = env.WHATSAPP_PHONE_ID?.trim();
  if (!token || !phoneId) return null;
  return { token, phoneId, verifyToken: env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "", appSecret: env.WHATSAPP_APP_SECRET?.trim() ?? "", template: env.WHATSAPP_TEMPLATE_NAME?.trim() || null, templateLang: env.WHATSAPP_TEMPLATE_LANG?.trim() || "es" };
}
/** Qué variables faltan para que Bix pueda enviar Y recibir (la firma del webhook es obligatoria). */
export function waMissing(env: Record<string, string | undefined> = process.env): string[] {
  const m: string[] = [];
  if (!env.WHATSAPP_TOKEN?.trim()) m.push("WHATSAPP_TOKEN");
  if (!env.WHATSAPP_PHONE_ID?.trim()) m.push("WHATSAPP_PHONE_ID");
  if (!env.WHATSAPP_VERIFY_TOKEN?.trim()) m.push("WHATSAPP_VERIFY_TOKEN");
  if (!env.WHATSAPP_APP_SECRET?.trim()) m.push("WHATSAPP_APP_SECRET");
  return m;
}

export type WaSendError = "not_found" | "window" | "auth" | "rate" | "other";
export class WaError extends Error { constructor(message: string, readonly kind: WaSendError, readonly code?: number) { super(message); } }

/** 131026 = el número no tiene WhatsApp (o no pudo recibir); 131047 = pasaron 24 h desde que el cliente escribió (solo plantillas). */
export function classifyWaError(status: number, code: number | undefined): WaSendError {
  if (code === 131026 || code === 131030 || code === 1006) return "not_found";
  if (code === 131047 || code === 131051 || code === 132000) return "window";
  if (status === 401 || code === 190) return "auth";
  if (status === 429 || code === 130429 || code === 131056) return "rate";
  return "other";
}
const MESSAGES: Record<WaSendError, string> = {
  not_found: "Ese número no tiene WhatsApp.",
  window: "WhatsApp solo permite escribir primero con una plantilla aprobada (falta WHATSAPP_TEMPLATE_NAME o pasaron más de 24 h).",
  auth: "WhatsApp rechazó el token. Revisa WHATSAPP_TOKEN.",
  rate: "WhatsApp pidió esperar (límite de envíos). Intenta más tarde.",
  other: "WhatsApp no pudo enviar el mensaje.",
};

async function post(cfg: WaConfig, payload: object, f: typeof fetch): Promise<string> {
  const res = await f(`${GRAPH}/${cfg.phoneId}/messages`, { method: "POST", headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", ...payload }), signal: AbortSignal.timeout(20_000) });
  const j = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number } };
  const id = j.messages?.[0]?.id;
  if (!res.ok || !id) { const kind = classifyWaError(res.status, j.error?.code); throw new WaError(MESSAGES[kind], kind, j.error?.code); }
  return id;
}
export const sendText = (cfg: WaConfig, to: string, body: string, f: typeof fetch = fetch) => post(cfg, { to, type: "text", text: { body, preview_url: true } }, f);
/** Primer contacto: la plantilla aprobada recibe el nombre del negocio como {{1}}. */
export const sendTemplate = (cfg: WaConfig, to: string, name: string, param: string, f: typeof fetch = fetch) =>
  post(cfg, { to, type: "template", template: { name, language: { code: cfg.templateLang }, components: [{ type: "body", parameters: [{ type: "text", text: param.slice(0, 60) }] }] } }, f);

/** Firma X-Hub-Signature-256 de Meta sobre el cuerpo EXACTO recibido. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const good = createHmac("sha256", appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === good.length && timingSafeEqual(given, good);
}

export interface InboundText { from: string; id: string; text: string }
export interface StatusUpdate { id: string; status: string; to: string; code?: number }
/** Extrae del webhook los textos entrantes y los estados de entrega (los demás tipos —audios, imágenes— se ignoran). */
export function parseWebhook(body: unknown): { messages: InboundText[]; statuses: StatusUpdate[]; unsupported: { from: string; id: string }[] } {
  const out = { messages: [] as InboundText[], statuses: [] as StatusUpdate[], unsupported: [] as { from: string; id: string }[] };
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const e of entries) for (const ch of ((e as { changes?: unknown[] })?.changes ?? [])) {
    const v = (ch as { value?: { messages?: { from?: string; id?: string; type?: string; text?: { body?: string }; button?: { text?: string } }[]; statuses?: { id?: string; status?: string; recipient_id?: string; errors?: { code?: number }[] }[] } })?.value;
    for (const m of v?.messages ?? []) {
      if (!m.from || !m.id) continue;
      const text = m.type === "text" ? m.text?.body : m.type === "button" ? m.button?.text : undefined;
      if (text?.trim()) out.messages.push({ from: m.from, id: m.id, text: text.trim().slice(0, 1000) });
      else out.unsupported.push({ from: m.from, id: m.id });
    }
    for (const s of v?.statuses ?? []) if (s.id && s.status) out.statuses.push({ id: s.id, status: s.status, to: s.recipient_id ?? "", code: s.errors?.[0]?.code });
  }
  return out;
}
