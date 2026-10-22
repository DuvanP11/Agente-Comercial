import type { Connector, ConnectorResult, ConnectorStatus, RawProspect, SearchCriteria } from "./types";

/**
 * Directorio empresarial: Registro Mercantil de las Cámaras de Comercio (RUES), publicado como datos abiertos por Confecámaras en
 * datos.gov.co. Licencia CC BY-SA 4.0: se debe citar la fuente. Trae razón social, actividad económica (CIIU), cámara de comercio,
 * estado de la matrícula y NIT del propietario; NO trae teléfono, correo, web ni dirección.
 */
export const DATASET = "nb3d-v3n7"; // «Establecimientos - Agencias - Sucursales»
export const DATASET_URL = `https://www.datos.gov.co/d/${DATASET}`;
const ENDPOINT = `https://www.datos.gov.co/resource/${DATASET}.json`;
export const ATTRIBUTION = "Datos: Confecámaras – Registro Mercantil (RUES), vía datos.gov.co, licencia CC BY-SA 4.0.";

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Cámaras de Comercio (valores exactos del campo camara_comercio, comprobados en el conjunto de datos). */
export const CHAMBERS = [
  "MEDELLIN PARA ANTIOQUIA", "BOGOTA", "CALI", "BUCARAMANGA", "BARRANQUILLA", "CUCUTA", "VILLAVICENCIO", "CARTAGENA", "HUILA", "IBAGUE", "PEREIRA",
  "SANTA MARTA PARA EL MAGDALENA", "ARMENIA", "ABURRA SUR", "PASTO", "CAUCA", "MONTERIA", "MANIZALES", "TUNJA", "VALLEDUPAR", "FACATATIVA", "PALMIRA",
  "ORIENTE ANTIOQUENO", "CASANARE", "LA GUAJIRA", "SINCELEJO", "FLORENCIA PARA EL CAQUETA", "BARRANCABERMEJA", "SUR Y ORIENTE DEL TOLIMA", "URABA", "DUITAMA",
  "GIRARDOT", "TULUA", "CARTAGO", "BUENAVENTURA", "CHOCÓ", "PUTUMAYO", "BUGA", "HONDA", "MAGDALENA MEDIO", "SOGAMOSO", "AGUACHICA", "LA DORADA", "DOSQUEBRADAS",
  "IPIALES", "TUMACO", "MAGANGUE", "SAN ANDRES", "OCANA", "SOACHA", "PIEDEMONTE ARAUCANO", "ARAUCA", "SAN JOSE", "PAMPLONA", "SANTA ROSA DE CABAL", "AMAZONAS", "CHINCHINA", "SEVILLA",
];

/** Ciudades que dependen de una cámara con otro nombre o que comparten jurisdicción. */
const CITY_TO_CHAMBERS: Record<string, string[]> = {
  MEDELLIN: ["MEDELLIN PARA ANTIOQUIA"], ENVIGADO: ["ABURRA SUR"], ITAGUI: ["ABURRA SUR"], SABANETA: ["ABURRA SUR"], BELLO: ["MEDELLIN PARA ANTIOQUIA"],
  NEIVA: ["HUILA"], POPAYAN: ["CAUCA"], YOPAL: ["CASANARE"], RIOHACHA: ["LA GUAJIRA"], QUIBDO: ["CHOCÓ"], MOCOA: ["PUTUMAYO"], "SANTA MARTA": ["SANTA MARTA PARA EL MAGDALENA"],
  FLORENCIA: ["FLORENCIA PARA EL CAQUETA"], "BOGOTA D C": ["BOGOTA"], BOGOTA: ["BOGOTA"], "CUCUTA": ["CUCUTA"], "RIONEGRO": ["ORIENTE ANTIOQUENO"], APARTADO: ["URABA"], "SAN ANDRES": ["SAN ANDRES"],
  "FUSAGASUGA": ["BOGOTA"], CHIA: ["BOGOTA"], ZIPAQUIRA: ["BOGOTA"], "MOSQUERA": ["FACATATIVA"], "LA CALERA": ["BOGOTA"],
};

