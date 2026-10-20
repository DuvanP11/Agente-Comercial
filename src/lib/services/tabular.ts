import ExcelJS from "exceljs";
import Papa from "papaparse";

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 20_000;

/** Neutraliza fórmulas al reexportar: una celda que empieza por = + - @ se ejecuta en Excel. */
export function sanitizeCell(v: string): string {
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}

function cellToString(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;       // hipervínculo
    if ("result" in v && v.result != null) return String(v.result);      // fórmula
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

export async function parseTable(fileName: string, data: ArrayBuffer): Promise<ParsedTable> {
  if (data.byteLength > MAX_UPLOAD_BYTES) throw new Error(`El archivo supera ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  const ext = fileName.toLowerCase().split(".").pop();

  let matrix: string[][];
  if (ext === "csv" || ext === "txt") {
    const text = new TextDecoder("utf-8").decode(data).replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    matrix = parsed.data.map((r) => r.map((c) => String(c ?? "").trim()));
  } else if (ext === "xlsx") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("El libro de Excel no tiene hojas.");
    matrix = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      matrix.push(values.map((c) => cellToString(c as ExcelJS.CellValue).trim()));
    });
  } else {
    throw new Error("Formato no soportado. Usa .csv o .xlsx.");
  }

  if (matrix.length < 2) throw new Error("El archivo no tiene filas de datos.");
  if (matrix.length - 1 > MAX_ROWS) throw new Error(`El archivo supera ${MAX_ROWS} filas.`);
  const headers = matrix[0].map((h, i) => h || `columna_${i + 1}`);
  const rows = matrix.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  return { headers, rows };
}
