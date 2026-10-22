import { TEMPLATE_VARS } from "./campaigns";

/**
 * Mensajes base para empezar. Ninguno trae precios, descuentos, garantías ni tiempos: esos datos solo los pone una persona
 * (la IA y la aprobación los rechazan si no están en la campaña).
 */
export const MESSAGE_TEMPLATES: { id: string; label: string; goal: string; body: string }[] = [
  { id: "presentacion", label: "Presentación", goal: "Primer contacto cordial",
    body: "Hola, equipo de {empresa} 👋 Somos PIBOX Mensajería y trabajamos con negocios de {ciudad}. Nos encantaría conocer cómo gestionan hoy sus entregas y ver si podemos ayudarles. ¿Con quién podríamos hablar?" },
  { id: "pregunta", label: "Pregunta abierta", goal: "Abrir conversación sobre su operación",
    body: "Hola, {empresa}. En PIBOX ayudamos a negocios de {categoria} a mover sus pedidos. ¿Hoy cómo hacen sus envíos y qué es lo que más les complica? Con gusto les cuento cómo lo hacemos." },
  { id: "propuesta", label: "Con propuesta de valor", goal: "Presentar el beneficio y proponer una llamada",
    body: "Hola, equipo de {empresa}. Somos PIBOX Mensajería. Pensamos que podríamos hacer más simples las entregas de su negocio en {ciudad}. ¿Les parece si coordinamos una llamada corta para contarles?" },
  { id: "seguimiento", label: "Seguimiento", goal: "Retomar un contacto sin respuesta",
    body: "Hola de nuevo, equipo de {empresa}. Les escribimos hace unos días desde PIBOX Mensajería. ¿Alcanzaron a ver nuestro mensaje? Quedamos atentos para resolver cualquier duda." },
  { id: "cierre", label: "Cierre amable", goal: "Último intento, sin presión",
    body: "Hola, {empresa}. Este es nuestro último mensaje para no incomodarlos. Si más adelante necesitan apoyo con sus entregas, aquí estamos. ¡Mucho éxito con el negocio! — PIBOX Mensajería" },
];

/** Defensa para pruebas: ninguna plantilla usa una variable que el sistema no conozca. */
export const templateVarsUsed = (body: string) => [...new Set([...body.matchAll(/\{([a-zA-Z_áéíóúñ]+)\}/g)].map((m) => m[1]))].filter((v) => !(TEMPLATE_VARS as readonly string[]).includes(v));
