const MetodoPago = require("../models/MetodoPago");
const mongoose = require("mongoose");
const { registrarAuditoria } = require("../services/auditService");

/**
 * Responde un error de base de datos o inesperado sin filtrar su detalle al navegador.
 * - ValidationError: 400 con el motivo (es un dato que el usuario debe corregir).
 * - CastError (id mal formado): 400 con un mensaje genérico.
 * - Cualquier otro: se registra en el log y responde 500 genérico.
 */
const responderErrorPago = (res, error, mensajeGenerico, contexto) => {
  if (error?.name === "ValidationError") {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error?.name === "CastError") {
    return res.status(400).json({ success: false, error: "Identificador inválido" });
  }
  console.error(`❌ Error en ${contexto}:`, error);
  return res.status(500).json({ success: false, error: mensajeGenerico });
};

const getPayments = async (req, res) => {
  try {
    const payments = await MetodoPago.find();
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error("❌ Error en getPayments:", error);
    res.status(500).json({ success: false, error: "Error al obtener métodos de pago" });
  }
};

const createPayment = async (req, res) => {
  try {
    const payment = await MetodoPago.create(req.body);
    // Add audit log
    await registrarAuditoria(req, {
      recursoId: payment._id,
      tipoRecurso: "metodo_pago",
      accion: "crear_metodo_pago",
      nuevo: payment.nombre,
      detalles: `Método de pago creado: ${payment.nombre}`,
    });
    res.json({ success: true, data: payment });
  } catch (error) {
    return responderErrorPago(res, error, "Error al guardar el método de pago", "createPayment");
  }
};

const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, error: "No encontrado" });
    }
    const oldPayment = await MetodoPago.findById(id); // Fetch old data for audit
    const payment = await MetodoPago.findByIdAndUpdate(id, req.body, {
      returnDocument: "after",
    });
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, error: "Método de pago no encontrado" });
    }
    // Add audit log
    await registrarAuditoria(req, {
      recursoId: payment._id,
      tipoRecurso: "metodo_pago",
      accion: "actualizar_metodo_pago",
      anterior: oldPayment ? oldPayment.nombre : "N/A",
      nuevo: payment.nombre,
      detalles: `Método de pago actualizado: ${payment.nombre}`,
    });
    res.json({ success: true, data: payment });
  } catch (error) {
    return responderErrorPago(res, error, "Error al actualizar el método de pago", "updatePayment");
  }
};

const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, error: "No encontrado" });
    }
    const deletedPayment = await MetodoPago.findByIdAndDelete(id);
    if (!deletedPayment)
      return res
        .status(404)
        .json({ success: false, error: "Método de pago no encontrado" });
    // Add audit log
    await registrarAuditoria(req, {
      recursoId: id,
      tipoRecurso: "metodo_pago",
      accion: "eliminar_metodo_pago",
      anterior: deletedPayment.nombre,
      detalles: `Método de pago eliminado: ${deletedPayment.nombre}`,
    });
    res.json({ success: true });
  } catch (error) {
    return responderErrorPago(res, error, "Error al eliminar el método de pago", "deletePayment");
  }
};

module.exports = { getPayments, createPayment, updatePayment, deletePayment };
