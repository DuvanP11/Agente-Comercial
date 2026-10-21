"use client";
import { useState, useTransition } from "react";
import { checkGooglePlacesAction } from "./actions";
import type { GoogleCheck as Result } from "@/lib/connectors/google-places";

export function GoogleCheck() {
  const [r, setR] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button className="btn" disabled={pending} onClick={() => start(async () => { try { setR(await checkGooglePlacesAction()); } catch { setR({ state: "error", message: "No se pudo hacer la prueba. Recarga la página e intenta de nuevo." }); } })}>{pending ? "Probando…" : "Probar clave de Google Places"}</button>
      <span className="ml-2 text-xs text-muted">Hace la consulta más barata posible (1 resultado, solo el id); no trae teléfonos ni webs.</span>
      {r && <p role="status" className={`text-sm ${r.state === "ok" ? "badge-ok" : "badge-bad"}`}>{r.state === "ok" ? "✔ " : "✘ "}{r.message}</p>}
    </div>
  );
}
