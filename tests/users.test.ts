import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { makeSessionToken, readSession } from "@/lib/auth";
import { ALLOWED_EMAIL_DOMAINS, passwordIssue, tempPassword, validateCorporateEmail, validateUsername } from "@/lib/user-rules";
import { authenticate, changeOwnPassword, createUser, hashPassword, listUsers, requestReset, resetPassword, updateUser, userForSession, verifyPassword } from "@/lib/services/users";

const ENV = { APP_PASSWORD: "clave-del-admin-123", AUTH_SECRET: "0123456789abcdef0123456789abcdef", ADMIN_EMAIL: "duvan@pibox.app" };
let saved: Record<string, string | undefined> = {};
beforeEach(() => { saved = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]])); Object.assign(process.env, ENV); });
afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

async function setup() {
  const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
  const login = await authenticate(d, o, "duvan@pibox.app", ENV.APP_PASSWORD);
  if (!login.ok) throw new Error("el administrador no pudo entrar");
  return { d, o, admin: login.user };
}

describe("reglas de usuarios", () => {
  it("solo los 4 dominios corporativos, exactos y en minúsculas", () => {
    expect(ALLOWED_EMAIL_DOMAINS).toEqual(["pibox.app", "picap.app", "picap.io", "softlab.app"]);
    for (const ok of ["ana@pibox.app", "Ana.Perez@PICAP.IO", " luis@softlab.app ", "x@picap.app"]) expect(() => validateCorporateEmail(ok), ok).not.toThrow();
    for (const bad of ["ana@gmail.com", "ana@picap.co", "ana@sub.pibox.app", "ana@pibox.app.evil.com", "ana@evilpibox.app", "ana", "@pibox.app", "a b@pibox.app"]) expect(() => validateCorporateEmail(bad), bad).toThrow();
    expect(validateCorporateEmail("Ana.Perez@PICAP.IO")).toBe("ana.perez@picap.io");
  });
  it("usuario y contraseña: formato y política", () => {
    expect(validateUsername("Ana.Perez")).toBe("ana.perez"); expect(() => validateUsername("a")).toThrow(); expect(() => validateUsername("../etc")).toThrow();
    expect(passwordIssue("corta1")).toMatch(/al menos 10/); expect(passwordIssue("sololetrasaqui")).toMatch(/letras y números/); expect(passwordIssue("1234567890123")).toMatch(/letras y números/); expect(passwordIssue("Clave-segura-2026")).toBeNull();
    for (let i = 0; i < 50; i++) { const t = tempPassword(); expect(t).toHaveLength(12); expect(passwordIssue(t)).toBeNull(); }
  });
  it("hash scrypt: no es la contraseña, verifica y rechaza", async () => {
    const h = await hashPassword("Clave-segura-2026");
    expect(h).toMatch(/^scrypt\$16384\$[0-9a-f]{32}\$[0-9a-f]{128}$/); expect(h).not.toContain("Clave");
    expect(await verifyPassword("Clave-segura-2026", h)).toBe(true); expect(await verifyPassword("otra", h)).toBe(false); expect(await verifyPassword("x", null)).toBe(false);
  });
});

describe("sesión firmada", () => {
  it("lee un token válido; rechaza manipulado, vencido y sin secreto", async () => {
    const t = await makeSessionToken({ u: "u1", v: 3, m: false }, 1_000_000);
    expect(await readSession(t, 1_000_000)).toMatchObject({ u: "u1", v: 3, m: false });
    const [body, sig] = t.split(".");
    expect(await readSession(`${body}.${sig.replace(/.$/, sig.endsWith("0") ? "1" : "0")}`, 1_000_000)).toBeNull();
    const forged = btoa(JSON.stringify({ u: "admin", v: 0, e: 9_999_999_999, m: false })).replace(/=+$/, "");
    expect(await readSession(`${forged}.${sig}`, 1_000_000)).toBeNull();
    expect(await readSession(t, 1_000_000 + 13 * 3600_000)).toBeNull();
    expect(await readSession(undefined)).toBeNull(); expect(await readSession("basura")).toBeNull();
    delete process.env.AUTH_SECRET; expect(await readSession(t, 1_000_000)).toBeNull();
  });
});

