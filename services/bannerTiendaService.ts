/**
 * Cintillo promocional de la tienda (F2g), editable desde el panel.
 * Se guarda en Setting (key "bannerTienda"). Sin nada guardado, el cintillo está apagado.
 * Mismo patrón que catalogoConfigService: caché en memoria con lectura síncrona y init() en el arranque.
 */
import { BannerTienda, validarBannerTienda } from "./configValidators";

export { BannerTienda };

const SETTING_KEY = "bannerTienda";

let bannerCache: BannerTienda | null = null;

function getSettingModel() {
  return process.env.NODE_ENV === "test" ? require("./dbLocal").getSettingModel() : require("../models/Setting");
}

export function getDefaultBannerTienda(): BannerTienda {
  return { activo: false, texto: "", productoId: null };
}

export function getBannerTiendaSync(): BannerTienda {
  return bannerCache || getDefaultBannerTienda();
}

export async function getBannerTienda(): Promise<BannerTienda> {
  if (bannerCache) return bannerCache;
  try {
    const doc = await getSettingModel().findOne({ key: SETTING_KEY });
    if (doc && doc.value) {
      const validacion = validarBannerTienda(doc.value);
      if (validacion.ok) {
        bannerCache = validacion.value;
        return bannerCache;
      }
    }
  } catch (err: any) {
    console.warn("⚠️ [BannerTienda] Error leyendo la base, se usa el cintillo apagado:", err?.message || err);
  }
  return getDefaultBannerTienda();
}

/** Valida y guarda en Setting. Lanza Error con el motivo si no es válido. */
export async function setBannerTienda(nuevo: unknown): Promise<BannerTienda> {
  const validacion = validarBannerTienda(nuevo);
  if (!validacion.ok) {
    throw new Error((validacion as { error: string }).error);
  }
  const guardado: BannerTienda = validacion.value;
  await getSettingModel().findOneAndUpdate(
    { key: SETTING_KEY },
    { key: SETTING_KEY, value: guardado },
    { upsert: true, returnDocument: "after" }
  );
  bannerCache = guardado;
  return guardado;
}

export function invalidateBannerTiendaCache(): void {
  bannerCache = null;
}

export async function init(): Promise<void> {
  await getBannerTienda();
}

module.exports = {
  getDefaultBannerTienda,
  getBannerTiendaSync,
  getBannerTienda,
  setBannerTienda,
  invalidateBannerTiendaCache,
  init,
};
