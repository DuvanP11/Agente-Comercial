/** Aviso de leads a un espacio de Google Chat mediante webhook entrante. */
export function validateChatWebhook(raw: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error("La URL del webhook no es válida."); }
  if (u.protocol !== "https:" || u.hostname !== "chat.googleapis.com" || !u.pathname.startsWith("/v1/spaces/")) throw new Error("Debe ser la URL del webhook de un espacio de Google Chat (empieza por https://chat.googleapis.com/v1/spaces/…).");
  return u.toString();
}

export type InterestRange = "Alto" | "Medio" | "Bajo";
export const interestRange = (n: number): InterestRange => (n >= 70 ? "Alto" : n >= 40 ? "Medio" : "Bajo");
const ICON: Record<InterestRange, string> = { Alto: "🔥", Medio: "🟡", Bajo: "⚪" };

export interface LeadNote {
  interest: number; name: string; business: string; phone: string; email: string | null; city: string | null; category: string | null;
  answers: { q: string; a: string }[]; hunter: { name: string; chatUserId: string | null }; summary?: string | null;
}
const clean = (s: string) => s.replace(/[*_`~<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 240);
/** Texto del aviso. Arroba al Hunter con <users/ID> (formato de Google Chat); si no tiene ID, solo escribe su nombre. */
export function buildLeadMessage(n: LeadNote): string {
  const r = interestRange(n.interest);
  const who = n.hunter.chatUserId ? `<users/${n.hunter.chatUserId.replace(/[^0-9A-Za-z_-]/g, "")}>` : `*${clean(n.hunter.name)}*`;
  const phone = n.phone.replace(/\D/g, "");
  const lines = [
    `${ICON[r]} *Nuevo lead de Bix* · Interés *${r.toUpperCase()}* (${n.interest}/100)`,
    `• *Prospecto:* ${clean(n.name)}${n.business && n.business !== n.name ? ` (${clean(n.business)})` : ""}`,
    `• *WhatsApp:* +${phone}  →  https://wa.me/${phone}`,
    `• *Correo:* ${n.email ? clean(n.email) : "sin correo"}`,
    ...(n.city || n.category ? [`• *Ciudad / rubro:* ${[n.city, n.category].filter(Boolean).map((x) => clean(x!)).join(" · ")}`] : []),
    `• *Asignado a:* ${who}`,
  ];
  if (n.answers.length) { lines.push("• *Lo que respondió a las preguntas filtro:*"); for (const a of n.answers.slice(0, 6)) lines.push(`    – ${clean(a.q)} → _${clean(a.a)}_`); }
  else lines.push("• *Respuestas:* aún no hay respuestas a las preguntas filtro; revisa la conversación en Bix.");
  if (n.summary) lines.push(`• *Resumen:* ${clean(n.summary)}`);
  lines.push("_Bix le indicó al cliente que escriba a tu WhatsApp. Contáctalo cuanto antes._");
  return lines.join("\n");
}

export async function postToChat(webhookUrl: string, text: string, f: typeof fetch = fetch): Promise<void> {
  const res = await f(validateChatWebhook(webhookUrl), { method: "POST", headers: { "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(res.status === 404 || res.status === 403 ? "Google Chat rechazó el webhook (¿se borró o se cambió la clave?)." : `Google Chat respondió ${res.status}.`);
}