describe("administración de usuarios", () => {
  it("el administrador entra con APP_PASSWORD y su identificador; nadie más entra así", async () => {
    const { d, o, admin } = await setup();
    expect(admin).toMatchObject({ role: "admin", email: "duvan@pibox.app" });
    expect((await authenticate(d, o, "duvan@pibox.app", "mala")).ok).toBe(false);
    expect((await authenticate(d, o, "otro@pibox.app", ENV.APP_PASSWORD)).ok).toBe(false);   // APP_PASSWORD sola no abre cualquier cuenta
    expect((await authenticate(d, o, "DUVAN@pibox.app", ENV.APP_PASSWORD)).ok).toBe(true);
    expect((await listUsers(d, o, admin.id)).length).toBe(1);
  });
  it("solo el administrador crea usuarios; dominio corporativo; contraseña temporal obligatoria de cambiar", async () => {
    const { d, o, admin } = await setup();
    await expect(createUser(d, o, admin.id, { name: "Ana", email: "ana@gmail.com" })).rejects.toThrow(/correos corporativos/);
    const { user, tempPassword: temp } = await createUser(d, o, admin.id, { name: "Ana Pérez", email: "Ana.Perez@picap.io" });
    expect(user).toMatchObject({ email: "ana.perez@picap.io", username: "ana.perez", role: "user", mustChangePassword: true, active: true });
    expect("passwordHash" in user).toBe(false);
    await expect(createUser(d, o, user.id, { name: "Luis", email: "luis@pibox.app" })).rejects.toThrow(/Solo el administrador/);     // un usuario normal no crea
    await expect(createUser(d, o, "no-existe", { name: "Luis", email: "luis@pibox.app" })).rejects.toThrow(/Solo el administrador/);
    await expect(createUser(d, o, admin.id, { name: "Otra Ana", email: "ana.perez@picap.io" })).rejects.toThrow(/ese correo/);
    await expect(createUser(d, o, admin.id, { name: "Otra Ana", email: "otra@picap.io", username: "ana.perez" })).rejects.toThrow(/nombre de usuario/);
    await expect(createUser(d, o, admin.id, { name: "Falso", email: "falso@picap.io", username: "admin" })).rejects.toThrow(/reservado/);
    const ok = await authenticate(d, o, "ana.perez", temp);   // entra con usuario o con correo
    expect(ok.ok && ok.user.mustChangePassword).toBe(true);
    expect((await authenticate(d, o, "ana.perez@picap.io", temp)).ok).toBe(true);
  });
  it("bloqueo tras 5 fallos y se libera con el tiempo; un correcto antes del bloqueo reinicia la cuenta", async () => {
    const { d, o, admin } = await setup();
    const { tempPassword: temp } = await createUser(d, o, admin.id, { name: "Ana Pérez", email: "ana@pibox.app" });
    for (let i = 0; i < 4; i++) expect(await authenticate(d, o, "ana", "mala-clave-1")).toEqual({ ok: false, reason: "invalid" });
    expect((await authenticate(d, o, "ana", temp)).ok).toBe(true);
    for (let i = 0; i < 5; i++) await authenticate(d, o, "ana", "mala-clave-1");
    expect(await authenticate(d, o, "ana", temp)).toEqual({ ok: false, reason: "locked" });      // aun con la correcta
    const later = new Date(Date.now() + 16 * 60_000);
    expect((await authenticate(d, o, "ana", temp, later)).ok).toBe(true);
  });
  it("cambiar la contraseña: pide la actual, aplica la política y cierra las otras sesiones", async () => {
    const { d, o, admin } = await setup();
    const { user, tempPassword: temp } = await createUser(d, o, admin.id, { name: "Ana Pérez", email: "ana@pibox.app" });
    await expect(changeOwnPassword(d, o, user.id, "equivocada1", "Nueva-clave-2026")).rejects.toThrow(/actual no es correcta/);
    await expect(changeOwnPassword(d, o, user.id, temp, "corta1")).rejects.toThrow(/al menos 10/);
    await expect(changeOwnPassword(d, o, user.id, temp, temp)).rejects.toThrow(/distinta/);
    const changed = await changeOwnPassword(d, o, user.id, temp, "Nueva-clave-2026");
    expect(changed).toMatchObject({ mustChangePassword: false, sessionVersion: 1 });
    expect(await userForSession(d, o, user.id, 0)).toBeNull(); expect(await userForSession(d, o, user.id, 1)).not.toBeNull();
    expect((await authenticate(d, o, "ana", temp)).ok).toBe(false); expect((await authenticate(d, o, "ana", "Nueva-clave-2026")).ok).toBe(true);
    await expect(changeOwnPassword(d, o, admin.id, ENV.APP_PASSWORD, "Nueva-clave-2026")).rejects.toThrow(/APP_PASSWORD/);   // el admin la cambia en Vercel
  });
  it("restablecer: solo el administrador, contraseña temporal nueva, sesiones cerradas, solicitud atendida", async () => {
    const { d, o, admin } = await setup();
    const { user } = await createUser(d, o, admin.id, { name: "Ana Pérez", email: "ana@pibox.app" });
    await requestReset(d, o, "ANA"); await requestReset(d, o, "no-existe");
    expect((await d.select().from(users).where(eq(users.id, user.id)))[0].resetRequestedAt).not.toBeNull();
    await expect(resetPassword(d, o, user.id, user.id)).rejects.toThrow(/Solo el administrador/);          // ni ella misma
    await expect(resetPassword(d, o, admin.id, admin.id)).rejects.toThrow(/APP_PASSWORD/);
    const r = await resetPassword(d, o, admin.id, user.id);
    expect(r.user).toMatchObject({ mustChangePassword: true, sessionVersion: 1, resetRequestedAt: null });
    expect((await authenticate(d, o, "ana", r.tempPassword)).ok).toBe(true);
    expect(await userForSession(d, o, user.id, 0)).toBeNull();
  });
  it("editar nombre, correo y usuario; desactivar corta el acceso; el administrador no se desactiva", async () => {
    const { d, o, admin } = await setup();
    const { user, tempPassword: temp } = await createUser(d, o, admin.id, { name: "Ana Pérez", email: "ana@pibox.app" });
    const { user: other } = await createUser(d, o, admin.id, { name: "Luis Gómez", email: "luis@softlab.app" });
    expect(await updateUser(d, o, admin.id, user.id, { name: "Ana M. Pérez", email: "ana.m@picap.app", username: "anamp" })).toMatchObject({ name: "Ana M. Pérez", email: "ana.m@picap.app", username: "anamp" });
    await expect(updateUser(d, o, admin.id, user.id, { email: "ana@hotmail.com" })).rejects.toThrow(/corporativos/);
    await expect(updateUser(d, o, admin.id, user.id, { email: other.email })).rejects.toThrow(/ese correo/);
    await expect(updateUser(d, o, admin.id, user.id, { username: other.username })).rejects.toThrow(/nombre de usuario/);
    await expect(updateUser(d, o, user.id, other.id, { name: "Hackeado" })).rejects.toThrow(/Solo el administrador/);
    await expect(updateUser(d, o, admin.id, admin.id, { active: false })).rejects.toThrow(/no se puede desactivar/);
    const off = await updateUser(d, o, admin.id, user.id, { active: false });
    expect(off).toMatchObject({ active: false, sessionVersion: 1 });
    expect((await authenticate(d, o, "anamp", temp)).ok).toBe(false); expect(await userForSession(d, o, user.id, 1)).toBeNull();
    expect((await updateUser(d, o, admin.id, user.id, { active: true })).active).toBe(true);
  });
});

