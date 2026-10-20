import { getActiveTheme } from "@/lib/theme/server";
import { ThemeEditor } from "./ThemeEditor";

export const dynamic = "force-dynamic";

export default async function Apariencia() {
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Apariencia y marca</h1>
        <p className="text-sm text-muted">Todos los componentes leen estas variables; al cambiarlas se actualiza la aplicación completa.</p></header>
      <ThemeEditor initial={await getActiveTheme()} />
    </div>
  );
}
