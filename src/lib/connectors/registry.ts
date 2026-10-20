import type { Connector } from "./types";
import { GooglePlacesConnector } from "./google-places";
import { OpenStreetMapConnector } from "./openstreetmap";

/** Conectores implementados. Los demás (LinkedIn, directorios, web) están pendientes y se listan en Integraciones. */
export function getConnectors(): Connector[] {
  return [new OpenStreetMapConnector(), new GooglePlacesConnector()];
}

export const PENDING_CONNECTORS = [
  { id: "linkedin", label: "LinkedIn", why: "Requiere una integración autorizada por LinkedIn; mientras tanto, flujo asistido por el usuario (fase 7)." },
  { id: "business_directory", label: "Directorios empresariales", why: "Falta elegir proveedor autorizado (fase 5)." },
  { id: "web_research", label: "Investigación web", why: "Requiere proveedor de búsqueda y respetar robots.txt/condiciones (fase 5)." },
  { id: "gmail", label: "Gmail (OAuth 2.0)", why: "Fase 7." },
  { id: "whatsapp_business", label: "WhatsApp Business Platform", why: "Fase 7. Hoy solo se abre un enlace wa.me para que el usuario revise y envíe." },
  { id: "ai_provider", label: "Proveedor de IA", why: "Fase 4: interpretación de lenguaje natural, análisis y redacción." },
];