import { clientIp, resetRateLimit, sameOrigin, tooMany } from "@/lib/rate-limit";
describe("frenos de ataque", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  it("límite por clave y ventana: el intento 21 se frena y pasado el tiempo se libera", () => {
    resetRateLimit();
    for (let i = 1; i <= 20; i++) expect(tooMany("ip1", 20, 900_000, 1000 + i)).toBe(false);
    expect(tooMany("ip1", 20, 900_000, 2000)).toBe(true);
    expect(tooMany("ip2", 20, 900_000, 2000)).toBe(false);                 // otra IP no se ve afectada
    expect(tooMany("ip1", 20, 900_000, 1000 + 900_001 + 30)).toBe(false);  // ya pasó la ventana
  });
  it("IP del proxy y control de origen", () => {
    expect(clientIp(h({ "x-forwarded-for": "181.1.2.3, 10.0.0.1" }))).toBe("181.1.2.3"); expect(clientIp(h({}))).toBe("desconocida");
    expect(sameOrigin(h({ origin: "https://app.pibox.app", host: "app.pibox.app" }))).toBe(true);
    expect(sameOrigin(h({ origin: "https://evil.com", host: "app.pibox.app" }))).toBe(false);
    expect(sameOrigin(h({ origin: "no es url", host: "app.pibox.app" }))).toBe(false);
    expect(sameOrigin(h({ host: "app.pibox.app" }))).toBe(true);
  });
});
