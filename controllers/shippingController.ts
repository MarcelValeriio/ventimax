let MetodoEnvio = require("../models/MetodoEnvio");
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("../services/dbLocal");
  MetodoEnvio = dbLocal.getMetodoEnvioModel();
}
const { registrarAuditoria } = require("../services/auditService");

const TIPOS_VALIDOS = ["delivery_local", "envio_nacional", "retiro", "otro"];
const COSTO_TIPOS_VALIDOS = ["fijo", "a_convenir"];

const getShippingMethods = async (req: any, res: any) => {
  try {
    const query: any = {};
    if (req?.query?.activo !== undefined) {
      query.activo = req.query.activo === "true" || req.query.activo === true;
    }
    const methods = await MetodoEnvio.find(query).sort({ orden: 1, createdAt: 1 });
    res.json({ success: true, data: methods });
  } catch (error: any) {
    console.error("❌ Error en getShippingMethods:", error);
    res.status(500).json({ success: false, error: "Error al obtener métodos de envío" });
  }
};

const createShippingMethod = async (req: any, res: any) => {
  try {
    const { nombre, tipo, descripcion, costoTipo, costo, pideDatos, direccion, horario, activo, orden } = req.body || {};

    if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
      return res.status(400).json({ success: false, error: "El nombre es obligatorio" });
    }
    if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ success: false, error: "Tipo de envío inválido" });
    }

    if (direccion !== undefined && typeof direccion === "string" && direccion.trim().length > 200) {
      return res.status(400).json({ success: false, error: "La dirección no puede exceder 200 caracteres" });
    }
    if (horario !== undefined && typeof horario === "string" && horario.trim().length > 100) {
      return res.status(400).json({ success: false, error: "El horario no puede exceder 100 caracteres" });
    }
    if (pideDatos !== undefined && typeof pideDatos === "string" && pideDatos.trim().length > 120) {
      return res.status(400).json({ success: false, error: "Los datos a pedir no pueden exceder 120 caracteres" });
    }

    let finalCostoTipo = costoTipo;
    let finalCosto = 0;

    if (tipo === "retiro") {
      if (!direccion || typeof direccion !== "string" || !direccion.trim()) {
        return res.status(400).json({
          success: false,
          error: "La dirección es obligatoria para el método de retiro",
        });
      }
      finalCostoTipo = "fijo";
      finalCosto = 0;
    } else {
      if (!costoTipo || !COSTO_TIPOS_VALIDOS.includes(costoTipo)) {
        return res.status(400).json({
          success: false,
          error: "Tipo de costo inválido (debe ser 'fijo' o 'a_convenir')",
        });
      }
      if (costoTipo === "fijo") {
        if (costo === undefined || costo === null || isNaN(Number(costo)) || Number(costo) < 0) {
          return res.status(400).json({
            success: false,
            error: "Para costo fijo, el costo debe ser un número mayor o igual a 0",
          });
        }
        finalCosto = Number(costo);
      }
    }

    const payload = {
      nombre: nombre.trim(),
      tipo,
      descripcion: descripcion ? String(descripcion).trim() : "",
      costoTipo: finalCostoTipo,
      costo: finalCosto,
      pideDatos: tipo === "retiro" ? "" : (pideDatos ? String(pideDatos).trim() : ""),
      direccion: direccion ? String(direccion).trim() : "",
      horario: horario ? String(horario).trim() : "",
      activo: activo !== false,
      orden: Number(orden) || 0,
    };

    const shipping = await MetodoEnvio.create(payload);

    await registrarAuditoria(req, {
      recursoId: shipping._id,
      tipoRecurso: "metodo_envio",
      accion: "crear_metodo_envio",
      nuevo: shipping.nombre,
      detalles: `Método de envío creado: ${shipping.nombre} (${shipping.tipo}, ${shipping.costoTipo})`,
    });

    res.status(201).json({ success: true, data: shipping });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const updateShippingMethod = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const oldMethod = await MetodoEnvio.findById(id);
    if (!oldMethod) {
      return res.status(404).json({ success: false, error: "Método de envío no encontrado" });
    }

    const { nombre, tipo, descripcion, costoTipo, costo, pideDatos, direccion, horario, activo, orden } = req.body || {};

    if (nombre !== undefined && (!nombre || typeof nombre !== "string" || !nombre.trim())) {
      return res.status(400).json({ success: false, error: "El nombre no puede estar vacío" });
    }
    if (tipo !== undefined && !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ success: false, error: "Tipo de envío inválido" });
    }

    if (direccion !== undefined && typeof direccion === "string" && direccion.trim().length > 200) {
      return res.status(400).json({ success: false, error: "La dirección no puede exceder 200 caracteres" });
    }
    if (horario !== undefined && typeof horario === "string" && horario.trim().length > 100) {
      return res.status(400).json({ success: false, error: "El horario no puede exceder 100 caracteres" });
    }
    if (pideDatos !== undefined && typeof pideDatos === "string" && pideDatos.trim().length > 120) {
      return res.status(400).json({ success: false, error: "Los datos a pedir no pueden exceder 120 caracteres" });
    }

    const finalTipo = tipo || oldMethod.tipo;

    if (finalTipo === "retiro") {
      const finalDireccion = direccion !== undefined ? direccion : oldMethod.direccion;
      if (!finalDireccion || typeof finalDireccion !== "string" || !finalDireccion.trim()) {
        return res.status(400).json({
          success: false,
          error: "La dirección es obligatoria para el método de retiro",
        });
      }
    } else if (costoTipo !== undefined && !COSTO_TIPOS_VALIDOS.includes(costoTipo)) {
      return res.status(400).json({ success: false, error: "Tipo de costo inválido" });
    }

    const finalCostoTipo = finalTipo === "retiro" ? "fijo" : (costoTipo || oldMethod.costoTipo);
    if (finalTipo !== "retiro" && finalCostoTipo === "fijo" && costo !== undefined) {
      if (isNaN(Number(costo)) || Number(costo) < 0) {
        return res.status(400).json({
          success: false,
          error: "El costo debe ser un número mayor o igual a 0",
        });
      }
    }

    const updateData: any = {};
    if (nombre !== undefined) updateData.nombre = nombre.trim();
    if (tipo !== undefined) updateData.tipo = tipo;
    if (descripcion !== undefined) updateData.descripcion = String(descripcion).trim();

    if (finalTipo === "retiro") {
      updateData.costoTipo = "fijo";
      updateData.costo = 0;
      updateData.pideDatos = "";
    } else {
      if (costoTipo !== undefined) {
        updateData.costoTipo = costoTipo;
        if (costoTipo === "a_convenir") updateData.costo = 0;
      }
      if (costo !== undefined && finalCostoTipo === "fijo") {
        updateData.costo = Number(costo);
      }
      if (pideDatos !== undefined) updateData.pideDatos = String(pideDatos).trim();
    }

    if (direccion !== undefined) updateData.direccion = String(direccion).trim();
    if (horario !== undefined) updateData.horario = String(horario).trim();
    if (activo !== undefined) updateData.activo = Boolean(activo);
    if (orden !== undefined) updateData.orden = Number(orden);

    const shipping = await MetodoEnvio.findByIdAndUpdate(id, updateData, {
      returnDocument: "after",
    });

    await registrarAuditoria(req, {
      recursoId: shipping._id,
      tipoRecurso: "metodo_envio",
      accion: "actualizar_metodo_envio",
      anterior: oldMethod ? oldMethod.nombre : "N/A",
      nuevo: shipping.nombre,
      detalles: `Método de envío actualizado: ${shipping.nombre}`,
    });

    res.json({ success: true, data: shipping });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const deleteShippingMethod = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const deleted = await MetodoEnvio.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Método de envío no encontrado" });
    }

    await registrarAuditoria(req, {
      recursoId: id,
      tipoRecurso: "metodo_envio",
      accion: "eliminar_metodo_envio",
      anterior: deleted.nombre,
      detalles: `Método de envío eliminado: ${deleted.nombre}`,
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

module.exports = {
  getShippingMethods,
  createShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
};
