/**
 * catalogo/js/sucursales.js
 * Lógica pura (sin DOM) para selectores en cascada de sucursales de envío nacional (F2n).
 * Testeable en Node.js.
 */

export const REGEX_SUCURSAL_ID = /^[a-z]+-[A-Za-z0-9-]+$/;
export const MAX_LARGO_ID = 40;

/**
 * Determina si una empresa de un método de envío cuenta con directorio de sucursales activo.
 * @param {object} metodo - Método de envío seleccionado.
 * @param {string} nombreEmpresa - Nombre de la empresa elegida.
 * @returns {boolean}
 */
export function empresaTieneSucursales(metodo, nombreEmpresa) {
  if (!metodo || !Array.isArray(metodo.empresas) || !nombreEmpresa) return false;
  const emp = metodo.empresas.find(
    (e) => e && typeof e === "object" && e.nombre === nombreEmpresa
  );
  return Boolean(emp && emp.conSucursales === true && emp.slug);
}

/**
 * Obtiene el slug de la empresa de envío si tiene sucursales activas.
 * @param {object} metodo
 * @param {string} nombreEmpresa
 * @returns {string}
 */
export function slugEmpresa(metodo, nombreEmpresa) {
  if (!metodo || !Array.isArray(metodo.empresas) || !nombreEmpresa) return "";
  const emp = metodo.empresas.find(
    (e) => e && typeof e === "object" && e.nombre === nombreEmpresa
  );
  return emp && emp.conSucursales ? String(emp.slug || "").trim().toLowerCase() : "";
}

/**
 * Valida el formato del identificador de la sucursal (ej: zoom-1234).
 * @param {string} id
 * @returns {boolean}
 */
export function validarSucursalId(id) {
  if (typeof id !== "string") return false;
  const limpio = id.trim();
  if (limpio.length === 0 || limpio.length > MAX_LARGO_ID) return false;
  return REGEX_SUCURSAL_ID.test(limpio);
}

/**
 * Formato de etiqueta para opción de estado: "Zulia (45)".
 */
export function formatearOpcionEstado(estado, cantidad) {
  const c = Number(cantidad) || 0;
  return `${estado} (${c})`;
}

/**
 * Formato de etiqueta para opción de sucursal: "código · nombre — ciudad".
 */
export function formatearOpcionSucursal(sucursal) {
  if (!sucursal) return "";
  const codigo = String(sucursal.codigo || "").trim();
  const nombre = String(sucursal.nombre || "").trim();
  const ciudad = String(sucursal.ciudad || "").trim();
  return `${codigo} · ${nombre} — ${ciudad}`;
}

/**
 * Formato resumido para la vista previa del carrito: "código · nombre (dirección)".
 */
export function formatearDetalleSucursal(sucursal) {
  if (!sucursal) return "";
  const codigo = String(sucursal.codigo || "").trim();
  const nombre = String(sucursal.nombre || "").trim();
  const direccion = String(sucursal.direccion || "").trim();
  return `${codigo} · ${nombre} (${direccion})`;
}

/**
 * Limpia el estado de sucursales al cambiar de empresa de envío.
 * @param {object} state
 */
export function limpiarCascadaAlCambiarEmpresa(state) {
  if (!state) return;
  state.estadoSucursal = "";
  state.sucursalId = "";
  state.sucursal = null;
  state.sucursalesFallo = false;
}

/**
 * Limpia la sucursal seleccionada al cambiar de estado.
 * @param {object} state
 */
export function limpiarCascadaAlCambiarEstado(state) {
  if (!state) return;
  state.sucursalId = "";
  state.sucursal = null;
}

/**
 * Verifica si la entrega nacional con sucursales está completa para habilitar el pedido.
 * Si la empresa no tiene sucursales, retorna true.
 * Si falló la API (sucursalesFallo: true), requiere dirección manual >= 8 caracteres.
 * Si no falló, requiere sucursalId válido y sucursal cargada.
 * @param {object} seleccion - Objeto de entrega del carrito.
 * @returns {boolean}
 */
export function entregaConSucursalCompleta(seleccion) {
  if (!seleccion || !seleccion.metodo) return false;
  const tieneSuc = empresaTieneSucursales(seleccion.metodo, seleccion.empresa);
  if (!tieneSuc) return true;

  if (seleccion.sucursalesFallo) {
    return String(seleccion.direccion || "").trim().length >= 8;
  }

  return Boolean(
    seleccion.sucursalId &&
    validarSucursalId(seleccion.sucursalId) &&
    seleccion.sucursal
  );
}
