import { ImportGuide, type GuideColumn } from "@/components/ImportGuide";

const COLUMNS: GuideColumn[] = [
  { name: "Nombre", required: true, what: "Nombre comercial de la empresa. Sin él la fila se omite.", example: "Panadería La Espiga", also: "nombre comercial, empresa, razón social, negocio" },
  { name: "Categoría", required: false, what: "Rubro o sector del negocio.", example: "Panadería", also: "categoria, sector, actividad, tipo" },
  { name: "Teléfono", required: false, what: "Celular o fijo colombiano. Puedes poner varios separados por «;», «/» o coma.", example: "3105551234; 6015551234", also: "celular, móvil, tel" },
  { name: "Correo", required: false, what: "Un correo electrónico con formato válido.", example: "ventas@laespiga.co", also: "email, e-mail, mail" },
  { name: "Web", required: false, what: "Sitio web del negocio.", example: "https://laespiga.co", also: "sitio, dominio, url, página" },
  { name: "Dirección", required: false, what: "Dirección completa.", example: "Calle 45 # 12-30", also: "direccion" },
  { name: "Ciudad", required: false, what: "Ciudad o municipio.", example: "Bogotá", also: "municipio" },
];

/** Cómo debe ir el archivo de prospectos. Coincide con lo que realmente lee el importador. */
export function ImportHelp() {
  return (
    <ImportGuide
      title="Cómo preparar y subir el archivo"
      steps={[
        "Prepara tu lista en Excel (.xlsx) o en .csv con las columnas de la tabla de abajo. Puedes descargar una plantilla de ejemplo.",
        "Pulsa «Seleccionar archivo», elige el archivo y luego «Ver vista previa».",
        "Revisa el mapeo de columnas (la app propone cuál columna es cuál; puedes cambiarlo) y las filas con problemas.",
        "Pulsa «Confirmar e importar». Cada prospecto se compara con tus clientes y prospectos; nada se fusiona solo.",
      ]}
      columns={COLUMNS}
      fileName="plantilla-prospectos.csv"
      templateRows={[
        ["Panadería La Espiga (ejemplo)", "Panadería", "3105551234", "ventas@laespiga.co", "https://laespiga.co", "Calle 45 # 12-30", "Bogotá"],
        ["Ferretería El Tornillo (ejemplo)", "Ferretería", "6015551234; 3115550000", "", "", "Carrera 7 # 80-10", "Bogotá"],
      ]}
      rules={[
        "Formato: .xlsx o .csv (en CSV, codificación UTF-8 para que las tildes se vean bien; la coma o el punto y coma como separador se detectan solos). No se admite .xls antiguo.",
        "Primera fila = nombres de columna. Desde la segunda fila van los prospectos, uno por fila.",
        "Excel con varias hojas: solo se lee la primera hoja.",
        "Tamaño: máximo 5 MB y 20.000 filas.",
        "Celdas vacías se quedan vacías: la app nunca inventa datos. Una fila sin nombre se omite.",
        "Teléfonos: si un número no se reconoce, se importa igual pero no se usa para detectar duplicados ni para WhatsApp. Si un correo tiene formato inválido, pasa lo mismo.",
        "Fórmulas: se lee el resultado calculado, no la fórmula.",
        "Origen: los datos quedan marcados como «tomados de un archivo cargado por el usuario», no como verificados.",
      ]}
    />
  );
}
