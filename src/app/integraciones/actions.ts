"use server";
import { GooglePlacesConnector, type GoogleCheck } from "@/lib/connectors/google-places";

/** Prueba mínima de la clave de Google Places (la consulta más barata). */
export async function checkGooglePlacesAction(): Promise<GoogleCheck> {
  try { return await new GooglePlacesConnector().check(); }
  catch (e) { console.error("checkGooglePlacesAction falló:", e); return { state: "error", message: "No se pudo hacer la prueba." }; }
}
