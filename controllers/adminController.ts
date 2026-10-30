const path = require("path");
const axios = require("axios");
const mongoose = require("mongoose");
const MensajeOriginal = require("../models/Mensaje");
const EtiquetaOriginal = require("../models/Etiqueta");
const MensajeIgOriginal = require("../models/MensajeIg");
const EtiquetaIgOriginal = require("../models/EtiquetaIg");
const ProductoOriginal = require("../models/Producto");
const PedidoOriginal = require("../models/Pedido");
const CategoriaOriginal = require("../models/Categoria");
let AuditoriaOriginal = require("../models/Auditoria");
const UsuarioOriginal = require("../models/Usuario");
const SettingOriginal = require("../models/Setting");
const MetodoEnvioOriginal = require("../models/MetodoEnvio");
const CarritoWebOriginal = require("../models/CarritoWeb");
const { registrarAuditoria } = require("../services/auditService"); // Imported audit service
const pushService = require("../services/pushService");
let Counter = require("../models/Counter");

let Mensaje = MensajeOriginal;
let Etiqueta = EtiquetaOriginal;
let MensajeIg = MensajeIgOriginal;
let EtiquetaIg = EtiquetaIgOriginal;
let Producto = ProductoOriginal;
let Pedido = PedidoOriginal;
let Categoria = CategoriaOriginal;
let Auditoria = AuditoriaOriginal;
let Usuario = UsuarioOriginal;
let Setting = SettingOriginal;
let MetodoEnvio = MetodoEnvioOriginal;
let CarritoWeb = CarritoWebOriginal;

// Soporte para Pruebas de Integración (Mock con Persistencia Compartida)
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("../services/dbLocal");
  Etiqueta = dbLocal.getEtiquetaModel();
  Mensaje = dbLocal.getMensajeModel();
  EtiquetaIg = dbLocal.getEtiquetaIgModel();
  MensajeIg = dbLocal.getMensajeIgModel();
  Producto = dbLocal.getProductoModel();
  Pedido = dbLocal.getPedidoModel();
  Counter = dbLocal.getCounterModel();
  Auditoria = dbLocal.getAuditoriaModel();
  Usuario = dbLocal.getUsuarioModel();
  Setting = dbLocal.getSettingModel();
  if (typeof dbLocal.getMetodoEnvioModel === "function") {
    MetodoEnvio = dbLocal.getMetodoEnvioModel();
  }
  if (typeof dbLocal.getCarritoWebModel === "function") {
    CarritoWeb = dbLocal.getCarritoWebModel();
  }
}
const configManager = require("../services/configManager");
const { nombreEnvio, detalleCostoEnvio } = require("../services/envioTexto");
const orderService = require("../services/orderService");
const bcv = require("../services/bcv");
const { obtenerTotalCreados, fechaCaracas } = require("../services/catalogoAbusoService");
const { obtenerTasas, obtenerTasaUSD } = bcv;
const {
  enviarTexto,
  enviarImagenPorMediaId,
  enviarImagenPorUrl,
  enviarUbicacion,
  notificarAdminConFallback,
} = require("../services/whatsapp");
const { formatBs, formatUsd } = require("../utils/helpers");
const { filtroPorCategoria } = require("../services/catalogQuery");
const { precioVigente, descuentoVigente } = require("../services/precios");
const { getPasoLabel } = require("../utils/pasoEmbudo");
// Definición ÚNICA de `requiereAtencion` (§6.2.1 del contrato del Inbox Unificado).
// `normalizar` no requiere modelos ni controladores: no genera ciclos.
const { computarRequiereAtencion } = require("../services/inbox/normalizar");
const { getConfig } = require("../services/configStore");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

/**
 * Retorna la vista principal del panel (preparado para SPA)
 */
const getPanel = (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
};

/**
 * Gestaión de Categorías
 */
const getCategorias = async (req, res) => {
  try {
    const { root } = req.query;
    const filter: any = {};
    if (root === "true") filter.padre = null;

    const categorias = await Categoria.find(filter)
      .populate("padre")
      .sort({ nombre: 1 });
    res.json({ success: true, data: categorias });
  } catch (error) {
    console.error("❌ Error en getCategorias:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Error obteniendo categorías" });
  }
};

const postCategoria = async (req, res) => {
  try {
    const { nombre, slug, padre } = req.body;
    if (!nombre || !slug)
      return res
        .status(400)
        .json({ success: false, error: "Nombre y slug son obligatorios" });

    const newCat = await Categoria.create({
      nombre,
      slug,
      padre: padre || null,
    });
    const populated = await newCat.populate("padre");

    // Registrar Auditoría
    await registrarAuditoria(req, {
      recursoId: newCat._id,
      tipoRecurso: "categoria",
      accion: "crear_categoria",
      nuevo: newCat.nombre,
      detalles: `Categoría creada: ${newCat.nombre}`,
    });

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error("❌ Error en postCategoria:", error.message);
    return responderErrorCatalogo(res, error, "Error creando categoría");
  }
};

const updateCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, padre } = req.body;

    const originalCat = await Categoria.findById(id);
    if (!originalCat)
      return res
        .status(404)
        .json({ success: false, error: "Categoría no encontrada" });

    const updateData: any = {};
    if (nombre !== undefined) {
      if (nombre.trim() === "")
        return res
          .status(400)
          .json({ success: false, error: "El nombre es obligatorio" });
      updateData.nombre = nombre.trim();
      updateData.slug = nombre
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
    }

    if (padre !== undefined) updateData.padre = padre || null;

    const updatedCat = await Categoria.findByIdAndUpdate(id, updateData, {
      returnDocument: "after",
      runValidators: true,
    }).populate("padre");

    if (!updatedCat)
      return res
        .status(404)
        .json({ success: false, error: "Categoría no encontrada" });

    // Construir detalle de cambios
    const cambios = [];
    if (updateData.nombre && updateData.nombre !== originalCat.nombre) {
      cambios.push(`nombre: "${originalCat.nombre}" → "${updateData.nombre}"`);
    }
    const originalPadreId = originalCat.padre
      ? originalCat.padre.toString()
      : null;
    const nuevoPadreId = updateData.padre ? updateData.padre.toString() : null;
    if (padre !== undefined && originalPadreId !== nuevoPadreId) {
      cambios.push(`padre actualizado`);
    }

    // Registrar Auditoría
    await registrarAuditoria(req, {
      recursoId: id,
      tipoRecurso: "categoria",
      accion: "actualizar_categoria",
      nuevo: updatedCat.nombre,
      detalles:
        cambios.length > 0
          ? `Categoría: ${updatedCat.nombre}. Cambios: ${cambios.join(" | ")}`
          : `Categoría: ${updatedCat.nombre} (sin cambios detectados)`,
    });

    res.json({ success: true, data: updatedCat });
  } catch (error) {
    console.error("❌ Error en updateCategoria:", error);
    return responderErrorCatalogo(res, error, "Error al actualizar la categoría.");
  }
};

const deleteCategoria = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificamos si tiene hijos para informar al usuario (aunque el frontend ya lo hace)
    const tieneHijos = await Categoria.exists({ padre: id });
    const tieneProductos = await Producto.exists(filtroPorCategoria(id));

    // Eliminación física
    const deleted = await Categoria.findByIdAndDelete(id);

    if (!deleted)
      return res
        .status(404)
        .json({ success: false, error: "Categoría no encontrada" });

    // Registrar Auditoría
    await registrarAuditoria(req, {
      recursoId: id,
      tipoRecurso: "categoria",
      accion: "eliminar_categoria",
      anterior: deleted.nombre,
      detalles: `Categoría eliminada: ${deleted.nombre}`,
    });

    res.json({
      success: true,
      message: "Categoría eliminada",
      advertencia:
        tieneHijos || tieneProductos
          ? "Se eliminó una categoría que tenía dependencias."
          : null,
    });
  } catch (error) {
    console.error("❌ Error en deleteCategoria:", error);
    res
      .status(500)
      .json({ success: false, error: "Error eliminando categoría" });
  }
};

/**
 * Endpoints de Inventario (Fase C)
 */
/**
 * Error al crear o editar productos y categorías: el usuario ve qué corregir si es un dato inválido
 * o repetido; cualquier otro error queda solo en el log (500 genérico, F0-11).
 */
function responderErrorCatalogo(res, error, mensajeGenerico) {
  if (error?.name === "ValidationError") {
    return res.status(400).json({ success: false, error: `${mensajeGenerico} ${error.message}` });
  }
  if (error?.code === 11000) {
    const campo = Object.keys(error.keyValue || {})[0];
    return res.status(400).json({
      success: false,
      error: `${mensajeGenerico} Ya existe uno con ese ${campo === "slug" ? "nombre" : campo || "valor"}.`,
    });
  }
  return res.status(500).json({ success: false, error: mensajeGenerico });
}

const getProducts = async (req, res) => {
  try {
    const { categoria, sort } = req.query;
    const filter: any = { activo: true };
    // Sanitización forzando tipo string para evitar inyección NoSQL
    if (categoria) {
      Object.assign(filter, filtroPorCategoria(String(categoria)));
    }

    const sortOption: any = {};
    if (sort === "desc") sortOption.id = -1;
    else if (sort === "asc") sortOption.id = 1;
    else sortOption.name = 1;

    const products = await Producto.find(filter)
      .populate("categoria")
      .populate("categorias")
      .sort(sortOption);

    // Cada producto trae su precio vigente (F2g) y el descuento; el resto de campos no cambia
    const data = (products || []).map((p) => {
      const plano = typeof p.toObject === "function" ? p.toObject() : { ...p };
      return { ...plano, descuentoPct: descuentoVigente(plano), precioVigente: precioVigente(plano) };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error("❌ Error en getProducts:", error.message);
    res.status(500).json({
      success: false,
      error: "Error obteniendo productos",
    });
  }
};

const postProduct = async (req, res) => {
  try {
    const {
      id,
      name,
      price,
      description,
      emoji,
      categoria,
      categorias,
      stock,
      trackStock,
    } = req.body;

    // 1. Validaciones de Campos Obligatorios
    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "El nombre del producto es obligatorio.",
      });
    }
    if (price === undefined || price === null || price === "") {
      return res
        .status(400)
        .json({ success: false, error: "El precio es obligatorio." });
    }
    if (!categoria) {
      return res
        .status(400)
        .json({ success: false, error: "La categoría es obligatoria." });
    }

    // 2. Validación de Tipo y Valor para Precio
    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({
        success: false,
        error: "El precio debe ser un número válido mayor a cero.",
      });
    }

    const newProduct = await Producto.create({
      id: id || `prod-${Date.now()}`,
      name: name.trim(),
      price: numericPrice,
      description: description || "",
      categoria: categoria,
      categorias: Array.isArray(categorias) ? categorias : [],
      stock: stock !== undefined ? Number(stock) : 0,
      trackStock: trackStock === true || trackStock === "true",
    });

    const populated = await newProduct.populate(["categoria", "categorias"]);

    // Registrar Auditoría
    await registrarAuditoria(req, {
      recursoId: newProduct.id,
      tipoRecurso: "producto",
      accion: "crear_producto",
      nuevo: newProduct.name,
      detalles: `Producto creado: ${newProduct.name} | Precio: $${newProduct.price} | Stock: ${newProduct.stock || 0} | Categoría: ${populated.categoria?.nombre || "N/A"}`,
    });

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error("❌ Error en postProduct:", error);
    return responderErrorCatalogo(res, error, "No se pudo crear el producto.");
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      price,
      description,
      emoji,
      categoria,
      categorias,
      activo,
      stock,
      trackStock,
    } = req.body;

    const originalProduct = await Producto.findOne({ id: id });
    if (!originalProduct)
      return res
        .status(404)
        .json({ success: false, error: "Producto no encontrado" });

    // 1. Validación de Precio si se incluye en el cuerpo
    if (price !== undefined && price !== null && price !== "") {
      const numericPrice = Number(price);
      if (isNaN(numericPrice) || numericPrice < 0) {
        return res.status(400).json({
          success: false,
          error: "El precio debe ser un número válido mayor o igual a cero.",
        });
      }
    }

    // 2. Validación de Nombre si se incluye
    if (name !== undefined && name.trim() === "") {
      return res
        .status(400)
        .json({ success: false, error: "El nombre no puede estaar vacío." });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (price !== undefined) updateData.price = Number(price);
    if (description !== undefined) updateData.description = description;
    if (emoji !== undefined) updateData.emoji = emoji;
    if (categoria !== undefined) updateData.categoria = categoria;
    if (categorias !== undefined)
      updateData.categorias = Array.isArray(categorias) ? categorias : [];
    if (activo !== undefined) updateData.activo = activo;
    if (stock !== undefined) updateData.stock = Number(stock);
    if (trackStock !== undefined)
      updateData.trackStock = trackStock === true || trackStock === "true";

    const updatedProduct = await Producto.findOneAndUpdate(
      { id: id },
      updateData,
      { returnDocument: "after", runValidators: true },
    ).populate(["categoria", "categorias"]);

    if (!updatedProduct)
      return res
        .status(404)
        .json({ success: false, error: "Producto no encontrado" });

    // Construir detalle de cambios
    const cambios = [];
    if (updateData.name && updateData.name !== originalProduct.name)
      cambios.push(`nombre: "${originalProduct.name}" → "${updateData.name}"`);
    if (
      updateData.price !== undefined &&
      updateData.price !== originalProduct.price
    )
      cambios.push(`precio: $${originalProduct.price} → $${updateData.price}`);
    if (
      updateData.stock !== undefined &&
      updateData.stock !== (originalProduct.stock || 0)
    )
      cambios.push(
        `stock: ${originalProduct.stock || 0} → ${updateData.stock}`,
      );
    if (
      updateData.description !== undefined &&
      updateData.description !== (originalProduct.description || "")
    )
      cambios.push(`descripción actualizada`);
    if (
      updateData.categoria &&
      updateData.categoria !== originalProduct.categoria?.toString()
    )
      cambios.push(`categoría actualizada`);
    if (updateData.categorias !== undefined) {
      const antes = (originalProduct.categorias || []).map((c) => String(c)).sort().join(",");
      const despues = [...updateData.categorias].map((c) => String(c)).sort().join(",");
      if (antes !== despues) cambios.push(`categorías adicionales actualizadas`);
    }
    if (
      updateData.activo !== undefined &&
      updateData.activo !== originalProduct.activo
    )
      cambios.push(`activo: ${originalProduct.activo} → ${updateData.activo}`);
    if (
      updateData.trackStock !== undefined &&
      updateData.trackStock !== originalProduct.trackStock
    )
      cambios.push(
        `control stock: ${originalProduct.trackStock ? "ON" : "OFF"} → ${updateData.trackStock ? "ON" : "OFF"}`,
      );

    // Registrar Auditoría
    await registrarAuditoria(req, {
      recursoId: id,
      tipoRecurso: "producto",
      accion: "actualizar_producto",
      anterior: originalProduct.name,
      nuevo: updatedProduct.name,
      detalles:
        cambios.length > 0
          ? `Producto: ${updatedProduct.name}. Cambios: ${cambios.join(" | ")}`
          : `Producto: ${updatedProduct.name} (sin cambios detectados)`,
    });

    res.json({ success: true, data: updatedProduct });
  } catch (error) {
    console.error("❌ Error en updateProduct:", error);
    return responderErrorCatalogo(res, error, "Error al actualizar el producto.");
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Producto.findOneAndDelete({ id: id });
    if (!result)
      return res
        .status(404)
        .json({ success: false, error: "Producto no encontrado" });

    // Registrar Auditoría
    await registrarAuditoria(req, {
      recursoId: id,
      tipoRecurso: "producto",
      accion: "eliminar_producto",
      anterior: result.name,
      detalles: `Producto eliminado: ${result.name}`,
    });

    res.json({ success: true, message: "Producto eliminado" });
  } catch (error) {
    console.error("❌ Error en deleteProduct:", error);
    res.status(500).json({ success: false, error: "Error eliminando el producto" });
  }
};

const postProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file || !req.file.buffer) {
      return res
        .status(400)
        .json({ success: false, error: "No se proporcionó ningún archivo de imagen" });
    }

    const producto = await Producto.findOne({
      $or: [{ id: id }, ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : [])],
    });
    if (!producto) {
      return res
        .status(404)
        .json({ success: false, error: "Producto no encontrado" });
    }

    if (producto.imagenes && producto.imagenes.length >= 5) {
      return res
        .status(400)
        .json({ success: false, error: "El producto ya tiene el límite máximo de 5 imágenes" });
    }

    const cloudinaryService = require("../services/cloudinaryService");
    let resultado;
    try {
      resultado = await cloudinaryService.subirImagenProducto(req.file.buffer);
    } catch (cloudErr: any) {
      console.error("❌ Error subiendo imagen de producto:", cloudErr.message);
      if (cloudErr.message === "Cloudinary no está configurado") {
        return res
          .status(400)
          .json({ success: false, error: "Cloudinary no está configurado" });
      }
      return res
        .status(500)
        .json({ success: false, error: "Error al subir la imagen a Cloudinary" });
    }

    if (!producto.imagenes) producto.imagenes = [];
    producto.imagenes.push({
      url: resultado.url,
      publicId: resultado.publicId,
    });

    if (typeof producto.save === "function") {
      await producto.save();
    } else {
      await Producto.findOneAndUpdate(
        { id: producto.id },
        { $set: { imagenes: producto.imagenes } }
      );
    }

    await registrarAuditoria(req, {
      recursoId: producto._id ? producto._id.toString() : producto.id,
      tipoRecurso: "producto",
      accion: "subir_imagen_producto",
      detalles: `Imagen subida para el producto ${producto.name}. Total: ${producto.imagenes.length}/5`,
      nuevo: producto.imagenes,
    });

    return res.status(201).json({
      success: true,
      data: producto,
      imagen: resultado,
      message: "Imagen subida correctamente",
    });
  } catch (error: any) {
    console.error("❌ Error en postProductImage:", error.message);
    return res.status(500).json({ success: false, error: "Error al subir la imagen del producto" });
  }
};

