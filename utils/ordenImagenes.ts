/**
 * Valida el orden para reordenar imágenes: `orden[i]` es el índice ACTUAL de la imagen que pasa a la posición i.
 * Debe ser una permutación exacta de 0..n-1.
 */
export function esOrdenValido(orden: unknown, n: number): orden is number[] {
  if (!Array.isArray(orden) || orden.length !== n) return false;
  const vistos = new Set<number>();
  for (const valor of orden) {
    if (!Number.isInteger(valor) || valor < 0 || valor >= n || vistos.has(valor)) return false;
    vistos.add(valor);
  }
  return true;
}
