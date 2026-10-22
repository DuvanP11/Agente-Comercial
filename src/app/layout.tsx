import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
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
  const [theme, b] = await Promise.all([getActiveTheme(), brand()]);
  return (
    <html lang="es">
      <head><style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} /></head>
      <body>
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-border bg-surface md:w-64 md:shrink-0 md:border-b-0 md:border-r">
            <div className="px-5 pt-5"><BrandLogo version={b.version} tint={b.tint} /><div className="mt-1 text-xs text-muted">Commercial Intelligence</div></div>
            <Sidebar />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
