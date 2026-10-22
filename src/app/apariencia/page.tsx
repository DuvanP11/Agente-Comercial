import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { getBrandInfo } from "@/lib/services/brand";
import { getActiveTheme } from "@/lib/theme/server";
import { LogoManager } from "./LogoManager";
import { ThemeEditor } from "./ThemeEditor";

export const dynamic = "force-dynamic";

export default async function Apariencia() {
  const db = await getDb();
  const brand = await getBrandInfo(db, await ensureDefaultOrg(db));
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div><h1 className="text-2xl font-bold">Apariencia y marca</h1>
          <p className="text-sm text-muted">Cambia los colores, la forma y el logo. Todos los componentes leen estas variables: al cambiarlas se actualiza la aplicación completa, y el logo y el ícono de la pestaña cambian de color con el diseño.</p></div>
      </header>
      <LogoManager hasLogo={brand.hasLogo} hasIcon={brand.hasIcon} tint={brand.tint} version={brand.version} />
      <ThemeEditor initial={await getActiveTheme()} />
    </div>
  );
}
