"use server";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { commitImport, previewImport, suggestMapping, type ColumnMapping, type PreviewRow } from "@/lib/services/clients";
import { parseTable } from "@/lib/services/tabular";

export interface ImportState {
  step: "idle" | "preview" | "done" | "error";
  headers?: string[]; mapping?: ColumnMapping; preview?: PreviewRow[]; total?: number;
  imported?: number; skipped?: { line: number; errors: string[] }[]; error?: string;
}

async function load(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Selecciona un archivo CSV o Excel (.xlsx).");
  const table = await parseTable(file.name, await file.arrayBuffer());
  const raw = formData.get("mapping");
  const mapping: ColumnMapping = raw ? JSON.parse(String(raw)) : suggestMapping(table.headers);
  return { table, mapping };
}

export async function previewAction(_: ImportState, formData: FormData): Promise<ImportState> {
  try {
    const { table, mapping } = await load(formData);
    const preview = previewImport(table.rows, mapping);
    return { step: "preview", headers: table.headers, mapping, total: preview.length, preview: preview.slice(0, 25) };
  } catch (e) {
    return { step: "error", error: e instanceof Error ? e.message : "Error leyendo el archivo." };
  }
}

export async function commitAction(_: ImportState, formData: FormData): Promise<ImportState> {
  try {
    const { table, mapping } = await load(formData);
    const preview = previewImport(table.rows, mapping);
    const db = await getDb();
    const res = await commitImport(db, await ensureDefaultOrg(db), preview, "usuario");
    return { step: "done", imported: res.imported, skipped: res.skipped };
  } catch (e) {
    return { step: "error", error: e instanceof Error ? e.message : "Error guardando la importación." };
  }
}
