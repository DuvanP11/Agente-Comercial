import type { Connector } from "./types";
import { GooglePlacesConnector } from "./google-places";
import { BusinessDirectoryConnector } from "./business-directory";
import { OpenStreetMapConnector } from "./openstreetmap";

/** Conectores implementados. Los demás (web, Gmail…) están pendientes y se listan en Integraciones. */
export function getConnectors(): Connector[] {
  return [new OpenStreetMapConnector(), new BusinessDirectoryConnector(), new GooglePlacesConnector()];
}

export const PENDING_CONNECTORS = [
  { id: "linkedin_api", label: "LinkedIn (conexión automática)", why: "LinkedIn no ofrece una API pública de búsqueda de empresas ni permite extraer sus datos automáticamente. Se usa el flujo asistido en Buscar clientes (enlaces + captura manual) y la importación de archivos." },
  { id: "web_research", label: "Investigación web", why: "Requiere proveedor de búsqueda y respetar robots.txt/condiciones (fase 5)." },
  { id: "gmail", label: "Gmail (OAuth 2.0)", why: "Fase 7." },
  { id: "whatsapp_business", label: "WhatsApp Business Platform", why: "Fase 7. Hoy solo se abre un enlace wa.me para que el usuario revise y envíe." },
];