export function chambersFor(city: string): string[] {
  const c = norm(city).replace(/ D C$/, "");
  if (CITY_TO_CHAMBERS[c]) return CITY_TO_CHAMBERS[c];
  const exact = CHAMBERS.filter((x) => norm(x) === c);
  if (exact.length) return exact;
  return CHAMBERS.filter((x) => c.length >= 4 && norm(x).split(" ").includes(c));
}

/** Rubros → código CIIU Rev. 4 A.C. de la actividad principal. Cada código se comprobó contra el conjunto de datos (nombres típicos de ese rubro en Bogotá). */
const CIIU: { words: string[]; code: string }[] = [
  { words: ["PANADERIA", "PAN ", "PASTELERIA", "REPOSTERIA"], code: "1081" },
  { words: ["FERRETERIA", "TORNILLO", "MATERIALES DE CONSTRUCCION"], code: "4752" },
  { words: ["PAPELERIA", "UTILES"], code: "4761" },
  { words: ["FARMACIA", "DROGUERIA", "COSMETIC", "PERFUMERIA", "BELLEZA", "MAQUILLAJE"], code: "4773" },
  { words: ["ROPA", "BOUTIQUE", "MODA", "CONFECCION", "PRENDAS", "VESTIDO"], code: "4771" },
  { words: ["ZAPATERIA", "CALZADO"], code: "4772" },
  { words: ["RESTAURANTE"], code: "5611" },
  { words: ["CAFETERIA", "CAFE "], code: "5613" },
  { words: ["PELUQUERIA", "SALON DE BELLEZA", "BARBERIA", "ESTETICA"], code: "9602" },
  { words: ["TIENDA", "SUPERMERCADO", "MINIMERCADO", "ABARROTES"], code: "4711" },
  { words: ["FLORISTERIA", "FLORES", "REGALOS"], code: "4774" },
  { words: ["TECNOLOGIA", "COMPUTADOR", "COMPUTO", "CELULAR"], code: "4741" },
  { words: ["ELECTRODOMESTIC"], code: "4754" },
];

/** CIIU por rubro. Un rubro puede encajar en varios códigos (p. ej. «cosmética y moda»). */
export function ciiuFor(category: string): string[] {
  const c = ` ${norm(category)} `;
  const out = CIIU.filter((x) => x.words.some((w) => c.includes(w.endsWith(" ") ? ` ${w}` : w))).map((x) => x.code);
  return [...new Set(out)];
}

const sq = (s: string) => s.replace(/'/g, "''");
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(\-\/.])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s);

interface Row { codigo_camara?: string; camara_comercio?: string; matricula?: string; razon_social?: string; cod_ciiu_act_econ_pri?: string; nit_propietario?: string; digito_verificacion?: string; ultimo_ano_renovado?: string }

export class BusinessDirectoryConnector implements Connector {
  id = "business_directory";
  label = "Directorio empresarial (RUES · gratis)";
  capabilities = ["empresas por actividad y ciudad", "NIT", "sin teléfono ni correo"];
  constructor(private fetchImpl: typeof fetch = fetch, private now: () => Date = () => new Date()) {}

  status(): ConnectorStatus { return { state: "connected" }; }

