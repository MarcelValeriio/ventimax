/**
 * Mapeo canónico de pasos del embudo del bot → etiqueta legible.
 * Fuente de verdad única: se usa en analítica de churn (backend) y
 * en la UI del chat (Fase 1, sin hardcodear en el frontend).
 */

const PASO_LABELS = {
  // Pasos reales del flujo (services/chatFlowService.js)
  inicio: "👋 Inicio",
  fin_semana_opciones: "📅 Opciones Fin de Semana",
  esperando_seleccion: "🍱 Eligiendo categoría",
  esperando_producto: "🛒 Viendo producto",
  esperando_cantidad: "🔢 Eligiendo cantidad",
  preguntando_mas: "➕ ¿Agregar más?",
  esperando_datos_cliente: "👤 Datos del cliente",
  esperando_cedula: "🆔 Cédula",
  esperando_ubicacion: "📍 Dirección",
  esperando_confirmacion_datos: "✅ Confirmando datos",
  esperando_pago_metodo: "💳 Método de pago",
  esperando_efectivo_opcion: "💵 Opción de efectivo",
  esperando_efectivo_monto: "💰 Monto en efectivo",
  esperando_comprobante: "🧾 Comprobante",
  pendiente_verificacion: "⏳ Verificación",

  // Alias legacy (datos antiguos en DB, para no mostrar claves crudas)
  menu: "🍱 Viendo menú",
  carrito: "🛒 Armando carrito",
  ubicacion: "📍 Dirección",
  pago: "💳 Proceso de pago",
  confirmacion_pago: "🧾 Esperando comprobante",
  esperando_verificacion: "⏳ Pendiente por validar",
};

/**
 * Devuelve la etiqueta legible de un paso. Si no se conoce, devuelve el
 * valor original (mismo comportamiento fallback que tenía el churn).
 */
const getPasoLabel = (paso) => PASO_LABELS[paso] || paso;

module.exports = { PASO_LABELS, getPasoLabel };
