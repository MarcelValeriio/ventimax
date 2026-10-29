/**
 * catalogo/js/carrito.js
 * Módulo puro para la gestión del carrito de compras.
 * Diseñado sin dependencias del DOM para ejecución en navegador y Node.js.
 */

export const MIN_CANTIDAD_POR_LINEA = 1;
export const MAX_CANTIDAD_POR_LINEA = 50;
export const MAX_LINEAS_CARRITO = 20;
export const STORAGE_KEY = "catalogo_carrito";

/**
 * Valida y normaliza la cantidad dentro del rango [1, 50].
 */
export function normalizarCantidad(cantidad) {
  const num = Math.floor(Number(cantidad));
  if (isNaN(num) || num < MIN_CANTIDAD_POR_LINEA) {
    return MIN_CANTIDAD_POR_LINEA;
  }
  if (num > MAX_CANTIDAD_POR_LINEA) {
    return MAX_CANTIDAD_POR_LINEA;
  }
  return num;
}

/**
 * Agrega un producto al carrito respetando los límites de unidades (1-50) y líneas (máx 20).
 * Si el producto ya existe en el carrito, incrementa su cantidad sin superar 50.
 * Si no existe y ya hay 20 líneas distintas, no agrega nada.
 * Retorna un nuevo array de items: [{ productoId, cantidad }].
 */
export function agregarProducto(items = [], productoId, cantidad = 1) {
  if (!productoId || typeof productoId !== "string") {
    return Array.isArray(items) ? [...items] : [];
  }

  const pid = productoId.trim();
  if (!pid) return Array.isArray(items) ? [...items] : [];

  const cant = normalizarCantidad(cantidad);
  const copia = Array.isArray(items) ? items.map((i) => ({ ...i })) : [];
  const index = copia.findIndex((i) => i.productoId === pid);

  if (index >= 0) {
    const nuevaCant = Math.min(MAX_CANTIDAD_POR_LINEA, copia[index].cantidad + cant);
    copia[index].cantidad = nuevaCant;
    return copia;
  }

  if (copia.length >= MAX_LINEAS_CARRITO) {
    // Límite de líneas alcanzado
    return copia;
  }

  copia.push({ productoId: pid, cantidad: cant });
  return copia;
}

/**
 * Actualiza la cantidad de un producto. Si cantidad <= 0, elimina la línea.
 * Si cantidad > 50, la limita a 50.
 */
export function actualizarCantidad(items = [], productoId, cantidad) {
  if (!productoId || !Array.isArray(items)) {
    return Array.isArray(items) ? [...items] : [];
  }

  const pid = String(productoId).trim();
  const num = Math.floor(Number(cantidad));

  if (isNaN(num) || num <= 0) {
    return items.filter((i) => i.productoId !== pid);
  }

  const cant = Math.min(MAX_CANTIDAD_POR_LINEA, num);
  return items.map((i) => (i.productoId === pid ? { ...i, cantidad: cant } : { ...i }));
}

/**
 * Elimina un producto del carrito.
 */
export function eliminarProducto(items = [], productoId) {
  if (!productoId || !Array.isArray(items)) {
    return Array.isArray(items) ? [...items] : [];
  }
  const pid = String(productoId).trim();
  return items.filter((i) => i.productoId !== pid);
}

/**
 * Vacía el carrito.
 */
export function vaciarCarrito() {
  return [];
}

/**
 * Retorna el total de unidades sumadas de todas las líneas.
 */
export function obtenerTotalUnidades(items = []) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, item) => acc + (Number(item?.cantidad) || 0), 0);
}

/**
 * Construye estrictamente el cuerpo para POST /api/public/pedidos.
 * Incluye { items: [{ productoId, cantidad }], website: "" } y, si el cliente la eligió, la entrega
 * ya armada por entrega.js (id del método, ubicación y dirección).
 * Prohibido enviar precios, nombres, subtotales ni costos: los calcula el servidor.
 */
export function armarCuerpoPedido(items = [], website = "", entrega = null) {
  const listaValida = (Array.isArray(items) ? items : [])
    .filter((i) => i && typeof i.productoId === "string" && i.productoId.trim() !== "")
    .map((i) => ({
      productoId: String(i.productoId).trim(),
      cantidad: normalizarCantidad(i.cantidad),
    }));

  const cuerpo = {
    items: listaValida,
    website: typeof website === "string" ? website : "",
  };
  if (entrega && typeof entrega.metodoId === "string") cuerpo.entrega = entrega;
  return cuerpo;
}

/**
 * Serializa los items a JSON asegurando que solo contengan productoId y cantidad.
 */
export function serializarCarrito(items = []) {
  const lista = (Array.isArray(items) ? items : [])
    .filter((i) => i && typeof i.productoId === "string" && i.productoId.trim() !== "")
    .map((i) => ({
      productoId: String(i.productoId).trim(),
      cantidad: normalizarCantidad(i.cantidad),
    }));
  return JSON.stringify(lista);
}

/**
 * Deserializa un string JSON al array de items con validación estricta de tipos.
 */
export function deserializarCarrito(jsonString) {
  if (!jsonString || typeof jsonString !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) return [];

    const resultado = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item.productoId === "string" &&
        item.productoId.trim() !== "" &&
        typeof item.cantidad !== "undefined"
      ) {
        resultado.push({
          productoId: item.productoId.trim(),
          cantidad: normalizarCantidad(item.cantidad),
        });
      }
      if (resultado.length >= MAX_LINEAS_CARRITO) break;
    }
    return resultado;
  } catch (_e) {
    return [];
  }
}

/**
 * Carga el carrito desde un objeto de almacenamiento (por defecto localStorage).
 */
export function cargarCarritoDesdeStorage(storage) {
  const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!s || typeof s.getItem !== "function") return [];
  try {
    const raw = s.getItem(STORAGE_KEY);
    return deserializarCarrito(raw);
  } catch (_e) {
    return [];
  }
}

/**
 * Guarda el carrito en un objeto de almacenamiento (por defecto localStorage).
 */
export function guardarCarritoEnStorage(items = [], storage) {
  const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!s || typeof s.setItem !== "function") return;
  try {
    const json = serializarCarrito(items);
    s.setItem(STORAGE_KEY, json);
  } catch (_e) {
    // Almacenamiento lleno o deshabilitado
  }
}

/**
 * Limpia el carrito del almacenamiento.
 */
export function limpiarCarritoEnStorage(storage) {
  const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!s || typeof s.removeItem !== "function") return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch (_e) {
    // Error silencioso
  }
}
