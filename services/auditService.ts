let Auditoria = require("../models/Auditoria");

// Soporte para Pruebas de Integración (Mock con Persistencia Compartida)
if (process.env.NODE_ENV === "test") {
  Auditoria = require("./dbLocal").getAuditoriaModel();
}

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
      estadoAnterior: anterior,
      estadoNuevo: nuevo,
      detalles,
      timestamp: new Date()
    });
  } catch (error) {
    console.error("⚠️ Error registrando auditoría:", error.message);
  }
};

module.exports = { registrarAuditoria };
