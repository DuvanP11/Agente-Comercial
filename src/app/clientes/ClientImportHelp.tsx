import { ImportGuide, type GuideColumn } from "@/components/ImportGuide";

const COLUMNS: GuideColumn[] = [
  { name: "Nombre comercial", required: true, what: "Nombre con el que se conoce al cliente. Sin él la fila se omite.", example: "Droguería San Jorge", also: "nombre, empresa, razón social, cliente" },
  { name: "NIT", required: false, what: "NIT colombiano, con o sin puntos y con o sin dígito de verificación. Es el dato más fuerte para detectar que un prospecto ya es cliente.", example: "900.123.456-7", also: "documento" },
  { name: "Teléfono", required: false, what: "Celular o fijo colombiano.", example: "3105551234", also: "celular, móvil, tel" },
  { name: "Correo", required: false, what: "Correo corporativo con formato válido. Su dominio también ayuda a detectar duplicados (los correos gratuitos como gmail no cuentan).", example: "compras@sanjorge.co", also: "email, e-mail, mail" },
  { name: "Sitio web", required: false, what: "Dominio o sitio web de la empresa.", example: "sanjorge.co", also: "web, sitio, dominio, url, página" },
  { name: "Dirección", required: false, what: "Dirección completa.", example: "Av. 68 # 45-10", also: "direccion" },
  { name: "Ciudad", required: false, what: "Ciudad o municipio.", example: "Bogotá", also: "municipio" },
  { name: "Nombre legal", required: false, what: "Razón social registrada, si es distinta del nombre comercial.", example: "San Jorge S.A.S.", also: "razón social" },
  { name: "Identificador", required: false, what: "Código interno del cliente en tu sistema (para cruzarlo con otros reportes).", example: "CLI-0042", also: "id, identificador, código" },
  { name: "Estado comercial", required: false, what: "Texto libre: Activo, Inactivo, En pausa, etc.", example: "Activo", also: "estado" },
  { name: "Responsable", required: false, what: "Persona que atiende la cuenta.", example: "Laura Gómez", also: "asesor, ejecutivo" },
  { name: "Último contacto", required: false, what: "Fecha del último contacto, escrita como AAAA-MM-DD. Otros formatos (15/10/2026) no se reconocen y quedan vacíos.", example: "2026-10-15", also: "ultimo contacto, fecha" },
];

/** Cómo debe ir el archivo de clientes existentes. Coincide con lo que realmente lee el importador. */
export function ClientImportHelp() {
  return (
    <ImportGuide
      title="Cómo preparar y subir el archivo de clientes"
      steps={[
        "Exporta tu lista de clientes a Excel (.xlsx) o .csv con las columnas de la tabla de abajo (puedes descargar una plantilla de ejemplo).",
        "Pulsa «Seleccionar archivo», elige el archivo y luego «Ver vista previa».",
        "Revisa el mapeo de columnas (la app propone cuál es cuál; puedes cambiarlo) y las filas con problemas.",
        "Confirma. Los prospectos que busques o importes desde ese momento se comparan con estos clientes: si coinciden, se marcan como duplicado y no se contactan como nuevos (los que ya tenías guardados antes no se vuelven a revisar).",
      ]}
      columns={COLUMNS}
      fileName="plantilla-clientes.csv"
      templateRows={[
        ["Droguería San Jorge (ejemplo)", "900.123.456-7", "3105551234", "compras@sanjorge.co", "sanjorge.co", "Av. 68 # 45-10", "Bogotá", "San Jorge S.A.S.", "CLI-0042", "Activo", "Laura Gómez", "2026-10-15"],
      ]}
      rules={[
        "Formato: .xlsx o .csv (en CSV, UTF-8 para que se vean las tildes; la coma o el punto y coma se detectan solos). No se admite .xls antiguo.",
        "Primera fila = nombres de columna. Desde la segunda fila va un cliente por fila.",
        "Excel con varias hojas: solo se lee la primera hoja.",
        "Tamaño: máximo 5 MB y 20.000 filas.",
        "Celdas vacías se quedan vacías: la app nunca inventa datos. Una fila sin nombre comercial se omite.",
        "NIT, teléfono o correo que no se reconozcan se importan igual, pero no se usan para detectar duplicados (se avisa en la vista previa).",
        "Para cargar solo una vez cada cliente: si subes el mismo archivo dos veces, los clientes se duplican en la lista.",
      ]}
    />
  );
}
