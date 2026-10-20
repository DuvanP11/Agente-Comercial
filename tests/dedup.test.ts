import { describe, expect, it } from "vitest";
import { findDuplicates, type CompanyRecord } from "@/lib/dedup/match";
import { normalizeDomain, normalizeName, normalizeNit, normalizePhone } from "@/lib/dedup/normalize";

const ref = (o: Partial<CompanyRecord> & { id: string }): CompanyRecord =>
  ({ origin: "existing_client", name: "Ref", ...o });
const cand = (o: Partial<CompanyRecord>): CompanyRecord => ({ id: "new", origin: "prospect", name: "X", ...o });

describe("normalización", () => {
  it("NIT con puntos y dígito de verificación", () => {
    expect(normalizeNit("900.123.456-7")).toBe("900123456");
    expect(normalizeNit("900123456")).toBe("900123456");
    expect(normalizeNit("12")).toBe("");
  });
  it("teléfonos colombianos en formatos distintos", () => {
    const e164 = "+573001234567";
    expect(normalizePhone("300 123 4567")).toBe(e164);
    expect(normalizePhone("+57 300-123-4567")).toBe(e164);
    expect(normalizePhone("(57) 3001234567")).toBe(e164);
    expect(normalizePhone("123")).toBe("");
  });
  it("dominios equivalentes", () => {
    for (const v of ["https://www.Tienda.com/productos?x=1", "tienda.com", "http://tienda.com:8080", "ventas@tienda.com"]) {
      expect(normalizeDomain(v)).toBe("tienda.com");
    }
    expect(normalizeDomain("no es dominio")).toBe("");
  });
  it("nombres sin sufijos legales ni tildes", () => {
    expect(normalizeName("Cosméticos La Rosa S.A.S.")).toBe("cosmeticos la rosa");
  });
});

describe("deduplicación", () => {
  it("coincidencia exacta por NIT", () => {
    const m = findDuplicates(cand({ name: "Otro nombre", nit: "900.123.456-7" }), [ref({ id: "1", nit: "900123456" })]);
    expect(m[0].level).toBe("exact");
    expect(m[0].reasons[0].field).toBe("nit");
  });
  it("coincidencia exacta por dominio aunque cambie el nombre", () => {
    const m = findDuplicates(cand({ website: "https://www.latienda.co" }), [ref({ id: "1", name: "Distinto", website: "latienda.co" })]);
    expect(m[0].level).toBe("exact");
  });
  it("coincidencia por teléfono en otro formato", () => {
    const m = findDuplicates(cand({ phone: "+57 300 123 4567" }), [ref({ id: "1", phone: "3001234567" })]);
    expect(m[0].level).toBe("exact");
  });
  it("variante de nombre = probable, nunca exacta", () => {
    const m = findDuplicates(cand({ name: "Cosmeticos La Rosa", city: "Bogotá" }), [ref({ id: "1", name: "Cosméticos La Rosas SAS", city: "Bogotá" })]);
    expect(m).toHaveLength(1);
    expect(m[0].level).toBe("probable");
  });
  it("falso positivo: nombres parecidos en ciudades distintas no coinciden", () => {
    const m = findDuplicates(cand({ name: "Moda Norte", city: "Bogotá" }), [ref({ id: "1", name: "Moda Norte", city: "Cali" })]);
    // mismo nombre, ciudad distinta → no se considera ni probable
    expect(m).toHaveLength(0);
  });
  it("correo genérico (gmail) no identifica a una empresa", () => {
    const m = findDuplicates(cand({ name: "A", email: "ventas@gmail.com" }), [ref({ id: "1", name: "B", email: "ventas@gmail.com" })]);
    expect(m).toHaveLength(0);
  });
  it("registros incompletos no coinciden por vacíos", () => {
    expect(findDuplicates(cand({ name: "Alfa" }), [ref({ id: "1", name: "Beta" })])).toHaveLength(0);
    expect(findDuplicates(cand({ name: "" }), [ref({ id: "1", name: "" })])).toHaveLength(0);
  });
  it("no se compara contra sí mismo", () => {
    expect(findDuplicates(cand({ id: "1", website: "a.com" }), [ref({ id: "1", website: "a.com" })])).toHaveLength(0);
  });
});
