"use client";
import { useActionState, useState } from "react";
import { commitAction, previewAction, type ImportState } from "./actions";
import { CLIENT_FIELDS } from "@/lib/services/clients";

const FIELD_LABELS: Record<string, string> = {
  externalId: "Identificador interno", name: "Nombre comercial *", legalName: "Nombre legal", nit: "NIT",
  website: "Dominio / sitio web", phone: "Teléfono", email: "Correo corporativo", address: "Dirección",
  city: "Ciudad", commercialStatus: "Estado comercial", accountOwner: "Responsable", lastContactAt: "Último contacto",
};

export function ImportForm() {
  const [prev, previewDispatch, previewing] = useActionState<ImportState, FormData>(previewAction, { step: "idle" });
  const [done, commitDispatch, committing] = useActionState<ImportState, FormData>(commitAction, { step: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const state = done.step !== "idle" ? done : prev;
  const withFile = (fd: FormData) => { if (file) fd.set("file", file); fd.set("mapping", JSON.stringify(mapping)); return fd; };

  return (
    <div className="space-y-4">
      <form action={(fd) => previewDispatch(withFile(fd))} className="card space-y-3">
        <div>
          <label className="label" htmlFor="file">Archivo CSV o Excel (.xlsx, máx. 5 MB)</label>
          <input id="file" name="file" type="file" accept=".csv,.xlsx" className="input"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMapping({}); }} />
        </div>
        <button className="btn btn-primary" disabled={previewing || !file}>{previewing ? "Leyendo…" : "Ver vista previa"}</button>
      </form>

      {state.step === "error" && <p role="alert" className="card badge-bad">{state.error}</p>}

      {state.step === "done" && (
        <div role="status" className="card">
          <p className="font-semibold badge-ok">Importados {state.imported} clientes.</p>
          {!!state.skipped?.length && (
            <p className="mt-1 text-sm">Se omitieron {state.skipped.length} filas con errores (líneas: {state.skipped.slice(0, 20).map((s) => s.line).join(", ")}).</p>
          )}
        </div>
      )}

      {prev.step === "preview" && done.step !== "done" && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Mapeo de columnas</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CLIENT_FIELDS.map((f) => (
              <div key={f}>
                <label className="label" htmlFor={`m-${f}`}>{FIELD_LABELS[f]}</label>
                <select id={`m-${f}`} className="input" value={mapping[f] ?? prev.mapping?.[f] ?? ""}
                  onChange={(e) => setMapping({ ...prev.mapping, ...mapping, [f]: e.target.value })}>
                  <option value="">— no importar —</option>
                  {prev.headers!.map((h) => <option key={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">Cambiar el mapeo y pulsar “Ver vista previa” de nuevo recalcula los errores.</p>
          <h2 className="font-semibold">Vista previa ({prev.total} filas; se muestran 25)</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Línea</th><th>Nombre</th><th>NIT</th><th>Teléfono</th><th>Web</th><th>Problemas</th></tr></thead>
              <tbody>
                {prev.preview!.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td><td>{r.values.name}</td><td>{r.values.nit}</td><td>{r.values.phone}</td><td>{r.values.website}</td>
                    <td>{r.errors.map((e) => <div key={e} className="badge-bad">{e}</div>)}{r.warnings.map((e) => <div key={e} className="badge-warn">{e}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={(fd) => commitDispatch(withFile(fd))}>
            <button className="btn btn-primary" disabled={committing}>{committing ? "Guardando…" : `Confirmar e importar ${prev.total} filas`}</button>
            <span className="ml-3 text-xs text-muted">Las filas sin nombre se omiten; nada se borra ni se fusiona.</span>
          </form>
        </div>
      )}
    </div>
  );
}
