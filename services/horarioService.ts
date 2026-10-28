const configManager = require("./configManager");
import { HorarioAtencion, validarHorarioAtencion } from "./configValidators";

let Setting = require("../models/Setting");
if (process.env.NODE_ENV === "test") {
  Setting = require("./dbLocal").getSettingModel();
}

export { HorarioAtencion };

const NOMBRES_DIAS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  0: "Domingo",
};

let horarioCache: HorarioAtencion | null = null;
let initialized = false;

export function getDefaultHorario(): HorarioAtencion {
  const fromConfig = configManager.get("settings.horarioAtencion");
  if (fromConfig && Array.isArray(fromConfig.dias) && fromConfig.apertura && fromConfig.cierre) {
    return {
      zonaHoraria: fromConfig.zonaHoraria || "America/Caracas",
      dias: fromConfig.dias,
      apertura: fromConfig.apertura,
      cierre: fromConfig.cierre,
    };
  }
  return {
    zonaHoraria: "America/Caracas",
    dias: [1, 2, 3, 4, 5],
    apertura: "09:00",
    cierre: "17:00",
  };
}

export function getHorarioSync(): HorarioAtencion {
  if (horarioCache) {
    return horarioCache;
  }
  return getDefaultHorario();
}

export async function getHorario(): Promise<HorarioAtencion> {
  if (horarioCache && initialized) {
    return horarioCache;
  }

  try {
    if (process.env.NODE_ENV === "test") {
      Setting = require("./dbLocal").getSettingModel();
    } else {
      Setting = require("../models/Setting");
    }

    if (Setting && typeof Setting.findOne === "function") {
      const doc = await Setting.findOne({ key: "horarioAtencion" });
      if (doc && doc.value) {
        const validacion = validarHorarioAtencion(doc.value);
        if (validacion.ok) {
          horarioCache = validacion.value;
          initialized = true;
          return horarioCache;
        }
      }
    }
  } catch (err: any) {
    console.warn("⚠️ [HorarioService] Error cargando horario de MongoDB, usando fallback:", err?.message || err);
  }

  horarioCache = getDefaultHorario();
  initialized = true;
  return horarioCache;
}

export async function setHorario(nuevo: HorarioAtencion): Promise<HorarioAtencion> {
  const validacion = validarHorarioAtencion(nuevo);
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
    { key: "horarioAtencion" },
    { key: "horarioAtencion", value: guardado },
    { upsert: true, returnDocument: "after" }
  );

  horarioCache = guardado;
  initialized = true;
  return guardado;
}

export function setHorarioEnMemoria(nuevo: HorarioAtencion): void {
  const validacion = validarHorarioAtencion(nuevo);
  if (!validacion.ok) {
    throw new Error((validacion as { ok: false; error: string }).error);
  }
  horarioCache = validacion.value;
  initialized = true;
}

export function invalidateHorarioCache(): void {
  horarioCache = null;
  initialized = false;
}

export async function init(): Promise<void> {
  await getHorario();
}

/**
 * Determina si una fecha corresponde a un día no laborable según la configuración activa.
 * @param date Fecha a verificar (por defecto la fecha actual).
 */
export function esDiaNoLaborable(date: Date = new Date()): boolean {
  const conf = getHorarioSync();
  const caracasDate = new Date(
    date.toLocaleString("en-US", { timeZone: conf.zonaHoraria || "America/Caracas" })
  );
  const day = caracasDate.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  return !conf.dias.includes(day);
}

function formatHour12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr.padStart(2, "0")} ${period}`;
}

export function formatearDias(dias: number[]): string {
  if (!dias || dias.length === 0) return "Cerrado";
  if (dias.length === 7) return "Lunes a Domingo";

  // Ordenar días para lectura natural (1: Lun, 2: Mar, ..., 6: Sáb, 7: Dom)
  const normalizarDia = (d: number) => (d === 0 ? 7 : d);
  const diasOrdenados = [...dias].sort((a, b) => normalizarDia(a) - normalizarDia(b));

  let esConsecutivo = true;
  for (let i = 0; i < diasOrdenados.length - 1; i++) {
    if (normalizarDia(diasOrdenados[i + 1]) !== normalizarDia(diasOrdenados[i]) + 1) {
      esConsecutivo = false;
      break;
    }
  }

  if (esConsecutivo && diasOrdenados.length >= 2) {
    const primerDia = NOMBRES_DIAS[diasOrdenados[0]];
    const ultimoDia = NOMBRES_DIAS[diasOrdenados[diasOrdenados.length - 1]];
    return `${primerDia} a ${ultimoDia}`;
  }

  return diasOrdenados.map((d) => NOMBRES_DIAS[d]).join(", ");
}

/**
 * Genera el texto legible del horario de atención comercial.
 * Ej: "Lunes a Viernes de 9:00 am a 5:00 pm"
 */
export function formatearHorarioAtencion(conf?: HorarioAtencion): string {
  const c = conf || getHorarioSync();
  const diasTexto = formatearDias(c.dias);
  return `${diasTexto} de ${formatHour12(c.apertura)} a ${formatHour12(c.cierre)}`;
}

/**
 * Retorna la hora de apertura formateada en 12 horas (ej: "9:00 am" o "10:00 am").
 */
export function getHoraAperturaFormateada(conf?: HorarioAtencion): string {
  const c = conf || getHorarioSync();
  return formatHour12(c.apertura);
}

/**
 * Retorna la hora de cierre formateada en 12 horas (ej: "5:00 pm").
 */
export function getHoraCierreFormateada(conf?: HorarioAtencion): string {
  const c = conf || getHorarioSync();
  return formatHour12(c.cierre);
}

/**
 * Calcula el nombre del próximo día hábil posterior a la fecha indicada.
 * Ej: Si hoy es sábado/domingo y los días hábiles son Lun-Vie, devuelve "Lunes".
 */
export function getProximoDiaHabil(date: Date = new Date(), conf?: HorarioAtencion): string {
  const c = conf || getHorarioSync();
  const caracasDate = new Date(
    date.toLocaleString("en-US", { timeZone: c.zonaHoraria || "America/Caracas" })
  );
  const currentDay = caracasDate.getDay();

  if (!c.dias || c.dias.length === 0) {
    return "Día hábil";
  }

  for (let offset = 1; offset <= 7; offset++) {
    const checkDay = (currentDay + offset) % 7;
    if (c.dias.includes(checkDay)) {
      return NOMBRES_DIAS[checkDay] || "Día hábil";
    }
  }

  return "Día hábil";
}

module.exports = {
  getDefaultHorario,
  getHorarioSync,
  getHorario,
  setHorario,
  setHorarioEnMemoria,
  invalidateHorarioCache,
  init,
  esDiaNoLaborable,
  formatearDias,
  formatearHorarioAtencion,
  getHoraAperturaFormateada,
  getHoraCierreFormateada,
  getProximoDiaHabil,
};
