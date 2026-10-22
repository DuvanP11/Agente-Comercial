import { and, eq, or, sql } from "drizzle-orm";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Db } from "../db/client";
import { auditLog, users } from "../db/schema";
import { appPasswordMatches } from "../auth";
import { LOCK_MINUTES, MAX_FAILED, normEmail, normUsername, passwordIssue, tempPassword, validateCorporateEmail, validateName, validateUsername } from "../user-rules";

export type User = typeof users.$inferSelect;
export type PublicUser = Omit<User, "passwordHash">;
export const strip = ({ passwordHash: _p, ...rest }: User): PublicUser => rest;

// ---- contraseñas (scrypt) ----
const N = 16384;
const kdf = (pw: string, salt: Buffer, n: number) => new Promise<Buffer>((ok, fail) => scrypt(pw, salt, 64, { N: n, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? fail(e) : ok(k))));
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${N}$${salt.toString("hex")}$${(await kdf(pw, salt, N)).toString("hex")}`;
}
export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [alg, n, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !salt || !hash) return false;
  const k = await kdf(pw, Buffer.from(salt, "hex"), Number(n));
  const h = Buffer.from(hash, "hex");
  return k.length === h.length && timingSafeEqual(k, h);
}

/** Identificador del administrador de arranque: ADMIN_EMAIL (si se definió) o «admin». Entra con APP_PASSWORD. */
export const adminIdentifier = () => normEmail(process.env.ADMIN_EMAIL ?? "") || "admin";

async function assertAdmin(db: Db, orgId: string, actorId: string): Promise<User> {
  const [a] = await db.select().from(users).where(and(eq(users.id, actorId), eq(users.orgId, orgId)));
  if (!a || a.role !== "admin" || !a.active) throw new Error("Solo el administrador puede hacer esto.");
  return a;
}

async function ensureBootstrapAdmin(db: Db, orgId: string): Promise<User> {
  const id = adminIdentifier();
  const [found] = await db.select().from(users).where(and(eq(users.orgId, orgId), eq(users.role, "admin")));
  if (found) return found;
  const [row] = await db.insert(users).values({ orgId, email: id.includes("@") ? id : `${id}@admin.local`, emailKey: id.includes("@") ? id : `${id}@admin.local`, username: id.includes("@") ? id.split("@")[0] : id, usernameKey: id.includes("@") ? id.split("@")[0] : id, name: "Administrador", role: "admin" }).returning();
  return row;
}

export type LoginResult = { ok: true; user: User } | { ok: false; reason: "invalid" | "locked" | "inactive" };

/**
 * Inicia sesión con correo o usuario + contraseña. El administrador de arranque entra con APP_PASSWORD.
 * Tras 5 fallos seguidos la cuenta se bloquea 15 minutos. Los motivos finos no se muestran a quien intenta entrar.
 */
export async function authenticate(db: Db, orgId: string, identifier: string, password: string, now = new Date()): Promise<LoginResult> {
  const key = normEmail(identifier);
  if (!key || !password) return { ok: false, reason: "invalid" };
  if (key === adminIdentifier() && (await appPasswordMatches(password))) {
    const admin = await ensureBootstrapAdmin(db, orgId);
    await db.update(users).set({ lastLoginAt: now, failedAttempts: 0, lockedUntil: null }).where(eq(users.id, admin.id));
    return { ok: true, user: admin };
  }
  const [u] = await db.select().from(users).where(and(eq(users.orgId, orgId), or(eq(users.emailKey, key), eq(users.usernameKey, key))));
  if (!u) { await kdf(password, Buffer.alloc(16), N); return { ok: false, reason: "invalid" }; }   // gasta el mismo tiempo: no revela si el usuario existe
  if (u.lockedUntil && u.lockedUntil > now) return { ok: false, reason: "locked" };
  const good = await verifyPassword(password, u.passwordHash);
  if (!good) {
    const fails = u.failedAttempts + 1;
    await db.update(users).set(fails >= MAX_FAILED ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { failedAttempts: fails }).where(eq(users.id, u.id));
    return { ok: false, reason: "invalid" };
  }
  if (!u.active) return { ok: false, reason: "inactive" };
  await db.update(users).set({ lastLoginAt: now, failedAttempts: 0, lockedUntil: null }).where(eq(users.id, u.id));
  return { ok: true, user: u };
}

/** Usuario de una sesión, solo si sigue activo y la versión de su sesión no cambió (restablecimiento, desactivación). */
export async function userForSession(db: Db, orgId: string, id: string, version: number): Promise<User | null> {
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, orgId)));
  return u && u.active && u.sessionVersion === version ? u : null;
}

export async function listUsers(db: Db, orgId: string, actorId: string): Promise<PublicUser[]> {
  await assertAdmin(db, orgId, actorId);
  return (await db.select().from(users).where(eq(users.orgId, orgId)).orderBy(users.createdAt)).map(strip);
}

async function uniqueCheck(db: Db, orgId: string, emailKey: string, usernameKey: string, exceptId?: string) {
  const rows = await db.select({ id: users.id, e: users.emailKey, u: users.usernameKey }).from(users).where(and(eq(users.orgId, orgId), or(eq(users.emailKey, emailKey), eq(users.usernameKey, usernameKey))));
  for (const r of rows) {
    if (r.id === exceptId) continue;
    if (r.e === emailKey) throw new Error("Ya existe un usuario con ese correo.");
    if (r.u === usernameKey) throw new Error("Ya existe un usuario con ese nombre de usuario.");
  }
  if (usernameKey === adminIdentifier() || usernameKey === "admin") throw new Error("Ese nombre de usuario está reservado.");
}

/** Crea un usuario (solo el administrador). Devuelve una contraseña temporal que se muestra UNA vez; el usuario debe cambiarla al entrar. */
export async function createUser(db: Db, orgId: string, actorId: string, input: { name: string; email: string; username?: string }): Promise<{ user: PublicUser; tempPassword: string }> {
  await assertAdmin(db, orgId, actorId);
  const email = validateCorporateEmail(input.email), name = validateName(input.name);
  const username = validateUsername(input.username?.trim() ? input.username : email.split("@")[0].replace(/[^a-z0-9._-]/g, ""));
  await uniqueCheck(db, orgId, email, username);
  const temp = tempPassword();
  const [row] = await db.insert(users).values({ orgId, email, emailKey: email, username, usernameKey: username, name, role: "user", passwordHash: await hashPassword(temp), mustChangePassword: true, createdBy: actorId }).returning();
  await db.insert(auditLog).values({ orgId, actor: actorId, action: "user.create", entity: row.id, detail: { email } });
  return { user: strip(row), tempPassword: temp };
}

/** Edita nombre, correo, usuario y si está activo (solo el administrador). El administrador no se puede desactivar. */
export async function updateUser(db: Db, orgId: string, actorId: string, id: string, input: { name?: string; email?: string; username?: string; active?: boolean }): Promise<PublicUser> {
  await assertAdmin(db, orgId, actorId);
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, orgId)));
  if (!u) throw new Error("Usuario no encontrado.");
  const set: Partial<typeof users.$inferInsert> = {};
  if (input.name !== undefined) set.name = validateName(input.name);
  const email = input.email !== undefined ? (u.role === "admin" ? normEmail(input.email) : validateCorporateEmail(input.email)) : u.emailKey;
  const username = input.username !== undefined ? validateUsername(input.username) : u.usernameKey;
  if (input.email !== undefined || input.username !== undefined) {
    if (u.role === "admin" && input.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$|^admin@admin\.local$/.test(email)) throw new Error("Escribe un correo válido.");
    const rows = await db.select({ id: users.id, e: users.emailKey, u: users.usernameKey }).from(users).where(and(eq(users.orgId, orgId), or(eq(users.emailKey, email), eq(users.usernameKey, username))));
    for (const r of rows) { if (r.id === id) continue; if (r.e === email) throw new Error("Ya existe un usuario con ese correo."); if (r.u === username) throw new Error("Ya existe un usuario con ese nombre de usuario."); }
    if (input.email !== undefined) { set.email = email; set.emailKey = email; }
    if (input.username !== undefined) { set.username = username; set.usernameKey = username; }
  }
  if (input.active !== undefined && input.active !== u.active) {
    if (u.role === "admin" && !input.active) throw new Error("El administrador no se puede desactivar.");
    set.active = input.active;
    if (!input.active) set.sessionVersion = sql`${users.sessionVersion} + 1` as unknown as number; // cierra sus sesiones abiertas
  }
  if (!Object.keys(set).length) return strip(u);
  const [row] = await db.update(users).set(set).where(eq(users.id, id)).returning();
  await db.insert(auditLog).values({ orgId, actor: actorId, action: "user.update", entity: id, detail: { fields: Object.keys(set).filter((k) => k !== "sessionVersion") } });
  return strip(row);
}

/** Restablece la contraseña (solo el administrador): genera una temporal, cierra las sesiones del usuario y lo obliga a cambiarla. */
export async function resetPassword(db: Db, orgId: string, actorId: string, id: string): Promise<{ user: PublicUser; tempPassword: string }> {
  await assertAdmin(db, orgId, actorId);
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, orgId)));
  if (!u) throw new Error("Usuario no encontrado.");
  if (u.role === "admin") throw new Error("La contraseña del administrador es APP_PASSWORD (variable de Vercel); se cambia allá.");
  const temp = tempPassword();
  const [row] = await db.update(users).set({ passwordHash: await hashPassword(temp), mustChangePassword: true, failedAttempts: 0, lockedUntil: null, resetRequestedAt: null, sessionVersion: sql`${users.sessionVersion} + 1` as unknown as number }).where(eq(users.id, id)).returning();
  await db.insert(auditLog).values({ orgId, actor: actorId, action: "user.reset_password", entity: id });
  return { user: strip(row), tempPassword: temp };
}

/** El propio usuario cambia su contraseña (con la actual). Cierra sus otras sesiones y quita la obligación de cambiarla. */
export async function changeOwnPassword(db: Db, orgId: string, userId: string, current: string, next: string): Promise<User> {
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.orgId, orgId)));
  if (!u) throw new Error("Usuario no encontrado.");
  if (!u.passwordHash) throw new Error("La contraseña del administrador es APP_PASSWORD (variable de Vercel); se cambia allá.");
  if (!(await verifyPassword(current, u.passwordHash))) throw new Error("La contraseña actual no es correcta.");
  const issue = passwordIssue(next);
  if (issue) throw new Error(issue);
  if (next === current) throw new Error("La nueva contraseña debe ser distinta de la actual.");
  const [row] = await db.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, sessionVersion: sql`${users.sessionVersion} + 1` as unknown as number }).where(eq(users.id, userId)).returning();
  await db.insert(auditLog).values({ orgId, actor: userId, action: "user.change_password", entity: userId });
  return row;
}

/** Cambia el nombre propio. Correo y usuario solo los cambia el administrador. */
export async function updateOwnName(db: Db, orgId: string, userId: string, name: string) {
  await db.update(users).set({ name: validateName(name) }).where(and(eq(users.id, userId), eq(users.orgId, orgId)));
}

/** Quien olvidó su contraseña la solicita; no se envía nada y la respuesta es siempre igual (no revela si el usuario existe). */
export async function requestReset(db: Db, orgId: string, identifier: string) {
  const key = normEmail(identifier);
  if (!key) return;
  await db.update(users).set({ resetRequestedAt: new Date() }).where(and(eq(users.orgId, orgId), eq(users.role, "user"), eq(users.active, true), or(eq(users.emailKey, key), eq(users.usernameKey, key))));
}
