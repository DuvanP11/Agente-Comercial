import { headers } from "next/headers";
import { ensureDefaultOrg, getDb } from "./db/client";
import type { Kind } from "./activity";
import { clientIp } from "./rate-limit";
import { getCurrentUser } from "./session";
import { logActivity } from "./services/activity";

/** Registra algo que hizo la persona de la sesión actual. Para acciones del servidor y rutas. Nunca lanza ni frena la acción. */
export async function track(kind: Kind, label: string, detail?: Record<string, unknown>, path?: string) {
  try {
    const [user, h] = await Promise.all([getCurrentUser(), headers()]);
    const db = await getDb();
    await logActivity(db, await ensureDefaultOrg(db), {
      kind, label, detail, path, ip: clientIp(h), userAgent: h.get("user-agent"),
      user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null,
    });
  } catch { /* el registro nunca debe romper nada */ }
}
