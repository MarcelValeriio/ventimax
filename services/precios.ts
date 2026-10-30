/**
 * Precio vigente de un producto (F2g). Única fuente de verdad para el descuento por producto.
 * `price` es el precio BASE; el precio vigente se cobra en la tienda, el bot, la venta manual,
 * el menú dinámico y el catálogo que recibe la IA.
 * Los ítems que ya están en un carrito o pedido conservan el precio con el que se agregaron.
 */

const DESCUENTO_MAX = 90;

/**
 * Descuento del producto como entero de 0 a 90. Un valor inválido (ausente, negativo, mayor a 90,
 * decimal o texto que no sea un entero) cuenta como 0: nunca se cobra un descuento inventado.
 */
function descuentoVigente(producto: any): number {
  const bruto = producto ? producto.descuentoPct : undefined;
  if (bruto === undefined || bruto === null) return 0;
  const n = typeof bruto === "string" && bruto.trim() !== "" ? Number(bruto) : bruto;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > DESCUENTO_MAX) return 0;
  return n;
}

/**
 * Precio que se cobra hoy: price * (100 - descuentoPct) / 100, redondeado a centavos.
 * Sin descuento devuelve el precio base tal cual.
 */
function precioVigente(producto: any): number {
  const base = Number(producto?.price) || 0;
  const pct = descuentoVigente(producto);
  if (pct === 0) return base;
  return Math.round(base * (100 - pct)) / 100;
}

/**
 * Texto corto del precio para los mensajes del bot, pensado para ir entre paréntesis:
 * "$32, -20%" con descuento, "$40" sin él.
 */
function etiquetaPrecio(producto: any): string {
  const pct = descuentoVigente(producto);
  const precio = `$${precioVigente(producto)}`;
  return pct > 0 ? `${precio}, -${pct}%` : precio;
}

module.exports = {
  descuentoVigente,
  precioVigente,
  etiquetaPrecio,
  DESCUENTO_MAX,
};

// Módulo con alcance propio (evita globales entre scripts)
export {};
