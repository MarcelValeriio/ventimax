let Aliado = require("../models/Aliado");
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("../services/dbLocal");
  Aliado = dbLocal.getAliadoModel();
}

const configManager = require("../services/configManager");
const { registrarAuditoria } = require("../services/auditService");
const cloudinaryService = require("../services/cloudinaryService");

const MAX_ALIADOS = 30;
const MAX_LARGO_NOMBRE = 60;
const MAX_LARGO_DESCRIPCION = 400;
const LOGO_URL_VALIDA = /^https:\/\/\S+$/;
const MSG_LOGO_URL = "La URL del logo debe empezar con https://";

/**
 * Responde errores de base de datos o inesperados (M-2):
 * - ValidationError: 400 con motivo
 * - CastError: 404 (ids mal formados no encontrados)
 * - Otros: 500 genérico
 */
const responderErrorAliado = (res: any, error: any, mensajeGenerico: string, contexto: string) => {
  if (error?.name === "ValidationError") {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error?.name === "CastError") {
    return res.status(404).json({ success: false, error: "Aliado no encontrado" });
  }
  console.error(`❌ Error en ${contexto}:`, error);
  return res.status(500).json({ success: false, error: mensajeGenerico });
};

/**
 * GET /api/admin/aliados
 * Lista todos los aliados comerciales ordenados por orden asc.
 */
const getAliados = async (req: any, res: any) => {
  try {
    const query: any = {};
    if (req?.query?.activo !== undefined) {
      query.activo = req.query.activo === "true" || req.query.activo === true;
    }
    const aliados = await Aliado.find(query).sort({ orden: 1, createdAt: 1 });
    res.json({ success: true, data: aliados || [] });
  } catch (error: any) {
    return responderErrorAliado(res, error, "Error al obtener aliados comerciales", "getAliados");
  }
};

/**
 * POST /api/admin/aliados
 * Crea un aliado comercial (máximo 30).
 */
const createAliado = async (req: any, res: any) => {
  try {
    const total = await Aliado.countDocuments();
    if (total >= MAX_ALIADOS) {
      return res.status(400).json({
        success: false,
        error: `Máximo ${MAX_ALIADOS} aliados permitidos`,
      });
    }

    const { nombre, descripcion, logoUrl, logoPublicId, orden, activo } = req.body || {};

    const nombreLimpio = String(nombre || "").trim();
    if (!nombreLimpio) {
      return res.status(400).json({ success: false, error: "El nombre del aliado es obligatorio" });
    }
    if (nombreLimpio.length > MAX_LARGO_NOMBRE) {
      return res.status(400).json({
        success: false,
        error: `El nombre no puede exceder ${MAX_LARGO_NOMBRE} caracteres`,
      });
    }

    const descLimpia = String(descripcion || "").trim();
    if (!descLimpia) {
      return res.status(400).json({ success: false, error: "La descripción del aliado es obligatoria" });
    }
    if (descLimpia.length > MAX_LARGO_DESCRIPCION) {
      return res.status(400).json({
        success: false,
        error: `La descripción no puede exceder ${MAX_LARGO_DESCRIPCION} caracteres`,
      });
    }

    const logoPublicIdLimpio = String(logoPublicId || "").trim();
    if (logoPublicIdLimpio && !cloudinaryService.esPublicIdDeAliado(logoPublicIdLimpio)) {
      return res.status(400).json({
        success: false,
        error: "El publicId del logo debe pertenecer a la carpeta de aliados de la marca",
      });
    }

    const logoUrlLimpia = String(logoUrl || "").trim();
    if (logoUrlLimpia && !LOGO_URL_VALIDA.test(logoUrlLimpia)) {
      return res.status(400).json({ success: false, error: MSG_LOGO_URL });
    }

    let brand = "default";
    try {
      brand = configManager.getBrand() || "default";
    } catch {}

    const nuevo = await Aliado.create({
      nombre: nombreLimpio,
      descripcion: descLimpia,
      logoUrl: logoUrlLimpia,
      logoPublicId: logoPublicIdLimpio,
      orden: typeof orden === "number" ? orden : Number(orden) || 0,
      activo: activo !== false,
      brand,
    });

    await registrarAuditoria(req, {
      recursoId: String(nuevo._id),
      tipoRecurso: "aliado",
      accion: "crear_aliado",
      nuevo: nuevo.nombre,
      detalles: `Aliado comercial creado: ${nuevo.nombre}`,
    });

    res.status(201).json({ success: true, data: nuevo });
  } catch (error: any) {
    return responderErrorAliado(res, error, "Error al crear el aliado comercial", "createAliado");
  }
};

/**
 * PUT /api/admin/aliados/:id
 * Actualiza un aliado comercial.
 */
