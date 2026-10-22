import { normalizeEmail, normalizePhone } from "./dedup/normalize";

/** ¿Es una dirección IP privada, local o reservada? (protección contra que se use la app para mirar la red interna) */
export function isPrivateIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v.includes(":")) {
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return m ? isPrivateIp(m[1]) : false;
  }
  const p = v.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // no es una IPv4 válida: se rechaza
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Nombre de host que nunca se consulta (local o interno). */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || /^\d+\.\d+\.\d+\.\d+$/.test(h) && isPrivateIp(h) || h.includes(":");
}

export interface RobotsRules { allow: string[]; disallow: string[] }

/** Lee robots.txt: toma las reglas del grupo que nombra a nuestro agente o, si no hay, las del grupo «*». */
export function parseRobots(text: string, agent: string): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null, lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "user-agent") { if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur); } cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "disallow" && val) cur.disallow.push(val); else if (key === "allow" && val) cur.allow.push(val);
  }
  const a = agent.toLowerCase();
  const own = groups.find((g) => g.agents.some((x) => x !== "*" && a.includes(x))) ?? groups.find((g) => g.agents.includes("*"));
  return own ? { allow: own.allow, disallow: own.disallow } : { allow: [], disallow: [] };
}

const toRe = (rule: string) => new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
/** ¿Se puede leer esta ruta? Gana la regla más específica (la más larga); en empate, Allow. */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  let best = { len: -1, allow: true };
  for (const r of rules.disallow) if (toRe(r).test(path) && r.length > best.len) best = { len: r.length, allow: false };
  for (const r of rules.allow) if (toRe(r).test(path) && r.length >= best.len) best = { len: r.length, allow: true };
  return best.allow;
}

export interface Found { value: string; display: string; where: string }
export interface Extracted { emails: Found[]; phones: Found[]; whatsapp: Found[] }

const JUNK_EMAIL = /(example\.|sentry|wixpress|godaddy|domain\.com|tudominio|email@|correo@ejemplo|@2x|\.(png|jpe?g|gif|svg|webp|css|js)$)/i;
const stripTags = (h: string) => h.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const dec = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/** Saca correos, teléfonos y enlaces de WhatsApp de una página. Solo devuelve lo que pasa la validación (teléfonos colombianos válidos, correos con formato válido). */
export function extractContacts(html: string, pageUrl: string): Extracted {
  const emails = new Map<string, Found>(), phones = new Map<string, Found>(), whatsapp = new Map<string, Found>();
  const addEmail = (raw: string, where: string) => { const e = normalizeEmail(dec(raw).replace(/^mailto:/i, "").split("?")[0]); if (e && !JUNK_EMAIL.test(e) && !emails.has(e)) emails.set(e, { value: e, display: e, where }); };
  const addPhone = (raw: string, where: string) => { const k = normalizePhone(raw); if (k && !phones.has(k)) phones.set(k, { value: raw.trim(), display: k, where }); };
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'>\s]+)/gi)) addEmail(m[1], "enlace de correo");
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)/gi)) addPhone(dec(m[1]), "enlace de teléfono");
  for (const m of html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?[^"'>\s]*phone=|web\.whatsapp\.com\/send\?[^"'>\s]*phone=)\+?(\d{10,15})/gi)) {
    const k = normalizePhone(`+${m[1]}`); if (k && !whatsapp.has(k)) whatsapp.set(k, { value: `+${m[1]}`, display: k, where: "enlace de WhatsApp" });
  }
  const text = stripTags(html);
  for (const m of text.matchAll(/[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g)) addEmail(m[0], "texto de la página");
  // Celulares (3xx xxx xxxx) y fijos (60x xxx xxxx), con separadores comunes. Los números muy largos (ids, NIT) se descartan.
  for (const m of text.matchAll(/(?<![\d])(?:\+?57[\s.-]?)?(?:\(?60\d\)?[\s.-]?\d{3}[\s.-]?\d{4}|3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})(?![\d])/g)) addPhone(m[0], "texto de la página");
  void pageUrl;
  return { emails: [...emails.values()], phones: [...phones.values()], whatsapp: [...whatsapp.values()] };
}

/** Enlaces de la misma página web que suelen traer los datos de contacto (contacto, nosotros…). Máximo 3. */
export function contactLinks(html: string, pageUrl: string): string[] {
  let base: URL; try { base = new URL(pageUrl); } catch { return []; }
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#>\s]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const label = stripTags(m[2]).toLowerCase(), href = m[1];
    if (!/contact|nosotros|acerca|quienes|about|ubica|sedes|donde/.test(`${href.toLowerCase()} ${label}`)) continue;
    try { const u = new URL(href, base); if (u.origin === base.origin && /^https?:$/.test(u.protocol) && !/\.(pdf|jpe?g|png|zip)$/i.test(u.pathname)) { u.hash = ""; if (!out.includes(u.toString()) && u.toString() !== base.toString()) out.push(u.toString()); } } catch { /* enlace roto */ }
    if (out.length >= 3) break;
  }
  return out;
}
