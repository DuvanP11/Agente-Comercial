import { randomBytes } from "node:crypto";
import { normalizeEmail } from "./dedup/normalize";

/** Armado de un correo (RFC 5322 / MIME) para enviarlo por la API de Gmail. Puro y probado: es lo que viaja a Gmail. */
export interface MailAttachment { name: string; mime: string; bytes: Uint8Array; /** Se muestra dentro del cuerpo (imagen) en vez de como adjunto aparte. */ inlineCid?: string }
export interface MailInput { from: string; fromName?: string | null; to: string; subject: string; text: string; html?: string; attachments?: MailAttachment[]; date?: Date; messageIdDomain?: string }

export const MAX_RAW_BYTES = 22 * 1024 * 1024; // Gmail admite 25 MB en total; se deja margen por la codificación

/** Quita saltos de línea y caracteres de control: así nada de lo que escriba una persona (asunto, nombres) puede inyectar encabezados. */
export const cleanHeader = (v: string) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
const b64 = (data: Uint8Array | string) => Buffer.from(typeof data === "string" ? new TextEncoder().encode(data) : data).toString("base64");
const fold76 = (s: string) => (s.match(/.{1,76}/g) ?? [""]).join("\r\n");
export const toBase64Url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Texto de encabezado con acentos o ñ: se codifica en palabras «=?UTF-8?B?…?=» de máximo ~45 bytes (límite de 75 caracteres por palabra). */
export function encodeHeaderText(s: string): string {
  const v = cleanHeader(s);
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  const words: string[] = []; let cur = "";
  for (const ch of v) { if (Buffer.byteLength(cur + ch) > 42) { words.push(cur); cur = ""; } cur += ch; }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${b64(w)}?=`).join("\r\n ");
}

const addr = (email: string, name?: string | null) => {
  const e = normalizeEmail(email);
  if (!e) throw new Error(`Dirección de correo no válida: ${cleanHeader(email).slice(0, 80)}`);
  const n = name ? cleanHeader(name).replace(/["\\]/g, "") : "";
  return n ? `${/^[\x20-\x7e]*$/.test(n) ? `"${n}"` : encodeHeaderText(n)} <${e}>` : e;
};
const boundary = (p: string) => `${p}_${randomBytes(12).toString("hex")}`;
const part = (type: string, body: string, extra: string[] = []) => [`Content-Type: ${type}`, "Content-Transfer-Encoding: base64", ...extra, "", fold76(body)].join("\r\n");

/** Texto plano → HTML sencillo (se escapa todo y los saltos de línea pasan a <br>). */
export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${esc.replace(/\r?\n/g, "<br>")}</div>`;
}

export function buildMime(m: MailInput): string {
  const atts = m.attachments ?? [];
  const total = atts.reduce((s, a) => s + a.bytes.length, 0) + m.text.length + (m.html?.length ?? 0);
  if (total * 1.37 > MAX_RAW_BYTES) throw new Error("El correo con sus adjuntos pesa demasiado (máximo ~16 MB en total): quita archivos.");
  const fromDomain = (normalizeEmail(m.from).split("@")[1] ?? "localhost");
  const headers = [
    `From: ${addr(m.from, m.fromName)}`, `To: ${addr(m.to)}`, `Subject: ${encodeHeaderText(m.subject.slice(0, 200))}`,
    `Date: ${(m.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`, `Message-ID: <${randomBytes(12).toString("hex")}@${m.messageIdDomain ?? fromDomain}>`, "MIME-Version: 1.0",
  ];
  const html = m.html ?? textToHtml(m.text);
  const alt = boundary("alt");
  const altBlock = `Content-Type: multipart/alternative; boundary="${alt}"\r\n\r\n--${alt}\r\n${part('text/plain; charset="UTF-8"', m.text)}\r\n--${alt}\r\n${part('text/html; charset="UTF-8"', html)}\r\n--${alt}--`;
  const inline = atts.filter((a) => a.inlineCid), normal = atts.filter((a) => !a.inlineCid);
  const attPart = (a: MailAttachment, disp: "inline" | "attachment") => {
    const fname = encodeHeaderText(a.name.replace(/["\\\r\n]/g, "_").slice(0, 120) || "archivo");
    return part(`${cleanHeader(a.mime)}; name="${fname}"`, b64(a.bytes), [`Content-Disposition: ${disp}; filename="${fname}"`, ...(a.inlineCid ? [`Content-ID: <${a.inlineCid.replace(/[^A-Za-z0-9._@-]/g, "")}>`] : [])]);
  };
  let body = altBlock;
  if (inline.length) { const rel = boundary("rel"); body = `Content-Type: multipart/related; boundary="${rel}"\r\n\r\n--${rel}\r\n${altBlock}\r\n${inline.map((a) => `--${rel}\r\n${attPart(a, "inline")}`).join("\r\n")}\r\n--${rel}--`; }
  if (normal.length) { const mix = boundary("mix"); body = `Content-Type: multipart/mixed; boundary="${mix}"\r\n\r\n--${mix}\r\n${body}\r\n${normal.map((a) => `--${mix}\r\n${attPart(a, "attachment")}`).join("\r\n")}\r\n--${mix}--`; }
  return `${headers.join("\r\n")}\r\n${body}\r\n`;
}
