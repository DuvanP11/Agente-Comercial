import { describe, expect, it } from "vitest";
import { ACTIONS, allowedOrigins, eventToEntry, SECTIONS, signAutomatizadorToken, TOKEN_TTL_MS, verifyAutomatizadorToken } from "@/lib/automatizador-audit";
import { moduleOf } from "@/lib/activity";

process.env.AUTH_SECRET = "0123456789abcdef0123456789abcdef";

describe("eventos del Automatizador: solo una lista cerrada, nunca texto libre", () => {
  it("convierte una pantalla vista y una acción en líneas de la auditoría", () => {
    expect(eventToEntry({ t: "view", s: "generador" })).toEqual({ kind: "view", label: "Abrió Generador de mensajes (Automatizador de mensajes)", path: "/automatizador/generador" });
    expect(eventToEntry({ t: "action", a: "wa_open" })).toMatchObject({ kind: "action", path: "/automatizador" });
    expect(eventToEntry({ t: "action", a: "clients_import", n: 125 })?.label).toBe("Importó clientes — 125 fila(s) aplicada(s) (Automatizador de mensajes)");
    expect(eventToEntry({ t: "action", a: "report_download" })?.kind).toBe("download");
  });
  it("rechaza cualquier cosa que no sea exactamente una clave conocida (incluidos trucos de objetos)", () => {
    for (const bad of [null, "texto", 5, [], {}, { t: "view", s: "no-existe" }, { t: "view", s: "__proto__" }, { t: "view", s: "constructor" }, { t: "action", a: "toString" }, { t: "action", a: "borrar_todo" },
      { t: "click", s: "generador" }, { t: "view" }, { t: "action", a: 7 }, { t: "action", a: ["wa_open"] }]) expect(eventToEntry(bad), JSON.stringify(bad)).toBeNull();
  });
  it("ignora cualquier campo extra: un nombre, teléfono o correo enviado «de contrabando» no llega al registro", () => {
    const e = eventToEntry({ t: "action", a: "client_create", label: "Creó a Juan Pérez 3001234567 juan@x.co", name: "Juan Pérez", phone: "3001234567", email: "juan@x.co", detail: { x: 1 } });
    expect(e).toEqual({ kind: "action", label: "Creó un cliente (Automatizador de mensajes)", path: "/automatizador" });
    expect(JSON.stringify(e)).not.toMatch(/Juan|3001234567|@/);
  });
  it("el número es un entero acotado y solo se usa en las acciones que cuentan", () => {
    expect(eventToEntry({ t: "action", a: "bc_prepare", n: 1e12 })?.label).toContain("100000 cliente(s)");
    expect(eventToEntry({ t: "action", a: "bc_prepare", n: -3 })?.label).toContain("0 cliente(s)");
    expect(eventToEntry({ t: "action", a: "bc_prepare", n: "12" })?.label).not.toMatch(/cliente\(s\)/);
    expect(eventToEntry({ t: "action", a: "bc_prepare", n: NaN })?.label).not.toMatch(/cliente\(s\)/);
    expect(eventToEntry({ t: "action", a: "wa_open", n: 5 })?.label).not.toMatch(/\d/);
  });
  it("todas las frases son fijas: ninguna deja un hueco para datos de clientes", () => {
    for (const [k, a] of Object.entries(ACTIONS)) { expect(a.label, k).not.toMatch(/[{}<>]/); if (a.withCount) expect(a.withCount, k).toMatch(/^\{n\} [a-z() áéíóú]+$/); }
    for (const s of Object.values(SECTIONS)) expect(s).not.toMatch(/\d/);
  });
  it("el módulo se muestra como «Automatizador de mensajes» en la auditoría", () => {
    expect(moduleOf("/automatizador/clientes")).toBe("Automatizador de mensajes"); expect(moduleOf("/automatizador")).toBe("Automatizador de mensajes");
  });
});

describe("firma de quien entra al Automatizador", () => {
  it("válida, alterada, vencida y de otra clave", () => {
    const t = signAutomatizadorToken("user-1", 1_000);
    expect(verifyAutomatizadorToken(t, 2_000)).toEqual({ userId: "user-1" });
    expect(verifyAutomatizadorToken(t, 1_000 + TOKEN_TTL_MS + 1)).toBeNull();
    const [b, s] = t.split(".");
    expect(verifyAutomatizadorToken(`${(b[0] === "e" ? "f" : "e") + b.slice(1)}.${s}`, 2_000)).toBeNull();
    expect(verifyAutomatizadorToken(`${b}.${s.slice(0, -2)}xx`, 2_000)).toBeNull();
    expect(verifyAutomatizadorToken("basura", 2_000)).toBeNull(); expect(verifyAutomatizadorToken("", 2_000)).toBeNull();
    const old = process.env.AUTH_SECRET; process.env.AUTH_SECRET = "otra-clave-otra-clave-otra-clave-1"; expect(verifyAutomatizadorToken(t, 2_000)).toBeNull(); process.env.AUTH_SECRET = old;
  });
  it("no sirve para otro fin: una firma de Gmail o de otro contexto no abre este registro", () => {
    expect(verifyAutomatizadorToken(Buffer.from(JSON.stringify({ u: "x", e: Date.now() + 1e6 })).toString("base64url") + ".firmafalsa")).toBeNull();
  });
});

describe("orígenes permitidos", () => {
  it("solo el de la dirección configurada (y los de la variable, si existe)", () => {
    expect(allowedOrigins("https://automatizador.vercel.app/ruta?x=1", {})).toEqual(["https://automatizador.vercel.app"]);
    expect(allowedOrigins(null, {})).toEqual([]);
    expect(allowedOrigins("no es url", {})).toEqual([]);
    expect(allowedOrigins("https://a.vercel.app", { AUTOMATIZADOR_ORIGINS: "https://b.vercel.app/x, malo, https://a.vercel.app" })).toEqual(["https://a.vercel.app", "https://b.vercel.app"]);
  });
});
