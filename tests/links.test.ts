import { describe, expect, it } from "vitest";
import { mailtoLink, phoneLinks, safeWebUrl, telLink } from "@/lib/contact-links";

describe("enlaces de contacto", () => {
  it("web: agrega https y acepta http/https", () => {
    expect(safeWebUrl("tienda.com")).toBe("https://tienda.com/");
    expect(safeWebUrl("http://x.co/a?b=1")).toBe("http://x.co/a?b=1");
    expect(safeWebUrl("https://www.larosa.co")).toBe("https://www.larosa.co/");
  });
  it("web: rechaza esquemas peligrosos y basura", () => {
    for (const v of ["javascript:alert(1)", "data:text/html,x", "ftp://a.com", "no es web", "", null, "localhost"]) expect(safeWebUrl(v as string)).toBeNull();
  });
  it("correo y teléfono solo con formato válido", () => {
    expect(mailtoLink("ventas@tienda.com")).toBe("mailto:ventas@tienda.com");
    expect(mailtoLink('a@b.co"><script>')).toBeNull();
    expect(mailtoLink("sin-arroba")).toBeNull();
    expect(telLink("+57 601 555 1234")).toBe("tel:+576015551234");
    expect(telLink("abc")).toBeNull();
  });
});

import { NAV } from "@/lib/nav";

describe("navegación", () => {
  it("cada módulo pendiente apunta a /m/<slug> y cada módulo con pantalla apunta a su ruta real", () => {
    for (const n of NAV) {
      if (n.status === "pending") expect(n.href).toBe(`/m/${n.slug}`);
      else expect(n.href.startsWith("/m/")).toBe(false);
    }
  });
  it("no hay rutas ni slugs repetidos", () => {
    expect(new Set(NAV.map((n) => n.href)).size).toBe(NAV.length);
    expect(new Set(NAV.map((n) => n.slug)).size).toBe(NAV.length);
  });
});


describe("enlaces para varios teléfonos", () => {
  it("un enlace por número, y los que no son números van sin enlace", () => {
    expect(phoneLinks("+57 601 5471740;+57 601 5471744")).toEqual([{ text: "+57 601 5471740", href: "tel:+576015471740" }, { text: "+57 601 5471744", href: "tel:+576015471744" }]);
    expect(phoneLinks("310 555 0000 / llamar a gerencia")[1]).toEqual({ text: "llamar a gerencia", href: null });
    expect(phoneLinks(null)).toEqual([]);
  });
});
