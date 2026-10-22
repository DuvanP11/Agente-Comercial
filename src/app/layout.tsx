import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { NAV } from "@/lib/nav";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "./cuenta/actions";
import { BrandLogo } from "@/components/BrandLogo";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { getBrandInfo, type BrandInfo } from "@/lib/services/brand";
import { getActiveTheme } from "@/lib/theme/server";
import { resolveTheme, themeCss } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

async function brand(): Promise<BrandInfo> {
  try { const db = await getDb(); return await getBrandInfo(db, await ensureDefaultOrg(db)); } catch { return { hasLogo: false, hasIcon: false, tint: true, iconTint: true, version: "0" }; }
}

export async function generateMetadata(): Promise<Metadata> {
  const [b, t] = await Promise.all([brand(), getActiveTheme()]);
  const { light, dark } = resolveTheme(t);
  // La versión incluye los colores: al cambiar el diseño, la pestaña pide el ícono de nuevo con el color nuevo.
  const v = `${b.version}-${light.primary.slice(1)}${dark ? dark.primary.slice(1) : ""}-${b.tint ? 1 : 0}${b.iconTint ? 1 : 0}`;
  return { title: "PIBOX Commercial Intelligence", icons: { icon: [{ url: `/brand/favicon?v=${v}`, type: "image/svg+xml" }] } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [theme, b, user] = await Promise.all([getActiveTheme(), brand(), getCurrentUser()]);
  return (
    <html lang="es">
      <head><style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} /></head>
      <body>
        {user ? (
          <AppShell items={NAV.filter((n) => !n.adminOnly || user.role === "admin")} user={{ name: user.name, email: user.email, role: user.role }} logout={logoutAction}
            brand={<div><BrandLogo version={b.version} tint={b.tint} height={30} /><div className="mt-1 text-xs text-muted">Commercial Intelligence</div></div>}>
            {children}
          </AppShell>
        ) : children}
      </body>
    </html>
  );
}
