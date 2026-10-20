import { stripAccents } from "../dedup/normalize";
import { CRITERION_LABELS, type CriterionKey } from "../scoring/score";
import { DEFAULT_TEMPLATE, renderTemplate } from "../campaigns";

/**
 * Skills comerciales SIN IA: reglas fijas sobre datos reales del prospecto.
 * Cubren: investigación previa, preguntas de diagnóstico, manejo de objeciones, preparación de reunión
 * y resumen para el equipo. Todo lo que no esté en los datos se declara "por verificar", nunca como hecho.
 */

export type Sector = "belleza" | "moda" | "alimentos" | "salud" | "ferreteria" | "tecnologia" | "general";

const SECTORS: [Sector, string[]][] = [
  ["belleza", ["cosmet", "belleza", "perfumer", "maquillaje", "peluquer", "spa"]],
  ["moda", ["ropa", "moda", "vestuario", "boutique", "zapat", "calzado", "uniform", "cartera"]],
  ["alimentos", ["restaurante", "panader", "pasteler", "supermercado", "minimercado", "fruver", "carnicer", "licor", "cafe", "comida"]],
  ["salud", ["farmacia", "droguer", "optica", "veterinar", "salud", "clinica"]],
  ["ferreteria", ["ferreter", "repuesto", "autopart", "construcc", "pintur", "cerraj"]],
  ["tecnologia", ["electronic", "tecnolog", "celular", "computador", "papeler", "libreria"]],
];

export function detectSector(category: string | null | undefined, name?: string | null): Sector {
  const flat = stripAccents(`${category ?? ""} ${name ?? ""}`).toLowerCase();
  return SECTORS.find(([, stems]) => stems.some((s) => flat.includes(s)))?.[0] ?? "general";
}

export const SECTOR_LABEL: Record<Sector, string> = {
  belleza: "Belleza y cosmética", moda: "Moda y calzado", alimentos: "Alimentos y bebidas", salud: "Salud y droguería",
  ferreteria: "Ferretería y repuestos", tecnologia: "Tecnología y papelería", general: "General",
};

const SECTOR_QUESTIONS: Record<Sector, string[]> = {
  belleza: ["¿Venden por Instagram, WhatsApp o tienda en línea, además del local?", "¿Qué hacen con productos frágiles o líquidos al despacharlos?", "¿Hacen entregas el mismo día a clientes de la ciudad?"],
  moda: ["¿Qué porcentaje de sus pedidos son cambios o devoluciones de tallas?", "¿Venden por temporadas? ¿En cuáles suben más los despachos?", "¿Entregan a domicilio o los clientes recogen en tienda?"],
  alimentos: ["¿Sus entregas requieren tiempos cortos o cuidado de temperatura?", "¿En qué horarios se concentran los pedidos?", "¿Hoy reparten con personal propio o con terceros?"],
  salud: ["¿Hacen domicilios de medicamentos o productos de cuidado personal?", "¿Hay productos que exijan entrega a una persona específica?", "¿Cuántos domicilios hacen en un día normal?"],
  ferreteria: ["¿Despachan productos pesados o voluminosos?", "¿Atienden obras o clientes empresariales con entregas recurrentes?", "¿Qué zonas cubren hoy y cuáles no pueden atender?"],
  tecnologia: ["¿Los envíos son de alto valor y requieren seguro o verificación de entrega?", "¿Venden por plataformas en línea además del local?", "¿Cuántos envíos salen por semana?"],
  general: ["¿Venden productos físicos que deban entregarse a sus clientes?", "¿Tienen una tienda en línea o venden por redes sociales?"],
};

/** Preguntas que sirven para cualquier negocio y que cubren los criterios del scoring. */
const GENERAL_QUESTIONS = [
  "¿Cuántos envíos o entregas hacen a la semana, más o menos?",
  "¿Con qué frecuencia: todos los días, algunos días, por temporada?",
  "¿A qué zonas o ciudades entregan hoy? ¿Cuáles les cuesta cubrir?",
  "¿Tienen más de una sede o punto de despacho?",
  "¿Cómo hacen las entregas actualmente y qué es lo que más les molesta de eso?",
  "¿A qué hora necesitan que se recoja el pedido para entregarlo a tiempo?",
  "¿Quién decide la contratación de un servicio de mensajería?",
];

export interface Objection { objection: string; response: string; caution: string }

/** Base provisional. La podrá editar el equipo en "Entrenamiento de IA" (pendiente). */
export const OBJECTIONS: Objection[] = [
  { objection: "Ya trabajamos con otra mensajería.", response: "Entiendo, y no se trata de cambiar lo que ya funciona. ¿Qué entregas les cuestan más hoy o dónde han tenido fallas? Podríamos probar con un volumen pequeño y comparar.", caution: "No hables mal de la competencia." },
  { objection: "Es muy caro.", response: "Para comparar bien, ¿me cuentas cuánto pagan hoy por envío y a qué zonas? Así revisamos con números reales.", caution: "No des tarifas ni descuentos que PIBOX no haya aprobado. Si no tienes la tarifa oficial, ofrece enviarla." },
  { objection: "Enviamos muy poco.", response: "Con poco volumen lo importante es no perder tiempo en coordinar. ¿Cuántos envíos hacen a la semana y quién los gestiona?", caution: "Si el volumen es muy bajo, valida si conviene seguir antes de insistir." },
  { objection: "No confío en un servicio nuevo.", response: "Es razonable. ¿Qué necesitarían ver para sentirse tranquilos: seguimiento del envío, prueba con pocos pedidos, referencias?", caution: "No prometas coberturas, seguros ni tiempos de entrega sin respaldo documentado de PIBOX." },
  { objection: "Ahora no es buen momento.", response: "Claro. ¿Cuándo sería mejor retomarlo? Puedo escribirte en esa fecha con información concreta.", caution: "Agenda un seguimiento con fecha en la campaña y respétalo." },
  { objection: "Lo tiene que decidir otra persona.", response: "Gracias por decírmelo. ¿Con quién podría hablar y qué información le sería útil para evaluarlo?", caution: "Pide el contacto de quien decide; no lo asumas." },
];

