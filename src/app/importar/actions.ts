"use server";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { ingestProspects, type IngestOutcome } from "@/lib/services/prospects";
import { previewProspects, suggestProspectMapping, toRawProspects, type ProspectMapping, type ProspectPreviewRow } from "@/lib/services/prospect-import";
import { parseTable } from "@/lib/services/tabular";

export interface ProspectImportState {
  step: "idle" | "preview" | "done" | "error";
  headers?: string[]; mapping?: ProspectMapping; preview?: ProspectPreviewRow[]; total?: number; valid?: number;
  outcomes?: IngestOutcome[]; skipped?: number; error?: string;
}

async function load(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Selecciona un archivo CSV o Excel (.xlsx).");
  const table = await parseTable(file.name, await file.arrayBuffer());
  const raw = fd.get("mapping");
  const mapping: ProspectMapping = raw && raw !== "{}" ? JSON.parse(String(raw)) : suggestProspectMapping(table.headers);
  return { file, table, mapping };
}

export async function previewProspectsAction(_: ProspectImportState, fd: FormData): Promise<ProspectImportState> {
  try {
    const { table, mapping } = await load(fd);
    const preview = previewProspects(table.rows, mapping);
    return { step: "preview", headers: table.headers, mapping, total: preview.length, valid: preview.filter((p) => !p.errors.length).length, preview: preview.slice(0, 25) };
  } catch (e) { return { step: "error", error: e instanceof Error ? e.message : "Error leyendo el archivo." }; }
}

export async function commitProspectsAction(_: ProspectImportState, fd: FormData): Promise<ProspectImportState> {
  try {
    const { file, table, mapping } = await load(fd);
    const preview = previewProspects(table.rows, mapping);
    const raws = toRawProspects(preview, file.name);
    const db = await getDb();
    const outcomes = await ingestProspects(db, await ensureDefaultOrg(db), raws);
    return { step: "done", outcomes, skipped: preview.length - raws.length };
  } catch (e) { return { step: "error", error: e instanceof Error ? e.message : "Error guardando." }; }
}
