"use client";
import { useActionState, useState } from "react";
import { OutcomeTable } from "@/components/OutcomeTable";
import { commitProspectsAction, previewProspectsAction, type ProspectImportState } from "./actions";
import { PROSPECT_FIELDS } from "@/lib/services/prospect-import";

const LABELS: Record<string, string> = { name: "Nombre de la empresa *", category: "Categoría / sector", website: "Sitio web", phone: "Teléfono", email: "Correo", address: "Dirección", city: "Ciudad" };

export function ProspectImportForm() {
  const [prev, previewDispatch, previewing] = useActionState<ProspectImportState, FormData>(previewProspectsAction, { step: "idle" });
  const [done, commitDispatch, committing] = useActionState<ProspectImportState, FormData>(commitProspectsAction, { step: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const state = done.step !== "idle" ? done : prev;
  const withFile = (fd: FormData) => { if (file) fd.set("file", file); fd.set("mapping", JSON.stringify(mapping)); return fd; };

  return (
    <div className="space-y-4">
      <form action={(fd) => previewDispatch(withFile(fd))} className="card space-y-3">
        <div><label className="label" htmlFor="pfile">Archivo CSV o Excel (.xlsx, máx. 5 MB)</label>
          <input id="pfile" name="file" type="file" accept=".csv,.xlsx" className="input" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMapping({}); }} /></div>
        <button className="btn btn-primary" disabled={previewing || !file}>{previewing ? "Leyendo…" : "Ver vista previa"}</button>
      </form>

      {state.step === "error" && <p role="alert" className="card badge-bad">{state.error}</p>}

      {done.step === "done" && (
        <div className="card space-y-2">
          <p role="status" className="font-semibold">Se procesaron {done.outcomes!.length} prospectos ({done.outcomes!.filter((o) => o.status === "already_stored").length} ya estaban guardados){done.skipped ? `; ${done.skipped} filas sin nombre se omitieron` : ""}. Cada uno se comparó con tus clientes y prospectos.</p>
          <OutcomeTable outcomes={done.outcomes!} />
        </div>
      )}

      {prev.step === "preview" && done.step !== "done" && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Mapeo de columnas</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PROSPECT_FIELDS.map((f) => (
              <div key={f}><label className="label" htmlFor={`pm-${f}`}>{LABELS[f]}</label>
                <select id={`pm-${f}`} className="input" value={mapping[f] ?? prev.mapping?.[f] ?? ""} onChange={(e) => setMapping({ ...prev.mapping, ...mapping, [f]: e.target.value })}>
                  <option value="">— no importar —</option>{prev.headers!.map((h) => <option key={h}>{h}</option>)}</select></div>))}
          </div>
          <p className="text-xs text-muted">Si cambias el mapeo, pulsa “Ver vista previa” de nuevo para recalcular.</p>
          <h2 className="font-semibold">Vista previa ({prev.valid} de {prev.total} filas válidas; se muestran 25)</h2>
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Línea</th><th>Empresa</th><th>Categoría</th><th>Teléfono</th><th>Web</th><th>Problemas</th></tr></thead>
            <tbody>{prev.preview!.map((r) => (
              <tr key={r.line}><td>{r.line}</td><td>{r.values.name}</td><td>{r.values.category}</td><td>{r.values.phone}</td><td>{r.values.website}</td>
                <td>{r.errors.map((e) => <div key={e} className="badge-bad">{e}</div>)}{r.warnings.map((e) => <div key={e} className="badge-warn">{e}</div>)}</td></tr>))}</tbody></table></div>
          <form action={(fd) => commitDispatch(withFile(fd))}>
            <button className="btn btn-primary" disabled={committing || !prev.valid}>{committing ? "Guardando…" : `Confirmar e importar ${prev.valid} prospectos`}</button>
            <span className="ml-3 text-xs text-muted">Se comparan con clientes y prospectos existentes; nada se fusiona solo.</span>
          </form>
        </div>
      )}
    </div>
  );
}
