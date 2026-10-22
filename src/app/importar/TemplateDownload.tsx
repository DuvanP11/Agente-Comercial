"use client";

const HEADER = ["Nombre", "Categoría", "Teléfono", "Correo", "Web", "Dirección", "Ciudad"];
const ROWS = [
  ["Panadería La Espiga (ejemplo)", "Panadería", "3105551234", "ventas@laespiga.co", "https://laespiga.co", "Calle 45 # 12-30", "Bogotá"],
  ["Ferretería El Tornillo (ejemplo)", "Ferretería", "6015551234; 3115550000", "", "", "Carrera 7 # 80-10", "Bogotá"],
];
const cell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Plantilla .csv con UTF-8 (BOM) para que Excel respete las tildes. Se arma en el navegador. */
export function TemplateDownload() {
  const csv = "﻿" + [HEADER, ...ROWS].map((r) => r.map(cell).join(",")).join("\r\n");
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  return <p><a className="btn" href={href} download="plantilla-prospectos.csv">Descargar plantilla de ejemplo (.csv)</a> <span className="text-xs text-muted">Borra las 2 filas de ejemplo antes de cargar tu lista.</span></p>;
}
