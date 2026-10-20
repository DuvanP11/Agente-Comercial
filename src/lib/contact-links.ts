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
