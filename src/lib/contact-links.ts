/** Enlace wa.me: abre la conversación con el texto prellenado; NO envía nada. */
export function whatsappLink(e164: string, text: string): string | null {
  const digits = e164.replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Búsqueda en Google Maps por texto: no implica coordenadas exactas. */
export function mapSearchLink(address: string, city?: string | null): string {
  const q = [address, city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Enlace web seguro: solo http/https (rechaza javascript:, data:, etc.). Sin esquema se asume https. */
export function safeWebUrl(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v || /\s/.test(v)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? u.toString() : null;
  } catch { return null; }
}

/** Enlace mailto solo si el correo tiene formato válido. */
export function mailtoLink(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v) ? `mailto:${v}` : null;
}

/** Enlace tel: solo con dígitos (y + inicial). */
export function telLink(value: string | null | undefined): string | null {
  const d = (value ?? "").replace(/[^\d+]/g, "");
  return /^\+?\d{7,15}$/.test(d) ? `tel:${d}` : null;
}


/** Un enlace tel: por cada número del campo (el campo puede traer varios separados por ; / ,). Los que no son números válidos van sin enlace. */
export function phoneLinks(value: string | null | undefined): { text: string; href: string | null }[] {
  return (value ?? "").split(/[;/|\n]|,(?=\s*\+?\d)/).map((t) => t.trim()).filter(Boolean).map((text) => ({ text, href: telLink(text) }));
}
