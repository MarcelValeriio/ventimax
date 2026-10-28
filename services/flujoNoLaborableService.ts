const configManager = require("./configManager");
import { FlujoNoLaborable, validarFlujoNoLaborable } from "./configValidators";

let Setting = require("../models/Setting");
if (process.env.NODE_ENV === "test") {
  Setting = require("./dbLocal").getSettingModel();
}

export { FlujoNoLaborable };

let flujoCache: FlujoNoLaborable | null = null;
let initialized = false;

export function getDefaultFlujoNoLaborable(): FlujoNoLaborable {
  const fromConfig = configManager.get("settings.flujoNoLaborable");
  if (fromConfig && typeof fromConfig === "object") {
    const validacion = validarFlujoNoLaborable(fromConfig);
    if (validacion.ok) {
      return validacion.value;
    }
  }
  return {
    activo: true,
    entregaDiferida: {
      activo: true,
      texto: "Entrega en día hábil",
    },
    retiroEnPunto: {
      activo: false,
      nombre: "",
      direccion: "",
      horario: "",
    },
  };
}

export function getFlujoNoLaborableSync(): FlujoNoLaborable {
  if (flujoCache) {
    return flujoCache;
  }
  return getDefaultFlujoNoLaborable();
}

export async function getFlujoNoLaborable(): Promise<FlujoNoLaborable> {
  if (flujoCache && initialized) {
    return flujoCache;
  }

  try {
    if (process.env.NODE_ENV === "test") {
      Setting = require("./dbLocal").getSettingModel();
    } else {
      Setting = require("../models/Setting");
    }

    if (Setting && typeof Setting.findOne === "function") {
      const doc = await Setting.findOne({ key: "flujoNoLaborable" });
      if (doc && doc.value) {
        const validacion = validarFlujoNoLaborable(doc.value);
        if (validacion.ok) {
          flujoCache = validacion.value;
          initialized = true;
          return flujoCache;
        }
      }
    }
  } catch (err: any) {
    console.warn("⚠️ [FlujoNoLaborableService] Error cargando flujoNoLaborable de MongoDB, usando fallback:", err?.message || err);
  }

  flujoCache = getDefaultFlujoNoLaborable();
  initialized = true;
  return flujoCache;
}

export async function setFlujoNoLaborable(nuevo: FlujoNoLaborable): Promise<FlujoNoLaborable> {
  const validacion = validarFlujoNoLaborable(nuevo);
  if (!validacion.ok) {
    throw new Error((validacion as { ok: false; error: string }).error);
  }

  if (process.env.NODE_ENV === "test") {
    Setting = require("./dbLocal").getSettingModel();
  } else {
    Setting = require("../models/Setting");
  }

  const guardado = validacion.value;
  await Setting.findOneAndUpdate(
    { key: "flujoNoLaborable" },
    { key: "flujoNoLaborable", value: guardado },
    { upsert: true, returnDocument: "after" }
  );

  flujoCache = guardado;
  initialized = true;
  return guardado;
}

export function setFlujoEnMemoria(nuevo: FlujoNoLaborable): void {
  const validacion = validarFlujoNoLaborable(nuevo);
  if (!validacion.ok) {
    throw new Error((validacion as { ok: false; error: string }).error);
  }
  flujoCache = validacion.value;
  initialized = true;
}

export function _setFlujoDirectoParaTest(raw: any): void {
  flujoCache = raw;
  initialized = true;
}

export function invalidateFlujoCache(): void {
  flujoCache = null;
  initialized = false;
}

export async function init(): Promise<void> {
  await getFlujoNoLaborable();
}

module.exports = {
  getDefaultFlujoNoLaborable,
  getFlujoNoLaborableSync,
  getFlujoNoLaborable,
  setFlujoNoLaborable,
  setFlujoEnMemoria,
  _setFlujoDirectoParaTest,
  invalidateFlujoCache,
  init,
};
