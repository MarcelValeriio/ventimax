/**
 * services/medidasProducto.ts (F1-7)
 *
 * Peso y medidas de la caja del producto: pesoKg (kg), altoCm, anchoCm, profundidadCm (cm).
 * Funciones puras: sin BD ni DOM. Las usan el controlador (POST/PUT), la importación Excel/CSV y la suite.
 * Reglas: undefined = no tocar; null o "" = quitar el dato; el separador decimal puede ser coma o punto.
 * No se exponen en la API pública (publicController no cambia).
 */

export interface ReglaMedida {
  titulo: string; // encabezado en la hoja de importación
  etiqueta: string; // texto de los mensajes de error
  min: number;
  max: number;
  minExclusivo: boolean; // true = debe ser mayor que min (medidas en cm)
  decimales: number;
}

export const MEDIDAS: Record<string, ReglaMedida> = {
  pesoKg: { titulo: "Peso (kg)", etiqueta: "El peso (kg)", min: 0, max: 1000, minExclusivo: false, decimales: 3 },
  altoCm: { titulo: "Alto (cm)", etiqueta: "El alto (cm)", min: 0, max: 500, minExclusivo: true, decimales: 1 },
  anchoCm: { titulo: "Ancho (cm)", etiqueta: "El ancho (cm)", min: 0, max: 500, minExclusivo: true, decimales: 1 },
  profundidadCm: { titulo: "Profundidad (cm)", etiqueta: "La profundidad (cm)", min: 0, max: 500, minExclusivo: true, decimales: 1 },
};

export const CLAVES_MEDIDAS = Object.keys(MEDIDAS);

export interface ResultadoMedida {
  ok: boolean;
  valor?: number | null; // undefined = no tocar, null = quitar
  error?: string;
}

/** Valida y normaliza una medida. Acepta número o texto con coma o punto decimal. */
export function normalizarMedida(clave: string, entrada: any): ResultadoMedida {
  const regla = MEDIDAS[clave];
  if (!regla) return { ok: false, error: "Medida desconocida." };
  if (entrada === undefined) return { ok: true, valor: undefined };
  if (entrada === null) return { ok: true, valor: null };

  let n: number;
  if (typeof entrada === "string") {
    const t = entrada.trim();
    if (t === "") return { ok: true, valor: null };
    const limpio = t.replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(limpio)) return { ok: false, error: `${regla.etiqueta} debe ser un número.` };
    n = Number(limpio);
  } else if (typeof entrada === "number") {
    if (!Number.isFinite(entrada)) return { ok: false, error: `${regla.etiqueta} debe ser un número.` };
    n = entrada;
  } else {
    return { ok: false, error: `${regla.etiqueta} debe ser un número.` };
  }

  const fuera = regla.minExclusivo ? n <= regla.min : n < regla.min;
  if (fuera || n > regla.max) {
    const minTexto = regla.minExclusivo ? "mayor a 0" : "mayor o igual a 0";
    return { ok: false, error: `${regla.etiqueta} debe ser ${minTexto} y no más de ${regla.max}.` };
  }
  const f = 10 ** regla.decimales;
  if (Math.abs(Math.round(n * f) - n * f) > 1e-7) {
    return { ok: false, error: `${regla.etiqueta} admite hasta ${regla.decimales} decimal${regla.decimales === 1 ? "" : "es"}.` };
  }
  return { ok: true, valor: n };
}

/** Valida las cuatro medidas de un producto. Solo devuelve las claves que llegan (las ausentes no se tocan). */
export function validarMedidasProducto(datos: Record<string, any>): { ok: boolean; valor: Record<string, number | null>; errores: string[] } {
  const valor: Record<string, number | null> = {};
  const errores: string[] = [];
  for (const clave of CLAVES_MEDIDAS) {
    if (datos[clave] === undefined) continue;
    const r = normalizarMedida(clave, datos[clave]);
    if (!r.ok) errores.push(r.error as string);
    else valor[clave] = r.valor as number | null;
  }
  return { ok: errores.length === 0, valor, errores };
}

/** Texto para una celda de exportación: vacío si no hay dato. */
export function celdaMedida(v: any): string {
  return v === null || v === undefined || v === "" ? "" : String(v);
}