const deleteProductImage = async (req, res) => {
  try {
    const { id, indice } = req.params;
    const idx = parseInt(indice, 10);

    const producto = await Producto.findOne({
      $or: [{ id: id }, ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : [])],
    });
    if (!producto) {
      return res
        .status(404)
        .json({ success: false, error: "Producto no encontrado" });
    }

    if (isNaN(idx) || idx < 0 || !producto.imagenes || idx >= producto.imagenes.length) {
      return res
        .status(400)
        .json({ success: false, error: "Índice de imagen no válido" });
    }

    const [imagenEliminada] = producto.imagenes.splice(idx, 1);

    if (typeof producto.save === "function") {
      await producto.save();
    } else {
      await Producto.findOneAndUpdate(
        { id: producto.id },
        { $set: { imagenes: producto.imagenes } }
      );
    }

    if (imagenEliminada && imagenEliminada.publicId) {
      const cloudinaryService = require("../services/cloudinaryService");
      try {
        await cloudinaryService.borrarImagen(imagenEliminada.publicId);
      } catch (cloudErr: any) {
        console.warn(`⚠️ Error eliminando imagen de Cloudinary (${imagenEliminada.publicId}):`, cloudErr.message);
      }
    }

    await registrarAuditoria(req, {
      recursoId: producto._id ? producto._id.toString() : producto.id,
      tipoRecurso: "producto",
      accion: "eliminar_imagen_producto",
      detalles: `Imagen eliminada del producto ${producto.name} en índice ${idx}. Restantes: ${producto.imagenes.length}`,
      anterior: imagenEliminada,
      nuevo: producto.imagenes,
    });

    return res.json({
      success: true,
      data: producto,
      message: "Imagen eliminada correctamente",
    });
  } catch (error: any) {
    console.error("❌ Error en deleteProductImage:", error.message);
    return res.status(500).json({ success: false, error: "Error al eliminar la imagen del producto" });
  }
};

const setPrimaryProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { indice } = req.body || {};
    const idx = parseInt(indice, 10);

    const producto = await Producto.findOne({
      $or: [{ id: id }, ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : [])],
    });
    if (!producto) {
      return res
        .status(404)
        .json({ success: false, error: "Producto no encontrado" });
    }

    if (isNaN(idx) || idx < 0 || !producto.imagenes || idx >= producto.imagenes.length) {
      return res
        .status(400)
        .json({ success: false, error: "Índice de imagen no válido" });
    }

    if (idx > 0) {
      const [imagenSeleccionada] = producto.imagenes.splice(idx, 1);
      producto.imagenes.unshift(imagenSeleccionada);

      if (typeof producto.save === "function") {
        await producto.save();
      } else {
        await Producto.findOneAndUpdate(
          { id: producto.id },
          { $set: { imagenes: producto.imagenes } }
        );
      }
    }

    await registrarAuditoria(req, {
      recursoId: producto._id ? producto._id.toString() : producto.id,
      tipoRecurso: "producto",
      accion: "marcar_imagen_principal_producto",
      detalles: `Imagen en índice ${idx} marcada como principal para el producto ${producto.name}`,
      nuevo: producto.imagenes,
    });

    return res.json({
      success: true,
      data: producto,
      message: "Imagen marcada como principal",
    });
  } catch (error: any) {
    console.error("❌ Error en setPrimaryProductImage:", error.message);
    return res.status(500).json({ success: false, error: "Error al marcar la imagen principal" });
  }
};

/**
 * Información Financiera
 */
const getBCVRate = async (req, res) => {
  try {
    const data = await obtenerTasas();
    if (!data)
      return res
        .status(503)
        .json({ success: false, error: "Servicio BCV no disponible" });
    res.json({
      success: true,
      data: { tasa: data.rates.USD, eur: data.rates.EUR, fecha: data.fecha },
    });
  } catch (error) {
    console.error("❌ Error en getBCVRate:", error);
    res.status(500).json({ success: false, error: "Error consultando tasa" });
  }
};

/**
 * Gestaión de Chats e Historial de Mensajes
 */
const getHistorial = async (req, res) => {
  try {
    const { page = 1, limit = 20, telefono } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    if (telefono) {
      const mensajes = await Mensaje.find({ telefono })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum);

      const total = await Mensaje.countDocuments({ telefono });

      // Los devolvemos en orden inverso (más recientes al final) para el frontend
      const data = mensajes.reverse().map((m) => ({
        _id: m._id,
        wamid: m.wamid || null,
        status: m.status || (m.direccion === "bot" ? "sent" : null),
        text: m.texto,
        caption: m.caption || null,
        fileName: m.fileName || null,
        mediaUrl: m.mediaUrl || null,
        timestamp:
          m.timestamp instanceof Date
            ? m.timestamp.getTime()
            : new Date(m.timestamp).getTime(),
        direction: m.direccion,
        tipo: m.tipo || "texto",
        mediaId: m.mediaId || null,
        mimeType: m.mimeType || null,
        replyToMid: m.replyToMid || null,
        replyToText: m.replyToText || null,
      }));

      return res.json({
        success: true,
        data,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          hasMore: skip + limitNum < total,
        },
      });
    } else {
      const limitNum = parseInt(req.query.limit) || 300;
      const agregados = await Mensaje.aggregate([
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$telefono",
            ultimoMensaje: {
              $first: {
                _id: "$_id",
                wamid: "$wamid",
                status: "$status",
                texto: "$texto",
                caption: "$caption",
                fileName: "$fileName",
                mediaUrl: "$mediaUrl",
                timestamp: "$timestamp",
                direccion: "$direccion",
                tipo: "$tipo",
                mediaId: "$mediaId",
                mimeType: "$mimeType",
              },
            },
            totalMensajes: { $sum: 1 },
          },
        },
        { $sort: { "ultimoMensaje.timestamp": -1 } },
        { $limit: limitNum },
      ]);
      const resultado = {};
      for (const ag of agregados) {
        resultado[ag._id] = {
          resumen: {
            _id: ag.ultimoMensaje._id,
            wamid: ag.ultimoMensaje.wamid || null,
            status:
              ag.ultimoMensaje.status ||
              (ag.ultimoMensaje.direccion === "bot" ? "sent" : null),
            text: ag.ultimoMensaje.texto,
            caption: ag.ultimoMensaje.caption || null,
            fileName: ag.ultimoMensaje.fileName || null,
            mediaUrl: ag.ultimoMensaje.mediaUrl || null,
            timestamp:
              ag.ultimoMensaje.timestamp instanceof Date
                ? ag.ultimoMensaje.timestamp.getTime()
                : new Date(ag.ultimoMensaje.timestamp).getTime(),
            direction: ag.ultimoMensaje.direccion,
            tipo: ag.ultimoMensaje.tipo || "texto",
            mediaId: ag.ultimoMensaje.mediaId || null,
            mimeType: ag.ultimoMensaje.mimeType || null,
          },
          totalMensajes: ag.totalMensajes,
          tienePedido: false,
          pedidosCount: 0,
        };
      }
      const telefonos = Object.keys(resultado);
      if (telefonos.length > 0) {
        const ets = await Etiqueta.find(
          { telefono: { $in: telefonos } },
          { telefono: 1, paso: 1, stuck: 1, "carrito.nombre": 1, "carrito.cedula": 1 },
        ).lean();

        const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const peds = await Pedido.find(
          { whatsappId: { $in: telefonos }, timestamp: { $gte: cutoffDate } },
          { whatsappId: 1, "cliente.nombre": 1, "cliente.cedula": 1, timestamp: 1 },
        )
          .sort({ timestamp: -1 })
          .lean();

        for (const et of ets) {
          if (resultado[et.telefono]) {
            resultado[et.telefono].paso = et.paso || null;
            resultado[et.telefono].pasoLabel = et.paso
              ? getPasoLabel(et.paso)
              : null;
            resultado[et.telefono].stuck = et.stuck || false;
            resultado[et.telefono].nombre = et.carrito?.nombre || null;
            resultado[et.telefono].cedula = et.carrito?.cedula || null;
          }
        }

        for (const ped of peds) {
          if (resultado[ped.whatsappId]) {
            resultado[ped.whatsappId].tienePedido = true;
            resultado[ped.whatsappId].pedidosCount =
              (resultado[ped.whatsappId].pedidosCount || 0) + 1;

            if (!resultado[ped.whatsappId].nombre) {
              if (
                ped.cliente?.nombre &&
                ped.cliente.nombre.trim() !== "Sin nombre"
              ) {
                resultado[ped.whatsappId].nombre = ped.cliente.nombre.trim();
              }
            }
            if (!resultado[ped.whatsappId].cedula) {
              resultado[ped.whatsappId].cedula = ped.cliente?.cedula || null;
            }
          }
        }
      }
      return res.json({ success: true, data: resultado });
    }
  } catch (err) {
    console.error("❌ Error en getHistorial:", err);
    res
      .status(500)
      .json({ success: false, error: "Error consultando historial" });
  }
};

/**
 * Detecta si un id corresponde a una conversación de Facebook Messenger.
 * Messenger comparte la colección EtiquetaIg con Instagram y se discrimina por `canal`.
 * Retrocompatible: los contactos históricos SIN campo `canal` se consideran Instagram,
 * por lo que nunca se bloquean.
 */
async function esConversacionMessenger(usuarioIgId) {
  try {
    const et = await EtiquetaIg.findOne({ usuarioIgId });
    return Boolean(et && et.canal === "messenger");
  } catch (e) {
    // Ante un fallo de lectura se mantiene el comportamiento histórico (no bloquear)
    return false;
  }
}

/** Respuesta estándar cuando una acción de la consola de Instagram apunta a Messenger */
const RESPUESTA_CANAL_EQUIVOCADO = {
  success: false,
  error:
    "Esta conversación pertenece a Facebook Messenger: no puede operarse desde la consola de Instagram.",
};

const getInstagramHistorial = async (req, res) => {
  try {
    const { page = 1, limit = 20, usuario } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    if (usuario) {
      // Excluye conversaciones de Messenger de la consola de Instagram (retrocompatible:
      // los documentos antiguos sin campo `canal` se siguen sirviendo aquí).
      const filtroUsuarioIg = { usuarioIgId: usuario, canal: { $ne: "messenger" } };

      const mensajes = await MensajeIg.find(filtroUsuarioIg)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum);

      const total = await MensajeIg.countDocuments(filtroUsuarioIg);

      // NOTA (Inbox Unificado — Fase 2A): este GET YA NO escribe estado.
      // Antes reseteaba `unreadCount` a 0 como efecto secundario implícito de
      // leer el hilo (GET con semántica de escritura). El marcado de leído es
      // ahora explícito: POST /api/admin/inbox/leido (services/inboxService).
      // La consola de Instagram hace esa llamada al abrir un hilo
      // (public/src/features/instagram/InstagramConsole.js).

      const data = mensajes.reverse().map((m) => ({
        _id: m._id,
        mid: m.mid || null,
        status: m.status || (m.direccion === "bot" ? "sent" : "received"),
        text: m.texto,
        timestamp:
          m.timestamp instanceof Date
            ? m.timestamp.getTime()
            : new Date(m.timestamp).getTime(),
        direction: m.direccion,
        tipo: m.tipo || "texto",
        mediaUrl: m.mediaUrl || null,
        mediaType: m.mediaType || null,
      }));

      return res.json({
        success: true,
        data,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          hasMore: skip + limitNum < total,
        },
      });
    } else {
      const limitConversaciones = parseInt(req.query.limit) || 300;
      const agregados = await MensajeIg.aggregate([
        // La consola de Instagram solo muestra su propio canal. Retrocompatible:
        // los documentos antiguos (sin campo `canal`) siguen apareciendo aquí.
        { $match: { canal: { $ne: "messenger" } } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$usuarioIgId",
            ultimoMensaje: {
              $first: {
                _id: "$_id",
                mid: "$mid",
                status: "$status",
                texto: "$texto",
                timestamp: "$timestamp",
                direccion: "$direccion",
                tipo: "$tipo",
                mediaUrl: "$mediaUrl",
                mediaType: "$mediaType",
              },
            },
            totalMensajes: { $sum: 1 },
          },
        },
        { $sort: { "ultimoMensaje.timestamp": -1 } },
        { $limit: limitConversaciones },
      ]);

      const resultado = {};
      for (const ag of agregados) {
        const uId = ag._id;
        const uMsg = ag.ultimoMensaje;
        resultado[uId] = {
          id: uId,
          usuarioIgId: uId,
          username: null,
          fullName: "Usuario de Instagram",
          avatar: null,
          paso: "inicio",
          modo: "automatico",
          operationMode: "automatico",
          origen: "directo",
          stuck: false,
          unreadCount: 0,
          requiresAttention: false,
          resumen: {
            _id: uMsg._id,
            mid: uMsg.mid || null,
            status:
              uMsg.status || (uMsg.direccion === "bot" ? "sent" : "received"),
            text: uMsg.texto,
            timestamp:
              uMsg.timestamp instanceof Date
                ? uMsg.timestamp.getTime()
                : new Date(uMsg.timestamp).getTime(),
            direction: uMsg.direccion,
            tipo: uMsg.tipo || "texto",
            mediaUrl: uMsg.mediaUrl || null,
            mediaType: uMsg.mediaType || null,
          },
          lastMessage: {
            text: uMsg.texto,
            timestamp:
              uMsg.timestamp instanceof Date
                ? uMsg.timestamp.getTime()
                : new Date(uMsg.timestamp).getTime(),
            direction: uMsg.direccion,
          },
          totalMensajes: ag.totalMensajes,
        };
      }

      const userIds = Object.keys(resultado);
      if (userIds.length > 0) {
        const ets = await EtiquetaIg.find({
          usuarioIgId: { $in: userIds },
        }).lean();

        for (const et of ets) {
          if (resultado[et.usuarioIgId]) {
            resultado[et.usuarioIgId].paso = et.paso || "inicio";
            resultado[et.usuarioIgId].modo = et.modo || "automatico";
            resultado[et.usuarioIgId].operationMode = et.modo || "automatico";
            resultado[et.usuarioIgId].origen = et.origen || "directo";
            resultado[et.usuarioIgId].stuck = et.stuck || false;
            resultado[et.usuarioIgId].unreadCount = et.unreadCount || 0;
            if (et.username) {
              resultado[et.usuarioIgId].username = et.username;
              resultado[et.usuarioIgId].fullName = et.nombre || `@${et.username}`;
            } else if (et.nombre) {
              resultado[et.usuarioIgId].fullName = et.nombre;
            }
            if (et.profilePic || et.metadata?.profilePic) {
              resultado[et.usuarioIgId].avatar = et.profilePic || et.metadata.profilePic;
            }
            // Definición ÚNICA de requiereAtencion (§6.2.1 del contrato del Inbox
            // Unificado): modo manual || stuck || bloqueado || origen anuncio ||
            // paso ∈ PASOS_DE_PAGO || (WhatsApp && pedido pendiente_verificacion).
            resultado[et.usuarioIgId].requiresAttention = computarRequiereAtencion({
              modo: et.modo,
              stuck: et.stuck,
              bloqueado: et.bloqueado,
              origen: et.origen,
              paso: et.paso,
              canal: et.canal || "instagram",
              pedido: null,
            });
          }
        }
      }

      return res.json({ success: true, data: resultado });
    }
  } catch (err) {
    console.error("❌ Error en getInstagramHistorial:", err);
    res
      .status(500)
      .json({ success: false, error: "Error consultando historial de Instagram" });
  }
};

const postInstagramEnviar = async (req, res, io = null) => {
  try {
    const { usuarioIgId, texto } = req.body;
    if (!usuarioIgId || !texto) {
      return res.status(400).json({
        success: false,
        error: "Faltan parámetros requeridos (usuarioIgId, texto)",
      });
    }

    // Aislamiento de canal: no responder por Instagram a un PSID de Messenger
    if (await esConversacionMessenger(usuarioIgId)) {
      return res.status(409).json(RESPUESTA_CANAL_EQUIVOCADO);
    }

    const { enviarTextoIg } = require("../services/instagram");
    await enviarTextoIg(getConfig("IG_ACCOUNT_ID"), usuarioIgId, texto);

    const nuevoMensaje = await MensajeIg.create({
      usuarioIgId,
      direccion: "bot",
      texto,
      tipo: "texto",
      mid: `igmid_admin_${Date.now()}`,
      status: "sent",
      timestamp: new Date(),
    });

    if (io) {
      io.emit("mensaje_ig", {
        usuarioIgId,
        mensaje: nuevoMensaje,
      });
      io.emit("ig_actualizado", { usuarioIgId });
    }

    return res.json({ success: true, data: nuevoMensaje });
  } catch (err) {
    console.error("❌ Error en postInstagramEnviar:", err);
    res
      .status(500)
      .json({ success: false, error: "Error al enviar mensaje por Instagram" });
  }
};

const postInstagramEnviarImagen = async (req, res, io = null) => {
  try {
    const { usuarioIgId } = req.body;
    const file = req.file;

    if (!usuarioIgId) {
      return res.status(400).json({
        success: false,
        error: "Falta el parámetro requerido: usuarioIgId",
      });
    }

    if (!file || !file.buffer) {
      return res.status(400).json({
        success: false,
        error: "No se proporcionó ningún archivo de imagen",
      });
    }

    // Aislamiento de canal: no subir ni enviar por Instagram a un PSID de Messenger
    if (await esConversacionMessenger(usuarioIgId)) {
      return res.status(409).json(RESPUESTA_CANAL_EQUIVOCADO);
    }

    // 1. Subir imagen a Cloudinary (carpeta 'ig_media')
    const cloudinaryService = require("../services/cloudinaryService");
    const mediaUrl = await cloudinaryService.uploadFromBuffer(
      file.buffer,
      "ig_media",
    );

    if (!mediaUrl) {
      return res.status(500).json({
        success: false,
        error: "Error al subir la imagen a Cloudinary",
      });
    }

    // 2. Enviar a Meta Instagram Graph API
    const { enviarImagenIg } = require("../services/instagram");
    await enviarImagenIg(getConfig("IG_ACCOUNT_ID"), usuarioIgId, mediaUrl);

    // 3. Persistir en MensajeIg
    const nuevoMensaje = await MensajeIg.create({
      usuarioIgId,
      direccion: "bot",
      texto: "[Foto]",
      tipo: "imagen",
      mediaUrl,
      mediaType: "image",
      mid: `igmid_admin_img_${Date.now()}`,
      status: "sent",
      timestamp: new Date(),
    });

    if (io) {
      io.emit("mensaje_ig", {
        usuarioIgId,
        mensaje: nuevoMensaje,
      });
      io.emit("ig_actualizado", { usuarioIgId });
    }

    return res.json({ success: true, data: nuevoMensaje });
  } catch (err) {
    console.error("❌ Error en postInstagramEnviarImagen:", err);
    return res.status(500).json({
      success: false,
      error: "Error al enviar imagen por Instagram",
    });
  }
};

const getWhatsAppProfile = async (req, res) => {
  try {
    const { getWhatsAppBusinessProfile } = require("../services/whatsapp");
    const profile = await getWhatsAppBusinessProfile();
    return res.json({ success: true, data: profile });
  } catch (err) {
    console.error("❌ Error en getWhatsAppProfile:", err);
    return res.status(500).json({
      success: false,
      error: "Error consultando perfil de WhatsApp Business",
    });
  }
};

