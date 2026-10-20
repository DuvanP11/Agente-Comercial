"use client";
import { useState, useTransition } from "react";
import { testConnectionAction } from "./actions";
import type { ProviderCheck } from "@/lib/ai/provider";

const TONE: Record<ProviderCheck["state"], string> = { ok: "badge-ok", model_not_found: "badge-bad", auth: "badge-bad", unreachable: "badge-bad", unknown: "badge-warn", error: "badge-bad" };
const LABEL: Record<ProviderCheck["state"], string> = { ok: "Correcto", model_not_found: "Modelo no existe", auth: "Clave rechazada", unreachable: "Sin conexión", unknown: "No comprobable", error: "Error" };

export function TestConnection() {
  const [checks, setChecks] = useState<ProviderCheck[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button className="btn" disabled={pending} onClick={() => start(async () => setChecks((await testConnectionAction()).checks))}>{pending ? "Probando…" : "Probar conexión"}</button>
      <span className="ml-2 text-xs text-muted">Solo pide la lista de modelos; no envía datos de prospectos.</span>
      {checks && checks.length === 0 && <p className="text-sm text-muted">No hay proveedores configurados.</p>}
      {checks?.map((c) => (
        <div key={c.role} className="rounded border border-border p-3 text-sm">
          <p><span className="badge">{c.role}</span> <b>{c.host}</b> · modelo escrito: <code>{c.model}</code> <span className={`badge ml-2 ${TONE[c.state]}`}>{LABEL[c.state]}</span></p>
          <p className="mt-1">{c.message}</p>
          {c.state === "model_not_found" && c.models.length > 0 && (
            <details className="mt-1" open><summary className="cursor-pointer underline">Modelos disponibles ({c.models.length}) — copia uno tal cual en AI_MODEL</summary>
              <ul className="mt-1 columns-2 text-xs">{c.models.map((m) => <li key={m}><code>{m}</code></li>)}</ul></details>)}
        </div>))}
    </div>
  );
}
