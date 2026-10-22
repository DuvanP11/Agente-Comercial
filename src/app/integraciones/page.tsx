import { getConnectors, PENDING_CONNECTORS } from "@/lib/connectors/registry";
import { authConfigured } from "@/lib/auth";
import { aiStatus } from "@/lib/ai/provider";
import { GoogleCheck } from "./GoogleCheck";
import { oauthConfig } from "@/lib/google-oauth";
import { dailyCap } from "@/lib/services/gmail";

const NO_KEY = new Set(["openstreetmap", "business_directory"]); // fuentes públicas: no usan clave

export const dynamic = "force-dynamic";

export default function Integraciones() {
  const ai = aiStatus();
  const gmailOn = !!oauthConfig();
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
            <tr><td>Proveedor de IA (compatible con OpenAI)</td>
              <td><span className={`badge ${ai.state === "connected" ? "badge-ok" : "badge-warn"}`}>{ai.state === "connected" ? "Configurado (no probado)" : "Pendiente"}</span></td>
              <td className="text-sm">{ai.state === "connected" ? ai.providers.map((p) => `${p.role}: ${p.model} en ${p.host}${p.local ? " (local)" : ""}`).join(" → ") : `Falta ${ai.missing.join(", ")}. ${ai.howTo}`}
                {ai.warnings.map((w) => <span key={w} className="mt-1 block badge-warn">⚠ {w}</span>)}</td></tr>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.label}</td>
                <td><span className={`badge ${r.status.state === "connected" ? "badge-ok" : "badge-warn"}`}>{r.status.state === "connected" ? (NO_KEY.has(r.id) ? "Disponible (sin clave)" : "Clave presente (no probada)") : r.status.state === "not_configured" ? "Pendiente" : "Error"}</span></td>
                <td className="text-sm">{r.status.state === "not_configured" ? `Falta ${r.status.missing.join(", ")}. ${r.status.howTo}` : r.status.state === "error" ? r.status.message : NO_KEY.has(r.id) ? (r.id === "business_directory" ? "Datos abiertos del Registro Mercantil (Confecámaras, datos.gov.co). No requiere clave; trae empresas y NIT, sin teléfono ni correo." : "Servicio público gratuito; a veces tarda o se satura.") : "La clave existe; el primer uso real confirma si es válida."}</td></tr>
            ))}
            <tr><td>Gmail (envío desde la plataforma)</td>
              <td><span className={`badge ${gmailOn ? "badge-ok" : "badge-warn"}`}>{gmailOn ? "Credenciales presentes (no probado con Google)" : "Pendiente"}</span></td>
              <td className="text-sm">{gmailOn ? <>Cada persona conecta su propio Gmail desde una campaña y envía con su cuenta (tope de {dailyCap()} por día y persona). Solo se pide el permiso de <b>enviar</b>; no se lee la bandeja. El primer envío real confirma que todo quedó bien.</> : <>Falta <code>GOOGLE_OAUTH_CLIENT_ID</code> y <code>GOOGLE_OAUTH_CLIENT_SECRET</code>. Mientras tanto, «Abrir correo» abre tu programa de correo con el mensaje ya escrito.</>}
                <details className="mt-2"><summary className="cursor-pointer underline">Qué hay que hacer para conectarlo</summary>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    <li>En Google Cloud, proyecto de PIBOX: habilitar «Gmail API».</li>
                    <li>Pantalla de consentimiento OAuth: tipo «Interna» (así solo entran cuentas del dominio) y agregar el alcance <code>gmail.send</code>.</li>
                    <li>Crear un ID de cliente OAuth de tipo «Aplicación web» con la URI de redireccionamiento autorizada <code>https://&lt;dominio de la plataforma&gt;/api/gmail/callback</code>.</li>
                    <li>En Vercel (como «Sensitive») cargar <code>GOOGLE_OAUTH_CLIENT_ID</code> y <code>GOOGLE_OAUTH_CLIENT_SECRET</code>; opcional <code>GMAIL_TOKEN_KEY</code> (clave propia para cifrar los permisos guardados) y <code>GMAIL_DAILY_CAP</code> (tope diario por persona, 150 por defecto). Volver a desplegar.</li>
                    <li>Cada persona entra a una campaña → «Conectar mi Gmail». Cada envío exige un mensaje aprobado por una persona y respeta «No contactar» y el máximo de intentos.</li>
                  </ol></details></td></tr>
            {PENDING_CONNECTORS.map((c) => (
              <tr key={c.id}><td>{c.label}</td>
                <td><span className={`badge ${c.tone === "ok" ? "badge-ok" : c.tone === "warn" ? "badge-warn" : ""}`}>{c.badge}</span></td>
                <td className="text-sm">{c.why}
                  {c.steps && <details className="mt-2"><summary className="cursor-pointer underline">Qué hay que hacer para conectarlo</summary><ol className="mt-1 list-decimal space-y-1 pl-5">{c.steps.map((st) => <li key={st}>{st}</li>)}</ol><p className="mt-1 text-xs text-muted">Pasos según la documentación del proveedor; confírmalos con quien administra la cuenta.</p></details>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {process.env.GOOGLE_PLACES_API_KEY?.trim() && (
        <section className="card space-y-2" aria-label="Google Places">
          <h2 className="font-semibold">Google Places</h2>
          <GoogleCheck />
          <p className="text-xs text-muted">Cobra por consulta, y teléfono y web son de una tarifa superior a los datos básicos: define un presupuesto y un límite diario de solicitudes en Google Cloud.</p>
          <p className="text-xs text-muted">Los términos de Google Maps Platform limitan cómo se pueden guardar sus datos. Esta plataforma guarda los resultados como prospectos: confirma con tu área legal o el administrador de Google Cloud que ese uso está permitido para tu cuenta.</p>
        </section>
      )}
    </div>
  );
}
