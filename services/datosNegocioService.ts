/**
 * Datos legales y de contacto del negocio (F0-14), editables desde el panel.
 * Si no hay nada guardado en la colección Setting (key "datosNegocio"), se usan los de la marca:
 * settings.legal, settings.contact y settings.whatsappPhone.
 * Mismo patrón que horarioService y flujoNoLaborableService: caché en memoria con lectura síncrona.
 */
const configManager = require("./configManager");
import { DatosNegocio, validarDatosNegocio } from "./configValidators";

export { DatosNegocio };

const SETTING_KEY = "datosNegocio";

let datosCache: DatosNegocio | null = null;

function getSettingModel() {
  return process.env.NODE_ENV === "test" ? require("./dbLocal").getSettingModel() : require("../models/Setting");
}

/** Fecha de hoy en Caracas, formato YYYY-MM-DD. */
function hoyCaracas(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function getDefaultDatosNegocio(): DatosNegocio {
  const legal = configManager.get("settings.legal") || {};
  const contact = configManager.get("settings.contact") || {};
  const validacion = validarDatosNegocio({
    legal: { razonSocial: legal.razonSocial, rif: legal.rif, direccion: legal.direccion },
    contacto: {
      email: contact.email,
      website: contact.website,
      instagram: contact.instagram,
      whatsapp: configManager.get("settings.whatsappPhone"),
    },
    fechaActualizacion: legal.fechaActualizacion,
  });
  if (validacion.ok) return validacion.value;
  console.warn(`⚠️ [DatosNegocio] Datos de la marca inválidos, se ignoran: ${(validacion as { error: string }).error}`);
  return {
    legal: { razonSocial: "", rif: "", direccion: "" },
    contacto: { email: "", website: "", instagram: "", whatsapp: "" },
    fechaActualizacion: "",
  };
}

export function getDatosNegocioSync(): DatosNegocio {
  return datosCache || getDefaultDatosNegocio();
}

export async function getDatosNegocio(): Promise<DatosNegocio> {
  if (datosCache) return datosCache;
  try {
    const doc = await getSettingModel().findOne({ key: SETTING_KEY });
    if (doc && doc.value) {
      const validacion = validarDatosNegocio(doc.value);
      if (validacion.ok) {
        datosCache = validacion.value;
        return datosCache;
      }
    }
  } catch (err: any) {
    console.warn("⚠️ [DatosNegocio] Error leyendo la base, se usan los datos de la marca:", err?.message || err);
  }
  datosCache = getDefaultDatosNegocio();
  return datosCache;
}

/** Valida, pone la fecha de hoy y guarda. Lanza Error con el motivo si los datos no son válidos. */
export async function setDatosNegocio(nuevo: unknown): Promise<DatosNegocio> {
  const validacion = validarDatosNegocio(nuevo);
  if (!validacion.ok) {
    throw new Error((validacion as { error: string }).error);
  }
  const guardado: DatosNegocio = { ...validacion.value, fechaActualizacion: hoyCaracas() };
  await getSettingModel().findOneAndUpdate(
    { key: SETTING_KEY },
    { key: SETTING_KEY, value: guardado },
    { upsert: true, returnDocument: "after" }
  );
  datosCache = guardado;
  return guardado;
}

export function invalidateDatosNegocioCache(): void {
  datosCache = null;
}

export async function init(): Promise<void> {
  await getDatosNegocio();
}

module.exports = {
  getDefaultDatosNegocio,
  getDatosNegocioSync,
  getDatosNegocio,
  setDatosNegocio,
  invalidateDatosNegocioCache,
  init,
};