export interface ApproachInput {
  name: string; category: string | null; city: string | null;
  phone: string | null; website: string | null; email: string | null; address: string | null;
  score: { priority: number | null; coverage: number; unknownCriteria: CriterionKey[] } | null;
  evidence: { field: string; observedValue: string; sourceName: string; verification: string }[];
  history: { type: string; to?: string; at: Date }[];
  doNotContact: boolean;
  status: string;
}

export type NextActionCode = "blocked" | "resolve_duplicate" | "complete_contact" | "assess" | "add_to_campaign" | "follow_up";
export interface Approach {
  sector: Sector;
  known: string[];
  unknown: string[];
  diagnosticQuestions: string[];
  objections: Objection[];
  toVerify: string[];
  meetingChecklist: string[];
  opening: string;
  nextAction: { code: NextActionCode; text: string };
}

const SOURCE_LABEL = (s: string) => (s === "user_input" ? "ingresado por el usuario" : s === "csv_import" ? "archivo cargado" : s === "openstreetmap" ? "OpenStreetMap" : s === "google_places" ? "Google Places" : s);

export function prepareApproach(i: ApproachInput): Approach {
  const sector = detectSector(i.category, i.name);

  // Qué sabemos: SOLO lo que está en los datos, con su fuente.
  const known: string[] = [];
  const srcOf = (field: string) => { const e = i.evidence.find((x) => x.field === field); return e ? ` (${SOURCE_LABEL(e.sourceName)})` : ""; };
  if (i.category) known.push(`Rubro registrado: ${i.category}.`);
  if (i.city) known.push(`Ciudad: ${i.city}.`);
  if (i.address) known.push(`Dirección: ${i.address}${srcOf("address")}.`);
  if (i.phone) known.push(`Teléfono: ${i.phone}${srcOf("phone")}.`);
  if (i.website) known.push(`Sitio web: ${i.website}${srcOf("website")}.`);
  if (i.email) known.push(`Correo: ${i.email}${srcOf("email")}.`);
  const contacted = i.history.filter((h) => h.type === "whatsapp_opened").length;
  if (contacted) known.push(`WhatsApp abierto ${contacted} vez/veces (no implica que se haya enviado).`);
  const stages = i.history.filter((h) => h.type === "campaign_status" && h.to).map((h) => h.to);
  if (stages.length) known.push(`Historial en campañas: ${stages.join(" → ")}.`);

  // Qué no sabemos.
  const unknown: string[] = [];
  if (!i.phone) unknown.push("Teléfono de contacto.");
  if (!i.website) unknown.push("Sitio web o tienda en línea (no sabemos si vende online).");
  if (!i.email) unknown.push("Correo de contacto.");
  unknown.push("Volumen y frecuencia de sus envíos.", "Cómo entregan hoy y con qué proveedor.", "Quién decide la contratación.");

  const toVerify: string[] = [];
  if (!i.score) toVerify.push("Aún no se han valorado los criterios comerciales (Analizar clientes).");
  else {
    if (i.score.priority === null) toVerify.push(`Información insuficiente para calcular prioridad (cobertura ${Math.round(i.score.coverage * 100)} %).`);
    for (const k of i.score.unknownCriteria) toVerify.push(`${CRITERION_LABELS[k]}: desconocido.`);
  }

  const diagnosticQuestions = [...SECTOR_QUESTIONS[sector], ...GENERAL_QUESTIONS];

  const meetingChecklist = [
    "Confirmar con quién hablas y su rol en la decisión.",
    "Llevar claras las preguntas de diagnóstico; escuchar más de lo que hablas.",
    "Tener a mano la tarifa y cobertura OFICIALES de PIBOX; si no las tienes, no las improvises.",
    "Anotar volumen, frecuencia y zonas con números concretos (no estimaciones tuyas).",
    "Cerrar con una próxima acción y una fecha, y registrarlas en la campaña.",
    ...(i.score?.unknownCriteria.length ? ["Resolver en la conversación los criterios desconocidos de la lista “Por verificar”."] : []),
  ];

  const opening = renderTemplate(DEFAULT_TEMPLATE, { empresa: i.name, ciudad: i.city, categoria: i.category }).text;

  let nextAction: Approach["nextAction"];
  if (i.doNotContact) nextAction = { code: "blocked", text: "No contactar: el prospecto pidió no recibir comunicaciones." };
  else if (i.status === "excluded_duplicate" || i.status === "needs_review") nextAction = { code: "resolve_duplicate", text: "Resolver primero el duplicado en la ficha." };
  else if (!i.phone && !i.email) nextAction = { code: "complete_contact", text: "Completar teléfono o correo en la ficha (puedes buscarlo en Google desde ahí)." };
  else if (!i.score || i.score.priority === null) nextAction = { code: "assess", text: "Valorar los criterios en Analizar clientes antes de abordarlo." };
  else if (stages.length || contacted) nextAction = { code: "follow_up", text: "Ya fue abordado: revisa su campaña y programa el seguimiento." };
  else nextAction = { code: "add_to_campaign", text: "Listo para abordar: agrégalo a una campaña y prepara el mensaje." };

  return { sector, known, unknown, diagnosticQuestions, objections: OBJECTIONS, toVerify, meetingChecklist, opening, nextAction };
}
