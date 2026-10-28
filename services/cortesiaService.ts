/**
 * Conversación natural en las redes sociales (M-3): agradecimientos y cierres, clientes fuera de la zona de
 * entrega y respuesta corta cuando el bot no entiende, con frases variadas y memoria corta por conversación.
 *
 * Independiente del canal: lo usa instagramFlowService (Instagram y Messenger) y lo reutilizará TikTok (F5).
 * WhatsApp NO lo usa: su flujo de compra es cerrado a propósito.
 * Las frases salen de settings.messages de la marca (listas); aquí solo hay respaldos neutros.
 */
const configManager = require("./configManager");

export type IntencionSocial = "agradecimiento" | "fueraDeZona";

export interface MemoriaSocial {
  /** Tipo de la última respuesta del bot: "agradecimiento", "fueraDeZona", "noEntendido" u otro. */
  ultimoTipo?: string;
  /** Momento de la última respuesta del bot (ISO o Date). */
  ultimaEn?: string | Date;
  /** Índice de la última variante usada por clave de mensaje, para no repetirla. */
  variantes?: Record<string, number>;
  /** Texto de la última respuesta, para no mandar dos veces la misma seguida. */
  ultimoTexto?: string;
}

/** Ventana en la que el bot no vuelve a saludar a quien ya atendió. */
export const VENTANA_CONVERSACION_MS = 30 * 60 * 1000;
/** Ventana en la que una segunda cortesía no recibe otra respuesta. */
export const VENTANA_SILENCIO_MS = 2 * 60 * 1000;

const RESPALDOS: Record<string, string[]> = {
  socialThanks: ["¡Con gusto! Aquí estamos cuando lo necesites."],
  socialOutsideZone: ["¡Enviamos a todo el país! Escríbenos por WhatsApp y te decimos cómo llega a tu ciudad: {{waLink}}"],
  socialOutsideZoneNoShipping: ["Un asesor puede ayudarte a buscar una opción para tu ciudad: {{waLink}}"],
  socialUnknown: ["¿Me cuentas un poco más para poder ayudarte mejor? También puedes hablar con un asesor por WhatsApp: {{waLink}}"],
};

