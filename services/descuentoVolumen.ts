/**
 * Descuento por volumen (F1-9). Funciones puras: sin BD, sin red, sin configuración global.
 *
 * Reglas (decididas por el dueño, 2026-11-04):
 * - Solo cuentan (y solo reciben el descuento) las unidades de productos sin descuento propio
 *   (descuentoProductoPct === 0). Un producto en oferta no cuenta ni se suma.
 * - Se aplica el tramo más alto alcanzado; los tramos no se suman.
 * - Monto = subtotal elegible * pct / 100, redondeado a centavos una sola vez sobre el subtotal.
 * - Un valor inválido (cantidad, precio o descuento) cuenta 0: nunca se cobra un descuento inventado.
 */

export const CANTIDAD_MAX_LINEA = 50;
const TRAMOS_MAX = 5;
const MIN_UNIDADES_MIN = 2;
const MIN_UNIDADES_MAX = 500;
const PCT_MIN = 1;
const PCT_MAX = 50;

export interface TramoDescuentoVolumen {
  minUnidades: number;
  pct: number;
}

export interface ConfigDescuentoVolumen {
  activo: boolean;
  tramos: TramoDescuentoVolumen[];
}

export interface LineaDescuentoVolumen {
  precioBase: unknown;
  descuentoProductoPct: unknown;
  cantidad: unknown;
}

export interface ResumenDescuentoVolumen {
  pct: number;
  montoUsd: number;
  unidadesElegibles: number;
}

export interface ResultadoDescuentoVolumen extends ResumenDescuentoVolumen {
  subtotalElegible: number;
}

type ResultadoValidacion<T> = { ok: true; value: T } | { ok: false; error: string };

/** Entero a partir de un número (texto, decimales o NaN no cuentan). */
function aEntero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isInteger(valor) ? valor : null;
}

/** Cantidad válida de una línea: entero de 1 a 50. Cualquier otro valor cuenta 0. */
function cantidadValida(valor: unknown): number {
  const n = aEntero(valor);
  return n !== null && n >= 1 && n <= CANTIDAD_MAX_LINEA ? n : 0;
}

/** Precio base válido: número finito no negativo. Cualquier otro valor cuenta 0. */
function precioValido(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : 0;
}

/** Solo un descuento propio igual a 0 (entero) hace elegible la línea. */
function sinDescuentoPropio(valor: unknown): boolean {
  return aEntero(valor) === 0;
}

function redondearCentavos(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Valida la configuración del descuento por volumen.
 * activo: booleano. tramos: de 1 a 5, minUnidades entero 2-500 y pct entero 1-50,
 * ambos estrictamente crecientes.
 */
export function validarConfigDescuentoVolumen(cfg: unknown): ResultadoValidacion<ConfigDescuentoVolumen> {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return { ok: false, error: "La configuración del descuento por volumen no es válida." };
  }
  const c = cfg as Record<string, unknown>;
  if (typeof c.activo !== "boolean") {
    return { ok: false, error: "El interruptor del descuento por volumen debe ser sí o no." };
  }
  if (!Array.isArray(c.tramos) || c.tramos.length < 1 || c.tramos.length > TRAMOS_MAX) {
    return { ok: false, error: `Indica de 1 a ${TRAMOS_MAX} tramos de descuento.` };
  }

  const tramos: TramoDescuentoVolumen[] = [];
  for (const t of c.tramos as unknown[]) {
    const tr = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    const min = aEntero(tr.minUnidades);
    const pct = aEntero(tr.pct);
    if (min === null || min < MIN_UNIDADES_MIN || min > MIN_UNIDADES_MAX) {
      return { ok: false, error: `Las unidades mínimas de cada tramo deben ser enteras entre ${MIN_UNIDADES_MIN} y ${MIN_UNIDADES_MAX}.` };
    }
    if (pct === null || pct < PCT_MIN || pct > PCT_MAX) {
      return { ok: false, error: `El porcentaje de cada tramo debe ser entero entre ${PCT_MIN} y ${PCT_MAX}.` };
    }
    tramos.push({ minUnidades: min, pct });
  }

  for (let i = 1; i < tramos.length; i++) {
    if (tramos[i].minUnidades <= tramos[i - 1].minUnidades) {
      return { ok: false, error: "Las unidades mínimas de los tramos deben ir de menor a mayor." };
    }
    if (tramos[i].pct <= tramos[i - 1].pct) {
      return { ok: false, error: "El porcentaje de los tramos debe subir de un tramo al siguiente." };
    }
  }

  return { ok: true, value: { activo: c.activo, tramos } };
}

/**
 * Calcula el descuento por volumen de un conjunto de líneas.
 * Si la configuración está apagada o no es válida, el porcentaje y el monto son 0.
 */
export function calcularDescuentoVolumen(items: LineaDescuentoVolumen[], config: unknown): ResultadoDescuentoVolumen {
  let unidadesElegibles = 0;
  let subtotalElegible = 0;

  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !sinDescuentoPropio(it.descuentoProductoPct)) continue;
    const cantidad = cantidadValida(it.cantidad);
    if (cantidad === 0) continue;
    unidadesElegibles += cantidad;
    subtotalElegible += precioValido(it.precioBase) * cantidad;
  }

  const validacion = validarConfigDescuentoVolumen(config);
  let pct = 0;
  if (validacion.ok && validacion.value.activo) {
    for (const tramo of validacion.value.tramos) {
      if (unidadesElegibles >= tramo.minUnidades) pct = tramo.pct;
    }
  }

  const montoUsd = pct > 0 ? redondearCentavos((subtotalElegible * pct) / 100) : 0;
  return {
    unidadesElegibles,
    pct,
    subtotalElegible: redondearCentavos(subtotalElegible),
    montoUsd,
  };
}

/** Resumen que se guarda en el carrito web, el pedido y la venta manual. */
export function resumenDescuentoVolumen(items: LineaDescuentoVolumen[], config: unknown): ResumenDescuentoVolumen {
  const r = calcularDescuentoVolumen(items, config);
  return { pct: r.pct, montoUsd: r.montoUsd, unidadesElegibles: r.unidadesElegibles };
}

/** Configuración apagada o sin tramos válidos: nunca aplica descuento. */
export const SIN_DESCUENTO_VOLUMEN: ConfigDescuentoVolumen = { activo: false, tramos: [] };
