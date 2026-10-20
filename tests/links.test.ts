import { describe, expect, it } from "vitest";
import { mailtoLink, safeWebUrl, telLink } from "@/lib/contact-links";

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