const postWhatsAppProfile = async (req, res) => {
  try {
    const { about, address, description, email, websites, vertical } = req.body;
    const profileData: any = {};
    if (typeof about === "string") profileData.about = about.trim();
    if (typeof address === "string") profileData.address = address.trim();
    if (typeof description === "string") profileData.description = description.trim();
    if (typeof email === "string") profileData.email = email.trim();
    if (Array.isArray(websites)) profileData.websites = websites.map((w) => (w || "").trim()).filter(Boolean);
    if (typeof vertical === "string" && vertical.trim()) profileData.vertical = vertical.trim();

    const { updateWhatsAppBusinessProfile } = require("../services/whatsapp");
    const result = await updateWhatsAppBusinessProfile(profileData);

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("❌ Error en postWhatsAppProfile:", err);
    return res.status(500).json({
      success: false,
      error: "Error actualizando perfil de WhatsApp Business",
    });
  }
};

const postWhatsAppProfilePicture = async (req, res) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({
        success: false,
        error: "No se proporcionó ningún archivo de imagen para la foto de perfil",
      });
    }

    const { updateWhatsAppBusinessProfilePicture } = require("../services/whatsapp");
    const result = await updateWhatsAppBusinessProfilePicture(
      file.buffer,
      file.mimetype || "image/jpeg",
    );

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("❌ Error en postWhatsAppProfilePicture:", err);
    return res.status(500).json({
      success: false,
      error: "Error actualizando foto de perfil de WhatsApp Business",
    });
  }
};

const getInstagramBotToggle = async (req, res) => {
  try {
    const doc = await Setting.findOne({ key: "instagram.botEnabled" });
    const enabled = doc && typeof doc.value === "boolean" ? doc.value : true;
    return res.json({ success: true, data: { enabled } });
  } catch (err) {
    console.error("❌ Error en getInstagramBotToggle:", err);
    return res.status(500).json({ success: false, error: "Error consultando estado del bot" });
  }
};

const postInstagramBotToggle = async (req, res, io = null) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "El parámetro 'enabled' debe ser booleano (true o false)",
      });
    }

    await Setting.findOneAndUpdate(
      { key: "instagram.botEnabled" },
      { $set: { value: enabled } },
      { upsert: true, returnDocument: "after" },
    );

    if (io) {
      io.emit("ig_bot_toggle", { enabled });
    }

    console.log(`🤖 [IG Bot] Bot de Instagram global cambiado a: ${enabled ? "ACTIVADO" : "DESACTIVADO"}`);
    return res.json({ success: true, data: { enabled } });
  } catch (err) {
    console.error("❌ Error en postInstagramBotToggle:", err);
    return res.status(500).json({ success: false, error: "Error actualizando estado del bot" });
  }
};

const postInstagramModo = async (req, res, io = null) => {
  try {
    const { usuarioIgId, modo } = req.body;

    if (!usuarioIgId || !modo) {
      return res.status(400).json({
        success: false,
        error: "Faltan parámetros requeridos (usuarioIgId, modo)",
      });
    }

    if (!["manual", "automatico"].includes(modo)) {
      return res.status(400).json({
        success: false,
        error: "Modo inválido. Debe ser 'manual' o 'automatico'",
      });
    }

    // Aislamiento de canal: el modo de una conversación de Messenger se opera en su propio canal
    if (await esConversacionMessenger(usuarioIgId)) {
      return res.status(409).json(RESPUESTA_CANAL_EQUIVOCADO);
    }

    const doc = await EtiquetaIg.findOneAndUpdate(
      { usuarioIgId },
      { $set: { modo } },
      { returnDocument: "after", upsert: true },
    );

    if (io) {
      io.emit("ig_modo_actualizado", { usuarioIgId, modo });
      io.emit("ig_actualizado", { usuarioIgId });
    }

    try {
      await registrarAuditoria(req, {
        recursoId: usuarioIgId,
        tipoRecurso: "usuario",
        accion: modo === "manual" ? "activar_modo_manual_ig" : "activar_modo_automatico_ig",
        detalles: `Operador cambió modo de IG a "${modo}" para: ${usuarioIgId}`,
      });
    } catch (auditErr) {
      // No bloqueante
    }

    console.log(`🤖 [ModoChat IG] ${usuarioIgId} → ${modo}`);
    return res.json({ success: true, data: { usuarioIgId, modo: doc?.modo || modo } });
  } catch (err) {
    console.error("❌ Error en postInstagramModo:", err);
    return res
      .status(500)
      .json({ success: false, error: "Error cambiando modo de conversación en Instagram" });
  }
};

const getChatContext = async (req, res) => {
  try {
    const { telefono } = req.query;
    if (!telefono) {
      return res
        .status(400)
        .json({ success: false, error: "Teléfono requerido" });
    }

    const pedidos = await Pedido.find({ whatsappId: telefono }).sort({
      timestamp: -1,
    });
    const pedidosList = Array.isArray(pedidos) ? pedidos : [];
    const ultimoPedido = pedidosList[0] || null;
    const etiqueta = await Etiqueta.findOne({ telefono });

    // 1. Datos del cliente
    let customerName = null;
    if (
      ultimoPedido?.cliente?.nombre &&
      ultimoPedido.cliente.nombre.trim() &&
      ultimoPedido.cliente.nombre.trim() !== "Sin nombre"
    ) {
      customerName = ultimoPedido.cliente.nombre.trim();
    } else if (etiqueta?.carrito?.nombre && etiqueta.carrito.nombre.trim()) {
      customerName = etiqueta.carrito.nombre.trim();
    }

    const cedula =
      ultimoPedido?.cliente?.cedula || etiqueta?.carrito?.cedula || null;
    const direccion =
      ultimoPedido?.ubicacion?.direccion ||
      etiqueta?.carrito?.direccion ||
      null;
    const latitud = ultimoPedido?.ubicacion?.latitud || null;
    const longitud = ultimoPedido?.ubicacion?.longitud || null;

    // 2. Historial & LTV
    const pedidosValidos = pedidosList.filter(
      (p) => !["cancelado", "anulado"].includes(p.estado),
    );
    const totalCompras = pedidosValidos.length;
    const ltvUSD = pedidosValidos.reduce(
      (acc, p) => acc + (Number(p.pago?.montoUSD) || 0),
      0,
    );

    // 3. Carrito en vivo / Items actuales
    let items = [];
    let envioActivo = null;
    if (
      Array.isArray(etiqueta?.carrito?.items) &&
      etiqueta.carrito.items.length > 0
    ) {
      items = etiqueta.carrito.items;
      envioActivo = etiqueta.carrito.envio || ultimoPedido?.envio || null;
    } else if (
      ultimoPedido?.items &&
      Array.isArray(ultimoPedido.items) &&
      !["entregado", "cancelado", "anulado"].includes(ultimoPedido.estado)
    ) {
      items = ultimoPedido.items;
      envioActivo = ultimoPedido.envio || null;
    }

    // 4. Totales en USD y Bs
    let totalUSD = null;
    if (items.length > 0) {
      totalUSD = orderService.calcularTotalCarrito({
        items,
        envio: envioActivo,
      });
    } else if (ultimoPedido?.pago?.montoUSD > 0) {
      totalUSD = ultimoPedido.pago.montoUSD;
    }

    let tasaBCV = null;
    let totalBS = null;
    try {
      const tasaRes = await obtenerTasaUSD();
      tasaBCV = tasaRes?.tasa || (typeof tasaRes === "number" ? tasaRes : null);
      if (tasaBCV && totalUSD != null) {
        totalBS = formatBs(Math.round(totalUSD * tasaBCV * 100) / 100);
      }
    } catch (e) {
      totalBS = null;
    }

    // 5. Pedido Activo (si existe uno en curso)
    let pedidoActivo = null;
    const estadosInactivos = ["entregado", "cancelado", "anulado"];
    if (ultimoPedido && !estadosInactivos.includes(ultimoPedido.estado)) {
      pedidoActivo = {
        _id: ultimoPedido._id,
        idFormateado:
          ultimoPedido.idFormateado ||
          ultimoPedido.correlativo ||
          `#${String(ultimoPedido._id).slice(-4)}`,
        estado: ultimoPedido.estado,
        metodoPago: ultimoPedido.pago?.metodo || null,
        comprobanteMediaId:
          ultimoPedido.pago?.comprobanteMediaId ||
          ultimoPedido.comprobanteMediaId ||
          null,
        comprobanteUrl: ultimoPedido.pago?.comprobanteUrl || null,
        repartidor: ultimoPedido.repartidor || null,
        montoUSD: ultimoPedido.pago?.montoUSD || totalUSD,
        montoVES: ultimoPedido.pago?.montoVES || null,
        direccion: ultimoPedido.ubicacion?.direccion || direccion,
        timestamp: ultimoPedido.timestamp,
      };
    }

    const pedidosActivos = pedidosList
      .filter(p => !estadosInactivos.includes(p.estado))
      .map(p => ({
        _id: p._id,
        idFormateado: p.idFormateado || p.correlativo || `#${String(p._id).slice(-4)}`,
        estado: p.estado,
        metodoPago: p.pago?.metodo || null,
        comprobanteMediaId: p.pago?.comprobanteMediaId || p.comprobanteMediaId || null,
        comprobanteUrl: p.pago?.comprobanteUrl || null,
        repartidor: p.repartidor || null,
        montoUSD: p.pago?.montoUSD || (p._id.toString() === ultimoPedido?._id?.toString() ? totalUSD : 0),
        montoVES: p.pago?.montoVES || null,
        direccion: p.ubicacion?.direccion || direccion,
        timestamp: p.timestamp,
      }));

    // 6. Lista de repartidores disponibles
    let repartidores = [];
    try {
      repartidores = await Usuario.find({ role: "repartidor" });
      if (Array.isArray(repartidores)) {
        repartidores = repartidores.map((r) => ({
          _id: r._id,
          nombre: r.nombre || r.username,
          username: r.username,
        }));
      }
    } catch (e) {
      repartidores = [];
    }

    let menuTexto = "";
    try {
      const { getMenuDinamico } = require("../services/faqMatcher");
      menuTexto = await getMenuDinamico();
    } catch (e) {
      menuTexto = "";
    }

    return res.json({
      success: true,
      data: {
        customerName,
        telefono,
        cedula,
        direccion,
        latitud,
        longitud,
        totalCompras,
        ltvUSD: Math.round(ltvUSD * 100) / 100,
        items,
        pasoActual: etiqueta?.paso || "inicio",
        etiqueta: etiqueta?.etiqueta || null,
        bloqueado: etiqueta?.bloqueado || false,
        totalUSD,
        totalBS,
        tasaBCV,
        pedidoActivo,
        pedidosActivos,
        repartidores: repartidores || [],
        menuTexto,
        menu: menuTexto,
      },
    });
  } catch (error) {
    console.error("❌ Error en getChatContext:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Error obteniendo contexto del chat" });
  }
};

/**
 * Historial de Pedidos (Nuevas Rutas)
 */
const getPedidosHistorial = async (req, res) => {
  try {
    const { telefono } = req.query;
    const filter = telefono ? { whatsappId: telefono } : {};
    const pedidos = await Pedido.find(filter)
      .populate("pago.metodo")
      .sort({ timestamp: -1 })
      .limit(100);

    res.json({ success: true, data: pedidos });
  } catch (error) {
    console.error("❌ Error en getPedidosHistorial:", error);
    res.status(500).json({
      success: false,
      error: "Error consultando historial de pedidos",
    });
  }
};