  async search(c: SearchCriteria, signal?: AbortSignal): Promise<ConnectorResult> {
    const errors: string[] = [], notes: string[] = [];
    if (c.requireContact) return { prospects: [], errors: ["Este directorio no trae teléfono, correo ni web, así que con «Solo negocios con teléfono, correo o web» no habría resultados. Desmarca esa casilla (el contacto se completa después en la ficha) o usa OpenStreetMap o Google."], notes };
    const chambers = chambersFor(c.city);
    if (!chambers.length) return { prospects: [], errors: [`No se reconoce una Cámara de Comercio para «${c.city}». Escribe la ciudad principal de la cámara (por ejemplo Bogotá, Medellín, Cali, Barranquilla, Bucaramanga, Cartagena…).`], notes };
    if (c.zones.length) notes.push("Este directorio no trae dirección ni barrio: las zonas no se pueden aplicar. La búsqueda cubre toda la jurisdicción de la cámara.");

    const mapped = c.categories.map((cat) => ({ cat, codes: ciiuFor(cat) }));
    const codes = [...new Set(mapped.flatMap((m) => m.codes))];
    const unmapped = mapped.filter((m) => !m.codes.length).map((m) => m.cat);
    const keywords = unmapped.flatMap((u) => norm(u).split(" ").filter((w) => w.length >= 4)).slice(0, 4);
    if (!codes.length && !keywords.length) return { prospects: [], errors: [`No pude relacionar ${c.categories.map((x) => `«${x}»`).join(", ")} con una actividad económica. Prueba con un rubro más común (panadería, ferretería, papelería, farmacia, ropa, restaurante, peluquería…).`], notes };
    if (unmapped.length && codes.length) notes.push(`Sin actividad económica asociada para ${unmapped.map((u) => `«${u}»`).join(", ")}: se buscó por palabras en el nombre.`);
    if (!codes.length) notes.push("Se buscó por palabras en el nombre de la empresa (sin actividad económica asociada): puede traer resultados menos precisos.");

    const year = String(this.now().getFullYear() - 1); // renovada el año pasado o este = negocio vivo
    const parts = [`estado_matricula='ACTIVA'`, `ultimo_ano_renovado >= '${year}'`, `camara_comercio in (${chambers.map((x) => `'${sq(x)}'`).join(",")})`];
    const rubro = [
      ...(codes.length ? [`cod_ciiu_act_econ_pri in (${codes.map((x) => `'${x.replace(/\D/g, "")}'`).join(",")})`] : []),
      ...keywords.map((k) => `upper(razon_social) like '%${sq(k)}%'`),
    ];
    parts.push(`(${rubro.join(" OR ")})`);
    for (const ex of c.excludeTerms.slice(0, 6)) { const t = norm(ex); if (t) parts.push(`upper(razon_social) not like '%${sq(t)}%'`); }

    const qs = new URLSearchParams({
      $select: "codigo_camara,camara_comercio,matricula,razon_social,cod_ciiu_act_econ_pri,nit_propietario,digito_verificacion,ultimo_ano_renovado",
      $where: parts.join(" AND "), $order: "ultimo_ano_renovado DESC, fecha_renovacion DESC", $limit: String(Math.min(60, c.maxResults * 2)),
    });
    const token = process.env.SOCRATA_APP_TOKEN?.trim();
    let rows: Row[];
    try {
      const res = await this.fetchImpl(`${ENDPOINT}?${qs}`, { signal: signal ?? AbortSignal.timeout(25_000), headers: { accept: "application/json", ...(token ? { "x-app-token": token } : {}) } });
      if (!res.ok) throw new Error(`datos.gov.co respondió ${res.status}`);
      rows = (await res.json()) as Row[];
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return { prospects: [], errors: [`No se pudo consultar el directorio (${/timeout|abort/i.test(m) ? "tardó demasiado" : m}). Es un servicio público: reintenta en unos minutos.`], notes };
    }

    const now = this.now(), seen = new Set<string>(), prospects: RawProspect[] = [];
    for (const r of rows) {
      const name = (r.razon_social ?? "").trim();
      if (!name) continue;
      const key = `${norm(name)}|${r.nit_propietario ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cat = mapped.find((m) => m.codes.includes(r.cod_ciiu_act_econ_pri ?? ""))?.cat ?? unmapped[0] ?? c.categories[0];
      prospects.push({
        name: titleCase(name), category: cat, website: null, phone: null, email: null, address: null, city: c.city,
        sourceName: "rues_datos_abiertos", sourceId: `${r.codigo_camara ?? "00"}-${r.matricula ?? name}`, sourceUrl: DATASET_URL,
        consultedAt: now, isDemo: false, nit: r.nit_propietario ? `${r.nit_propietario}${r.digito_verificacion ? `-${r.digito_verificacion}` : ""}` : null,
        limitations: `Registro Mercantil (RUES) vía datos.gov.co. Establecimiento con matrícula activa y renovada en ${r.ultimo_ano_renovado ?? "—"}; actividad CIIU ${r.cod_ciiu_act_econ_pri ?? "—"}. No trae teléfono, correo, web ni dirección. ${ATTRIBUTION}`,
      });
      if (prospects.length >= c.maxResults) break;
    }
    notes.push(`Datos del Registro Mercantil: son empresas reales con matrícula activa, pero sin datos de contacto. Complétalos en la ficha de cada una. ${ATTRIBUTION}`);
    return { prospects, errors, notes };
  }
}
