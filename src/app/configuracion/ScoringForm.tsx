"use client";
import { useState, useTransition } from "react";
import { CRITERION_LABELS, DEFAULT_WEIGHTS, type CriterionKey } from "@/lib/scoring/score";
import { resetScoringAction, saveScoringAction, type ConfigState } from "./actions";

const KEYS = Object.keys(DEFAULT_WEIGHTS) as CriterionKey[];
const HELP: Record<CriterionKey, string> = {
  icp_fit: "Qué tanto se parece al cliente ideal de PIBOX.",
  logistics_need: "Si se ve que despacha o necesita envíos.",
  delivery_volume: "Cuántas entregas podría generar.",
  delivery_frequency: "Qué tan seguido las necesitaría.",
  geo_compatibility: "Si está donde PIBOX opera.",
  operational_viability: "Si es viable atenderlo (horarios, acceso, etc.).",
  contact_channel: "Si hay teléfono, WhatsApp, web o correo para contactarlo.",
  evidence_quality: "Cuántos datos clave tienen evidencia registrada.",
};

export function ScoringForm({ weights, minCoverage }: { weights: Record<CriterionKey, number>; minCoverage: number }) {
  const [w, setW] = useState<Record<CriterionKey, string>>(() => Object.fromEntries(KEYS.map((k) => [k, String(weights[k])])) as Record<CriterionKey, string>);
  const [cov, setCov] = useState(String(Math.round(minCoverage * 100)));
  const [msg, setMsg] = useState<ConfigState | null>(null);
  const [pending, start] = useTransition();
  const total = KEYS.reduce((s, k) => s + (Number(w[k]) || 0), 0);

  const run = (p: Promise<ConfigState>) => start(async () => { try { setMsg(await p); } catch { setMsg({ error: "No se pudo completar. Recarga la página e inténtalo de nuevo." }); } });
  const restore = () => { setW(Object.fromEntries(KEYS.map((k) => [k, String(DEFAULT_WEIGHTS[k])])) as Record<CriterionKey, string>); setCov("40"); };

  return (
    <section className="card space-y-3" aria-label="Puntaje de prioridad">
      <div>
        <h2 className="font-semibold">Puntaje de prioridad</h2>
        <p className="text-sm text-muted">Cuánto pesa cada criterio al calcular la prioridad comercial. Los criterios desconocidos nunca suman. Los valores de arranque son provisionales, no están calibrados con datos de PIBOX.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {KEYS.map((k) => (
          <div key={k}>
            <label className="label" htmlFor={`w_${k}`}>{CRITERION_LABELS[k]}</label>
            <div className="flex items-center gap-2">
              <input id={`w_${k}`} className="input w-24" type="number" min={0} max={100} step={1} value={w[k]} onChange={(e) => setW((x) => ({ ...x, [k]: e.target.value }))} />
              <span className="text-xs text-muted">{total > 0 ? `${Math.round(((Number(w[k]) || 0) / total) * 100)} % del total` : ""}</span>
            </div>
            <p className="text-xs text-muted">{HELP[k]}</p>
          </div>
        ))}
      </div>
      <div>
        <label className="label" htmlFor="mincov">Cobertura mínima para mostrar prioridad (%)</label>
        <input id="mincov" className="input w-24" type="number" min={10} max={90} step={5} value={cov} onChange={(e) => setCov(e.target.value)} />
        <p className="text-xs text-muted">Se muestra prioridad solo si lo que se sabe pesa al menos este porcentaje del total. Más alto = más exigente y menos prioridades poco fiables.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={pending || total <= 0} onClick={() => run(saveScoringAction({ weights: Object.fromEntries(KEYS.map((k) => [k, Number(w[k])])), minCoverage: Number(cov) / 100 }))}>{pending ? "Guardando…" : "Guardar y recalcular"}</button>
        <button className="btn" disabled={pending} onClick={() => { restore(); run(resetScoringAction()); }}>Restaurar valores de arranque</button>
        <span className="text-xs text-muted">Suma de pesos: {total}</span>
      </div>
      <div role="status" aria-live="polite">
        {msg?.ok && <p className="badge-ok">{msg.ok}</p>}
        {msg?.error && <p role="alert" className="badge-bad">{msg.error}</p>}
      </div>
    </section>
  );
}
