/**
 * services/catalogQuery.ts
 * Helper centralizado para consultas de catálogo y soporte multicategoría.
 * Regla única: un producto pertenece a la categoría X si `categoria === X` o `categorias` contiene X.
 */

/**
 * Genera el filtro de MongoDB / Mongoose para consultar productos que pertenezcan a una categoría.
 * Si no se proporciona categoriaId (null, undefined o vacío), devuelve un objeto vacío `{}` (sin filtro).
 * @param categoriaId ObjectId o string de la categoría
 */
export function filtroPorCategoria(categoriaId: any): { $or?: any[] } | Record<string, never> {
  if (!categoriaId) return {};
  const id = categoriaId._id ? categoriaId._id : categoriaId;
  return {
    $or: [
      { categoria: id },
      { categorias: id }
    ]
  };
}

/**
 * Verifica en memoria si un producto pertenece a una categoría dada.
 * @param producto Objeto producto
 * @param categoriaId ObjectId, string u objeto categoría
 */
export function productoPerteneceACategoria(producto: any, categoriaId: any): boolean {
  if (!producto || !categoriaId) return false;
  const targetId = String(categoriaId._id || categoriaId);
  const catPrincipal = producto.categoria ? String(producto.categoria._id || producto.categoria) : null;
  if (catPrincipal === targetId) return true;
  if (Array.isArray(producto.categorias)) {
    return producto.categorias.some((c: any) => String(c?._id || c) === targetId);
  }
  return false;
}

/**
 * Retorna todos los IDs de categoría únicos a los que pertenece un producto.
 */
export function obtenerCategoriasDeProducto(producto: any): string[] {
  if (!producto) return [];
  const ids = new Set<string>();
  if (producto.categoria) {
    ids.add(String(producto.categoria._id || producto.categoria));
  }
  if (Array.isArray(producto.categorias)) {
    for (const c of producto.categorias) {
      if (c) ids.add(String(c._id || c));
    }
  }
  return Array.from(ids);
}

module.exports = {
  filtroPorCategoria,
  productoPerteneceACategoria,
  obtenerCategoriasDeProducto
};
