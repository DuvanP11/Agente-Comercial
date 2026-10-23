import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { NAV } from "@/lib/nav";
import { canAccessPath, canManageUsers, canSeeNavItem, homeFor, isHunter, MANAGER_ROLES, ROLE_KEYS, seesAllData } from "@/lib/permissions";
import { authenticate, createUser, isBootstrap, listUsers, resetPassword, updateUser, userForSession } from "@/lib/services/users";

const ENV = { APP_PASSWORD: "clave-del-admin-123", AUTH_SECRET: "0123456789abcdef0123456789abcdef", ADMIN_EMAIL: "duvan@pibox.app" };
let saved: Record<string, string | undefined> = {};
beforeEach(() => { saved = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]])); Object.assign(process.env, ENV); });
afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("permisos por rol (puros)", () => {
  it("cinco roles; gestionan usuarios solo Admin, Gerencia y Head", () => {
    expect(ROLE_KEYS.sort()).toEqual(["admin", "gerencia", "head", "hunter", "it"]);
    expect([...MANAGER_ROLES].sort()).toEqual(["admin", "gerencia", "head"]);
    for (const r of ["admin", "gerencia", "head"]) expect(canManageUsers(r), r).toBe(true);
    for (const r of ["it", "hunter", "otro", ""]) expect(canManageUsers(r), r).toBe(false);
  });
  it("Hunter: solo Prospección, Comercial y Reportes; el resto, todo", () => {
    for (const p of ["/buscar", "/importar", "/analizar", "/analizar/123", "/captar", "/bienvenida", "/prospectos", "/prospectos/9", "/clientes", "/campanas", "/campanas/1", "/metas", "/mercado", "/reportes", "/reportes/prospectos", "/cuenta", "/api/campaigns/1/attachments"]) expect(canAccessPath("hunter", p), p).toBe(true);
    for (const p of ["/", "/dashboard", "/agentes", "/entrenamiento", "/integraciones", "/configuracion", "/apariencia", "/usuarios", "/auditoria", "/buscarX", "/prospectos-secretos", "/api/otra"]) expect(canAccessPath("hunter", p), p).toBe(false);
    for (const r of ["admin", "head", "it", "gerencia"]) for (const p of ["/", "/usuarios", "/auditoria", "/configuracion", "/buscar"]) expect(canAccessPath(r, p), `${r} ${p}`).toBe(true);
    expect(canAccessPath("inventado", "/buscar")).toBe(false);
  });
  it("menú: el Hunter ve 6 de Prospección, 4 de Comercial (con Bix) y Reportes; los demás ven todo", () => {
    const h = NAV.filter((n) => canSeeNavItem("hunter", n)).map((n) => n.slug).sort();
    expect(h).toEqual(["analizar", "bix", "buscar", "campanas", "captar", "clientes", "importar", "mercado", "metas", "prospectos", "reportes"]);
    for (const r of ["admin", "head", "it", "gerencia"]) expect(NAV.every((n) => canSeeNavItem(r, n))).toBe(true);
    expect(homeFor("hunter")).toBe("/bienvenida"); expect(homeFor("it")).toBe("/bienvenida");
    expect(isHunter("hunter") && !seesAllData("hunter") && seesAllData("it")).toBe(true);
  });
});

async function setup() {
  const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
  const l = await authenticate(d, o, "duvan@pibox.app", ENV.APP_PASSWORD);
  if (!l.ok) throw new Error("admin no entró");
  const mk = async (name: string, email: string, role: string) => (await createUser(d, o, l.user.id, { name, email, role })).user;
  return { d, o, boot: l.user, mk };
}

