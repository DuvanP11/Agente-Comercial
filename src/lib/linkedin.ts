/** Flujo asistido de LinkedIn: arma enlaces de búsqueda para abrir a mano y valida la URL de la empresa que la persona captura. No extrae nada de LinkedIn. */
export function linkedinSearchUrl(query: string, city: string): string {
  return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent([query, city].filter(Boolean).join(" ").trim())}`;
}
export function googleLinkedinUrl(query: string, city: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/company ${query ? `"${query}"` : ""} ${city}`.replace(/\s+/g, " ").trim())}`;
}

/** Devuelve la URL normalizada de una página de EMPRESA de LinkedIn, o null si no lo es (otro sitio, perfil personal, http, etc.). */
export function parseLinkedinCompanyUrl(input: string): string | null {
  let u: URL;
  try { u = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) return null;
  const m = /^\/company\/([A-Za-z0-9%._\-]{1,100})\/?/.exec(u.pathname);
  return m ? `https://www.linkedin.com/company/${m[1]}` : null;
}
