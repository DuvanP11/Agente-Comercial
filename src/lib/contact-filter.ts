/** Filtro por datos de contacto, para la tabla de resultados y la lista de prospectos. */
export type ContactFilter = "all" | "any" | "phone" | "email" | "web";

export const CONTACT_FILTER_LABEL: Record<ContactFilter, string> = {
  all: "Todos", any: "Con algún contacto", phone: "Con teléfono", email: "Con correo", web: "Con web",
};

export const isContactFilter = (v: unknown): v is ContactFilter => typeof v === "string" && v in CONTACT_FILTER_LABEL;

export function matchesContactFilter(c: { phone?: string | null; email?: string | null; website?: string | null }, f: ContactFilter): boolean {
  const phone = !!c.phone?.trim(), email = !!c.email?.trim(), web = !!c.website?.trim();
  switch (f) {
    case "all": return true;
    case "any": return phone || email || web;
    case "phone": return phone;
    case "email": return email;
    case "web": return web;
  }
}
