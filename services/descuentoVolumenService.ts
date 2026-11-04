/**
 * Configuración del descuento por volumen (F1-9), editable desde el panel.
 * Se guarda en la colección Setting (key "descuentoVolumen"). Si no existe, al arrancar se copia
 * la de la marca (settings.descuentoVolumen de config/brand/<marca>/). Si la marca no trae una
 * configuración válida, el descuento queda apagado.
 * Mismo patrón que catalogoConfigService: caché en memoria con lectura síncrona para los totales.
 */
const configManager = require("./configManager");
const { validarConfigDescuentoVolumen, SIN_DESCUENTO_VOLUMEN } = require("./descuentoVolumen");

const SETTING_KEY = "descuentoVolumen";

let descuentoCache: any = null;

function getSettingModel() {
  return process.env.NODE_ENV === "test" ? require("./dbLocal").getSettingModel() : require("../models/Setting");
}

/** Configuración de la marca (o apagada si no hay una válida). */
export function getDefaultConfigDescuentoVolumen(): any {
  const validacion = validarConfigDescuentoVolumen(configManager.get("settings.descuentoVolumen"));
  if (validacion.ok) return validacion.value;
  return { ...SIN_DESCUENTO_VOLUMEN, tramos: [] };
}

/** Lectura síncrona para los totales (carrito, pedido web, venta manual). */
export function getConfigDescuentoVolumenSync(): any {
  return descuentoCache || getDefaultConfigDescuentoVolumen();
}

export async function getConfigDescuentoVolumen(): Promise<any> {
  if (descuentoCache) return descuentoCache;
  try {
    const doc = await getSettingModel().findOne({ key: SETTING_KEY });
    if (doc && doc.value) {
      const validacion = validarConfigDescuentoVolumen(doc.value);
      if (validacion.ok) {
        descuentoCache = validacion.value;
        return descuentoCache;
      }
    }
  } catch (err: any) {
    console.warn("⚠️ [DescuentoVolumen] Error leyendo de la base, se usa la de la marca:", err?.message || err);
  }
  return getDefaultConfigDescuentoVolumen();
}

/** Valida y guarda en Setting. Lanza Error con el motivo si no es válido. */
export async function setConfigDescuentoVolumen(nuevo: unknown): Promise<any> {
  const validacion = validarConfigDescuentoVolumen(nuevo);
  if (!validacion.ok) {
    throw new Error((validacion as { error: string }).error);
  }
  const guardado = validacion.value;
  await getSettingModel().findOneAndUpdate(
    { key: SETTING_KEY },
    { key: SETTING_KEY, value: guardado },
    { upsert: true, returnDocument: "after" }
  );
  descuentoCache = guardado;
  return guardado;
}

export function invalidateConfigDescuentoVolumenCache(): void {
  descuentoCache = null;
}

/**
 * Al arrancar: si no hay nada guardado, copia la de la marca (solo si es válida) y carga la caché.
 * Un fallo de base no impide arrancar: queda la de la marca.
 */
export async function init(): Promise<void> {
  try {
    const doc = await getSettingModel().findOne({ key: SETTING_KEY });
    if (!doc) {
      const dePartida = getDefaultConfigDescuentoVolumen();
      if (dePartida.tramos.length > 0) {
        await setConfigDescuentoVolumen(dePartida);
      }
    }
  } catch (err: any) {
    console.warn("⚠️ [DescuentoVolumen] No se pudo inicializar la configuración:", err?.message || err);
  }
  await getConfigDescuentoVolumen();
}

module.exports = {
  getDefaultConfigDescuentoVolumen,
  getConfigDescuentoVolumenSync,
  getConfigDescuentoVolumen,
  setConfigDescuentoVolumen,
  invalidateConfigDescuentoVolumenCache,
  init,
};
