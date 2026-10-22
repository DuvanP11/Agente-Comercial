"use server";
import { requireNotHunter } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { themeSettings } from "@/lib/db/schema";
import { themeTokens } from "@/lib/theme/tokens";

export async function saveTheme(name: string, tokens: unknown) {
  await requireNotHunter(); // el Hunter no usa este módulo
  const parsed = themeTokens.safeParse(tokens);
  if (!parsed.success) return { error: "Tema inválido: " + parsed.error.issues[0]?.message };
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  await db.update(themeSettings).set({ isActive: false }).where(eq(themeSettings.orgId, org));
  await db.insert(themeSettings).values({ orgId: org, name: name.slice(0, 60) || "Mi tema", tokens: parsed.data, isActive: true });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Volver al diseño original: desactiva todos los temas guardados (los conserva). */
export async function resetTheme() {
  await requireNotHunter(); // el Hunter no usa este módulo
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  await db.update(themeSettings).set({ isActive: false }).where(and(eq(themeSettings.orgId, org)));
  revalidatePath("/", "layout");
  return { ok: true };
}
