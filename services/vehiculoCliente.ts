/**
 * services/vehiculoCliente.ts (F1-4)
 *
 * Normalización y validación del vehículo del cliente.
 * Funciones puras: sin BD ni DOM.
 */
import { normalizarTexto } from "./productoAmpliado";

export interface IVehiculoInput {
  marca?: string | null;
  modelo?: string | null;
  anio?: number | string | null;
  motor?: string | null;
  version?: string | null;
}

export interface IVehiculoNormalizado {
  marca: string;
  modelo: string;
  marcaNorm: string;
  modeloNorm: string;
  anio: number | null;
  motor: string;
  version: string;
}

export interface ResultadoValidacionVehiculo {
  ok: boolean;
  valor: IVehiculoNormalizado | null;
  errores: string[];
}

export const LIMITES_VEHICULO = {
  marca: 60,
  modelo: 60,
  motor: 20,
  version: 40,
  anioMin: 1950,
  anioMax: 2100,
};

/**
 * Valida y normaliza los datos del vehículo de un cliente.
 * Si todos los campos están vacíos o null, se considera borrado / sin vehículo ({ ok: true, valor: null }).
 */
export function validarVehiculo(datos: any): ResultadoValidacionVehiculo {
  if (datos === null || datos === undefined) {
    return { ok: true, valor: null, errores: [] };
  }
  if (typeof datos !== "object" || Array.isArray(datos)) {
    return { ok: false, valor: null, errores: ["El formato del vehículo no es válido"] };
  }

  const errores: string[] = [];

  const marcaRaw = typeof datos.marca === "string" ? datos.marca.trim() : "";
  const modeloRaw = typeof datos.modelo === "string" ? datos.modelo.trim() : "";
  const motorRaw = typeof datos.motor === "string" ? datos.motor.trim() : "";
  const versionRaw = typeof datos.version === "string" ? datos.version.trim() : "";

  const anioVacio = datos.anio === undefined || datos.anio === null || datos.anio === "";

  // Si todos los campos son vacíos, se interpreta como borrar vehículo
  if (!marcaRaw && !modeloRaw && !motorRaw && !versionRaw && anioVacio) {
    return { ok: true, valor: null, errores: [] };
  }

  if (marcaRaw.length > LIMITES_VEHICULO.marca) {
    errores.push(`La marca no puede superar los ${LIMITES_VEHICULO.marca} caracteres`);
  }
  if (modeloRaw.length > LIMITES_VEHICULO.modelo) {
    errores.push(`El modelo no puede superar los ${LIMITES_VEHICULO.modelo} caracteres`);
  }
  if (motorRaw.length > LIMITES_VEHICULO.motor) {
    errores.push(`El motor no puede superar los ${LIMITES_VEHICULO.motor} caracteres`);
  }
  if (versionRaw.length > LIMITES_VEHICULO.version) {
    errores.push(`La versión no puede superar los ${LIMITES_VEHICULO.version} caracteres`);
  }

  let anioNum: number | null = null;
  if (!anioVacio) {
    const parsed = Number(datos.anio);
    if (!Number.isInteger(parsed)) {
      errores.push("El año del vehículo debe ser un número entero");
    } else if (parsed < LIMITES_VEHICULO.anioMin || parsed > LIMITES_VEHICULO.anioMax) {
      errores.push(`El año debe estar entre ${LIMITES_VEHICULO.anioMin} y ${LIMITES_VEHICULO.anioMax}`);
    } else {
      anioNum = parsed;
    }
  }

  if (errores.length > 0) {
    return { ok: false, valor: null, errores };
  }

  return {
    ok: true,
    valor: {
      marca: marcaRaw,
      modelo: modeloRaw,
      marcaNorm: normalizarTexto(marcaRaw),
      modeloNorm: normalizarTexto(modeloRaw),
      anio: anioNum,
      motor: motorRaw,
      version: versionRaw,
    },
    errores: [],
  };
}

/**
 * Genera una representación textual legible del vehículo:
 * "Toyota Corolla 2012 1.8" (omite los campos vacíos).
 */
export function describirVehiculo(v: any): string {
  if (!v || typeof v !== "object") return "";
  const partes = [
    typeof v.marca === "string" ? v.marca.trim() : "",
    typeof v.modelo === "string" ? v.modelo.trim() : "",
    v.anio ? String(v.anio).trim() : "",
    typeof v.motor === "string" ? v.motor.trim() : "",
    typeof v.version === "string" ? v.version.trim() : "",
  ].filter(Boolean);

  return partes.join(" ");
}

