/**
 * Nombres e íconos de las áreas de auditoría (tipoRecurso) y títulos de las acciones.
 * Lo que no está en los mapas se muestra humanizado (guiones bajos a espacios, primera letra en mayúscula).
 */

const AREAS = {
  pedido: { nombre: "Pedidos", icono: "receipt" },
  producto: { nombre: "Productos", icono: "package" },
  categoria: { nombre: "Categorías", icono: "tags" },
  metodo_envio: { nombre: "Envíos", icono: "truck" },
  metodo_pago: { nombre: "Pagos", icono: "credit-card" },
  usuario: { nombre: "Usuarios", icono: "user" },
  config: { nombre: "Configuración", icono: "settings" },
  bot: { nombre: "Bot", icono: "bot" },
};

const ACCIONES = {
  cambio_estado: "Cambio de estado",
  pago_confirmado: "Pago confirmado",
  venta_manual: "Venta manual",
  reset_bot: "Bot reiniciado",
  reactivar_bot: "Bot reactivado",
  modificar_envio_pedido: "Envío modificado",
  subir_imagen_producto: "Imagen subida",
  eliminar_imagen_producto: "Imagen eliminada",
  marcar_imagen_principal_producto: "Imagen principal",
  update: "Actualizado",
  eliminado: "Eliminado",
};

/** Texto legible a partir de un identificador: "metodo_envio" -> "Metodo envio". */
export const humanizar = (texto) => {
  const limpio = String(texto || "").replace(/_/g, " ").trim().toLowerCase();
  if (!limpio) return "Otro";
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
};

/** Nombre e ícono de un área. Las desconocidas (y "otro") usan file-text. */
export const infoArea = (tipoRecurso) =>
  AREAS[tipoRecurso] || { nombre: humanizar(tipoRecurso), icono: "file-text" };

/** Título humanizado de una acción; las conocidas tienen su texto fijo. */
export const tituloAccion = (accion) => {
  if (!accion) return "Otra acción";
  if (ACCIONES[accion]) return ACCIONES[accion];
  if (accion.startsWith("crear_")) return "Creado";
  if (accion.startsWith("actualizar_")) return "Actualizado";
  if (accion.startsWith("eliminar_")) return "Eliminado";
  return humanizar(accion);
};

/**
 * Mismo criterio que el servidor: solo se puede filtrar por identificadores en minúsculas.
 * Los registros antiguos con mayúsculas (p. ej. "Pedido") no se pueden pedir por área.
 */
export const esFiltrable = (valor) => /^[a-z_]{1,50}$/.test(String(valor || ""));
