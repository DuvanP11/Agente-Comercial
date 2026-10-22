import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfigured, makeSessionToken, readSession, SESSION_COOKIE, SESSION_MAX_AGE } from "./auth";
import { ensureDefaultOrg, getDb } from "./db/client";
import { strip, userForSession, type PublicUser, type User } from "./services/users";

/** Usuario simulado para desarrollo local sin APP_PASSWORD/AUTH_SECRET (en producción nunca se usa: el middleware bloquea). */
const DEV_ADMIN: PublicUser = {
  id: "dev", orgId: "dev", email: "dev@local", emailKey: "dev@local", username: "dev", usernameKey: "dev", name: "Desarrollo", role: "admin",
  mustChangePassword: false, active: true, sessionVersion: 0, failedAttempts: 0, lockedUntil: null, resetRequestedAt: null, lastLoginAt: null, createdBy: null, createdAt: new Date(0),
};

/** Usuario de la sesión actual (activo y con sesión vigente), o null. */
export async function getCurrentUser(): Promise<PublicUser | null> {
  if (!authConfigured()) return process.env.NODE_ENV === "production" ? null : DEV_ADMIN;
  const payload = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  try {
    const db = await getDb();
    const u = await userForSession(db, await ensureDefaultOrg(db), payload.u, payload.v);
    return u ? strip(u) : null;
  } catch { return null; }
}

export async function requireUser(): Promise<PublicUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<PublicUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

export async function startSession(user: Pick<User, "id" | "sessionVersion" | "mustChangePassword">) {
  (await cookies()).set(SESSION_COOKIE, await makeSessionToken({ u: user.id, v: user.sessionVersion, m: user.mustChangePassword }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() { (await cookies()).delete(SESSION_COOKIE); }
