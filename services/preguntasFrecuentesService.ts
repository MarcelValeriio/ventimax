/**
 * Preguntas frecuentes: lista única para el bot y la tienda web (F2h).
 *
 * Antes había dos listas: las FAQ del bot (colección FAQ) y el Setting "preguntasFrecuentes" de la tienda.
 * Ahora solo existe la colección FAQ; la tienda muestra las estáticas activas con `mostrarEnTienda: true`.
 *
 * Este servicio hace dos cosas:
 *  - migrarPreguntasTienda(): una sola vez, pasa las preguntas del Setting viejo a FAQ (idempotente).
 *  - listarPreguntasTienda(): lo que lee GET /api/public/info.
 */
import { IFAQ } from "../types/models";

const SETTING_KEY = "preguntasFrecuentes";
const FLAG_KEY = "preguntasFrecuentesMigradas";
// Misma marca con la que el bot (chatFlowService) y el panel (adminController) leen y crean las FAQ
const MARCA_FAQ = "default";

// Palabras sin valor para buscar: se descartan al generar las keywords de una pregunta migrada
const PALABRAS_VACIAS = new Set([
  "algun", "alguna", "algunos", "algunas", "todos", "todas", "cada", "otro", "otra", "sobre", "entre", "desde",
  "hasta", "pero", "tambien", "nosotros", "ustedes", "usted", "quiero", "quisiera", "necesito", "favor", "tengo",
  "tienen", "tiene", "hacen", "hace", "donde", "cuanto", "cuanta", "cuales", "cual", "cuando", "como", "para",
  "puedo", "pueden", "puede", "este", "esta", "estos", "estas", "hay", "los", "las", "del", "que", "por", "con",
  "una", "uno", "unos", "unas", "mis", "sus", "nuestro", "nuestra", "muy", "mucho", "mas", "solo", "ser", "son",
]);

const MAX_KEYWORDS = 5;

function getSettingModel() {
  return process.env.NODE_ENV === "test" ? require("./dbLocal").getSettingModel() : require("../models/Setting");
}

function getFaqModel() {
  if (process.env.NODE_ENV === "test") {
    const dbLocal = require("./dbLocal");
    if (typeof dbLocal.getFAQModel === "function") return dbLocal.getFAQModel();
  }
  return require("../models/FAQ");
}

/** Texto sin mayúsculas, sin tildes ni espacios dobles (para comparar preguntas). */
export function normalizarTexto(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Hasta 5 palabras de 4 o más letras de la pregunta, sin tildes, sin palabras vacías y sin repetir. */
/**
 * Palabras clave candidatas de una pregunta. `excluir` son raíces que no sirven para distinguirla: el bot responde
 * la primera FAQ que tenga CUALQUIER palabra clave dentro del mensaje, así que una palabra común (el nombre de
 * un producto o una que comparten dos preguntas) haría que conteste una pregunta equivocada.
 */
export function keywordsDePregunta(pregunta: string, excluir: string[] = []): string[] {
  const palabras = normalizarTexto(pregunta).replace(/[^a-z0-9]+/g, " ").split(" ");
  const parecida = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);
  const keywords: string[] = [];
  for (const palabra of palabras) {
    // 5+ letras: las más cortas aparecen dentro de otras palabras ("nota" en "notas", "envio" es tema del bot)
    if (palabra.length < 5 || PALABRAS_VACIAS.has(palabra) || keywords.includes(palabra)) continue;
    if (excluir.some((x) => parecida(palabra, x))) continue;
    keywords.push(palabra);
    if (keywords.length === MAX_KEYWORDS) break;
  }
  return keywords;
}

/** Raíces del catálogo (nombres de productos y categorías): no sirven como palabra clave de una pregunta. */
async function vocabularioCatalogo(): Promise<string[]> {
  const enTest = process.env.NODE_ENV === "test";
  const Producto = enTest ? require("./dbLocal").getProductoModel() : require("../models/Producto");
  const Categoria = enTest ? require("./dbLocal").getCategoriaModel() : require("../models/Categoria");
  const textos: string[] = [];
  try {
    for (const p of (await Producto.find({})) || []) textos.push(String(p.name || ""));
    for (const c of (await Categoria.find({})) || []) textos.push(String(c.nombre || ""));
  } catch (_e) {
    // Sin catálogo legible, se sigue sin esta exclusión
  }
  const palabras = normalizarTexto(textos.join(" ")).replace(/[^a-z0-9]+/g, " ").split(" ");
  // Raíz de 5 letras: "ventilador" excluye también "ventiladores"
  return [...new Set(palabras.filter((w) => w.length >= 5).map((w) => w.slice(0, 5)))];
}