const getEtiquetas = async (req, res) => {
  try {
    const ets = await Etiqueta.find({});
    const data = {};
    ets.forEach((e) => {
      data[e.telefono] = {
        etiqueta: e.etiqueta,
        paso: e.paso,
        stuck: e.stuck || false,
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Error en getEtiquetas:", err);
    res
      .status(500)
      .json({ success: false, error: "Error consultando etiquetas" });
  }
};

const postEtiqueta = async (req, res, io) => {
  try {
    const { telefono, etiqueta } = req.body;
    await Etiqueta.findOneAndUpdate(
      { telefono },
      { etiqueta },
      { upsert: true, returnDocument: "after" },
    );
    io.emit("etiqueta_actualizada", { telefono, etiqueta });
    res.json({ success: true, data: null });
  } catch (err) {
    console.error("❌ Error en postEtiqueta:", err);
    res
      .status(500)
      .json({ success: false, error: "Error actualizando etiqueta" });
  }
};

/**
 * Multimedia y Operaciones Especiales
 */
const getMedia = async (req, res) => {
  const mediaId = req.params.mediaId;
  try {
    // Protección IDOR: Verificar que el mediaId pertenece a un pedido registrado O a un mensaje de chat
    const existsInPedido = await Pedido.exists({
      $or: [
        { "pago.comprobanteMediaId": mediaId },
        { comprobanteMediaId: mediaId },
      ],
    });

    const existsInMensaje = await Mensaje.exists({ mediaId });

    if (!existsInPedido && !existsInMensaje && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Acceso denegado a este recurso multimedia",
      });
    }

    const mediaResponse = await axios.get(
      `https://graph.facebook.com/v20.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      },
    );
    const imageResponse = await axios.get(mediaResponse.data.url, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    res.set("Content-Type", imageResponse.headers["content-type"]);
    res.send(imageResponse.data);
  } catch (err) {
    console.error(
      `❌ Error en getMedia (${mediaId}):`,
      err.response?.data || err.message,
    );
    const status = err.response?.status || 500;
    const message =
      status === 404
        ? "Media no encontrada"
        : "Error al recuperar media de WhatsApp";
    res.status(status).json({
      success: false,
      error: message,
    });
  }
};

const getAudioMedia = async (req, res) => {
  const mediaId = req.params.mediaId;
  try {
    // 1. Protección IDOR: Validar que el mediaId pertenece a un mensaje guardado de tipo "audio"
    const mensajeDoc = await Mensaje.findOne({ mediaId, tipo: "audio" });
    if (!mensajeDoc) {
      return res.status(404).json({
        success: false,
        error: "Nota de voz no encontrada o recurso no autorizado",
      });
    }

    if (process.env.NODE_ENV === "test") {
      res.set("Content-Type", mensajeDoc.mimeType || "audio/ogg");
      res.set("Content-Disposition", "inline");
      res.set("Cache-Control", "private, max-age=3600");
      return res.send(Buffer.from("MOCK_AUDIO_DATA"));
    }

    // 2. Obtener URL temporal de descarga desde Graph API de Meta
    const mediaResponse = await axios.get(
      `https://graph.facebook.com/v20.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      },
    );

    const downloadUrl = mediaResponse.data?.url;
    if (!downloadUrl) {
      return res.status(404).json({
        success: false,
        error: "URL de audio de WhatsApp no disponible",
      });
    }

    // 3. Descargar binario de audio
    const audioResponse = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    // 4. Content-Type seguro y validado
    const mimeDetectado =
      audioResponse.headers["content-type"] ||
      mensajeDoc.mimeType ||
      "audio/ogg";
    const allowedMimes = [
      "audio/ogg",
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/aac",
      "audio/amr",
      "audio/webm",
      "audio/wav",
      "audio/x-m4a",
    ];
    const baseMime = mimeDetectado.split(";")[0].trim().toLowerCase();
    const contentType = allowedMimes.includes(baseMime)
      ? mimeDetectado
      : "audio/ogg";

    res.set("Content-Type", contentType);
    res.set("Content-Disposition", "inline");
    res.set("Cache-Control", "private, max-age=3600");
    return res.send(Buffer.from(audioResponse.data));
  } catch (err) {
    console.error(
      `❌ Error en getAudioMedia (${mediaId}):`,
      err.response?.data || err.message,
    );
    const status = err.response?.status || 500;
    const message =
      status === 404
        ? "Nota de voz no encontrada"
        : "Error al recuperar nota de voz de WhatsApp";
    return res.status(status).json({
      success: false,
      error: message,
    });
  }
};

const confirmarPago = async (req, res, io, modosOperacion) => {
  try {
    const { telefono, pedidoId } = req.body;

    let query: any = {
      whatsappId: telefono,
      estado: {
        $in: [
          "pendiente_verificacion",
          "por_verificar",
          "esperando_verificacion",
          "verificando_pago",
        ],
      },
    };
    if (pedidoId) query._id = pedidoId;

    // Buscamos el pedido pendiente de verificación en el nuevo modelo
    const pedidoDoc = await Pedido.findOne(query);

    if (!pedidoDoc)
      return res.status(400).json({
        error: "No hay pedido pendiente de verificación para estae número",
      });

    // 1. Sistema de Correlativos Atómico (Fix: Solo asignar si no existe)
    let idFormateado = pedidoDoc.idFormateado || pedidoDoc.correlativo;
    if (!idFormateado) {
      idFormateado = await orderService.getNextOrderNumber();
    }

    const { items = [], cliente = {}, pago = {}, ubicacion = {} } = pedidoDoc;

    // Blindaje de propiedades con encadenamiento opcional y valores por defecto
    const totalUSD = pago?.montoUSD ?? pedidoDoc["pago.montoUSD"] ?? 0;
    let totalVES = pago?.montoVES ?? pedidoDoc["pago.montoVES"] ?? 0;
    let tasa = pago?.tasa ?? pedidoDoc["pago.tasa"] ?? 0;
    const mediaId =
      pago?.comprobanteMediaId ?? pedidoDoc["pago.comprobanteMediaId"];

    // Corrección del Bug de Bs. 0
    if (!totalVES || totalVES === 0) {
      const tasaRes = await obtenerTasaUSD();
      tasa = tasaRes?.tasa || 0;
      totalVES = totalUSD * tasa;
    }

    const clienteNombre =
      cliente?.nombre ?? pedidoDoc["cliente.nombre"] ?? "Sin nombre";
    const clienteCedula =
      cliente?.cedula ?? pedidoDoc["cliente.cedula"] ?? "Sin cédula";

    const ubicacionLat = ubicacion?.latitud ?? pedidoDoc["ubicacion.latitud"];
    const ubicacionLon = ubicacion?.longitud ?? pedidoDoc["ubicacion.longitud"];
    const rawUbicacionDir =
      ubicacion?.direccion ??
      pedidoDoc["ubicacion.direccion"] ??
      (ubicacionLat ? "Ubicación GPS" : "Retiro por tienda");
    let cleanUbicacionDir =
      rawUbicacionDir.split("\nMapa:")[0].replace(/Mapa:.*$/m, "").trim() ||
      (ubicacionLat ? "Ubicación GPS" : "Retiro por tienda");

    // Activación modo manual (30 min) para permitir chat libre tras pago
    await orderService.setModo(telefono, "manual", io);

    setTimeout(
      async () => {
        const currentModo = await orderService.getModo(telefono);
        if (currentModo === "manual") {
          await orderService.setModo(telefono, "automatico", io);
        }
      },
      30 * 60 * 1000,
    );

    // 2. Notificación "Media-Rich" al Administrador
    const itemsString = Array.isArray(items)
      ? items
          .map((i) => `${i?.producto || "Producto"} x${i?.cantidad || 1}`)
          .join(", ")
      : "Sin items";

    const { getCaracasTime } = require("../utils/helpers");

    let adminMsg =
      `🧾 COMANDA DE PAGO VERIFICADO (${idFormateado})\n` +
      `   Hora y Fecha: ${getCaracasTime().toLocaleString("es-VE")}\n` +
      `👤 Cliente: ${clienteNombre}\n` +
      `🆔 Cédula: ${clienteCedula}\n` +
      `📞 Teléfono: ${telefono}\n` +
      `📦 Pedido: ${itemsString}\n` +
      `💰 Total: $${formatUsd(totalUSD)} USD\n` +
      `🧾 Monto Bs: Bs. ${formatBs(totalVES)} (Tasa: ${tasa})\n`;

    if (ubicacionLat && ubicacionLon) {
      adminMsg += `📍 Dirección: ${cleanUbicacionDir}\n   Mapa: https://www.google.com/maps?q=${ubicacionLat},${ubicacionLon}\n`;
    } else {
      adminMsg += `📍 Dirección: ${cleanUbicacionDir}\n`;
    }

    if (pedidoDoc.notas) {
      adminMsg += `📝 Notas: ${pedidoDoc.notas}\n`;
    }
    
    // Registro Contable para Pagos Mixtos
    const pagoEfectivo =
      pedidoDoc.pago?.pagoEfectivo || pedidoDoc["pago.pagoEfectivo"];
    const pagoDigitalVES =
      pedidoDoc.pago?.pagoDigitalVES || pedidoDoc["pago.pagoDigitalVES"];

    if (
      pagoEfectivo ||
      (pagoDigitalVES && pedidoDoc.pago?.metodo === "Pago Mixto")
    ) {
      adminMsg += `   Registro Contable:\n`;
      if (pagoEfectivo)
        adminMsg += `   - Ingreso Caja ($): $${formatUsd(pagoEfectivo)}\n`;
      if (pagoDigitalVES)
        adminMsg += `   - Ingreso Banco (Bs): Bs. ${formatBs(pagoDigitalVES)}\n`;
    }

    const adminPhones = [
      getConfig("ADMIN_PHONE_NUMBER"),
      getConfig("ADMIN_PHONE_NUMBER_2"),
    ].filter(Boolean);

    for (const phone of adminPhones) {
      // Usar fallback: texto libre si ventana 24h está abierta, plantilla si no (1 solo parámetro para compatibilidad)
      const bodyParams = [
        {
          type: "text",
          text: adminMsg.substring(0, 1000).replace(/\n/g, " "),
        },
      ];
      await notificarAdminConFallback(
        phone,
        adminMsg,
        "order_notification",
        bodyParams,
      ).catch((e) => console.error("Error notificando admin en marcarPagado:", e.message));

      // Enviar ubicación nativa de WhatsApp si el cliente compartió coordenadas
      if (ubicacionLat && ubicacionLon) {
        await enviarUbicacion(
          phone,
          ubicacionLat,
          ubicacionLon,
          "Ubicación del Cliente",
          cleanUbicacionDir || "Ubicación de entrega",
        ).catch((e) => console.error("Error enviando ubicación al admin en marcarPagado:", e.message));
      }
    }

    // 3. Notificación al Cliente (Sync chat history)
    const totalBSString = totalVES ? formatBs(totalVES) : "0,00";
    const clientMsg =
      `✅ ¡Pago Verificado!\n\n` +
      `Tu pedido ${idFormateado} ha sido confirmado con éxito.\n` +
      `📍 Dirección: ${cleanUbicacionDir}\n` +
      `📦 Pedido: ${itemsString}\n` +
      `💰 Monto: $${formatUsd(totalUSD)} USD (Bs. ${totalBSString})\n\n` +
      `¡Gracias por tu compra! Te avisaremos cuando el repartidor esté en camino.`;

    const enviado = await enviarTexto(telefono, clientMsg);
    if (enviado) {
      await orderService.emitirYGuardar(telefono, clientMsg, "bot", io);
    }

    // 4. Actualizar estado del pedido
    const estadoAnterior = pedidoDoc.estado;
    pedidoDoc.estado = "verificado";
    pedidoDoc.verifiedAt = new Date();
    pedidoDoc.idFormateado = idFormateado;
    pedidoDoc.correlativo = idFormateado;

    if (!pedidoDoc.pago) pedidoDoc.pago = {};
    pedidoDoc.pago.montoUSD = totalUSD;
    pedidoDoc.pago.montoVES = totalVES;
    pedidoDoc.pago.tasa = tasa;
    pedidoDoc.markModified("pago");

    await pedidoDoc.save();

    // 4b. Disparar evento de conversión a Meta CAPI si proviene de Click-to-WhatsApp (CTWA)
    const metaCapiService = require("../services/metaCapiService");
    metaCapiService.enviarEventoCompra(pedidoDoc).catch((capiErr: any) => {
      console.error("⚠️ [Meta CAPI] Error no bloqueante al enviar evento de compra:", capiErr.message);
    });

    // Registrar Auditoría
    await registrarAuditoria(req, {
      pedidoId: pedidoDoc._id,
      correlativo: idFormateado,
      tipoRecurso: "pedido",
      accion: "pago_confirmado",
      anterior: estadoAnterior,
      nuevo: "verificado",
      detalles: `Pago confirmado por $${totalUSD} USD`,
    });

    // Notificar al Kanban via WebSockets
    if (io) {
      io.emit("pedido_actualizado", {
        _id: pedidoDoc._id,
        estado: "verificado",
      });
      io.emit("pago_confirmado", pedidoDoc);
    }

    // Reset de estado de sesión
    await orderService.setEstado(
      telefono,
      {
        paso: "inicio",
        etiqueta: "compra_realizada",
        carrito: { items: [] },
        mensajesEnEsperaCount: 0,
      },
      io,
    );

    res.json({ success: true, data: { idFormateado } });
  } catch (err) {
    console.error("❌ Error en confirmarPago:", err.message);
    res
      .status(500)
      .json({ error: "Error procesando pago" });
  }
};

const getModos = async (req, res) => {
  try {
    const ets = await Etiqueta.find({ modo: "manual" });
    const data = {};
    ets.forEach((e) => {
      data[e.telefono] = "manual";
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error("❌ Error en getModos:", error);
    res.status(500).json({ success: false, error: "Error consultando modos" });
  }
};

const reactivarBot = async (req, res, io) => {
  try {
    const { telefono } = req.body;
    if (!telefono)
      return res
        .status(400)
        .json({ success: false, error: "Teléfono requerido" });

    // Cambiamos el modo a automático en DB y notificamos
    await orderService.setModo(telefono, "automatico", io);

    // Registrar Auditoría
    await registrarAuditoria(req, {
      recursoId: telefono,
      tipoRecurso: "usuario", // Usamos usuario para referirnos al cliente/telefono
      accion: "reactivar_bot",
      detalles: `Bot reactivado manualmente para: ${telefono}`,
    });

    console.log(`[Emergencia] Bot reactivado manualmente para: ${telefono}`);

    res.json({ success: true, message: "Bot reactivado con éxito" });
  } catch (error) {
    console.error("❌ Error en reactivarBot:", error);
    res.status(500).json({ success: false, error: "Error en la reactivación" });
  }
};

const setModoChat = async (req, res, io) => {
  try {
    const { telefono, modo } = req.body;
    if (!telefono)
      return res
        .status(400)
        .json({ success: false, error: "Teléfono requerido" });
    if (!["manual", "automatico"].includes(modo))
      return res.status(400).json({
        success: false,
        error: "Modo inválido. Use 'manual' o 'automatico'",
      });

    await orderService.setModo(telefono, modo, io);

    await registrarAuditoria(req, {
      recursoId: telefono,
      tipoRecurso: "usuario",
      accion:
        modo === "manual" ? "activar_modo_manual" : "activar_modo_automatico",
      detalles: `Operador cambió modo a "${modo}" para: ${telefono}`,
    });

    console.log(`[ModoChat] ${telefono} → ${modo}`);
    res.json({ success: true, data: { telefono, modo } });
  } catch (error) {
    console.error("❌ Error en setModoChat:", error);
    res.status(500).json({ success: false, error: "Error cambiando modo" });
  }
};

const resetBot = async (req, res, io) => {
  try {
    const { telefono } = req.body;
    if (!telefono)
      return res
        .status(400)
        .json({ success: false, error: "Teléfono requerido" });

    // 1. Resetear estado en DB
    await Etiqueta.findOneAndUpdate(
      { telefono },
      {
        paso: "inicio",
        modo: "automatico",
        carrito: { items: [] },
        mensajesEnEsperaCount: 0,
        stuck: false,
      },
      { upsert: true },
    );

    // 2. Notificar a UI
    if (io) {
      io.emit("modo_actualizado", { telefono, modo: "automatico" });
      io.emit("estado_actualizado", { telefono, paso: "inicio" });
      io.emit("bot_destrabado", telefono);
    }

    // Registrar Auditoría
    await registrarAuditoria(req, {
      recursoId: telefono,
      tipoRecurso: "usuario",
      accion: "reset_bot",
      detalles: `Bot reseteado a cero para: ${telefono}`,
    });

    console.log(`[Watchdog] Bot reseteado a cero para: ${telefono}`);
    res.json({ success: true, message: "Bot destrabado con éxito" });
  } catch (error) {
    console.error("❌ Error en resetBot:", error);
    res.status(500).json({ success: false, error: "Error al resetear bot" });
  }
};

const editOrder = async (req, res, io) => {
  try {
    const { id } = req.params;
    let payload = req.body;
    if (req.body.data) {
      try {
        payload = JSON.parse(req.body.data);
      } catch (e) {
        console.warn("Error parseando data JSON de editOrder:", e);
      }
    }
    const { cliente, whatsappId, ubicacion, notas, pago, items } = payload;

    const pedido = await Pedido.findById(id);
    if (!pedido) {
      return res.status(404).json({ success: false, error: "Pedido no encontrado" });
    }

    if (cliente) {
      if (!pedido.cliente) pedido.cliente = {};
      if (cliente.nombre !== undefined) pedido.cliente.nombre = cliente.nombre;
      if (cliente.cedula !== undefined) pedido.cliente.cedula = cliente.cedula;
      if (cliente.telefono !== undefined) pedido.cliente.telefono = cliente.telefono;
    }
    
    if (whatsappId !== undefined) {
      pedido.whatsappId = whatsappId;
    }

    if (ubicacion) {
      if (!pedido.ubicacion) pedido.ubicacion = {};
      if (ubicacion.direccion !== undefined) pedido.ubicacion.direccion = ubicacion.direccion;
      if (ubicacion.latitud !== undefined) pedido.ubicacion.latitud = ubicacion.latitud;
      if (ubicacion.longitud !== undefined) pedido.ubicacion.longitud = ubicacion.longitud;
    }

    if (notas !== undefined) {
      pedido.notas = notas;
    }

    if (pago && pago.metodo !== undefined) {
      if (!pedido.pago) pedido.pago = {};
      pedido.pago.metodo = pago.metodo;
    }

    if (items && Array.isArray(items)) {
      let montoUSD = 0;
      pedido.items = items.map((item, index) => {
        const existingItem = pedido.items && pedido.items[index] ? pedido.items[index] : null;
        let itemPrice = 0;
        
        if (item.precio !== undefined) {
          itemPrice = Number(item.precio);
        } else if (item.price !== undefined) {
          itemPrice = Number(item.price);
        } else if (existingItem && existingItem.price !== undefined) {
          itemPrice = Number(existingItem.price);
        }

        const qty = Number(item.cantidad) || 1;
        montoUSD += qty * itemPrice;

        return {
          producto: item.producto || (existingItem ? existingItem.producto : "Producto Desconocido"),
          price: itemPrice,
          cantidad: qty
        };
      });

      if (!pedido.pago) pedido.pago = {};
      pedido.pago.montoUSD = montoUSD;
      pedido.pago.montoVES = montoUSD * (pedido.pago.tasa || 1);
    }

    // Subir comprobante a Cloudinary si se adjuntó
    if (req.file && req.file.buffer && req.file.size > 0) {
      try {
        const { uploadFromBuffer } = require("../services/cloudinaryService");
        const comprobanteUrl = await uploadFromBuffer(req.file.buffer, "vouchers");
        if (comprobanteUrl) {
          if (!pedido.pago) pedido.pago = {};
          pedido.pago.comprobanteUrl = comprobanteUrl;
          pedido.pago.comprobanteMediaId = null; // Quitar media ID viejo
        }
      } catch (err) {
        console.error("Error subiendo comprobante en editOrder:", err);
      }
    }

    await pedido.save();

    await registrarAuditoria(req, {
      pedidoId: pedido._id,
      correlativo: pedido.correlativo,
      recursoId: pedido._id.toString(),
      tipoRecurso: "pedido",
      accion: "editar_pedido",
      detalles: `Cambios: ${JSON.stringify(req.body)}`
    });

    if (io) {
      io.emit('pedido_actualizado', pedido);
      io.emit('order_updated', pedido);
    }

    res.json(pedido);
  } catch (error) {
    console.error("❌ Error en editOrder:", error);
    res.status(500).json({ success: false, error: "Error editando pedido" });
  }
};

const updateOrderStatus = async (req, res, io) => {
  try {
    const { id } = req.params;
    const { estado, telefono } = req.body;
    const validStates = [
      "pendiente_verificacion",
      "verificado",
      "en_ruta",
      "confirmado",
      "entregado",
      "cancelado",
    ];

    if (!validStates.includes(estado)) {
      return res
        .status(400)
        .json({ success: false, error: "estado no válido" });
    }

    // Restaricciones por Rol
    if (req.user.role === "repartidor") {
      if (!["en_ruta", "entregado"].includes(estado)) {
        return res.status(403).json({
          success: false,
          error: "El repartidor solo puede marcar como en ruta o entregado",
        });
      }
    }

    if (req.user.role === "cajero") {
      if (!["verificado", "en_ruta", "cancelado"].includes(estado)) {
        return res.status(403).json({
          success: false,
          error: "El cajero solo puede verificar, despachar o cancelar pedidos",
        });
      }
    }

    const updateFields: any = {
      estado: estado.toLowerCase(),
      status: estado.toLowerCase(),
      botActive: true,
      botActivo: true,
      intervencionHumana: false,
    };

    if (estado === "verificado") updateFields.verifiedAt = new Date();
    if (estado === "entregado") updateFields.deliveredAt = new Date();

    const pedidoAnterior = await Pedido.findById(id);
    if (!pedidoAnterior) {
      return res
        .status(404)
        .json({ success: false, error: "Pedido no encontrado" });
    }

    const estadoAnterior = pedidoAnterior.estado;

    const pedido = await Pedido.findByIdAndUpdate(id, updateFields, {
      returnDocument: "after",
    });

    // Registrar Auditoría
    await registrarAuditoria(req, {
      pedidoId: pedido._id,
      correlativo: pedido.idFormateado || pedido.correlativo || id,
      tipoRecurso: "pedido",
      accion: "cambio_estado",
      anterior: estadoAnterior,
      nuevo: estado.toLowerCase(),
      detalles: `estado actualizado manualmente`,
    });

    if (estado === "verificado" && estadoAnterior !== "verificado") {
      const metaCapiService = require("../services/metaCapiService");
      metaCapiService.enviarEventoCompra(pedido).catch((capiErr: any) => {
        console.error("⚠️ [Meta CAPI] Error no bloqueante al enviar evento de compra:", capiErr.message);
      });
    }

    // Notificar al Kanban y Chat via WebSockets (Evento Unificado)
    if (io) {
      io.emit("order_status_changed", pedido);
      if (estado === "verificado" || estado === "confirmado") {
        io.emit("pago_confirmado", pedido);
      }
    }

    // Inyectar Notificaciones de WhatsApp por Cambio de estaatus
    const targetPhone = telefono || pedido.whatsappId;

    if (targetPhone) {
      try {
        const idForm = pedido.idFormateado || pedido.correlativo || id;

        if (estado === "verificado" || estado === "confirmado") {
          // 1. Notificación al Administrador (Comanda)
          const itemsString = Array.isArray(pedido.items)
            ? pedido.items
                .map((i) => `${i?.producto || "Producto"} x${i?.cantidad || 1}`)
                .join(", ")
            : "Sin items";

          const totalUSD = pedido.pago?.montoUSD || 0;
          const totalVES = pedido.pago?.montoVES || 0;
          const tasa = pedido.pago?.tasa || 0;
          const idForm = pedido.idFormateado || pedido.correlativo || id;

          let adminMsg =
            `🧾 *COMANDA DE PAGO VERIFICADO (${idForm})*\n\n` +
            `👤 *Cliente:* ${pedido.cliente?.nombre || "Sin nombre"}\n` +
            `🆔 *Cédula:* ${pedido.cliente?.cedula || "Sin cédula"}\n` +
            `📞 *Teléfono:* ${targetPhone}\n` +
            `📦 *Pedido:* ${itemsString}\n` +
            `💰 *Total:* $${formatUsd(totalUSD)} USD`;

          if (totalVES)
            adminMsg += `\n🧾 *Monto Bs:* Bs. ${formatBs(totalVES)} (Tasa: ${tasa})`;

          const rawDir =
            pedido.ubicacion?.direccion ||
            (pedido.ubicacion?.latitud ? "Ubicación GPS" : "Retiro por tienda");
          let cleanDir =
            rawDir.split("\nMapa:")[0].replace(/Mapa:.*$/m, "").trim() ||
            (pedido.ubicacion?.latitud ? "Ubicación GPS" : "Retiro por tienda");

          if (pedido.ubicacion?.latitud && pedido.ubicacion?.longitud) {
            adminMsg += `\n📍 Dirección: ${cleanDir}\n   Mapa: https://www.google.com/maps?q=${pedido.ubicacion.latitud},${pedido.ubicacion.longitud}`;
          } else {
            adminMsg += `\n📍 Dirección: ${cleanDir}`;
          }

          if (pedido.notas) {
            adminMsg += `\n📝 Notas: ${pedido.notas}`;
          }

          const adminPhones = [
            getConfig("ADMIN_PHONE_NUMBER"),
            getConfig("ADMIN_PHONE_NUMBER_2"),
          ].filter(Boolean);

          for (const phone of adminPhones) {
            await notificarAdminConFallback(
              phone,
              adminMsg,
              "order_notification",
              [{ type: "text", text: adminMsg.substring(0, 1000).replace(/\n/g, " ") }],
            ).catch((e) => console.error("Error notificando admin en cambio de estado:", e.message));

            if (pedido.ubicacion?.latitud && pedido.ubicacion?.longitud) {
              await enviarUbicacion(
                phone,
                pedido.ubicacion.latitud,
                pedido.ubicacion.longitud,
                "Ubicación del Cliente",
                cleanDir,
              ).catch((e) => console.error("Error enviando ubicación al admin:", e.message));
            }
          }

          // 2b. Notificación al Repartidor (Si aplica)
          const deliveryPhone = getConfig("DELIVERY_PHONE_NUMBER");
          if (deliveryPhone) {
            const deliveryMsg = adminMsg.replace(
              "COMANDA DE PAGO VERIFICADO",
              "🚚 *NUEVA ENTREGA ASIGNADA*",
            );
            await enviarTexto(deliveryPhone, deliveryMsg);
            if (pedido.ubicacion?.latitud && pedido.ubicacion?.longitud) {
              await enviarUbicacion(
                deliveryPhone,
                pedido.ubicacion.latitud,
                pedido.ubicacion.longitud,
                "Ubicación de Entrega",
                cleanDir,
              ).catch((e) => console.error("Error enviando ubicación a repartidor:", e.message));
            }
          }

          // 2. Imagen del Comprobante a los Administradores
          const urlPermanente =
            pedido.comprobanteUrl || pedido.pago?.comprobanteUrl;
          const mediaId = pedido.pago?.comprobanteMediaId;

          if (urlPermanente || mediaId) {
            for (const phone of adminPhones) {
              if (urlPermanente) {
                await enviarImagenPorUrl(
                  phone,
                  urlPermanente,
                  `Comprobante ${idForm}`,
                ).catch(() => {});
              } else if (mediaId) {
                await enviarImagenPorMediaId(phone, mediaId).catch(() => {});
              }
            }
          }

          // 3. Notificación al Cliente
          const msgVerificado = `✅ ¡Pago Verificado!\n\nTu pedido ${idForm} ha sido confirmado con éxito. Te avisaremos cuando el repartidor esté en camino. ¡Gracias por tu compra! 🥡`;
          const enviado = await enviarTexto(targetPhone, msgVerificado);
          if (enviado) {
            await orderService.emitirYGuardar(
              targetPhone,
              msgVerificado,
              "bot",
              io,
            );
          }

          // Mantener en modo manual durante todo el proceso de despacho
          await orderService.setModo(targetPhone, "manual", io);

        } else if (estado === "en_ruta") {
          const idForm = pedido.idFormateado || pedido.correlativo || id;
          const rawDir =
            pedido.ubicacion?.direccion ??
            pedido["ubicacion.direccion"] ??
            "Retiro por tienda";
          let cleanDir =
            rawDir.split("\nMapa:")[0].replace(/Mapa:.*$/m, "").trim() ||
            "Retiro por tienda";
          const msgRuta =
            configManager.format("settings.messages.orderDispatched", {
              id: idForm,
              direccion: cleanDir,
            }) ||
            `🛵 ¡Tu pedido está en camino!\n\nEl repartidor ya lleva tu Pedido ${idForm} hacia la dirección indicada: ${cleanDir}.\n\n¡Prepárate para recibir tu compra! ✨`;
          const enviado = await enviarTexto(targetPhone, msgRuta);
          if (enviado) {
            await orderService.emitirYGuardar(targetPhone, msgRuta, "bot", io);
          }
        } else if (estado === "entregado") {
          const msgCierre =
            configManager.format("settings.messages.orderDelivered", {}) ||
            `🏁 ¡Pedido Entregado!\n\n¡Gracias por tu compra! Esperamos que disfrutes tu compra. Si deseas volver a ordenar en el futuro, solo escribe 'Menú' y estaré encantado de ayudarte de nuevo. ✨`;
          const enviado = await enviarTexto(targetPhone, msgCierre);
          if (enviado) {
            await orderService.emitirYGuardar(
              targetPhone,
              msgCierre,
              "bot",
              io,
            );
          }

          console.log(`[Bot] Pedido entregado. El bot se reactivará automáticamente en 15 minutos para ${targetPhone}.`);

          // Esperar 15 minutos antes de reactivar el bot
          setTimeout(
            async () => {
              const currentModo = await orderService.getModo(targetPhone);
              if (currentModo === "manual") {
                await orderService.setModo(targetPhone, "automatico", io);
                
                // Limpiar estado de sesión para permitir nuevo pedido limpio
                await orderService.setEstado(
                  targetPhone,
                  {
                    paso: "inicio",
                    etiqueta: "compra_realizada",
                    carrito: { items: [] },
                    mensajesEnEsperaCount: 0,
                  },
                  io,
                );
                console.log(`[Bot] IA reactivada para ${targetPhone} tras 15 minutos de entrega.`);
              }
            },
            15 * 60 * 1000,
          );
        }
      } catch (wsError) {
        console.error(
          "⚠️ Error enviando notificación de WhatsApp:",
          wsError.message,
        );
        // El fallo de WhatsApp no debe afectar el éxito de la actualización del pedido en el panel
      }
    }

    res.json({ success: true, data: pedido });
  } catch (error) {
    console.error("❌ Error en updateOrderStatus:", error);
    res
      .status(500)
      .json({ success: false, error: "Error actualizando estado del pedido" });
  }
};

const assignRepartidor = async (req, res, io) => {
  try {
    const { id } = req.params;
    const { repartidor } = req.body;

    const pedido = await Pedido.findByIdAndUpdate(
      id,
      { repartidor: repartidor || null },
      { returnDocument: "after" },
    );

    if (!pedido) {
      return res
        .status(404)
        .json({ success: false, error: "Pedido no encontrado" });
    }

    if (io) io.emit("order_status_changed", pedido);

    return res.json({
      success: true,
      data: pedido,
      message: "Repartidor asignado correctamente",
    });
  } catch (error) {
    console.error("❌ Error en assignRepartidor:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Error al asignar repartidor" });
  }
};

const deleteOrder = async (req, res, io) => {
  try {
    const { id } = req.params;

    const pedido = await Pedido.findById(id);
    if (!pedido) {
      return res
        .status(404)
        .json({ success: false, error: "Pedido no encontrado" });
    }

    const correlativo = pedido.idFormateado || pedido.correlativo || id;

    // Registrar auditoría de la eliminación (se conserva como trazabilidad)
    await registrarAuditoria(req, {
      pedidoId: pedido._id,
      correlativo,
      tipoRecurso: "pedido",
      accion: "eliminado",
      anterior: pedido.estado,
      detalles: `Pedido eliminado manualmente (prueba): ${pedido.cliente?.nombre || "Sin nombre"} - Total $${pedido.pago?.montoUSD || 0} USD`,
    });

    await Pedido.findByIdAndDelete(id);

    // Liberar correlativo para ser reutilizado por el próximo pedido entrante
    const rawCorrelativo = pedido.correlativo || pedido.idFormateado;
    if (rawCorrelativo && typeof rawCorrelativo === "string") {
      const match = rawCorrelativo.match(/\d+/);
      if (match) {
        const seqNum = parseInt(match[0], 10);
        if (!isNaN(seqNum) && seqNum > 0) {
          await Counter.findOneAndUpdate(
            { _id: "pedidoId" },
            {
              $push: {
                available_seqs: {
                  $each: [seqNum],
                  $sort: 1,
                },
              },
            },
            { upsert: true },
          );
        }
      }
    }

    if (io) {
      io.emit("order_deleted", {
        pedidoId: id,
        whatsappId: pedido.whatsappId,
      });
    }

    // Notificar al cliente que el pedido fue cancelado
    try {
      if (pedido.whatsappId) {
        const orderIdForm = pedido.idFormateado || pedido.correlativo || "";
        const msgTexto = `⚠️ Hola${pedido.cliente?.nombre ? ` *${pedido.cliente.nombre}*` : ""}, tu pedido${orderIdForm ? ` *${orderIdForm}*` : ""} ha sido *cancelado* administrativamente. Si tienes alguna duda o deseas volver a ordenar, escríbenos por esta vía.`;
        await enviarTexto(pedido.whatsappId, msgTexto);
        
        // Guardar el mensaje en el historial del bot
        const orderService = require("../services/orderService");
        if (orderService.emitirYGuardar) {
          await orderService.emitirYGuardar(pedido.whatsappId, msgTexto, "bot", io);
        }
      }
    } catch (notifError) {
      console.error("❌ Error enviando notificación de cancelación (deleteOrder):", notifError.message);
    }

    return res.json({
      success: true,
      data: { id, whatsappId: pedido.whatsappId },
      message: "Pedido eliminado correctamente",
    });
  } catch (error) {
    console.error("❌ Error en deleteOrder:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Error al eliminar pedido" });
  }
};

const updateOrderShipping = async (req, res, io) => {
  try {
    const { id } = req.params;
    const { metodoId, costoAcordado, avisarCliente } = req.body || {};

    if (!metodoId) {
      return res.status(400).json({ success: false, error: "metodoId es obligatorio" });
    }

    const pedido = await Pedido.findById(id);
    if (!pedido) {
      return res.status(404).json({ success: false, error: "Pedido no encontrado" });
    }

    const estadosBloqueados = ["entregado", "cancelado", "anulado"];
    if (estadosBloqueados.includes(pedido.estado)) {
      return res.status(400).json({
        success: false,
        error: "No se puede modificar el envío de un pedido entregado o cancelado",
      });
    }

    const metodo = await MetodoEnvio.findById(metodoId);
    if (!metodo || metodo.activo === false) {
      return res.status(400).json({
        success: false,
        error: "Método de envío no válido o inactivo",
      });
    }

    const esAConvenir = metodo.costoTipo === "a_convenir";
    if (!esAConvenir && costoAcordado !== undefined) {
      return res.status(400).json({
        success: false,
        error: "costoAcordado solo se permite para métodos con costo a convenir",
      });
    }

    let costoFinal = 0;
    let tieneCostoAcordado = false;
    let aConvenirFinal = false;

    if (esAConvenir) {
      if (costoAcordado !== undefined) {
        const c = Number(costoAcordado);
        if (isNaN(c) || c < 0) {
          return res.status(400).json({
            success: false,
            error: "costoAcordado debe ser un número mayor o igual a 0",
          });
        }
        costoFinal = c;
        tieneCostoAcordado = true;
        aConvenirFinal = false;
      } else {
        costoFinal = 0;
        tieneCostoAcordado = false;
        aConvenirFinal = true;
      }
    } else {
      costoFinal = Number(metodo.costo) || 0;
      tieneCostoAcordado = false;
      aConvenirFinal = false;
    }

    const envioAnterior = pedido.envio ? JSON.parse(JSON.stringify(pedido.envio)) : null;
    const montoUSDAnterior = Number(pedido.pago?.montoUSD) || 0;
    const tipoAnterior = envioAnterior?.tipo || null;
    const cambioTrasCotizar = Boolean(tipoAnterior && tipoAnterior !== metodo.tipo);

    pedido.envio = {
      metodoId: metodo._id,
      nombre: metodo.nombre,
      tipo: metodo.tipo,
      costo: costoFinal,
      aConvenir: aConvenirFinal,
      costoAcordado: tieneCostoAcordado,
      direccion: metodo.direccion || "",
      horario: metodo.horario || "",
      cambioTrasCotizar,
    };

    const montoUSDNuevo = orderService.calcularTotalCarrito({
      items: pedido.items || [],
      envio: pedido.envio,
    });

    if (!pedido.pago) pedido.pago = {};
    pedido.pago.montoUSD = montoUSDNuevo;

    let tasa = 0;
    try {
      const bcvRes = await bcv.obtenerTasaUSD();
      tasa = Number(bcvRes?.tasa) || 0;
    } catch (_) {
      tasa = 0;
    }

    if (tasa > 0) {
      pedido.pago.tasa = tasa;
    } else {
      tasa = Number(pedido.pago?.tasa) || 0;
    }

    pedido.pago.montoVES = tasa > 0 ? Math.round(montoUSDNuevo * tasa * 100) / 100 : (pedido.pago.montoVES || 0);

    await pedido.save();

    const difMonto = montoUSDNuevo - montoUSDAnterior;
    await registrarAuditoria(req, {
      pedidoId: pedido._id,
      correlativo: pedido.idFormateado || pedido.correlativo || id,
      recursoId: pedido._id.toString(),
      tipoRecurso: "pedido",
      accion: "modificar_envio_pedido",
      detalles: `Modificación de método de envío en pedido ${pedido.idFormateado || pedido.correlativo || id}. Anterior: ${JSON.stringify(envioAnterior)}, Nuevo: ${JSON.stringify(pedido.envio)}, Diferencia de monto: ${difMonto >= 0 ? "+" : ""}${difMonto.toFixed(2)} USD`,
      anterior: envioAnterior,
      nuevo: pedido.envio,
    });

    if (io) {
      io.emit("pedido_actualizado", pedido);
      io.emit("order_updated", pedido);
    }

    let aviso: string | undefined = undefined;
    if (pedido.estado === "verificado" || pedido.estado === "en_ruta") {
      aviso = "El pago ya estaba verificado. La diferencia debe coordinarse con el cliente.";
    }

    if (avisarCliente && (pedido.whatsappId || pedido.cliente?.telefono)) {
      const telefonoDestino = pedido.whatsappId || pedido.cliente?.telefono;
      try {
        const orderIdForm = pedido.idFormateado || pedido.correlativo || "";
        const msgTexto = `🚚 Hola${pedido.cliente?.nombre ? ` *${pedido.cliente.nombre}*` : ""}, el método de envío de tu pedido${orderIdForm ? ` *${orderIdForm}*` : ""} ha sido actualizado a *${metodo.nombre}*.\n*Total actualizado:* $${montoUSDNuevo.toFixed(2)}${pedido.pago.montoVES ? ` (Bs. ${pedido.pago.montoVES.toFixed(2)})` : ""}.${metodo.tipo === "retiro" && metodo.direccion ? `\n📍 *Punto de retiro:* ${metodo.direccion}` : ""}`;
        const { enviarTexto } = require("../services/whatsapp");
        await enviarTexto(telefonoDestino, msgTexto);
        if (orderService.emitirYGuardar) {
          await orderService.emitirYGuardar(telefonoDestino, msgTexto, "bot", io);
        }
      } catch (notifErr: any) {
        console.error("⚠️ Error notificando al cliente sobre cambio de envío:", notifErr.message);
      }
    }

    return res.json({
      success: true,
      data: pedido,
      ...(aviso ? { aviso } : {}),
    });
  } catch (error: any) {
    console.error("❌ Error en updateOrderShipping:", error.message);
    return res.status(500).json({
      success: false,
      error: "Error modificando el método de envío",
    });
  }
};

const getSalesSummary = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      filtroFecha = "mes",
      fechaInicio,
      fechaFin,
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // Si limit es 0, desactivamos la paginación para exportaciones completas
    const skip = limitNum > 0 ? (pageNum - 1) * limitNum : 0;

    // 1. Construir Filtro de Fecha

    const queryFilter: any = {
      estado: { $in: ["entregado", "confirmado", "verificado", "en_ruta"] },
    };

    // Obtener la fecha actual YYYY-MM-DD en America/Caracas
    const caracasParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Caracas",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const caracasYear = caracasParts.find((p) => p.type === "year").value;
    const caracasMonth = caracasParts.find((p) => p.type === "month").value;
    const caracasDay = caracasParts.find((p) => p.type === "day").value;
    const todayCaracasStr = `${caracasYear}-${caracasMonth}-${caracasDay}`;

    // Límites del día de hoy en Caracas (UTC-4)
    const startOfTodayCaracas = new Date(`${todayCaracasStr}T00:00:00.000-04:00`);
    const endOfTodayCaracas = new Date(`${todayCaracasStr}T23:59:59.999-04:00`);

    if (filtroFecha === "hoy") {
      queryFilter.timestamp = {
        $gte: startOfTodayCaracas,
        $lte: endOfTodayCaracas,
      };
    } else if (filtroFecha === "semana") {
      // Semana en curso comenzando el Lunes en hora de Caracas
      const dayOfWeek = startOfTodayCaracas.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const startSemana = new Date(
        startOfTodayCaracas.getTime() - diffToMonday * 24 * 60 * 60 * 1000
      );
      queryFilter.timestamp = {
        $gte: startSemana,
        $lte: endOfTodayCaracas,
      };
    } else if (filtroFecha === "mes") {
      // Últimos 30 días respecto al inicio del día de hoy en Caracas
      const startMes = new Date(startOfTodayCaracas.getTime() - 29 * 24 * 60 * 60 * 1000);
      queryFilter.timestamp = {
        $gte: startMes,
        $lte: endOfTodayCaracas,
      };
    } else if (filtroFecha === "personalizado" && fechaInicio) {
      const startIso = fechaInicio.includes("T")
        ? fechaInicio
        : `${fechaInicio}T00:00:00.000-04:00`;
      const startDate = new Date(startIso);

      if (fechaFin) {
        const endIso = fechaFin.includes("T")
          ? fechaFin
          : `${fechaFin}T23:59:59.999-04:00`;
        const endDate = new Date(endIso);
        queryFilter.timestamp = {
          $gte: startDate,
          $lte: endDate,
        };
      } else {
        queryFilter.timestamp = { $gte: startDate };
      }
    }

    // 2. Calcular KPIs sobre TODO el universo filtrado usando Aggregation Pipeline
    const kpiData = await Pedido.aggregate([
      { $match: queryFilter },
      {
        $group: {
          _id: null,
          totalIngresos: { $sum: "$pago.montoUSD" },
          totalVES: { $sum: "$pago.montoVES" },
          totalPedidos: { $sum: 1 },
          totalAdsIngresos: {
            $sum: {
              $cond: [
                { $ne: [{ $ifNull: ["$ctwaClid", ""] }, ""] },
                { $ifNull: ["$pago.montoUSD", 0] },
                0,
              ],
            },
          },
          totalAdsVES: {
            $sum: {
              $cond: [
                { $ne: [{ $ifNull: ["$ctwaClid", ""] }, ""] },
                { $ifNull: ["$pago.montoVES", 0] },
                0,
              ],
            },
          },
          totalAdsPedidos: {
            $sum: {
              $cond: [
                { $ne: [{ $ifNull: ["$ctwaClid", ""] }, ""] },
                1,
                0,
              ],
            },
          },
          sumaTiempoEntrega: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$estado", "entregado"] },
                    { $ne: ["$verifiedAt", null] },
                    { $ne: ["$deliveredAt", null] },
                  ],
                },
                {
                  $divide: [
                    { $subtract: ["$deliveredAt", "$verifiedAt"] },
                    1000 * 60,
                  ],
                },
                0,
              ],
            },
          },
          totalEntregados: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$estado", "entregado"] },
                    { $ne: ["$verifiedAt", null] },
                    { $ne: ["$deliveredAt", null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const stats = kpiData[0] || {
      totalIngresos: 0,
      totalVES: 0,
      totalPedidos: 0,
      sumaTiempoEntrega: 0,
      totalEntregados: 0,
      totalAdsIngresos: 0,
      totalAdsVES: 0,
      totalAdsPedidos: 0,
    };
    const avgDeliveryTime =
      stats.totalEntregados > 0
        ? Math.round(stats.sumaTiempoEntrega / stats.totalEntregados)
        : 0;

    // 3. Analítica de Abandono (Churn Rate) - Se mantiene sobre las últimas 24h
    const twentyFourHoursAgo = new Date(
      new Date().getTime() - 24 * 60 * 60 * 1000,
    );
    const compradoresExitosos = await Pedido.distinct("whatsappId", {
      estado: { $in: ["entregado", "confirmado", "verificado", "en_ruta"] },
    });

    let etiquetas = await Etiqueta.find({
      telefono: { $nin: compradoresExitosos },
      updatedAt: { $gt: twentyFourHoursAgo },
    }).lean();

    if (etiquetas.length === 0) {
      etiquetas = await Etiqueta.find({
        telefono: { $nin: compradoresExitosos },
      })
        .limit(50)
        .lean();
    }

    const churnData = etiquetas.reduce((acc, curr) => {
      const pasoOriginal = curr.paso || "inicio";
      const pasoBonito = getPasoLabel(pasoOriginal);
      acc[pasoBonito] = (acc[pasoBonito] || 0) + 1;
      return acc;
    }, {});

    // 4. Obtener tasa actual del BCV
    let tasaActual = 0;
    try {
      const tasaRes = await obtenerTasaUSD();
      tasaActual = tasaRes?.tasa || 0;
    } catch (e) {}

    // 5. Métrica de Pedidos Web (F2-4)
    let inicioCaracasStr: string | undefined;
    let finCaracasStr: string | undefined;
    if (queryFilter.timestamp && queryFilter.timestamp.$gte) {
      inicioCaracasStr = fechaCaracas(new Date(queryFilter.timestamp.$gte));
    }
    if (queryFilter.timestamp && queryFilter.timestamp.$lte) {
      finCaracasStr = fechaCaracas(new Date(queryFilter.timestamp.$lte));
    }

    const creadosWeb = await obtenerTotalCreados(inicioCaracasStr, finCaracasStr);
    const carritoWebQuery: any = { estado: "vinculado" };
    if (queryFilter.timestamp) {
      carritoWebQuery.creadoEn = queryFilter.timestamp;
    }
    const vinculadosWebCount = await CarritoWeb.countDocuments(carritoWebQuery);

    const convertidosWebCount = await Pedido.countDocuments({
      ...queryFilter,
      "origenWeb.codigo": { $exists: true, $ne: null },
    });
    const vinculadosWeb = Math.max(vinculadosWebCount, convertidosWebCount);

    // 6. Obtener Transacciones (Paginadas o Totales)
    const totalRecords = await Pedido.countDocuments(queryFilter);
    let query = Pedido.find(queryFilter).sort({ timestamp: -1 });

    if (limitNum > 0) {
      query = query.skip(skip).limit(limitNum);
    }

    const transaccionesRaw = await query.lean();

    const transacciones = transaccionesRaw.map((p) => ({
      id: p?.correlativo || p?.idFormateado || p?._id,
      idPedidoOriginal: p?._id,
      cliente: p?.cliente?.nombre || "Sin nombre",
      productos: (p?.items || [])
        .map((i) => `${i?.producto} x${i?.cantidad}`)
        .join(", "),
      total: p?.pago?.montoUSD || 0,
      totalBs: p?.pago?.montoVES || 0,
      tasaHistorial: p?.pago?.tasa || 0,
      fecha: p?.timestamp || new Date(),
      esAd: Boolean(p?.ctwaClid && typeof p.ctwaClid === "string" && p.ctwaClid.trim() !== ""),
      ctwaClid: p?.ctwaClid || null,
      esWeb: Boolean(p?.origenWeb?.codigo),
      origenWebCodigo: p?.origenWeb?.codigo || null,
    }));

    return res.status(200).json({
      success: true,
      data: {
        tasaActual,
        kpis: {
          totalIngresos: formatUsd(stats.totalIngresos),
          totalVES: stats.totalVES,
          totalPedidos: stats.totalPedidos,
          ticketPromedio:
            stats.totalPedidos > 0
              ? formatUsd(stats.totalIngresos / stats.totalPedidos)
              : "0.00",
          avgDeliveryTime,
          totalAdsIngresos: formatUsd(stats.totalAdsIngresos || 0),
          totalAdsVES: stats.totalAdsVES || 0,
          totalAdsPedidos: stats.totalAdsPedidos || 0,
          porcentajeVentasAds:
            stats.totalPedidos > 0
              ? Math.round(((stats.totalAdsPedidos || 0) / stats.totalPedidos) * 100)
              : 0,
          pedidosWeb: {
            creados: creadosWeb,
            vinculados: vinculadosWeb,
            convertidos: convertidosWebCount,
          },
        },
        pagination: {
          totalRecords,
          totalPages: Math.ceil(totalRecords / limitNum),
          currentPage: pageNum,
          limit: limitNum,
        },
        churn: churnData,
        transacciones,
      },
    });
  } catch (error) {
    console.error("❌ Error crítico en getSalesSummary:", error);
    res
      .status(500)
      .json({ success: false, error: "Error interno al generar analíticas" });
  }
};

