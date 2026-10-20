import { and, eq } from "drizzle-orm";
import { getDb, ensureDefaultOrg } from "../db/client";
import { themeSettings } from "../db/schema";
import { PROVISIONAL_THEME, themeTokens, type ThemeTokens } from "./tokens";

export async function getActiveTheme(): Promise<ThemeTokens> {
  try {
    const db = await getDb();
    const org = await ensureDefaultOrg(db);
    const [row] = await db.select().from(themeSettings).where(and(eq(themeSettings.orgId, org), eq(themeSettings.isActive, true))).limit(1);
    const parsed = row ? themeTokens.safeParse(row.tokens) : null;
    return parsed?.success ? parsed.data : PROVISIONAL_THEME;
  } catch {
    return PROVISIONAL_THEME; // si la base falla, la interfaz sigue con el tema provisional
  }
}
