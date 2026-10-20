import { getConnectors, PENDING_CONNECTORS } from "@/lib/connectors/registry";
import { authConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function Integraciones() {
  const rows = getConnectors().map((c) => ({ id: c.id, label: c.label, status: c.status() }));
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Integraciones</h1>
        <p className="text-sm text-muted">El estado se calcula en el servidor a partir de las variables de entorno realmente presentes; no se simula ninguna conexión.</p></header>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Integración</th><th>Estado</th><th>Configuración</th></tr></thead>
          <tbody>
            <tr><td>Acceso a la app (APP_PASSWORD)</td>
              <td><span className={`badge ${authConfigured() ? "badge-ok" : "badge-warn"}`}>{authConfigured() ? "Configurado" : "Pendiente"}</span></td>
              <td className="text-sm">Variables <code>APP_PASSWORD</code> y <code>AUTH_SECRET</code> (≥ 24 caracteres).</td></tr>
            <tr><td>Base de datos</td>
              <td><span className={`badge ${process.env.DATABASE_URL ? "badge-ok" : "badge-warn"}`}>{process.env.DATABASE_URL ? "PostgreSQL" : "PGlite local (solo desarrollo)"}</span></td>
              <td className="text-sm">Variable <code>DATABASE_URL</code>. Obligatoria en producción.</td></tr>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.label}</td>
                <td><span className={`badge ${r.status.state === "connected" ? "badge-ok" : "badge-warn"}`}>{r.status.state === "connected" ? "Clave presente (no probada)" : r.status.state === "not_configured" ? "Pendiente" : "Error"}</span></td>
                <td className="text-sm">{r.status.state === "not_configured" ? `Falta ${r.status.missing.join(", ")}. ${r.status.howTo}` : r.status.state === "error" ? r.status.message : "La clave existe; el primer uso real confirma si es válida."}</td></tr>
            ))}
            {PENDING_CONNECTORS.map((c) => (
              <tr key={c.id}><td>{c.label}</td><td><span className="badge">No implementado</span></td><td className="text-sm">{c.why}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