const getBackup = async (req, res) => {
  try {
    const productos = await Producto.find({});
    const pedidos = await Pedido.find({});
    const brandName = configManager.get("settings.brandName") || "backup";

    const backupData = {
      timestamp: new Date().toISOString(),
      brand: brandName,
      collections: {
        productos,
        pedidos,
      },
    };

    const filePrefix = brandName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    res.attachment(
      `backup_${filePrefix}_${new Date().toISOString().split("T")[0]}.json`,
    );
    res.json(backupData);
  } catch (error) {
    console.error("❌ Error en getBackup:", error);
    res.status(500).json({ success: false, error: "Error generando respaldo" });
  }
};

const getHealth = async (req, res) => {
  try {
    const watchdogService = require("../services/watchdogService");
    const health = await watchdogService.getHealthStatus();
    res.json({ success: true, data: health });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error consultando salud" });
  }
};

const getMe = async (req, res) => {
  try {
    res.json({ success: true, data: req.user });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Error obteniendo info de usuario" });
  }
};

const getOrderAuditLog = async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await Auditoria.find({ pedidoId: id }).sort({ timestamp: -1 });
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error("❌ Error en getOrderAuditLog:", error);
    res
      .status(500)
      .json({ success: false, error: "Error obteniendo auditoría" });
  }
};

