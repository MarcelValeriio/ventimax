const MetodoPago = require("../models/MetodoPago");
const { registrarAuditoria } = require("../services/auditService");

const getPayments = async (req, res) => {
  try {
    const payments = await MetodoPago.find();
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
    res.status(400).json({ success: false, error: error.message });
  }
};

const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const oldPayment = await MetodoPago.findById(id); // Fetch old data for audit
    const payment = await MetodoPago.findByIdAndUpdate(id, req.body, {
      returnDocument: "after",
    });
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
    res.status(400).json({ success: false, error: error.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
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
    res.status(400).json({ success: false, error: error.message });
  }
};

module.exports = { getPayments, createPayment, updatePayment, deletePayment };
