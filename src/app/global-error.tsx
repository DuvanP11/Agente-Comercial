"use client";
import { explainError, shortDetail } from "@/lib/error-info";

/** Último recurso: si falla el diseño raíz, igual se muestra una salida (sin depender de estilos de la app). */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const info = explainError(error.message);
  return (
    <html lang="es"><body style={{ fontFamily: "system-ui", padding: 32, maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>{info.title}</h1>
      <p style={{ fontSize: 14 }}>{info.hint}</p>
      <button onClick={() => window.location.reload()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #94a3b8", cursor: "pointer" }}>Recargar la página</button>
      <details style={{ marginTop: 16, fontSize: 12, color: "#475569" }}><summary>Detalle técnico</summary><pre style={{ whiteSpace: "pre-wrap" }}>{shortDetail(error.message, error.digest)}</pre></details>
    </body></html>
  );
}
