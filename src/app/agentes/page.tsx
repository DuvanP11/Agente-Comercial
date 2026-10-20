import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { aiStatus } from "@/lib/ai/provider";
import { AGENTS, EXTRA_AGENTS, MATURITY_LABEL, SKILLS, type Maturity } from "@/lib/agents/catalog";
import { listRuns } from "@/lib/services/agents";

export const dynamic = "force-dynamic";
const TONE: Record<Maturity, string> = { ready: "badge-ok", logic: "badge-warn", partial: "", pending: "" };
const AGENT_LABEL: Record<string, string> = { search_interpreter: "Interpretación de búsqueda", qualification: "Calificación (propuesta)", drafting: "Redacción (borrador)" };

export default async function Agentes() {
  const db = await getDb();
  const runs = await listRuns(db, await ensureDefaultOrg(db), 25);
  const ai = aiStatus();
  const all = [...AGENTS, ...EXTRA_AGENTS];
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-bold">Agentes y skills</h1>
        <p className="text-sm text-muted">Estado real de cada agente. Ningún agente envía mensajes ni guarda datos por su cuenta: proponen, el código valida y tú apruebas.</p></header>

      <section className="card space-y-1" aria-label="Proveedor de IA">
        <h2 className="font-semibold">Proveedor de IA</h2>
        {ai.state === "connected" ? (
          <div className="space-y-1">
            <p className="text-sm">Cadena de proveedores, en orden. Si uno falla o agota su cupo, se pasa al siguiente y queda anotado:</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">{ai.providers.map((p) => (
              <li key={p.role}><span className="badge badge-ok">{p.role}</span> modelo <b>{p.model}</b> en <b>{p.host}</b>{p.local && <span className="badge ml-2">local</span>}</li>))}</ol>
            <p className="text-xs text-muted">Las claves existen; el primer uso real confirma si son válidas.</p>
          </div>
        ) : (
          <><p className="text-sm"><span className="badge badge-warn">Pendiente</span> Falta {ai.missing.join(", ")}.</p>
            <p className="text-sm text-muted">{ai.howTo} Sirve cualquier API compatible con OpenAI. Algunos proveedores tienen plan gratuito: verifica sus condiciones vigentes y que permitan enviar información de negocios.</p></>)}
        {ai.warnings.map((w) => <p key={w} role="alert" className="text-sm badge-warn">⚠ {w}</p>)}
        <p className="text-xs text-muted">Al proveedor no se le envían teléfonos ni correos de prospectos, solo si existen.</p>
      </section>

      <section className="card overflow-x-auto" aria-label="Agentes">
        <h2 className="mb-2 font-semibold">Agentes ({all.length})</h2>
        <table className="table"><thead><tr><th>#</th><th>Agente</th><th>Cómo funciona</th><th>Estado</th><th>Detalle</th></tr></thead>
          <tbody>{all.map((a) => (
            <tr key={a.n}><td>{a.n}</td><td><b>{a.name}</b>{a.ai && <span className="badge ml-2">usa IA</span>}</td><td className="text-sm">{a.how}</td>
              <td><span className={`badge ${TONE[a.status]}`}>{MATURITY_LABEL[a.status]}</span></td><td className="text-sm">{a.detail}</td></tr>))}</tbody></table>
        <p className="mt-2 text-xs text-muted">Los agentes con IA ya tienen su lógica, validaciones y pruebas; su botón en las pantallas se activa al configurar el proveedor, para que puedas probarlos con respuestas reales.</p>
      </section>

      <section className="card overflow-x-auto" aria-label="Skills">
        <h2 className="mb-2 font-semibold">Skills comerciales ({SKILLS.length})</h2>
        <table className="table"><thead><tr><th>Skill</th><th>Estado</th><th>Detalle</th></tr></thead>
          <tbody>{SKILLS.map((s) => (<tr key={s.name}><td><b>{s.name}</b></td><td><span className={`badge ${TONE[s.status]}`}>{MATURITY_LABEL[s.status]}</span></td><td className="text-sm">{s.detail}</td></tr>))}</tbody></table>
      </section>

      <section className="card overflow-x-auto" aria-label="Ejecuciones">
        <h2 className="mb-2 font-semibold">Últimas ejecuciones</h2>
        {runs.length === 0 ? <p className="text-sm text-muted">Aún no se ha ejecutado ningún agente.</p> : (
          <table className="table"><thead><tr><th>Cuándo</th><th>Agente</th><th>Estado</th><th>Modelo</th><th>Intentos</th><th>Duración</th><th>Avisos / error</th></tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.id}><td className="text-sm">{r.startedAt.toLocaleString("es-CO", { timeZone: "America/Bogota" })}</td>
                <td>{AGENT_LABEL[r.agent] ?? r.agent}</td>
                <td><span className={`badge ${r.status === "completed" ? "badge-ok" : r.status === "failed" ? "badge-bad" : ""}`}>{r.status === "completed" ? "Completada" : r.status === "failed" ? "Falló" : "En curso"}</span></td>
                <td className="text-sm">{r.model}</td><td>{r.attempts}</td><td className="text-sm">{r.durationMs === null ? "—" : `${(r.durationMs / 1000).toFixed(1)} s`}</td>
                <td className="text-sm">{r.error ?? (Array.isArray(r.warnings) && r.warnings.length ? `${r.warnings.length} aviso(s)` : "—")}</td></tr>))}</tbody></table>)}
      </section>
    </div>
  );
}