// Identificadores de área y acción (p. ej. "metodo_envio", "cambio_estado"): solo minúsculas y guion bajo.
const FILTRO_AUDITORIA = /^[a-z_]{1,50}$/;

/**
 * Arma el filtro de Auditoria con `tipoRecurso` y `accion` (ambos opcionales).
 * Devuelve null si algún valor no tiene el formato esperado.
 * "otro" incluye los registros sin tipoRecurso, igual que el resumen.
 */
const construirFiltroAuditoria = (query: any): Record<string, any> | null => {
  const filtro: Record<string, any> = {};
  for (const campo of ["tipoRecurso", "accion"]) {
    const valor = query[campo];
    if (valor === undefined) continue;
    if (typeof valor !== "string" || !FILTRO_AUDITORIA.test(valor)) return null;
    filtro[campo] = valor;
  }
  if (filtro.tipoRecurso === "otro") {
    filtro.tipoRecurso = { $in: ["otro", null] };
  }
  return filtro;
};

const getAuditLogs = async (req, res) => {
  try {
    const filtro = construirFiltroAuditoria(req.query);
    if (!filtro) {
      return res.status(400).json({ success: false, error: "Filtro inválido" });
    }
    // Número no válido -> valor por defecto; número fuera de rango -> acotado
    const limiteSolicitado = parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limiteSolicitado) ? 50 : Math.min(100, Math.max(1, limiteSolicitado));
    const paginaSolicitada = parseInt(req.query.page, 10);
    const page = Number.isNaN(paginaSolicitada) ? 1 : Math.max(1, paginaSolicitada);
    const skip = (page - 1) * limit;
    const logs = await Auditoria.find(filtro)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate("usuarioId", "username nombre role");

    const total = await Auditoria.countDocuments(filtro);

    res.json({
      success: true,
      data: logs,
      totalCount: total, // Para depuración
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error en getAuditLogs:", error);
    res
      .status(500)
      .json({ success: false, error: "Error obteniendo logs de auditoría" });
  }
};

/**
 * Resumen por área (tipoRecurso) y acción, para la pantalla de auditoría agrupada.
 * Áreas y acciones van de mayor a menor total.
 */
const getAuditSummary = async (req, res) => {
  try {
    let filas: { tipoRecurso?: string; accion?: string; total: number }[];
    if (typeof Auditoria.aggregate === "function") {
      const resultado = await Auditoria.aggregate([
        {
          $group: {
            _id: { tipoRecurso: { $ifNull: ["$tipoRecurso", "otro"] }, accion: "$accion" },
            total: { $sum: 1 },
          },
        },
      ]);
      filas = resultado.map((f) => ({
        tipoRecurso: f._id.tipoRecurso,
        accion: f._id.accion,
        total: f.total,
      }));
    } else {
      // Mock de pruebas (dbLocal) sin aggregate: mismo cálculo con find y reduce
      const registros = await Auditoria.find({});
      const conteo = new Map<string, { tipoRecurso: string; accion: string; total: number }>();
      for (const r of registros) {
        const tipoRecurso = r.tipoRecurso || "otro";
        const accion = r.accion || "otro";
        const clave = `${tipoRecurso}|${accion}`;
        const previo = conteo.get(clave) || { tipoRecurso, accion, total: 0 };
        previo.total += 1;
        conteo.set(clave, previo);
      }
      filas = [...conteo.values()];
    }

    const areas = new Map<string, { tipoRecurso: string; total: number; acciones: Map<string, number> }>();
    for (const fila of filas) {
      const tipoRecurso = fila.tipoRecurso || "otro";
      const accion = fila.accion || "otro";
      const area = areas.get(tipoRecurso) || { tipoRecurso, total: 0, acciones: new Map<string, number>() };
      area.total += fila.total;
      area.acciones.set(accion, (area.acciones.get(accion) || 0) + fila.total);
      areas.set(tipoRecurso, area);
    }

    const porTotal = (a: { total: number }, b: { total: number }) => b.total - a.total;
    const listaAreas = [...areas.values()]
      .map((area) => ({
        tipoRecurso: area.tipoRecurso,
        total: area.total,
        acciones: [...area.acciones.entries()]
          .map(([accion, total]) => ({ accion, total }))
          .sort((a, b) => porTotal(a, b) || a.accion.localeCompare(b.accion)),
      }))
      .sort((a, b) => porTotal(a, b) || a.tipoRecurso.localeCompare(b.tipoRecurso));

    const total = listaAreas.reduce((suma, area) => suma + area.total, 0);

    res.json({ success: true, data: { total, areas: listaAreas } });
  } catch (error) {
    console.error("❌ Error en getAuditSummary:", error);
    res
      .status(500)
      .json({ success: false, error: "Error obteniendo resumen de auditoría" });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await Usuario.find({}, "-password").sort({ username: 1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Error obteniendo usuarios" });
  }
};

const postUser = async (req, res) => {
  try {
    const { username, password, nombre, role } = req.body;
    if (!username || !password || !nombre || !role) {
      return res
        .status(400)
        .json({ success: false, error: "Todos los campos son obligatorios" });
    }

    const existing = await Usuario.findOne({ username });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, error: "El usuario ya existe" });
    }

    const newUser = await Usuario.create({ username, password, nombre, role });

    // Registrar Auditoría
    await registrarAuditoria(req, {
      recursoId: newUser._id,
      tipoRecurso: "usuario",
      accion: "crear_usuario",
      nuevo: newUser.username,
      detalles: `Usuario creado: ${newUser.username} | Nombre: ${newUser.nombre} | Rol: ${newUser.role}`,
    });

    res.status(201).json({
      success: true,
      data: {
        username: newUser.username,
        nombre: newUser.nombre,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("❌ Error en postUser:", error);
    res.status(500).json({
      success: false,
      error: "Error creando usuario",
    });
  }
};

const patchUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo, role, password, nombre } = req.body;

    const user = await Usuario.findById(id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, error: "Usuario no encontrado" });

    const anterior = {
      activo: user.activo,
      role: user.role,
      nombre: user.nombre,
    };

    // Whitelisting de campos: Solo permitimos modificar nombre y password a usuarios con permiso
    if (nombre !== undefined) user.nombre = nombre;
    if (password) user.password = password; // Hashed por el hook pre-save

    // Protección de Privilegios: Solo un ADMIN real puede cambiar roles o estados de cuenta
    if (req.user.role === "admin") {
      if (activo !== undefined) user.activo = activo;
      if (role !== undefined) user.role = role;
    } else if (activo !== undefined || role !== undefined) {
      return res.status(403).json({
        success: false,
        error: "No tienes privilegios para modificar roles o estado de cuenta",
      });
    }

    await user.save();

    // Registrar Auditoría
    const cambios = [];
    if (nombre !== undefined && user.nombre !== anterior.nombre) {
      cambios.push(`nombre: "${anterior.nombre}" → "${user.nombre}"`);
    }
    if (role !== undefined && user.role !== anterior.role) {
      cambios.push(`rol: "${anterior.role}" → "${user.role}"`);
    }
    if (activo !== undefined && user.activo !== anterior.activo) {
      cambios.push(`activo: ${anterior.activo} → ${user.activo}`);
    }
    if (password) {
      cambios.push(`contraseña actualizada`);
    }

    await registrarAuditoria(req, {
      recursoId: id,
      tipoRecurso: "usuario",
      accion: "actualizar_usuario",
      anterior: JSON.stringify(anterior),
      nuevo: JSON.stringify({
        activo: user.activo,
        role: user.role,
        nombre: user.nombre,
      }),
      detalles:
        cambios.length > 0
          ? `Usuario: ${user.username}. Cambios: ${cambios.join(" | ")}`
          : `Usuario: ${user.username} (sin cambios detectados)`,
    });

    res.json({ success: true, message: "Usuario actualizado" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Error actualizando usuario" });
  }
};

const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Pedido.findById(id).populate("pago.metodo");
    if (!order) {
      return res
        .status(404)
        .json({ success: false, error: "Pedido no encontrado" });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    console.error("❌ Error en getOrder:", error.message);
    res.status(500).json({ success: false, error: "Error consultando pedido" });
  }
};

const uploadAndSendFile = async (req, res, io) => {
  try {
    const { to, caption, replyToMid, replyToText } = req.body;
    const file = req.file;

    if (!to || !file) {
      return res
        .status(400)
        .json({ success: false, message: "Faltan datos (to, file)" });
    }

    const { uploadFromBuffer } = require("../services/cloudinaryService");
    const {
      enviarImagenPorUrl,
      enviarDocumentoPorUrl,
    } = require("../services/whatsapp");
    const orderService = require("../services/orderService");

    // Subir a Cloudinary
    const url = await uploadFromBuffer(file.buffer, "panel_uploads");

    // Verificar si es imagen, audio o documento
    const isImage = file.mimetype.startsWith("image/");
    const isAudio = file.mimetype.startsWith("audio/");
    const tipo = isImage ? "image" : isAudio ? "audio" : "document";
    let sendResult = null;
    let wamid = null;

    if (isImage) {
      sendResult = await enviarImagenPorUrl(to, url, caption || "", null, replyToMid);
    } else {
      sendResult = await enviarDocumentoPorUrl(
        to,
        url,
        file.originalname,
        caption || "",
        null,
        replyToMid,
      );
    }

    const success = !!sendResult;
    if (typeof sendResult === "string") {
      wamid = sendResult;
    }

    if (success) {
      // Guardar en DB y emitir una sola vez a través de orderService.emitirYGuardar
      const savedMsg = await orderService.emitirYGuardar(
        to,
        caption || "",
        "bot",
        io,
        tipo,
        null, // mediaId
        wamid,
        "sent",
        file.mimetype,
        url, // mediaUrl
        file.originalname, // fileName
        caption || null, // caption
        replyToMid || null,
        replyToText || null,
      );

      res.json({ success: true, url, data: savedMsg });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Error al enviar por WhatsApp" });
    }
  } catch (error) {
    console.error("❌ Error en uploadAndSendFile:", error);
    res.status(500).json({ success: false, message: "Error al procesar y enviar archivo" });
  }
};

