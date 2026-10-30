/**
 * Banner lateral de la tienda (imágenes verticales), editable desde el panel.
 * Se guarda en Setting (key "bannerLateral"). Sin nada guardado, el banner está apagado y sin imágenes.
 * Mismo patrón que bannerTiendaService: caché en memoria con lectura síncrona y init() en el arranque.
 */
import { BannerLateral, validarBannerLateral } from "./configValidators";

export { BannerLateral };

const SETTING_KEY = "bannerLateral";

let bannerCache: BannerLateral | null = null;

function getSettingModel() {
  return process.env.NODE_ENV === "test" ? require("./dbLocal").getSettingModel() : require("../models/Setting");
}

export function getDefaultBannerLateral(): BannerLateral {
  return { activo: false, imagenes: [] };
}

export function getBannerLateralSync(): BannerLateral {
  return bannerCache || getDefaultBannerLateral();
}

export async function getBannerLateral(): Promise<BannerLateral> {
  if (bannerCache) return bannerCache;
  try {
    const doc = await getSettingModel().findOne({ key: SETTING_KEY });
    if (doc && doc.value) {
      const validacion = validarBannerLateral(doc.value);
      if (validacion.ok) {
        bannerCache = validacion.value;
        return bannerCache;
      }
    }
  } catch (err: any) {
    console.warn("⚠️ [BannerLateral] Error leyendo la base, se usa el banner apagado:", err?.message || err);
  }
  return getDefaultBannerLateral();
}

/** Valida y guarda en Setting. Lanza Error con el motivo si no es válido. */
export async function setBannerLateral(nuevo: unknown): Promise<BannerLateral> {
  const validacion = validarBannerLateral(nuevo);
  if (!validacion.ok) {
    throw new Error((validacion as { error: string }).error);
  }
  const guardado: BannerLateral = validacion.value;
  await getSettingModel().findOneAndUpdate(
    { key: SETTING_KEY },
    { key: SETTING_KEY, value: guardado },
    { upsert: true, returnDocument: "after" }
  );
  bannerCache = guardado;
  return guardado;
}

export function invalidateBannerLateralCache(): void {
  bannerCache = null;
}

export async function init(): Promise<void> {
  await getBannerLateral();
}

module.exports = {
  getDefaultBannerLateral,
  getBannerLateralSync,
  getBannerLateral,
  setBannerLateral,
  invalidateBannerLateralCache,
  init,
};
