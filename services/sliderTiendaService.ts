/**
 * Slider de portada de la tienda (carrusel de imágenes), editable desde el panel.
 * Se guarda en Setting (key "sliderTienda"). Sin nada guardado, el slider está apagado y sin slides.
 * Mismo patrón que bannerLateralService: caché en memoria con lectura síncrona y init() en el arranque.
 */
import { SliderTienda, SlideTienda, validarSliderTienda } from "./configValidators";

export { SliderTienda, SlideTienda };

const SETTING_KEY = "sliderTienda";

let sliderCache: SliderTienda | null = null;

function getSettingModel() {
  return process.env.NODE_ENV === "test" ? require("./dbLocal").getSettingModel() : require("../models/Setting");
}

function getProductoModel() {
  return process.env.NODE_ENV === "test" ? require("./dbLocal").getProductoModel() : require("../models/Producto");
}

function getCategoriaModel() {
  return process.env.NODE_ENV === "test" ? require("./dbLocal").getCategoriaModel() : require("../models/Categoria");
}

export function getDefaultSliderTienda(): SliderTienda {
  return { activo: false, autoavance: true, segundos: 6, slides: [] };
}

export function getSliderTiendaSync(): SliderTienda {
  return sliderCache || getDefaultSliderTienda();
}

export async function getSliderTienda(): Promise<SliderTienda> {
  if (sliderCache) return sliderCache;
  try {
    const doc = await getSettingModel().findOne({ key: SETTING_KEY });
    if (doc && doc.value) {
      const validacion = validarSliderTienda(doc.value);
      if (validacion.ok) {
        sliderCache = validacion.value;
        return sliderCache;
      }
    }
  } catch (err: any) {
    console.warn("⚠️ [SliderTienda] Error leyendo la base, se usa el slider apagado:", err?.message || err);
  }
  return getDefaultSliderTienda();
}

/** Valida y guarda en Setting. Lanza Error con el motivo si no es válido. */
export async function setSliderTienda(nuevo: unknown): Promise<SliderTienda> {
  const validacion = validarSliderTienda(nuevo);
  if (!validacion.ok) {
    throw new Error((validacion as { error: string }).error);
  }
  const guardado: SliderTienda = validacion.value;
  await getSettingModel().findOneAndUpdate(
    { key: SETTING_KEY },
    { key: SETTING_KEY, value: guardado },
    { upsert: true, returnDocument: "after" }
  );
  sliderCache = guardado;
  return guardado;
}

export function invalidateSliderTiendaCache(): void {
  sliderCache = null;
}

export async function init(): Promise<void> {
  await getSliderTienda();
}

/**
 * Salida pública para GET /api/public/info.
 * Lista blanca: solo url, urlMovil, alt y destino resuelto (#/producto/<id> o #/categoria/<slug> o null).
 * NUNCA publicId ni publicIdMovil.
 * Si el destino enlazado ya no existe o está inactivo, destino pasa a ser null sin romper la slide.
 * Si el slider está inactivo o no tiene slides válidas, devuelve null.
 */
export async function getSliderTiendaPublico(): Promise<{
  autoavance: boolean;
  segundos: number;
  slides: { url: string; urlMovil: string | null; alt: string; destino: string | null }[];
} | null> {
  const cfg = await getSliderTienda();
  if (!cfg || cfg.activo !== true || !Array.isArray(cfg.slides) || cfg.slides.length === 0) {
    return null;
  }

  const Producto = getProductoModel();
  const Categoria = getCategoriaModel();

  const slidesResueltas: {
    url: string;
    urlMovil: string | null;
    alt: string;
    destino: string | null;
  }[] = [];

  for (const s of cfg.slides) {
    let destino: string | null = null;

    if (s.productoId) {
      try {
        const prod = await Producto.findOne({ id: s.productoId });
        if (prod && prod.activo !== false) {
          destino = `#/producto/${encodeURIComponent(String(prod.id))}`;
        }
      } catch {
        destino = null;
      }
    } else if (s.categoriaSlug) {
      try {
        const cat = await Categoria.findOne({ slug: s.categoriaSlug });
        if (cat) {
          destino = `#/categoria/${encodeURIComponent(String(cat.slug))}`;
        }
      } catch {
        destino = null;
      }
    }

    slidesResueltas.push({
      url: s.url,
      urlMovil: s.urlMovil || null,
      alt: s.alt || "",
      destino,
    });
  }

  return {
    autoavance: cfg.autoavance !== false,
    segundos: cfg.segundos || 6,
    slides: slidesResueltas,
  };
}

module.exports = {
  getDefaultSliderTienda,
  getSliderTiendaSync,
  getSliderTienda,
  setSliderTienda,
  invalidateSliderTiendaCache,
  init,
  getSliderTiendaPublico,
};