const updateAliado = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const anterior = await Aliado.findById(id);
    if (!anterior) {
      return res.status(404).json({ success: false, error: "Aliado no encontrado" });
    }

    const { nombre, descripcion, logoUrl, logoPublicId, orden, activo } = req.body || {};
    const updates: any = {};

    if (nombre !== undefined) {
      const nombreLimpio = String(nombre || "").trim();
      if (!nombreLimpio) {
        return res.status(400).json({ success: false, error: "El nombre del aliado es obligatorio" });
      }
      if (nombreLimpio.length > MAX_LARGO_NOMBRE) {
        return res.status(400).json({
          success: false,
          error: `El nombre no puede exceder ${MAX_LARGO_NOMBRE} caracteres`,
        });
      }
      updates.nombre = nombreLimpio;
    }

    if (descripcion !== undefined) {
      const descLimpia = String(descripcion || "").trim();
      if (!descLimpia) {
        return res.status(400).json({ success: false, error: "La descripción del aliado es obligatoria" });
      }
      if (descLimpia.length > MAX_LARGO_DESCRIPCION) {
        return res.status(400).json({
          success: false,
          error: `La descripción no puede exceder ${MAX_LARGO_DESCRIPCION} caracteres`,
        });
      }
      updates.descripcion = descLimpia;
    }

    if (logoPublicId !== undefined) {
      const pubId = String(logoPublicId || "").trim();
      if (pubId && !cloudinaryService.esPublicIdDeAliado(pubId)) {
        return res.status(400).json({
          success: false,
          error: "El publicId del logo debe pertenecer a la carpeta de aliados de la marca",
        });
      }
      updates.logoPublicId = pubId;
    }

    if (logoUrl !== undefined) {
      const url = String(logoUrl || "").trim();
      if (url && !LOGO_URL_VALIDA.test(url)) {
        return res.status(400).json({ success: false, error: MSG_LOGO_URL });
      }
      updates.logoUrl = url;
    }

    if (orden !== undefined) {
      updates.orden = typeof orden === "number" ? orden : Number(orden) || 0;
    }

    if (activo !== undefined) {
      updates.activo = activo === true || activo === "true";
    }

    // Si el logo cambió o se quitó, borrar el anterior de Cloudinary
    if (
      updates.logoPublicId !== undefined &&
      anterior.logoPublicId &&
      anterior.logoPublicId !== updates.logoPublicId
    ) {
      try {
        await cloudinaryService.borrarImagen(anterior.logoPublicId);
      } catch (err: any) {
        console.warn(`⚠️ No se pudo borrar el logo anterior del aliado (${anterior.logoPublicId}):`, err?.message || err);
      }
    }

    const actualizado = await Aliado.findByIdAndUpdate(id, updates, { new: true });

    await registrarAuditoria(req, {
      recursoId: id,
      tipoRecurso: "aliado",
      accion: "actualizar_aliado",
      anterior: anterior.nombre,
      nuevo: actualizado.nombre,
      detalles: `Aliado comercial actualizado: ${actualizado.nombre}`,
    });

    res.json({ success: true, data: actualizado });
  } catch (error: any) {
    return responderErrorAliado(res, error, "Error al actualizar el aliado comercial", "updateAliado");
  }
};

/**
 * DELETE /api/admin/aliados/:id
 * Elimina un aliado comercial y su logo en Cloudinary si existía.
 */
const deleteAliado = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const deleted = await Aliado.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Aliado no encontrado" });
    }

    if (deleted.logoPublicId) {
      try {
        await cloudinaryService.borrarImagen(deleted.logoPublicId);
      } catch (err: any) {
        console.warn(`⚠️ No se pudo borrar el logo del aliado (${deleted.logoPublicId}):`, err?.message || err);
      }
    }

    await registrarAuditoria(req, {
      recursoId: id,
      tipoRecurso: "aliado",
      accion: "eliminar_aliado",
      anterior: deleted.nombre,
      detalles: `Aliado comercial eliminado: ${deleted.nombre}`,
    });

    res.json({ success: true });
  } catch (error: any) {
    return responderErrorAliado(res, error, "Error al eliminar el aliado comercial", "deleteAliado");
  }
};

/**
 * POST /api/admin/aliados/logo
 * Sube el logo de un aliado comercial (formato validado en multer).
 */
const uploadAliadoLogo = async (req: any, res: any) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: "No se proporcionó ningún archivo de logo" });
    }
    const resultado = await cloudinaryService.subirLogoAliado(req.file.buffer);
    return res.status(200).json({
      success: true,
      data: { url: resultado.url, publicId: resultado.publicId },
    });
  } catch (error: any) {
    if (error?.message === "Cloudinary no está configurado") {
      return res.status(400).json({ success: false, error: "Cloudinary no está configurado" });
    }
    console.error("❌ Error en uploadAliadoLogo:", error?.message || error);
    return res.status(500).json({ success: false, error: "Error al subir el logo a Cloudinary" });
  }
};

module.exports = {
  getAliados,
  createAliado,
  updateAliado,
  deleteAliado,
  uploadAliadoLogo,
};
