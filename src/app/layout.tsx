import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getActiveTheme } from "@/lib/theme/server";
import { tokensToCssVars } from "@/lib/theme/tokens";

export const metadata: Metadata = { title: "PIBOX Commercial Intelligence" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const vars = tokensToCssVars(await getActiveTheme());
  return (
    <html lang="es" style={vars as React.CSSProperties}>
      <body>
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-border bg-surface md:w-64 md:shrink-0 md:border-b-0 md:border-r">
            <div className="px-5 pt-5 text-base font-bold">PIBOX <span className="text-muted font-normal">Commercial Intelligence</span></div>
            <Sidebar />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
