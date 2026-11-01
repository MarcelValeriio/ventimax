/**
 * catalogo/js/relacionados.js
 * Selección determinista de artículos relacionados para la ficha de producto (F2k).
 * Módulo sin DOM ni efectos secundarios; apto para pruebas en Node y empaquetado en navegador.
 */

/**
 * Comprueba si una lista de categorías incluye una categoría específica
 * (comparación insensible a mayúsculas y espacios).
 *
 * @param {Array} categorias
 * @param {string} categoriaBuscada
 * @returns {boolean}
 */
function tieneCategoria(categorias, categoriaBuscada) {
  if (!Array.isArray(categorias) || !categoriaBuscada) return false;
  const buscada = String(categoriaBuscada).toLowerCase().trim();
  return categorias.some((c) => String(c).toLowerCase().trim() === buscada);
}

/**
 * Selecciona hasta `limite` productos relacionados a partir del catálogo:
 * 1. Misma categoría principal (la primera de sus `categorias`).
 * 2. Excluye el producto actual y los inactivos.
 * 3. Orden: primero los disponibles, luego los agotados; dentro de cada grupo,
 *    el precio más cercano al del producto actual y, a igualdad, por nombre.
 * 4. Si la categoría no alcanza para `limite`, se completa con productos de
 *    las otras categorías del producto, con el mismo criterio.
 * 5. Si no hay ninguno, devuelve un arreglo vacío.
 * 6. Determinista: siempre el mismo resultado para los mismos datos.
 *
 * @param {object} productoActual - Producto en vista ({ id, precioUsd, categorias, disponible, ... })
 * @param {Array|object} catalogo - Lista de productos o { productos: [...] }
 * @param {number} [limite=3] - Máximo de productos a devolver (por defecto 3)
 * @returns {Array} Productos relacionados seleccionados
 */
export function seleccionarRelacionados(productoActual, catalogo, limite = 3) {
  if (!productoActual || typeof productoActual !== "object" || !catalogo) {
    return [];
  }

  const productos = Array.isArray(catalogo)
    ? catalogo
    : Array.isArray(catalogo.productos)
    ? catalogo.productos
    : [];

  if (productos.length === 0) {
    return [];
  }

  const categoriasActual = Array.isArray(productoActual.categorias)
    ? productoActual.categorias.filter((c) => typeof c === "string" && c.trim() !== "")
    : [];

  if (categoriasActual.length === 0) {
    return [];
  }

  const idActual = productoActual.id ?? productoActual._id;
  const categoriaPrincipal = categoriasActual[0];
  const otrasCategorias = categoriasActual.slice(1);

  const precioRef = Number(
    productoActual.precioUsd ?? productoActual.precio ?? productoActual.price ?? 0
  );

  /**
   * Comparador determinista:
   * 1. Disponibles (true) antes que agotados (false)
   * 2. Menor distancia absoluta de precio respecto al producto actual
   * 3. Orden alfabético por nombre (localeCompare con locale 'es')
   */
  const compararProductos = (a, b) => {
    const dispA = a.disponible !== false;
    const dispB = b.disponible !== false;
    if (dispA !== dispB) {
      return dispA ? -1 : 1;
    }

    const precioA = Number(a.precioUsd ?? a.precio ?? a.price ?? 0);
    const precioB = Number(b.precioUsd ?? b.precio ?? b.price ?? 0);
    const diffA = Math.abs(precioA - precioRef);
    const diffB = Math.abs(precioB - precioRef);
    const diffDiff = Math.abs(diffA - diffB);

    if (diffDiff > 0.000001) {
      return diffA - diffB;
    }

    const nomA = String(a.nombre || a.name || "");
    const nomB = String(b.nombre || b.name || "");
    return nomA.localeCompare(nomB, "es", { sensitivity: "base" });
  };

  // Fase 1: Misma categoría principal
  const candidatosPrincipal = productos.filter((p) => {
    if (!p || typeof p !== "object") return false;
    const pid = p.id ?? p._id;
    if (idActual && pid && pid === idActual) return false;
    if (p.activo === false) return false;
    return tieneCategoria(p.categorias, categoriaPrincipal);
  });

  candidatosPrincipal.sort(compararProductos);
  const seleccionados = candidatosPrincipal.slice(0, limite);

  // Fase 2: Completar con otras categorías si no alcanza para `limite`
  if (seleccionados.length < limite && otrasCategorias.length > 0) {
    const yaElegidos = new Set(
      seleccionados.map((s) => s.id ?? s._id).filter(Boolean)
    );

    const candidatosOtras = productos.filter((p) => {
      if (!p || typeof p !== "object") return false;
      const pid = p.id ?? p._id;
      if (idActual && pid && pid === idActual) return false;
      if (p.activo === false) return false;
      if (pid && yaElegidos.has(pid)) return false;
      return otrasCategorias.some((cat) => tieneCategoria(p.categorias, cat));
    });

    candidatosOtras.sort(compararProductos);
    const faltantes = limite - seleccionados.length;
    seleccionados.push(...candidatosOtras.slice(0, faltantes));
  }

  return seleccionados;
}