/**
 * Migración única: copia las preguntas con respuesta del Setting "preguntasFrecuentes" a FAQ.
 * - Si ya existe una FAQ de la misma marca con la misma pregunta (sin mayúsculas ni tildes), no la duplica.
 * - Devuelve cuántas creó. Devuelve null si ya estaba hecha o si no había nada que migrar (no marca la
 *   migración como hecha en el segundo caso, así se reintenta en el siguiente arranque).
 * - No borra el Setting viejo.
 */
export async function migrarPreguntasTienda(): Promise<number | null> {
  const Setting = getSettingModel();
  const bandera = await Setting.findOne({ key: FLAG_KEY });
  if (bandera && bandera.value === true) return null;

  const viejo = await Setting.findOne({ key: SETTING_KEY });
  if (!viejo || !viejo.value || !Array.isArray(viejo.value.items)) return null;

  const Faq = getFaqModel();
  const existentes: IFAQ[] = (await Faq.find({ brand: MARCA_FAQ })) || [];
  const claves = new Set(existentes.map((f) => normalizarTexto(f.pregunta)));
  let orden = existentes.reduce((max, f) => Math.max(max, Number(f.order) || 0), -1) + 1;

  // Palabras que no distinguen una pregunta: las del catálogo y las que aparecen en más de una pregunta migrada
  const aMigrar = viejo.value.items.filter((i: any) => String(i?.pregunta || "").trim() && String(i?.respuesta || "").trim());
  const conteo = new Map<string, number>();
  for (const item of aMigrar) {
    for (const k of new Set(keywordsDePregunta(String(item.pregunta)))) conteo.set(k, (conteo.get(k) || 0) + 1);
  }
  const repetidas = [...conteo].filter(([, n]) => n > 1).map(([k]) => k.slice(0, 5));
  const excluir = [...(await vocabularioCatalogo()), ...repetidas];

  let creadas = 0;
  for (const item of viejo.value.items) {
    const pregunta = typeof item?.pregunta === "string" ? item.pregunta.trim() : "";
    const respuesta = typeof item?.respuesta === "string" ? item.respuesta.trim() : "";
    if (!pregunta || !respuesta) continue;

    const clave = normalizarTexto(pregunta);
    if (claves.has(clave)) continue;

    const keywords = keywordsDePregunta(pregunta, excluir);
    if (!keywords.length) {
      console.warn(`⚠️ [FAQ] "${pregunta}" migrada sin palabras clave: sale en la tienda, pero el bot no la usará hasta que le agregues palabras en el panel`);
    }
    await Faq.create({
      pregunta,
      respuesta,
      keywords,
      type: "estatica",
      dynamicKey: null,
      activo: true,
      mostrarEnTienda: true,
      order: orden,
      brand: MARCA_FAQ,
    });
    claves.add(clave);
    orden++;
    creadas++;
  }

  await Setting.findOneAndUpdate(
    { key: FLAG_KEY },
    { key: FLAG_KEY, value: true },
    { upsert: true, returnDocument: "after" }
  );
  return creadas;
}

/**
 * Preguntas que se muestran en la tienda: FAQ estáticas activas, con `mostrarEnTienda` y respuesta, en orden.
 * Las dinámicas nunca salen (dependen del inventario y solo las usa el bot).
 */
export async function listarPreguntasTienda(): Promise<{ pregunta: string; respuesta: string }[]> {
  const Faq = getFaqModel();
  const faqs: IFAQ[] = (await Faq.find({ brand: MARCA_FAQ, activo: true }).sort({ order: 1, createdAt: 1 })) || [];
  return faqs
    .filter((f) => f && f.activo !== false && f.type !== "dinamica" && f.mostrarEnTienda === true)
    .filter((f) => String(f.respuesta || "").trim() !== "")
    .map((f) => ({ pregunta: String(f.pregunta), respuesta: String(f.respuesta) }));
}

/** Arranque: la migración corre una vez; si falla, el servidor sigue y se reintenta en el siguiente arranque. */
export async function init(): Promise<void> {
  try {
    const creadas = await migrarPreguntasTienda();
    if (creadas !== null) {
      console.log(`✅ [FAQ] Migradas ${creadas} preguntas de la tienda a la lista única`);
    }
  } catch (err: any) {
    console.error("❌ [FAQ] Error migrando las preguntas de la tienda:", err?.message || err);
  }
}
