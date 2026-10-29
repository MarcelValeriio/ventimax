/**
 * catalogo/js/entrega.js
 * Entrega elegida en el carrito (F2c), sin acceso al DOM para poder probarla con Node: qué se manda al servidor
 * y cuándo está completa. El servidor vuelve a validar el método y toma el costo de la base.
 */

/** Largo mínimo de una dirección escrita (igual que el servidor). */
export const MIN_DIRECCION = 8;
export const MAX_DIRECCION = 300;

/** Coordenadas con 6 decimales (~10 cm): suficiente para el repartidor y no más de lo necesario. */
export function redondearCoordenada(valor) {
  return Math.round(Number(valor) * 1e6) / 1e6;
}

function coordenadasValidas(gps) {
  return (
    gps &&
    Number.isFinite(gps.latitud) &&
    Number.isFinite(gps.longitud) &&
    Math.abs(gps.latitud) <= 90 &&
    Math.abs(gps.longitud) <= 180
  );
}

/** La ubicación del teléfono solo aplica al delivery en la ciudad; un envío nacional se arma con datos escritos. */
export function usaGps(metodo) {
  return Boolean(metodo && metodo.tipo === "delivery_local");
}

/**
 * ¿Ya se puede pedir? Retiro no pide nada más; el delivery necesita la ubicación del teléfono o una dirección
 * escrita, y los demás (envío nacional) los datos escritos.
 * @param {{ metodo?: { id: string, tipo: string }, gps?: { latitud: number, longitud: number } | null, direccion?: string }} seleccion
 */
export function entregaCompleta(seleccion) {
  if (!seleccion || !seleccion.metodo || !seleccion.metodo.id) return false;
  if (seleccion.metodo.tipo === "retiro") return true;
  if (usaGps(seleccion.metodo) && coordenadasValidas(seleccion.gps)) return true;
  return String(seleccion.direccion || "").trim().length >= MIN_DIRECCION;
}

/**
 * Cuerpo `entrega` para POST /api/public/pedidos: solo el id del método, la ubicación y la dirección.
 * Nunca el costo ni el nombre (los pone el servidor). Null si no hay método elegido.
 */
export function armarEntrega(seleccion) {
  if (!seleccion || !seleccion.metodo || !seleccion.metodo.id) return null;
  const entrega = { metodoId: String(seleccion.metodo.id) };
  if (seleccion.metodo.tipo === "retiro") return entrega;
  if (usaGps(seleccion.metodo) && coordenadasValidas(seleccion.gps)) {
    entrega.latitud = redondearCoordenada(seleccion.gps.latitud);
    entrega.longitud = redondearCoordenada(seleccion.gps.longitud);
  }
  const direccion = String(seleccion.direccion || "").trim().slice(0, MAX_DIRECCION);
  if (direccion) entrega.direccion = direccion;
  return entrega;
}

/** Costo del método para el resumen: fijo (número), a convenir o sin costo. */
export function costoEntrega(metodo) {
  if (!metodo) return { tipo: "pendiente", monto: 0 };
  if (metodo.aConvenir || metodo.costo === null) return { tipo: "a_convenir", monto: 0 };
  const monto = Number(metodo.costo) || 0;
  return monto > 0 ? { tipo: "fijo", monto } : { tipo: "gratis", monto: 0 };
}

/** Enlace para ver un punto en el mapa (el mismo que recibe el negocio por WhatsApp). */
export function enlaceMapa(gps) {
  if (!coordenadasValidas(gps)) return "";
  return `https://maps.google.com/?q=${redondearCoordenada(gps.latitud).toFixed(6)},${redondearCoordenada(gps.longitud).toFixed(6)}`;
}