const postManualSale = async (req, res, io) => {
  try {
    // Soporte para FormData (req.body puede venir como string JSON)
    let body = req.body;
    if (
      typeof body === "string" ||
      (body.data && typeof body.data === "string")
    ) {
      body = JSON.parse(typeof body === "string" ? body : body.data);
    }
    const { whatsappId, usuarioId, cliente, items, pago, ubicacion, notas, envio } = body;

    // 1. Validaciones
    if (!cliente || !cliente.nombre || cliente.nombre.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "El nombre del cliente es obligatorio.",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Debe incluir al menos un producto en la venta.",
      });
    }

    for (const item of items) {
      if (
        (!item.producto && !item.id && !item.productoId && !item._id) ||
        !item.cantidad ||
        isNaN(item.cantidad) ||
        Number(item.cantidad) <= 0
      ) {
        return res.status(400).json({
          success: false,
          error: "Cada item debe tener producto y cantidad válidos.",
        });
      }
    }

    // 2. Pre-verificar, validar existencia/estado y obtener precio real de la base de datos
    // Primero validamos todo para evitar decrementos parciales en caso de error
    for (const item of items) {
      const prodId = item.id || item.productoId || item._id;
      let prod = null;
      if (prodId) {
        // Un id de texto (p. ej. "fortunne-n21") no se puede convertir a ObjectId: Mongoose lanzaría CastError
        prod = await Producto.findOne({
          $or: [{ id: prodId }, ...(mongoose.Types.ObjectId.isValid(prodId) ? [{ _id: prodId }] : [])],
        });
      }
      if (!prod && item.producto) {
        prod = await Producto.findOne({
          $or: [{ id: item.producto }, { name: item.producto }],
        });
      }

      if (!prod || prod.activo === false) {
        return res.status(400).json({
          success: false,
          error: `El producto "${item.producto || prodId || "desconocido"}" no existe en el catálogo o está inactivo.`,
        });
      }

      // Seguridad: el precio se toma SIEMPRE de la base de datos por producto/id, no del cuerpo de la petición.
      // Es el precio VIGENTE (con el descuento del producto, F2g)
      item.price = precioVigente(prod);
      item.producto = prod.name;
      item.id = prod.id;

      if (prod.trackStock && prod.stock < Number(item.cantidad)) {
        return res.status(400).json({
          success: false,
          error: `Stock insuficiente para "${item.producto}". Disponible: ${prod.stock}, Solicitado: ${item.cantidad}`,
        });
      }
    }

    // Descontamos stock de forma atómica para los que tienen trackStock
    for (const item of items) {
      if (typeof Producto.findOneAndUpdate === "function") {
        const decResult = await Producto.findOneAndUpdate(
          {
            name: item.producto,
            trackStock: true,
            stock: { $gte: item.cantidad },
          },
          { $inc: { stock: -item.cantidad } },
          { returnDocument: "after" },
        );
        if (decResult) {
          console.log(
            `✅ [Venta Manual] Stock descontado para "${item.producto}": -${item.cantidad} (Restante: ${decResult.stock})`,
          );
        }
      } else {
        // Fallback para testing con dbLocal mock
        const prod = await Producto.findOne({ name: item.producto });
        if (prod && prod.trackStock) {
          prod.stock = (prod.stock || 0) - item.cantidad;
          if (process.env.NODE_ENV === "test") {
            const dbLocal = require("../services/dbLocal");
            const dbData = dbLocal.read();
            const idx = dbData.productos.findIndex(
              (p) => p.name === item.producto,
            );
            if (idx !== -1) {
              dbData.productos[idx].stock = prod.stock;
              dbLocal.write(dbData);
            }
          }
        }
      }
    }

    // 3. Generar correlativo
    const correlativo = await orderService.getNextOrderNumber();

    // 3b. Subir comprobante a Cloudinary (si se adjuntó imagen)
    let comprobanteUrl = null;
    if (req.file && req.file.buffer && req.file.size > 0) {
      try {
        const { uploadFromBuffer } = require("../services/cloudinaryService");
        comprobanteUrl = await uploadFromBuffer(req.file.buffer, "vouchers");
        console.log(`✅ [Venta Manual] Comprobante subido: ${comprobanteUrl}`);
      } catch (uploadErr) {
        console.error(
          "⚠️ [Venta Manual] Error subiendo comprobante:",
          uploadErr.message,
        );
        // No bloqueamos la venta por error de imagen
      }
    }

    // 4. Método de Envío y Totales
    let envioSanitizado = null;
    if (envio) {
      const metodoId = envio.metodoId || envio._id;
      if (!metodoId) {
        return res.status(400).json({
          success: false,
          error: "El método de envío debe incluir metodoId.",
        });
      }
      let metodoDB = null;
      try {
        const queryMetodo = MetodoEnvio.findById(metodoId);
        metodoDB = typeof queryMetodo?.lean === "function" ? await queryMetodo.lean() : await queryMetodo;
      } catch (err) {
        metodoDB = null;
      }
      if (!metodoDB || metodoDB.activo === false) {
        return res.status(400).json({
          success: false,
          error: "El método de envío seleccionado no existe o está inactivo.",
        });
      }

      const esAConvenir = metodoDB.costoTipo === "a_convenir";
      const costoReal = esAConvenir ? 0 : (Number(metodoDB.costo) || 0);
      envioSanitizado = {
        metodoId: String(metodoDB._id),
        nombre: metodoDB.nombre,
        tipo: metodoDB.tipo,
        costo: costoReal,
        aConvenir: esAConvenir,
      };
    }

    const montoUSD = orderService.calcularTotalCarrito({
      items,
      envio: envioSanitizado,
    });

    // Obtener tasa BCV
    const bcvRes = await obtenerTasaUSD();
    const tasa = bcvRes?.tasa || 0;
    const montoVES = tasa ? Math.round(montoUSD * tasa * 100) / 100 : 0;

    // 4.5 Extraer ctwaClid si el cliente proviene de un anuncio (WhatsApp o IG/Messenger)
    let ctwaClid = null;
    try {
      const chatID = whatsappId || req.body.usuarioId || cliente.telefono;
      if (chatID) {
        // Intentar primero en WhatsApp
        const waEtq = await Etiqueta.findOne({ telefono: chatID });
        if (waEtq && waEtq.ctwaClid) {
          ctwaClid = waEtq.ctwaClid;
        } else {
          // Intentar en IG/Messenger
          const igEtq = await EtiquetaIg.findOne({ $or: [{ usuarioIgId: chatID }, { username: chatID }] });
          if (igEtq) {
            if (igEtq.metadata && igEtq.metadata.referral && igEtq.metadata.referral.ad_id) {
              ctwaClid = `igad_${igEtq.metadata.referral.ad_id}`;
            } else if (igEtq.origen === "anuncio") {
              ctwaClid = `igad_unknown_${Date.now()}`;
            }
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ No se pudo extraer ctwaClid para la venta manual:", err);
    }

    // 5. Crear el Pedido (con soporte fallback para dbLocal mock)
    const telefonoCliente = cliente.telefono ? cliente.telefono.trim() : null;
    const pedidoData = {
      whatsappId: telefonoCliente || `manual-${Date.now()}`,
      cliente: {
        nombre: cliente.nombre.trim(),
        cedula: cliente.cedula ? cliente.cedula.trim() : "N/A",
        telefono: telefonoCliente || undefined,
      },
      items: items.map((item) => ({
        producto: item.producto,
        price: Number(item.price),
        cantidad: Number(item.cantidad),
      })),
      ubicacion: (() => {
        let dir = ubicacion?.direccion || "Retiro en tienda";
        let lat = null;
        let lon = null;
        const mapsRegex = /https:\/\/maps\.google\.com\/\?q=([-\d\.]+),([-\d\.]+)/;
        const match = dir.match(mapsRegex);
        if (match) {
          lat = parseFloat(match[1]);
          lon = parseFloat(match[2]);
          dir = dir.replace(match[0], "").replace(/Mapa:\s*/i, "").trim();
          if (dir === "") dir = "Ubicación GPS";
        }
        return { direccion: dir, latitud: lat, longitud: lon };
      })(),
      pago: {
        metodo: pago?.metodo || "Efectivo",
        montoUSD,
        montoVES,
        tasa,
        comprobanteUrl: comprobanteUrl || pago?.comprobanteUrl || undefined,
        pagoCon: pago?.pagoCon || 0,
        vuelto: pago?.vuelto || 0,
      },
      ...(envioSanitizado ? { envio: envioSanitizado } : {}),
      notas: notas || "",
      ctwaClid: ctwaClid,
      idFormateado: correlativo,
      correlativo,
      estado: body.estado || "entregado",
      timestamp: new Date(),
      deliveredAt: new Date(),
    };

    let pedido;
    if (typeof Pedido.create === "function") {
      pedido = await Pedido.create(pedidoData);
    } else {
      pedido = await Pedido.findOneAndUpdate(
        { whatsappId: pedidoData.whatsappId },
        { $set: pedidoData },
        { upsert: true, returnDocument: "after" },
      );
    }

    // 6. Emitir por Socket.IO
    if (io) {
      io.emit("pago_enviado_cliente", pedido);
    }

    // 6.5. Enviar Comanda al Administrador
    try {
      const { enviarTexto } = require("../services/whatsapp");
      const { formatUsd, formatBs } = require("../utils/helpers");
      
      const adminPhones = [
        getConfig("ADMIN_PHONE_NUMBER"),
        getConfig("ADMIN_PHONE_NUMBER_2"),
      ].filter(Boolean);

      if (adminPhones.length > 0) {
        const itemsString = Array.isArray(pedido.items)
          ? pedido.items
              .map((i) => `${i?.producto || "Producto"} x${i?.cantidad || 1}`)
              .join(", ")
          : "Sin items";
        
        const { getCaracasTime } = require("../utils/helpers");
        const fechaStr = getCaracasTime().toLocaleString("es-VE");
        
        let adminMsg =
          `🔔 *NUEVA VENTA RÁPIDA (${pedido.idFormateado || pedido.correlativo})*\n` +
          `🕒 *Fecha:* ${fechaStr}\n\n` +
          `👤 *Cliente:* ${pedido.cliente?.nombre || "Sin nombre"}\n` +
          `🆔 *Cédula:* ${pedido.cliente?.cedula || "Sin cédula"}\n` +
          `📞 *Teléfono:* ${pedido.whatsappId || "Sin teléfono"}\n` +
          `📦 *Pedido:* ${itemsString}\n` +
          `💳 *Método de Pago:* ${pedido.pago?.metodo || "Efectivo"}\n` +
          `💰 *Total:* $${formatUsd(montoUSD)} USD`;
        
        if (montoVES) {
          adminMsg += `\n🧾 *Monto Bs:* Bs. ${formatBs(montoVES)} (Tasa: ${tasa})`;
        }
        if (pago?.pagoCon > 0 && pago?.vuelto >= 0) {
          adminMsg += `\n💵 *Pago con:* $${formatUsd(pago.pagoCon)} (Vuelto: $${formatUsd(pago.vuelto)})`;
        }

        const rawManualDir =
          pedido.ubicacion?.direccion ||
          (pedido.ubicacion?.latitud ? "Ubicación GPS" : "Retiro en tienda");
        let cleanManualDir =
          rawManualDir.split("\nMapa:")[0].replace(/Mapa:.*$/m, "").trim() ||
          (pedido.ubicacion?.latitud ? "Ubicación GPS" : "Retiro en tienda");

        if (pedido.ubicacion?.latitud && pedido.ubicacion?.longitud) {
          adminMsg += `\n📍 Dirección: ${cleanManualDir}\n   Mapa: https://www.google.com/maps?q=${pedido.ubicacion.latitud},${pedido.ubicacion.longitud}`;
        } else {
          adminMsg += `\n📍 Dirección: ${cleanManualDir}`;
        }

        if (pedido.envio && pedido.envio.nombre) {
          adminMsg += `\n🚚 Envío: ${nombreEnvio(pedido.envio)}${detalleCostoEnvio(pedido.envio)}`;
        }

        if (pedido.notas) {
          adminMsg += `\n📝 Notas: ${pedido.notas}`;
        }
        
        for (const phone of adminPhones) {
          await notificarAdminConFallback(
            phone,
            adminMsg,
            "order_notification",
            [{ type: "text", text: adminMsg.substring(0, 1000).replace(/\n/g, " ") }],
          ).catch((e) => console.error("Error notificando admin en venta rápida:", e.message));

          if (pedido.ubicacion?.latitud && pedido.ubicacion?.longitud) {
            await enviarUbicacion(
              phone,
              pedido.ubicacion.latitud,
              pedido.ubicacion.longitud,
              "Ubicación del Cliente",
              pedido.ubicacion.direccion || "Retiro en tienda",
            ).catch((e) => console.error("Error enviando ubicación al admin en venta rápida:", e.message));
          }

          const urlPermanente = pedido.pago?.comprobanteUrl || pedido.comprobanteUrl || comprobanteUrl;
          if (urlPermanente) {
            await enviarImagenPorUrl(
              phone,
              urlPermanente,
              `Comprobante Venta Rápida ${pedido.idFormateado || pedido.correlativo}`
            ).catch((e) => console.error("Error enviando comprobante:", e.message));
          }
        }
      }
    } catch (msgErr) {
      console.error("⚠️ [Venta Manual] Error enviando comanda al admin:", msgErr.message);
    }

    // 7. Registrar Auditoría
    await registrarAuditoria(req, {
      pedidoId: pedido._id,
      correlativo,
      tipoRecurso: "pedido",
      accion: "venta_manual",
      anterior: "n/a",
      nuevo: "entregado",
      detalles: `Venta manual registrada. Cliente: ${pedido.cliente.nombre}. Total: $${montoUSD.toFixed(2)} USD (${tasa ? `Bs. ${montoVES.toFixed(2)}` : "Tasa BCV no disp."})`,
    });

    res.status(201).json({ success: true, data: pedido });
  } catch (error) {
    console.error("❌ Error en postManualSale:", error);
    res.status(500).json({
      success: false,
      error: "Error interno al procesar la venta manual",
    });
  }
};

const getQuickReplies = async (req, res) => {
  try {
    const QuickReply = require("../models/QuickReply");
    const replies = await QuickReply.find({ brand: "default" }).sort({
      isFavorite: -1,
      order: 1,
      createdAt: -1,
    });
    res.json({ success: true, data: replies });
  } catch (err) {
    console.error("Error getQuickReplies:", err.message);
    res.status(500).json({ success: false, error: "Error al obtener respuestas rápidas" });
  }
};

const createQuickReply = async (req, res) => {
  try {
    const QuickReply = require("../models/QuickReply");
    const { text, category, order, isFavorite } = req.body;
    if (!text || !text.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "El texto es requerido" });
    }
    const reply = await QuickReply.create({
      text: text.trim(),
      category: category || "general",
      order: order || 0,
      isFavorite: Boolean(isFavorite),
      brand: "default",
    });
    res.status(201).json({ success: true, data: reply });
  } catch (err) {
    console.error("Error createQuickReply:", err.message);
    res.status(500).json({ success: false, error: "Error al crear respuesta rápida" });
  }
};

const updateQuickReply = async (req, res) => {
  try {
    const QuickReply = require("../models/QuickReply");
    const { text, category, order, active, isFavorite, usageCount } = req.body;
    const update: any = {};
    if (text !== undefined) update.text = text.trim();
    if (category !== undefined) update.category = category;
    if (order !== undefined) update.order = order;
    if (active !== undefined) update.active = active;
    if (isFavorite !== undefined) update.isFavorite = Boolean(isFavorite);
    if (usageCount !== undefined) update.usageCount = Number(usageCount) || 0;

    const reply = await QuickReply.findByIdAndUpdate(req.params.id, update, {
      returnDocument: "after",
    });
    if (!reply)
      return res.status(404).json({ success: false, error: "No encontrada" });
    res.json({ success: true, data: reply });
  } catch (err) {
    console.error("Error updateQuickReply:", err.message);
    res.status(500).json({ success: false, error: "Error al actualizar respuesta rápida" });
  }
};

const deleteQuickReply = async (req, res) => {
  try {
    const QuickReply = require("../models/QuickReply");
    const reply = await QuickReply.findByIdAndDelete(req.params.id);
    if (!reply)
      return res.status(404).json({ success: false, error: "No encontrada" });
    res.json({ success: true, message: "Eliminada" });
  } catch (err) {
    console.error("Error deleteQuickReply:", err.message);
    res.status(500).json({ success: false, error: "Error al eliminar respuesta rápida" });
  }
};

const reorderQuickReplies = async (req, res) => {
  try {
    const QuickReply = require("../models/QuickReply");
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res
        .status(400)
        .json({ success: false, error: "Se requiere array de IDs" });
    }
    for (let i = 0; i < ids.length; i++) {
      await QuickReply.findByIdAndUpdate(ids[i], { order: i });
    }
    res.json({ success: true, message: "Reordenado" });
  } catch (err) {
    console.error("Error reorderQuickReplies:", err.message);
    res.status(500).json({ success: false, error: "Error al reordenar respuestas rápidas" });
  }
};

const getFaqs = async (req, res) => {
  try {
    let FAQ = require("../models/FAQ");
    if (process.env.NODE_ENV === "test") {
      const dbLocal = require("../services/dbLocal");
      if (typeof dbLocal.getFAQModel === "function")
        FAQ = dbLocal.getFAQModel();
    }
    const faqs = await FAQ.find({ brand: "default" }).sort({
      order: 1,
      createdAt: 1,
    });
    res.json({ success: true, data: faqs });
  } catch (err) {
    console.error("Error getFaqs:", err.message);
    res.status(500).json({ success: false, error: "Error al obtener preguntas frecuentes" });
  }
};

const createFaq = async (req, res) => {
  try {
    let FAQ = require("../models/FAQ");
    if (process.env.NODE_ENV === "test") {
      const dbLocal = require("../services/dbLocal");
      if (typeof dbLocal.getFAQModel === "function")
        FAQ = dbLocal.getFAQModel();
    }
    const { pregunta, keywords, respuesta, order, activo, type, dynamicKey, mostrarEnTienda } =
      req.body;
    if (!pregunta || !pregunta.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "La pregunta es requerida" });
    }
    const faqType = type === "dinamica" ? "dinamica" : "estatica";
    if (faqType === "estatica" && (!respuesta || !respuesta.trim())) {
      return res
        .status(400)
        .json({
          success: false,
          error: "La respuesta es requerida para FAQs estáticas",
        });
    }
    const processedKeywords = Array.isArray(keywords)
      ? keywords.map((k) => String(k).trim()).filter(Boolean)
      : typeof keywords === "string"
        ? keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : [];

    const faq = await FAQ.create({
      pregunta: pregunta.trim(),
      keywords: processedKeywords,
      respuesta: (respuesta || "").trim(),
      type: faqType,
      dynamicKey: dynamicKey ? String(dynamicKey).trim() : null,
      order: Number(order) || 0,
      activo: activo !== undefined ? Boolean(activo) : true,
      // Las dinámicas nunca salen en la tienda (F2h)
      mostrarEnTienda: faqType === "estatica" && mostrarEnTienda === true,
      brand: "default",
    });
    res.status(201).json({ success: true, data: faq });
  } catch (err) {
    console.error("Error createFaq:", err.message);
    res.status(500).json({ success: false, error: "Error al crear pregunta frecuente" });
  }
};

const updateFaq = async (req, res) => {
  try {
    let FAQ = require("../models/FAQ");
    if (process.env.NODE_ENV === "test") {
      const dbLocal = require("../services/dbLocal");
      if (typeof dbLocal.getFAQModel === "function")
        FAQ = dbLocal.getFAQModel();
    }
    const { pregunta, keywords, respuesta, order, activo, type, dynamicKey, mostrarEnTienda } =
      req.body;
    const update: any = {};
    if (pregunta !== undefined) update.pregunta = pregunta.trim();
    if (respuesta !== undefined) update.respuesta = respuesta.trim();
    if (type !== undefined)
      update.type = type === "dinamica" ? "dinamica" : "estatica";
    if (dynamicKey !== undefined)
      update.dynamicKey = dynamicKey ? String(dynamicKey).trim() : null;
    if (order !== undefined) update.order = Number(order) || 0;
    if (activo !== undefined) update.activo = Boolean(activo);
    // Las dinámicas nunca salen en la tienda (F2h)
    if (type === "dinamica") update.mostrarEnTienda = false;
    else if (mostrarEnTienda !== undefined) update.mostrarEnTienda = mostrarEnTienda === true;
    if (keywords !== undefined) {
      update.keywords = Array.isArray(keywords)
        ? keywords.map((k) => String(k).trim()).filter(Boolean)
        : typeof keywords === "string"
          ? keywords
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean)
          : [];
    }

    const faq = await FAQ.findByIdAndUpdate(req.params.id, update, {
      returnDocument: "after",
    });
    if (!faq)
      return res
        .status(404)
        .json({ success: false, error: "FAQ no encontrada" });
    res.json({ success: true, data: faq });
  } catch (err) {
    console.error("Error updateFaq:", err.message);
    res.status(500).json({ success: false, error: "Error al actualizar pregunta frecuente" });
  }
};

