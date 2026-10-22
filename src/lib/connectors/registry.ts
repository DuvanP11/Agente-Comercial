import type { Connector } from "./types";
import { GooglePlacesConnector } from "./google-places";
import { BusinessDirectoryConnector } from "./business-directory";
import { OpenStreetMapConnector } from "./openstreetmap";

/** Conectores implementados. Los demás (web, Gmail…) están pendientes y se listan en Integraciones. */
export function getConnectors(): Connector[] {
  return [new OpenStreetMapConnector(), new BusinessDirectoryConnector(), new GooglePlacesConnector()];
}

/** Integraciones que no son un «conector de búsqueda»: qué hay hoy (siempre honesto) y qué falta para el siguiente paso, con quién lo hace. */
export interface IntegrationNote { id: string; label: string; badge: string; tone: "ok" | "warn" | "off"; why: string; steps?: string[] }
export const PENDING_CONNECTORS: IntegrationNote[] = [
  { id: "linkedin_api", label: "LinkedIn", badge: "Asistido (activo)", tone: "ok",
    why: "LinkedIn no ofrece una API pública de búsqueda de empresas ni permite extraer sus datos automáticamente (hacerlo violaría sus condiciones). Hoy: en Buscar clientes se arman los enlaces de búsqueda y se guarda a mano cada empresa con su enlace como fuente; Sales Navigator se exporta e importa." },
  { id: "web_research", label: "Investigación web", badge: "Parcial (activo)", tone: "ok",
    why: "En la ficha de cada prospecto con sitio web, «Buscar contacto en su sitio web» lee su página pública (inicio y páginas de contacto) y sugiere teléfono, correo y WhatsApp, con la página de origen como evidencia. Respeta robots.txt y no entra a redes internas. No hay un buscador general de internet: no se usa porque sus condiciones no permiten extraer resultados." },
  { id: "gmail", label: "Gmail (correo)", badge: "Asistido por correo", tone: "warn",
    why: "Hoy, «Abrir correo» en cada campaña abre tu programa de correo con el mensaje aprobado ya escrito; tú lo envías. Para enviar desde la plataforma sin ese paso hace falta conectar Gmail API.",
    steps: ["Un administrador de Google Workspace crea (o usa) un proyecto en Google Cloud y habilita «Gmail API».", "Configura la pantalla de consentimiento OAuth como «Interna» y crea un cliente OAuth (aplicación web) con la URL de retorno de la plataforma.", "Alternativa sin pedir permiso a cada persona: una cuenta de servicio con delegación de dominio y el alcance de envío, autorizada por el administrador.", "Guarda el ID y el secreto del cliente como variables de entorno en Vercel (nunca en el chat ni en el repositorio) y avisa para construir el envío.", "El envío seguirá exigiendo que un mensaje esté aprobado por una persona."] },
  { id: "whatsapp_business", label: "WhatsApp Business Platform", badge: "Asistido (wa.me)", tone: "warn",
    why: "Hoy, «Abrir WhatsApp» abre el chat con el mensaje aprobado y la persona lo envía. La comunicación automática con el cliente por WhatsApp requiere la plataforma oficial de Meta.",
    steps: ["Crear (o usar) la cuenta de Meta Business de PIBOX y verificar la empresa.", "Registrar en WhatsApp Business Platform un número exclusivo para la plataforma (no puede estar en uso en la app de WhatsApp).", "Crear y enviar a aprobación las plantillas de mensaje: para escribirle primero a un cliente potencial, Meta exige plantillas aprobadas, y cobra por conversación.", "Generar el token permanente y el identificador del número, y configurar el webhook para recibir respuestas.", "Guardar el token como variable de entorno en Vercel y avisar para construir el envío y la recepción de respuestas. Se mantendrán la aprobación humana, el máximo de intentos y «No contactar»."] },
];
