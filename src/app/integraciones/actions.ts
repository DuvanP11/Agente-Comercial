"use server";
import { logError } from "@/lib/log";
import { requireNotHunter } from "@/lib/session";
import { GooglePlacesConnector, type GoogleCheck } from "@/lib/connectors/google-places";

/** Prueba mínima de la clave de Google Places (la consulta más barata). */
export async function checkGooglePlacesAction(): Promise<GoogleCheck> {
  await requireNotHunter(); // el Hunter no usa este módulo
  try { return await new GooglePlacesConnector().check(); }
  catch (e) { logError("checkGooglePlacesAction falló:", e); return { state: "error", message: "No se pudo hacer la prueba." }; }
}
