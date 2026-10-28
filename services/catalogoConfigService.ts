/**
 * Configuración del Catálogo Web (F2-4), editable desde el panel.
 * Si no hay nada guardado en la colección Setting (key "catalogo"), se usan los valores de la marca:
 * settings.catalogo (activo, prefijoPedido) y settings.messages.webOrderPrefill.
 * Mismo patrón que datosNegocioService y horarioService: caché en memoria con lectura síncrona.
 */
const configManager = require("./configManager");
import { ConfigCatalogo, validarConfigCatalogo } from "./configValidators";

export { ConfigCatalogo };

const SETTING_KEY = "catalogo";

let catalogoCache: ConfigCatalogo | null = null;

function getSettingModel() {
  return process.env.NODE_ENV === "test" ? require("./dbLocal").getSettingModel() : require("../models/Setting");
}

export function getDefaultConfigCatalogo(): ConfigCatalogo {
  const brandCatalogo = configManager.get("settings.catalogo") || {};
  const activoDirecto = configManager.get("settings.catalogo.activo");
  const activoRaw = activoDirecto !== undefined ? (activoDirecto !== false) : (brandCatalogo.activo !== false);
  const prefijoDirecto = configManager.get("settings.catalogo.prefijoPedido");
  const prefijoRaw = prefijoDirecto || brandCatalogo.prefijoPedido || "PW";
  const prefillRaw = configManager.get("settings.messages.webOrderPrefill") || "Hola, quiero confirmar mi pedido web {{codigo}}";

  const validacion = validarConfigCatalogo({
    activo: activoRaw,
    prefijo: prefijoRaw,
    mensajePrefill: prefillRaw,
  });

  if (validacion.ok) return validacion.value;

  console.warn(`⚠️ [CatalogoConfig] Configuración de marca inválida, se usan valores por defecto neutros: ${(validacion as { error: string }).error}`);
  return {
    activo: true,
    prefijo: "PW",
    mensajePrefill: "Hola, quiero confirmar mi pedido web {{codigo}}",
  };
}

export function getConfigCatalogoSync(): ConfigCatalogo {
  return catalogoCache || getDefaultConfigCatalogo();
}

export async function getConfigCatalogo(): Promise<ConfigCatalogo> {
  if (catalogoCache) return catalogoCache;
  try {
    const doc = await getSettingModel().findOne({ key: SETTING_KEY });
    if (doc && doc.value) {
      const validacion = validarConfigCatalogo(doc.value);
      if (validacion.ok) {
        catalogoCache = validacion.value;
        return catalogoCache;
      }
    }
  } catch (err: any) {
    console.warn("⚠️ [CatalogoConfig] Error leyendo de la base, se usan datos por defecto:", err?.message || err);
  }
  return getDefaultConfigCatalogo();
}

/** Valida y guarda en Setting. Lanza Error con el motivo si no es válido. */
export async function setConfigCatalogo(nuevo: unknown): Promise<ConfigCatalogo> {
  const validacion = validarConfigCatalogo(nuevo);
  if (!validacion.ok) {
    throw new Error((validacion as { error: string }).error);
  }
  const guardado: ConfigCatalogo = validacion.value;
  await getSettingModel().findOneAndUpdate(
    { key: SETTING_KEY },
    { key: SETTING_KEY, value: guardado },
    { upsert: true, returnDocument: "after" }
  );
  catalogoCache = guardado;
  return guardado;
}

export function invalidateConfigCatalogoCache(): void {
  catalogoCache = null;
}

export async function init(): Promise<void> {
  await getConfigCatalogo();
}

module.exports = {
  getDefaultConfigCatalogo,
  getConfigCatalogoSync,
  getConfigCatalogo,
  setConfigCatalogo,
  invalidateConfigCatalogoCache,
  init,
};
