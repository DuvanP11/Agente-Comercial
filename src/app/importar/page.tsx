import { ProspectImportForm } from "./ProspectImportForm";

export default function Importar() {
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Importar prospectos</h1>
        <p className="text-sm text-muted">Sube una lista propia (CSV o Excel) sin necesidad de ninguna API de pago. Los datos quedan marcados como “tomados de archivo cargado por el usuario”, no como verificados.</p></header>
      <ProspectImportForm />
    </div>
  );
}
