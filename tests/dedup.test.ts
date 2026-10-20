import { describe, expect, it } from "vitest";
import { duplicateMessage, findDuplicates, type CompanyRecord } from "@/lib/dedup/match";
import { allPhonesValid, normalizeDomain, normalizeName, normalizeNit, normalizePhone, normalizePhones, splitPhones } from "@/lib/dedup/normalize";

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

  it("nombres genéricos de una palabra no se marcan como duplicados (son categorías, no negocios)", () => {
    const m = findDuplicates(cand({ name: "Droguería", city: "Bogotá", address: "Carrera 28" }), [ref({ id: "1", name: "Drogueria", city: "Bogotá", address: "Calle 2" })]);
    expect(m).toHaveLength(0);
  });
  it("misma calle sin número de puerta NO es duplicado exacto", () => {
    const m = findDuplicates(cand({ name: "Ferretería Central", city: "Bogotá", address: "Carrera 7" }), [ref({ id: "1", name: "Ferretería Central", city: "Bogotá", address: "Carrera 7" })]);
    expect(m.every((x) => x.level !== "exact")).toBe(true);
  });
  it("mismo nombre + misma dirección con número de puerta SÍ es exacto", () => {
    const m = findDuplicates(cand({ name: "Ferretería Central", address: "Cra 7 # 10-20" }), [ref({ id: "1", name: "Ferretería Central SAS", address: "Carrera 7 No. 10-20" })]);
    expect(m[0]?.level).toBe("exact");
  });
  it("mensaje según con qué coincide: cliente vs prospecto", () => {
    expect(duplicateMessage("exact", "client")).toMatch(/cliente ya está registrado/);
    expect(duplicateMessage("exact", "prospect")).toMatch(/prospecto ya existe/);
    expect(duplicateMessage("probable", "client")).toMatch(/Posible duplicado/);
  });
});


describe("varios teléfonos en un mismo campo (caso real de OpenStreetMap: «+57 601 5471740;+57 601 5471744»)", () => {
  it("separa por ; / | , y salto de línea", () => {
    expect(splitPhones("601 5471740; 310 555 0000")).toEqual(["601 5471740", "310 555 0000"]);
    expect(splitPhones("601 5471740 / 3105550000")).toEqual(["601 5471740", "3105550000"]);
    expect(splitPhones("3105550000, 3205551111")).toEqual(["3105550000", "3205551111"]);
    expect(splitPhones("3105550000\n3205551111")).toHaveLength(2);
    expect(splitPhones(null)).toEqual([]); expect(splitPhones("  ")).toEqual([]);
  });
  it("el caso real: ambos números válidos y el primero es el principal", () => {
    expect(normalizePhones("+57 601 5471740;+57 601 5471744")).toEqual(["+576015471740", "+576015471744"]);
    expect(normalizePhone("+57 601 5471740;+57 601 5471744")).toBe("+576015471740");
  });
  it("descarta los inválidos y los repetidos sin perder los buenos", () => {
    expect(normalizePhones("123; 310 555 0000; 3105550000")).toEqual(["+573105550000"]);
    expect(normalizePhone("abc")).toBe("");
  });
  it("un número solo sigue funcionando igual que antes", () => { expect(normalizePhone("300 123 4567")).toBe("+573001234567"); });
  it("allPhonesValid exige que TODOS sean válidos (para lo que escribe el usuario)", () => {
    expect(allPhonesValid("310 555 0000; 601 5471740")).toBe(true);
    expect(allPhonesValid("310 555 0000; 123")).toBe(false);
    expect(allPhonesValid("")).toBe(false);
  });
  it("dedup: coincide si COMPARTEN algún teléfono, aunque tengan otros distintos", () => {
    const m = findDuplicates(cand({ name: "A", phone: "601 5471740; 3105550000" }), [ref({ id: "1", name: "B", phone: "3201112222; +57 310 555 0000" })]);
    expect(m[0].level).toBe("exact"); expect(m[0].reasons[0]).toMatchObject({ field: "phone", candidateValue: "+573105550000" });
  });
  it("dedup: sin números en común no coinciden", () => {
    expect(findDuplicates(cand({ name: "A", phone: "601 5471740; 3105550000" }), [ref({ id: "1", name: "B", phone: "3201112222; 3001234567" })])).toHaveLength(0);
  });
});
