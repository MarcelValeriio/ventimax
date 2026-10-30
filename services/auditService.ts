let Auditoria = require("../models/Auditoria");

// Soporte para Pruebas de Integración (Mock con Persistencia Compartida)
if (process.env.NODE_ENV === "test") {
  Auditoria = require("./dbLocal").getAuditoriaModel();
}

/**
 * estadoAnterior / estadoNuevo son texto en el modelo: una lista u objeto (p. ej. las fotos de un producto) se guarda
 * como JSON recortado. Antes se pasaba tal cual y Mongoose rechazaba el registro: la acción quedaba sin auditar.
 */
const comoTexto = (valor) => {
  if (valor === undefined || valor === null) return valor;
  if (typeof valor === "string") return valor;
  try {
    const texto = JSON.stringify(valor);
    return texto.length > 2000 ? `${texto.slice(0, 2000)}…` : texto;
  } catch (_e) {
    return String(valor);
  }
};

const registrarAuditoria = async (req, { pedidoId, correlativo, recursoId, tipoRecurso, accion, anterior, nuevo, detalles = "" }) => {
  try {
    const usuarioId = req.user?.id || req.user?._id || null;
    const usuarioNombre = req.user?.nombre || req.user?.user || "Sistema/Antiguo";

    await Auditoria.create({
      usuarioId,
      usuarioNombre,
      pedidoId,
      correlativoPedido: correlativo,
      recursoId,
      tipoRecurso,
      accion,
      estadoAnterior: comoTexto(anterior),
      estadoNuevo: comoTexto(nuevo),
      detalles,
      timestamp: new Date()
    });
  } catch (error) {
    console.error("⚠️ Error registrando auditoría:", error.message);
  }
};

module.exports = { registrarAuditoria };
