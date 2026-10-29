/**
 * Preguntas frecuentes de la tienda pública (F2b), editables desde el panel.
 * Si no hay nada guardado en la colección Setting (key "preguntasFrecuentes"), se usan las de la marca:
 * settings.tienda.preguntasFrecuentes.
 * Mismo patrón que datosNegocioService: caché en memoria con lectura síncrona.
 */
const configManager = require("./configManager");
import { PreguntasFrecuentes, validarPreguntasFrecuentes } from "./configValidators";

export { PreguntasFrecuentes };

const SETTING_KEY = "preguntasFrecuentes";

let preguntasCache: PreguntasFrecuentes | null = null;

function getSettingModel() {
  return process.env.NODE_ENV === "test" ? require("./dbLocal").getSettingModel() : require("../models/Setting");
}

export function getDefaultPreguntasFrecuentes(): PreguntasFrecuentes {
  const deMarca = configManager.get("settings.tienda.preguntasFrecuentes");
  const validacion = validarPreguntasFrecuentes({ items: Array.isArray(deMarca) ? deMarca : [] });
  if (validacion.ok) return validacion.value;
  console.warn(`⚠️ [PreguntasFrecuentes] Preguntas de la marca inválidas, se ignoran: ${(validacion as { error: string }).error}`);
  return { items: [] };
}

export function getPreguntasFrecuentesSync(): PreguntasFrecuentes {
  return preguntasCache || getDefaultPreguntasFrecuentes();
}

export async function getPreguntasFrecuentes(): Promise<PreguntasFrecuentes> {
  if (preguntasCache) return preguntasCache;
  try {
    const doc = await getSettingModel().findOne({ key: SETTING_KEY });
    if (doc && doc.value) {
      const validacion = validarPreguntasFrecuentes(doc.value);
      if (validacion.ok) {
        preguntasCache = validacion.value;
        return preguntasCache;
      }
    }
  } catch (err: any) {
    console.warn("⚠️ [PreguntasFrecuentes] Error leyendo la base, se usan las de la marca:", err?.message || err);
  }
  preguntasCache = getDefaultPreguntasFrecuentes();
  return preguntasCache;
}

/** Valida y guarda la lista. Lanza Error con el motivo si no es válida. */
export async function setPreguntasFrecuentes(nuevo: unknown): Promise<PreguntasFrecuentes> {
  const validacion = validarPreguntasFrecuentes(nuevo);
  if (!validacion.ok) {
    throw new Error((validacion as { error: string }).error);
  }
  const guardado: PreguntasFrecuentes = validacion.value;
  await getSettingModel().findOneAndUpdate(
    { key: SETTING_KEY },
    { key: SETTING_KEY, value: guardado },
    { upsert: true, returnDocument: "after" }
  );
  preguntasCache = guardado;
  return guardado;
}

export function invalidatePreguntasFrecuentesCache(): void {
  preguntasCache = null;
}

export async function init(): Promise<void> {
  await getPreguntasFrecuentes();
}

module.exports = {
  getDefaultPreguntasFrecuentes,
  getPreguntasFrecuentesSync,
  getPreguntasFrecuentes,
  setPreguntasFrecuentes,
  invalidatePreguntasFrecuentesCache,
  init,
};