describe("gestión de usuarios por rol", () => {
  it("Admin, Gerencia y Head crean y editan; IT y Hunter no; IT sí puede ver la lista, Hunter no", async () => {
    const { d, o, boot, mk } = await setup();
    const g = await mk("Gina Gerente", "gina@picap.io", "gerencia"), hd = await mk("Hugo Head", "hugo@picap.io", "head"), it = await mk("Ivan IT", "ivan@picap.io", "it"), hu = await mk("Hana Hunter", "hana@pibox.app", "hunter");
    expect(g.role).toBe("gerencia");
    await expect(createUser(d, o, g.id, { name: "Nuevo Uno", email: "n1@pibox.app", role: "hunter" })).resolves.toBeTruthy();
    await expect(createUser(d, o, hd.id, { name: "Nuevo Dos", email: "n2@pibox.app", role: "it" })).resolves.toBeTruthy();
    for (const actor of [it, hu]) {
      await expect(createUser(d, o, actor.id, { name: "Nuevo Tres", email: "n3@pibox.app" }), actor.role).rejects.toThrow(/Solo Admin, Gerencia o Head/);
      await expect(updateUser(d, o, actor.id, hu.id, { name: "X Y" }), actor.role).rejects.toThrow(/Solo Admin, Gerencia o Head/);
      await expect(resetPassword(d, o, actor.id, hu.id), actor.role).rejects.toThrow(/Solo Admin, Gerencia o Head/);
    }
    expect((await listUsers(d, o, it.id)).length).toBeGreaterThan(3);
    await expect(listUsers(d, o, hu.id)).rejects.toThrow(/No tienes permiso/);
    await expect(createUser(d, o, boot.id, { name: "Rol Malo", email: "malo@pibox.app", role: "root" })).rejects.toThrow(/Rol no válido/);
  });
  it("cambiar el rol: lo hacen los gestores, cierra sesiones, no se puede a uno mismo ni al de arranque", async () => {
    const { d, o, boot, mk } = await setup();
    const g = await mk("Gina Gerente", "gina@picap.io", "gerencia"), hu = await mk("Hana Hunter", "hana@pibox.app", "hunter");
    const up = await updateUser(d, o, g.id, hu.id, { role: "it" });
    expect(up).toMatchObject({ role: "it", sessionVersion: 1 });
    expect(await userForSession(d, o, hu.id, 0)).toBeNull();                                  // la sesión vieja con el rol viejo ya no vale
    await expect(updateUser(d, o, g.id, g.id, { role: "hunter" })).rejects.toThrow(/tu propio rol/);
    await expect(updateUser(d, o, g.id, boot.id, { role: "hunter" })).rejects.toThrow(/arranque/);
    await expect(updateUser(d, o, g.id, boot.id, { active: false })).rejects.toThrow(/arranque/);
    await expect(resetPassword(d, o, g.id, boot.id)).rejects.toThrow(/APP_PASSWORD/);
    await expect(resetPassword(d, o, g.id, g.id)).rejects.toThrow(/Mi cuenta/);
    expect(isBootstrap({ role: "admin", passwordHash: null })).toBe(true); expect(isBootstrap({ role: "admin", passwordHash: "x" })).toBe(false);
  });
  it("siempre queda al menos un gestor activo", async () => {
    const { d, o, boot, mk } = await setup();
    const g = await mk("Gina Gerente", "gina@picap.io", "gerencia");
    // el de arranque cuenta como gestor: se puede degradar a Gina
    expect((await updateUser(d, o, boot.id, g.id, { role: "it" })).role).toBe("it");
    const h = await mk("Hugo Head", "hugo@picap.io", "head");
    const hh = await mk("Hector Head", "hector@picap.io", "head");
    expect((await updateUser(d, o, h.id, hh.id, { active: false })).active).toBe(false);
  });
});

import { getHiddenModules, saveHiddenModules } from "@/lib/services/settings";
import { cleanHidden, isPathHidden } from "@/lib/nav";
describe("módulos del menú encendidos y apagados", () => {
  it("de fábrica solo «Agentes y skills» está apagado; se guarda y se lee; Configuración y Usuarios no se pueden apagar", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    expect(await getHiddenModules(d, o)).toEqual(["agentes"]);
    expect(await saveHiddenModules(d, o, "t", ["mercado", "configuracion", "usuarios", "no-existe", "mercado", 7])).toEqual(["mercado"]);
    expect(await getHiddenModules(d, o)).toEqual(["mercado"]);
    expect(await saveHiddenModules(d, o, "t", [])).toEqual([]);
    expect(await getHiddenModules(d, o)).toEqual([]);   // vacío guardado a propósito: ya no vuelve a los de fábrica
  });
  it("reconoce las rutas de un módulo apagado, también las internas, y «/» solo exacto", () => {
    expect(cleanHidden("x")).toEqual([]);
    expect(isPathHidden(["agentes"], "/agentes")).toBe(true); expect(isPathHidden(["agentes"], "/agentes/abc")).toBe(true); expect(isPathHidden(["agentes"], "/agentesx")).toBe(false);
    expect(isPathHidden(["dashboard"], "/")).toBe(true); expect(isPathHidden(["dashboard"], "/buscar")).toBe(false);
  });
});