/** Minúsculas, sin acentos, sin emojis ni signos; espacios simples. */
export function normalizar(texto: string): string {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Palabras que, solas, forman un agradecimiento o un cierre. Si el mensaje tiene cualquier otra palabra
// ("gracias, ¿hacen delivery?"), no es una cortesía y sigue el camino normal (FAQ, acciones).
const PALABRAS_CORTESIA = new Set([
  "gracias", "gracia", "muchas", "muchisimas", "mil", "ok", "oki", "okey", "okay", "vale", "listo", "lista",
  "perfecto", "perfecta", "dale", "excelente", "genial", "chevere", "fino", "bueno", "buena", "buenas",
  "noches", "tardes", "dias", "chao", "chau", "adios", "hasta", "luego", "pronto", "manana", "bendiciones",
  "saludos", "igualmente", "entendido", "entiendo", "de", "nada", "y", "a", "ti", "usted", "ustedes", "te",
  "le", "les", "por", "todo", "la", "info", "informacion", "amable", "muy", "super", "si", "thanks", "thank",
  "you", "bye", "ya", "jaja", "jajaja",
]);

// Señales de que el cliente está lejos de la zona de entrega o pregunta por envíos a otra ciudad.
const PATRONES_FUERA_DE_ZONA = [
  /\b(estoy|estamos|vivo|vivimos|queda|quedo|quedamos)\b.*\blejos\b/,
  /\bmuy lejos\b/,
  /\b(soy|somos) de\b/,
  /\b(vivo|vivimos) en\b/,
  // "¿envían a Valencia?", "¿llegan al Zulia?"; no "¿me envían fotos?" ni "¿cuándo llegan los nuevos?"
  /\b(envian|envias|mandan|despachan|llegan|entregan) (a|al|hasta|para)\b/,
  /\b(hacen|tienen|realizan) envios?\b/,
  /\benvios? (a|al|para|nacional|nacionales)\b/,
  /\b(otro|otra) (estado|ciudad)\b/,
  /\bpor (agencia|mrw|zoom|tealca|domesa)\b/,
];

/**
 * Detecta una intención social en el texto, o null.
 * "fueraDeZona" tiene prioridad: "estamos muy lejos, gracias" pide envío, no despedida.
 */
export function detectarIntencion(texto: string): IntencionSocial | null {
  const limpio = normalizar(texto);
  if (!limpio) return null;
  if (PATRONES_FUERA_DE_ZONA.some((p) => p.test(limpio))) return "fueraDeZona";
  const palabras = limpio.split(" ");
  if (palabras.length <= 6 && palabras.every((w) => PALABRAS_CORTESIA.has(w))) return "agradecimiento";
  return null;
}

function aFecha(valor: string | Date | undefined): number {
  if (!valor) return 0;
  const t = new Date(valor).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** El bot respondió a esta persona hace menos de 30 minutos: no se vuelve a saludar. */
export function conversacionReciente(memoria: MemoriaSocial | undefined, ahora: Date = new Date()): boolean {
  const ultima = aFecha(memoria?.ultimaEn);
  return ultima > 0 && ahora.getTime() - ultima < VENTANA_CONVERSACION_MS;
}

/**
 * Una cortesía que llega justo después de otra respuesta social no recibe otra respuesta:
 * "Estamos muy lejos" → respuesta → "Gracias" (en menos de 2 min) → silencio.
 */
export function debeSilenciar(
  intencion: IntencionSocial | null,
  memoria: MemoriaSocial | undefined,
  ahora: Date = new Date(),
): boolean {
  if (intencion !== "agradecimiento") return false;
  const ultima = aFecha(memoria?.ultimaEn);
  const tiposSociales = ["agradecimiento", "fueraDeZona", "noEntendido"];
  return ultima > 0 && ahora.getTime() - ultima < VENTANA_SILENCIO_MS && tiposSociales.includes(memoria?.ultimoTipo || "");
}

/** Lista de frases de la marca para una clave (acepta una lista o un texto suelto). */
export function obtenerFrases(clave: string): string[] {
  const valor = configManager.get(`settings.messages.${clave}`);
  const lista = Array.isArray(valor) ? valor : typeof valor === "string" ? [valor] : [];
  const limpias = lista.filter((f: unknown) => typeof f === "string" && f.trim());
  return limpias.length ? limpias : RESPALDOS[clave] || [];
}

/**
 * Elige una frase al azar sin repetir la última usada con esta persona y rellena las variables.
 * Devuelve el texto y el índice elegido (para guardarlo en la memoria).
 */
export function elegirFrase(
  clave: string,
  variables: Record<string, string>,
  memoria: MemoriaSocial | undefined,
  azar: () => number = Math.random,
): { texto: string; indice: number } {
  const frases = obtenerFrases(clave);
  if (!frases.length) return { texto: "", indice: -1 };
  const anterior = memoria?.variantes?.[clave];
  let candidatos = frases.map((_, i) => i);
  if (frases.length > 1 && typeof anterior === "number") candidatos = candidatos.filter((i) => i !== anterior);
  const indice = candidatos[Math.floor(azar() * candidatos.length) % candidatos.length];
  const vars: Record<string, string> = {
    brandName: configManager.get("settings.brandName") || "",
    ...variables,
  };
  const texto = frases[indice].replace(/{{(\w+)}}/g, (m: string, k: string) => (vars[k] !== undefined ? vars[k] : m));
  return { texto, indice };
}

/** La respuesta es idéntica a la anterior y llegaría menos de 2 minutos después: no se manda. */
export function esRespuestaRepetida(texto: string, memoria: MemoriaSocial | undefined, ahora: Date = new Date()): boolean {
  const ultima = aFecha(memoria?.ultimaEn);
  return Boolean(texto) && texto === memoria?.ultimoTexto && ultima > 0 && ahora.getTime() - ultima < VENTANA_SILENCIO_MS;
}

/** Memoria actualizada tras una respuesta del bot. */
export function registrarRespuesta(
  memoria: MemoriaSocial | undefined,
  tipo: string,
  clave: string | null,
  indice: number,
  texto: string,
  ahora: Date = new Date(),
): MemoriaSocial {
  const variantes = { ...(memoria?.variantes || {}) };
  if (clave && indice >= 0) variantes[clave] = indice;
  return { ultimoTipo: tipo, ultimaEn: ahora.toISOString(), variantes, ultimoTexto: texto };
}

module.exports = {
  VENTANA_CONVERSACION_MS,
  VENTANA_SILENCIO_MS,
  normalizar,
  detectarIntencion,
  conversacionReciente,
  debeSilenciar,
  obtenerFrases,
  elegirFrase,
  esRespuestaRepetida,
  registrarRespuesta,
};