const deleteFaq = async (req, res) => {
  try {
    let FAQ = require("../models/FAQ");
    if (process.env.NODE_ENV === "test") {
      const dbLocal = require("../services/dbLocal");
      if (typeof dbLocal.getFAQModel === "function")
        FAQ = dbLocal.getFAQModel();
    }
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    if (!faq)
      return res
        .status(404)
        .json({ success: false, error: "FAQ no encontrada" });
    res.json({ success: true, message: "FAQ eliminada" });
  } catch (err) {
    console.error("Error deleteFaq:", err.message);
    res.status(500).json({ success: false, error: "Error al eliminar pregunta frecuente" });
  }
};

const postPushSubscribe = async (req, res) => {
  try {
    const subscription = req.body.subscription || req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        error: "Objeto de suscripción push incompleto o inválido",
      });
    }

    const usuarioId = req.user?._id || null;
    const role = req.user?.role || "admin";
    const userAgent = req.headers["user-agent"] || "";

    const saved = await pushService.saveSubscription(subscription, usuarioId, role, userAgent);

    return res.json({
      success: true,
      message: "Dispositivo suscrito a notificaciones push móviles con éxito",
      data: { endpoint: saved.endpoint },
    });
  } catch (error) {
    console.error("❌ Error en postPushSubscribe:", error);
    return res.status(500).json({
      success: false,
      error: "Error guardando suscripción push",
    });
  }
};

const postPushUnsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: "Endpoint requerido para cancelar suscripción",
      });
    }

    await pushService.removeSubscription(endpoint);
    return res.json({
      success: true,
      message: "Suscripción push eliminada con éxito",
    });
  } catch (error) {
    console.error("❌ Error en postPushUnsubscribe:", error);
    return res.status(500).json({
      success: false,
      error: "Error eliminando suscripción push",
    });
  }
};

const postPushTest = async (req, res) => {
  try {
    const payload = {
      title: "🔔 Notificación de Prueba",
      body: "Tu dispositivo está correctamente vinculado para recibir alertas del panel en segundo plano.",
      url: "/panel",
      tag: "test-push",
      icon: "/assets/favicon.svg",
      badge: "/assets/badge.png"
    };

    // Enviamos la respuesta inmediatamente al frontend
    res.json({
      success: true,
      message: "Notificación programada en 5 segundos. ¡Cierra la app ahora!",
    });

    // Retardamos el envío real para que el usuario tenga tiempo de cerrar la PWA
    setTimeout(async () => {
      let result;
      if (req.user?._id) {
        result = await pushService.sendToUser(req.user._id, payload);
      } else {
        result = await pushService.sendToAllAdmins(payload);
      }
      console.log("✅ [WebPush] Notificación de prueba diferida enviada:", result);
    }, 5000);
  } catch (error) {
    console.error("❌ Error en postPushTest:", error);
    return res.status(500).json({
      success: false,
      error: "Error enviando notificación de prueba",
    });
  }
};

/**
 * Top 10 Productos Más Vendidos (v2.0)
 * Agrupa pedidos válidos por producto y suma cantidades vendidas e ingresos en USD.
 */
const getTopProducts = async (req, res) => {
  try {
    const { filtroFecha = "mes", fechaInicio, fechaFin } = req.query;
    
    // 1. Construir Filtro de Fecha
    const queryFilter: any = {
      estado: { $in: ["entregado", "confirmado", "verificado", "en_ruta"] },
      items: { $exists: true, $ne: [] },
    };

    // Obtener la fecha actual YYYY-MM-DD en America/Caracas
    const caracasParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Caracas",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const caracasYear = caracasParts.find((p) => p.type === "year").value;
    const caracasMonth = caracasParts.find((p) => p.type === "month").value;
    const caracasDay = caracasParts.find((p) => p.type === "day").value;
    const todayCaracasStr = `${caracasYear}-${caracasMonth}-${caracasDay}`;

    // Límites del día de hoy en Caracas (UTC-4)
    const startOfTodayCaracas = new Date(`${todayCaracasStr}T00:00:00.000-04:00`);
    const endOfTodayCaracas = new Date(`${todayCaracasStr}T23:59:59.999-04:00`);

    if (filtroFecha === "hoy") {
      queryFilter.timestamp = {
        $gte: startOfTodayCaracas,
        $lte: endOfTodayCaracas,
      };
    } else if (filtroFecha === "semana") {
      // Semana en curso comenzando el Lunes en hora de Caracas
      const dayOfWeek = startOfTodayCaracas.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const startSemana = new Date(
        startOfTodayCaracas.getTime() - diffToMonday * 24 * 60 * 60 * 1000
      );
      queryFilter.timestamp = {
        $gte: startSemana,
        $lte: endOfTodayCaracas,
      };
    } else if (filtroFecha === "mes") {
      const startMes = new Date(startOfTodayCaracas.getTime() - 29 * 24 * 60 * 60 * 1000);
      queryFilter.timestamp = {
        $gte: startMes,
        $lte: endOfTodayCaracas,
      };
    } else if (filtroFecha === "personalizado" && fechaInicio && fechaFin) {
      queryFilter.timestamp = {
        $gte: new Date(`${fechaInicio}T00:00:00.000-04:00`),
        $lte: new Date(`${fechaFin}T23:59:59.999-04:00`),
      };
    }

    const topProducts = await Pedido.aggregate([
      {
        $match: queryFilter,
      },
      {
        $unwind: "$items",
      },
      {
        $match: {
          "items.producto": { $exists: true, $nin: [null, ""] },
        },
      },
      {
        $group: {
          _id: "$items.producto",
          cantidadVendida: { 
            $sum: { 
              $convert: { input: { $ifNull: ["$items.cantidad", 1] }, to: "double", onError: 0, onNull: 1 } 
            } 
          },
          totalIngresosUSD: {
            $sum: {
              $multiply: [
                { $convert: { input: { $ifNull: ["$items.cantidad", 1] }, to: "double", onError: 0, onNull: 1 } },
                { $convert: { input: { $ifNull: ["$items.price", 0] }, to: "double", onError: 0, onNull: 0 } },
              ],
            },
          },
        },
      },
      {
        $sort: {
          cantidadVendida: -1,
          totalIngresosUSD: -1,
        },
      },
      {
        $limit: 10,
      },
      {
        $project: {
          _id: 0,
          producto: "$_id",
          cantidadVendida: 1,
          totalIngresosUSD: { $round: ["$totalIngresosUSD", 2] },
          ingresos: { $round: ["$totalIngresosUSD", 2] },
        },
      },
    ]);

    return res.json({
      success: true,
      data: topProducts,
    });
  } catch (error) {
    console.error("❌ Error en getTopProducts:", error);
    return res.status(500).json({
      success: false,
      error: "Error consultando top productos",
    });
  }
};

/**
 * CRM de Cliente por Teléfono (v2.0)
 * Consolida historial de compras, métricas de LTV, ticket promedio y fechas clave.
 */
const getCustomerCRM = async (req, res) => {
  try {
    const { telefono } = req.params;
    if (!telefono) {
      return res.status(400).json({
        success: false,
        error: "El parámetro teléfono es obligatorio",
      });
    }

    const rawPhone = String(telefono).trim();
    const cleanPhone = rawPhone.replace(/\D/g, "");

    const phoneConditions = [
      { whatsappId: rawPhone },
      { "cliente.telefono": rawPhone },
    ];

    if (cleanPhone) {
      phoneConditions.push({ whatsappId: cleanPhone });
      phoneConditions.push({ "cliente.telefono": cleanPhone });
      phoneConditions.push({ whatsappId: `${cleanPhone}@c.us` });

      // Soporte para normalización de números venezolanos (04XX <-> 584XX)
      if (cleanPhone.startsWith("58") && cleanPhone.length === 12) {
        const localPhone = "0" + cleanPhone.slice(2);
        phoneConditions.push({ whatsappId: localPhone });
        phoneConditions.push({ "cliente.telefono": localPhone });
      } else if (cleanPhone.startsWith("0") && cleanPhone.length === 11) {
        const intlPhone = "58" + cleanPhone.slice(1);
        phoneConditions.push({ whatsappId: intlPhone });
        phoneConditions.push({ "cliente.telefono": intlPhone });
        phoneConditions.push({ whatsappId: `${intlPhone}@c.us` });
      }
    }

    const filter = {
      $and: [
        { $or: phoneConditions },
        { estado: { $in: ["entregado", "confirmado", "verificado", "en_ruta"] } },
      ],
    };

    const pedidos = await Pedido.find(filter)
      .sort({ timestamp: 1 })
      .lean();

    const totalOrders = pedidos.length;
    let ltvUSD = 0;
    let ltvVES = 0;

    for (const p of pedidos) {
      let montoUSD = Number(p.pago?.montoUSD);
      if (isNaN(montoUSD) || montoUSD <= 0) {
        montoUSD = orderService.calcularTotalCarrito({
          items: p.items || [],
          envio: p.envio,
        });
      }
      ltvUSD += montoUSD;

      let montoVES = Number(p.pago?.montoVES);
      if (isNaN(montoVES) || montoVES < 0) {
        montoVES = 0;
      }
      ltvVES += montoVES;
    }

    const averageTicketUSD =
      totalOrders > 0 ? Number((ltvUSD / totalOrders).toFixed(2)) : 0;
    const firstOrderDate =
      totalOrders > 0
        ? pedidos[0].timestamp || pedidos[0].createdAt || null
        : null;
    const lastOrderDate =
      totalOrders > 0
        ? pedidos[pedidos.length - 1].timestamp ||
          pedidos[pedidos.length - 1].createdAt ||
          null
        : null;

    return res.json({
      success: true,
      data: {
        telefono: rawPhone,
        totalOrders,
        ltvUSD: Number(ltvUSD.toFixed(2)),
        ltvVES: Number(ltvVES.toFixed(2)),
        firstOrderDate,
        lastOrderDate,
        averageTicketUSD,
        pedidos,
      },
    });
  } catch (error) {
    console.error("❌ Error en getCustomerCRM:", error);
    return res.status(500).json({
      success: false,
      error: "Error consultando datos CRM del cliente",
    });
  }
};

const getClients = async (req, res) => {
  try {
    const clients = await Pedido.aggregate([
      {
        $match: {
          "cliente.telefono": { $exists: true, $ne: "" },
          "cliente.nombre": { $exists: true, $ne: "" }
        }
      },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$cliente.telefono",
          nombre: { $first: "$cliente.nombre" },
          cedula: { $first: "$cliente.cedula" },
          telefono: { $first: "$cliente.telefono" },
          direccionesRaw: { $push: "$ubicacion.direccion" }
        }
      },
      {
        $project: {
          _id: 0,
          nombre: 1,
          cedula: 1,
          telefono: 1,
          direcciones: {
            $filter: {
              input: "$direccionesRaw",
              as: "dir",
              cond: {
                $and: [
                  { $ne: ["$$dir", null] },
                  { $ne: ["$$dir", ""] },
                  { $ne: ["$$dir", "Retiro en tienda"] }
                ]
              }
            }
          }
        }
      },
      { $sort: { nombre: 1 } }
    ]);

    // Deduplicación heurística (ignora puntos, comas, acentos, mayúsculas y espacios extra)
    // para evitar consultar a la IA en un endpoint de lectura masiva y hacerlo instantáneo.
    const normalizeAddress = (str) => {
      if (!str) return "";
      return str.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
        .replace(/[.,;\-\_]/g, " ") // cambiar puntuación por espacio
        .replace(/\s+/g, " ") // unificar espacios
        .trim();
    };

    clients.forEach(c => {
      if (c.direcciones && c.direcciones.length > 0) {
        const unicas = [];
        const hashes = new Set();
        for (const dir of c.direcciones) {
          const norm = normalizeAddress(dir);
          if (norm.length > 0 && !hashes.has(norm)) {
            hashes.add(norm);
            unicas.push(dir); // Guarda la original, que por el sort es la más reciente
          }
        }
        c.direcciones = unicas;
      }
    });

    res.json({ success: true, data: clients });
  } catch (error) {
    console.error("❌ Error en getClients:", error);
    res.status(500).json({ success: false, error: "Error obteniendo clientes" });
  }
};

module.exports = {
  getClients,
  getPanel,
  getMe,
  getAuditLogs,
  getAuditSummary,
  getUsers,
  postUser,
  patchUser,
  getOrderAuditLog,
  getProducts,
  postProduct,
  updateProduct,
  deleteProduct,
  postProductImage,
  deleteProductImage,
  setPrimaryProductImage,
  getBCVRate,
  getCategorias,
  postCategoria,
  updateCategoria,
  deleteCategoria,
  getHistorial,
  getWhatsAppProfile,
  postWhatsAppProfile,
  postWhatsAppProfilePicture,
  getInstagramHistorial,
  postInstagramEnviar,
  postInstagramEnviarImagen,
  getInstagramBotToggle,
  postInstagramBotToggle,
  postInstagramModo,
  getChatContext,
  getPedidosHistorial,
  getEtiquetas,
  postEtiqueta,
  getMedia,
  getAudioMedia,
  confirmarPago,
  reactivarBot,
  setModoChat,
  resetBot,
  getModos,
  editOrder,
  updateOrderStatus,
  assignRepartidor,
  deleteOrder,
  updateOrderShipping,
  getOrder,
  getSalesSummary,
  getBackup,
  getHealth,
  uploadAndSendFile,
  postManualSale,
  getQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  reorderQuickReplies,
  getFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  postPushSubscribe,
  postPushUnsubscribe,
  postPushTest,
};

const extractOrderFromChat = async (req, res) => {
  try {
    const { telefono } = req.body;
    if (!telefono) return res.status(400).json({ success: false, error: "Teléfono requerido" });

    let mensajes = await Mensaje.find({ telefono }).sort({ timestamp: -1 }).limit(50);
    if (!mensajes || mensajes.length === 0) {
      return res.status(404).json({ success: false, error: "No hay historial para extraer" });
    }

    // 1. Encontrar el índice del primer mensaje (más reciente hacia el pasado) que represente un "reset" del flujo
    const resetIndex = mensajes.findIndex((m) => {
      const dir = (m.direccion || "").toLowerCase();
      const txt = (m.texto || "").toLowerCase().trim();

      // Reset de Cliente: comandos exactos o que incluyan cancelar, vaciar, salir, o comando 0
      if (dir === "cliente") {
        return ["0", "cancelar", "vaciar", "salir"].includes(txt);
      }

      // Reset de Bot: eventos de cierre, cancelación o confirmación de pedidos
      if (dir === "bot") {
        return (
          txt.includes("carrito vaciado y pedido cancelado") ||
          txt.includes("pedido cancelado") ||
          txt.includes("pago verificado") ||
          txt.includes("confirmado con éxito") ||
          txt.includes("confirmado con exito") ||
          txt.includes("pedido enviado") ||
          txt.includes("cancelado administrativamente")
        );
      }

      return false;
    });

    // 2. Si encontramos un reset en resetIndex, descartar el reset y todo el historial anterior
    if (resetIndex !== -1) {
      mensajes = mensajes.slice(0, resetIndex);
    }

    // 3. Si tras el recorte no quedan mensajes, no hay intención de compra post-reset
    if (mensajes.length === 0) {
      return res.json({ success: true, data: {} });
    }

    const conversation = mensajes
      .reverse()
      .map((m) => {
        let texto = m.texto || "";
        const esImg = m.tipo === "imagen" || m.tipo === "image";
        const urlImg = m.mediaUrl || (m.mediaId ? `/api/admin/media/${m.mediaId}` : null);
        if (esImg && urlImg) {
          texto += ` (Imagen enviada: ${urlImg})`;
        }
        if (m.tipo === "location" && m.mediaUrl) {
          texto += ` (Enlace de Google Maps: ${m.mediaUrl})`;
        }
        return `[${m.direccion === "cliente" ? "Cliente" : "Bot"}]: ${texto.trim()}`;
      })
      .join("\n");

    const catalogo = await Producto.find({ activo: true }).select('name');
    const nombresCatalogo = catalogo.map(p => p.name).join(", ");

    const lastPedido = await Pedido.findOne({
      whatsappId: telefono,
      "cliente.nombre": { $exists: true, $ne: "" },
    }).sort({ timestamp: -1 });

    let knownDataMsg = "";
    if (lastPedido) {
      const nombre = (lastPedido.cliente?.nombre || "").trim();
      const cedula = (lastPedido.cliente?.cedula || "").trim();

      const datosCliente = [];
      if (nombre && nombre !== "Sin nombre") datosCliente.push(`- Nombre: ${nombre}`);
      if (cedula) datosCliente.push(`- Cédula: ${cedula}`);

      if (datosCliente.length > 0) {
        knownDataMsg = `\n\nDATOS DEL CLIENTE FRECUENTE (Úsalos por defecto en el JSON si el cliente no los vuelve a mencionar en esta intención de compra):\n${datosCliente.join("\n")}`;
      }
    }

    const prompt = `Analiza esta conversación de WhatsApp y extrae los datos de un posible pedido.
IMPORTANTE: Concéntrate EXCLUSIVAMENTE en la intención de compra más reciente (los últimos mensajes de la conversación). Ignora pedidos antiguos o conversaciones pasadas que ya hayan concluido.
Devuelve ÚNICAMENTE un JSON válido (sin formato markdown ni bloques de código extra) con la siguiente estructura estricta:
{
  "cliente": {
    "nombre": "Nombre si lo dio, sino ''",
    "cedula": "Cedula si la dio, sino ''",
    "direccion": "La dirección de envío. Si el cliente dio texto Y un 'Enlace de Google Maps', formatea este campo combinándolos exactamente así: 'Direccion escrita \n   Mapa: https://maps...'." 
  },
  "notas": "Notas adicionales o instrucciones si las dio, sino ''",
  "comprobanteUrl": "URL de la imagen enviada si parece ser un comprobante de pago, sino null",
  "items": [
    { "producto": "Nombre EXACTO del producto", "cantidad": numero }
  ]
}

Catálogo disponible (Usa EXACTAMENTE estos nombres para mapear los productos, no inventes nombres):
${nombresCatalogo}${knownDataMsg}

Conversación:
${conversation}`;

    const axios = require("axios");
    const aiResponse = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const rawJson = aiResponse.data.choices[0].message.content;
    let jsonStr = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
    const orderData = JSON.parse(jsonStr);

    return res.json({ success: true, data: orderData });
  } catch (error) {
    console.error("❌ Error en extractOrderFromChat:", error?.response?.data || error);
    return res.status(500).json({ success: false, error: "Error analizando el chat con IA" });
  }
};

module.exports.extractOrderFromChat = extractOrderFromChat;

module.exports.getTopProducts = getTopProducts;
module.exports.getCustomerCRM = getCustomerCRM;
