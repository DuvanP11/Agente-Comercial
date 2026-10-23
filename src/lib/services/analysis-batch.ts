import { and, eq } from "drizzle-orm";
import { waitFromMessage, type AiProvider } from "../ai/provider";
import type { Db } from "../db/client";
import { prospects } from "../db/schema";
import { DEFAULT_WEIGHTS, type CriterionKey } from "../scoring/score";
import { proposeAssessment } from "./agents";
import { saveAssessment, type StoredScore } from "./analysis";

/** Marca de quien firma una valoración que hizo la IA y nadie ha revisado. Una persona que guarda la valoración la reemplaza con su propia firma. */
export const AI_ACTOR = "IA (sin revisar)";
export const isAiScore = (s: StoredScore | null | undefined) => !!s && s.assessedBy === AI_ACTOR;

export interface BatchItem { prospectId: string; name: string; state: "saved" | "skipped" | "error"; priority: number | null; reason?: string }
export interface AnalyzeSaveResult {
  items: BatchItem[]; saved: number; skipped: number; failed: number; pending: number; stopped?: string;
  /** Si se detuvo por el límite del proveedor: cuántos segundos pidió esperar (si lo informó) y qué prospectos quedaron sin analizar de esta tanda. */
  retryAfterSec?: number; remaining?: string[];
}

/**
 * Analiza varios prospectos con la IA y GUARDA cada valoración marcada «IA (sin revisar)».
 * Salvaguardas: la IA nunca deja un criterio como «confirmado» (lo impone su agente), una valoración de la IA no permite calificar
 * al prospecto hasta que una persona la revise y la guarde, no se pisa lo que ya valoró una persona salvo que se pida,
 * hay tope por llamada y de tiempo, y el lote se DETIENE si el proveedor de IA llegó a su límite.
 */
export async function analyzeAndSaveBatch(
  db: Db, orgId: string, prospectIds: string[], provider: AiProvider | null,
  opts: { includeRated?: boolean; max?: number; deadlineMs?: number; now?: () => number } = {},
): Promise<AnalyzeSaveResult> {
  const now = opts.now ?? Date.now;
  const max = opts.max ?? 5, deadline = now() + (opts.deadlineMs ?? 45_000);
  const ids = [...new Set(prospectIds)].slice(0, 60);
  const items: BatchItem[] = [];
  let saved = 0, stopped: string | undefined, retryAfterSec: number | undefined;
  const remaining: string[] = [];
  const skip = (prospectId: string, name: string, reason: string) => items.push({ prospectId, name, state: "skipped", priority: null, reason });
  if (!provider) return { items: ids.map((prospectId) => ({ prospectId, name: "", state: "error" as const, priority: null, reason: "La IA no está configurada." })), saved: 0, skipped: 0, failed: ids.length, pending: 0, stopped: "La IA no está configurada (ver Integraciones)." };

  for (const id of ids) {
    const [p] = await db.select().from(prospects).where(and(eq(prospects.id, id), eq(prospects.orgId, orgId)));
    if (!p) { skip(id, "", "No encontrado."); continue; }
    if (p.status === "excluded_duplicate" || p.status === "needs_review") { skip(id, p.name, "Tiene un duplicado sin resolver."); continue; }
    if (p.doNotContact) { skip(id, p.name, "Marcado «No contactar»."); continue; }
    const cur = p.scoreJson as StoredScore | null;
    if (cur && !opts.includeRated) { skip(id, p.name, "Ya tiene una valoración."); continue; }
    if (stopped) { skip(id, p.name, stopped); remaining.push(id); continue; }
    if (saved >= max) { skip(id, p.name, "Límite por llamada: se continúa en la siguiente."); remaining.push(id); continue; }
    if (now() > deadline) { stopped = "Se agotó el tiempo de esta tanda: se continúa en la siguiente."; skip(id, p.name, stopped); remaining.push(id); continue; }

    const r = await proposeAssessment(db, orgId, id, provider, AI_ACTOR);
    if (!r.ok || !r.output) {
      const rateLimited = /límite de uso|Ningún proveedor/i.test(r.error ?? "");
      if (rateLimited) {
        // No es un fallo de este prospecto: se queda pendiente y se repite cuando el proveedor lo permita.
        retryAfterSec = waitFromMessage(r.error) ?? undefined;
        stopped = `El proveedor de IA alcanzó su límite de uso: se detuvo el lote.${retryAfterSec ? "" : " Reintenta en unos minutos."}`;
        skip(id, p.name, stopped); remaining.push(id);
      } else items.push({ prospectId: id, name: p.name, state: "error", priority: null, reason: r.error ?? "La IA no pudo analizarlo." });
      continue;
    }
    // Lo «desconocido» no se guarda (no suma ni resta), igual que en el formulario manual.
    const input: Partial<Record<CriterionKey, unknown>> = {};
    for (const a of r.output.assessments) {
      if (a.kind === "unknown" || !(a.criterion in DEFAULT_WEIGHTS)) continue;
      input[a.criterion] = { kind: a.kind, value: a.value, evidenceIds: a.evidenceIds, note: (a.note ?? "").slice(0, 500) || undefined };
    }
    try {
      const s = await saveAssessment(db, orgId, id, input, AI_ACTOR);
      items.push({ prospectId: id, name: p.name, state: "saved", priority: s.priority });
      saved++;
    } catch (e) { items.push({ prospectId: id, name: p.name, state: "error", priority: null, reason: e instanceof Error ? e.message : "No se pudo guardar." }); }
  }
  return { items, saved, skipped: items.filter((x) => x.state === "skipped").length, failed: items.filter((x) => x.state === "error").length,
    pending: items.filter((x) => x.state === "skipped" && /se continúa en la siguiente/.test(x.reason ?? "")).length, stopped, retryAfterSec, remaining };
}
