import { HelpPanel } from "@/components/Insight";
import { TemplateDownload } from "./TemplateDownload";

const COLUMNS: { name: string; required: boolean; what: string; example: string; also: string }[] = [
  { name: "Nombre", required: true, what: "Nombre comercial de la empresa. Sin él la fila se omite.", example: "Panadería La Espiga", also: "nombre comercial, empresa, razón social, negocio" },
  { name: "Categoría", required: false, what: "Rubro o sector del negocio.", example: "Panadería", also: "categoria, sector, actividad, tipo" },
  { name: "Teléfono", required: false, what: "Celular o fijo colombiano. Puedes poner varios separados por «;», «/» o coma.", example: "3105551234; 6015551234", also: "celular, móvil, tel" },
  { name: "Correo", required: false, what: "Un correo electrónico con formato válido.", example: "ventas@laespiga.co", also: "email, e-mail, mail" },
  { name: "Web", required: false, what: "Sitio web del negocio.", example: "https://laespiga.co", also: "sitio, dominio, url, página" },
  { name: "Dirección", required: false, what: "Dirección completa.", example: "Calle 45 # 12-30", also: "direccion" },
  { name: "Ciudad", required: false, what: "Ciudad o municipio.", example: "Bogotá", also: "municipio" },
];

/** Cómo debe ir el archivo: formato, columnas y reglas. Coincide con lo que realmente lee el importador. */
export function ImportHelp() {
  return (
    <HelpPanel title="Cómo preparar y subir el archivo" open>
      <section className="space-y-1">
        <h3 className="font-semibold">Pasos</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Prepara tu lista en Excel (<b>.xlsx</b>) o en <b>.csv</b> con las columnas de la tabla de abajo. Puedes descargar una plantilla de ejemplo.</li>
          <li>Pulsa «Seleccionar archivo», elige el archivo y luego <b>Ver vista previa</b>.</li>
          <li>Revisa el mapeo de columnas (la app propone cuál columna es cuál; puedes cambiarlo) y las filas con problemas.</li>
          <li>Pulsa <b>Confirmar e importar</b>. Cada prospecto se compara con tus clientes y prospectos; nada se fusiona solo.</li>
        </ol>
        <TemplateDownload />
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold">Columnas (7 en total; solo el nombre es obligatorio)</h3>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Columna</th><th>¿Obligatoria?</th><th>Qué debe llevar</th><th>Ejemplo</th><th>Otros nombres que la app reconoce</th></tr></thead>
            <tbody>
              {COLUMNS.map((c) => (
                <tr key={c.name}><td><b>{c.name}</b></td><td>{c.required ? <span className="badge-bad">Sí</span> : "No"}</td><td>{c.what}</td><td><code>{c.example}</code></td><td className="text-muted">{c.also}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Puedes llamar a las columnas como quieras: si el nombre no coincide, en la vista previa eliges a mano cuál es cuál. Las columnas que no corresponden a ninguna se ignoran.</p>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold">Reglas del archivo</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Formato:</b> .xlsx o .csv (en CSV, codificación UTF-8 para que las tildes se vean bien; la coma o el punto y coma como separador se detectan solos). No se admite .xls antiguo.</li>
          <li><b>Primera fila = nombres de columna.</b> Desde la segunda fila van los prospectos, uno por fila.</li>
          <li><b>Excel con varias hojas:</b> solo se lee la <b>primera hoja</b>.</li>
          <li><b>Tamaño:</b> máximo 5 MB y 20.000 filas.</li>
          <li><b>Celdas vacías</b> se quedan vacías: la app nunca inventa datos. Una fila sin nombre se omite.</li>
          <li><b>Teléfonos:</b> si un número no se reconoce, se importa igual pero no se usa para detectar duplicados ni para WhatsApp. Si un correo tiene formato inválido, pasa lo mismo.</li>
          <li><b>Fórmulas:</b> se lee el resultado calculado, no la fórmula.</li>
          <li><b>Origen:</b> los datos quedan marcados como «tomados de un archivo cargado por el usuario», no como verificados.</li>
        </ul>
      </section>
    </HelpPanel>
  );
}
