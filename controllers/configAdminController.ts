import { Request, Response } from "express";
const axios = require("axios");
const { configStore, EDITABLE_KEYS, SECRET_KEYS, getConfig, setConfig } = require("../services/configStore");
const { registrarAuditoria } = require("../services/auditService");
const { validarValorConfig, validarHorarioAtencion, validarFlujoNoLaborable, validarDatosNegocio, validarConfigCatalogo, validarBannerTienda, validarBannerLateral } = require("../services/configValidators");
const { getHorario, setHorario, formatearHorarioAtencion } = require("../services/horarioService");
const { getFlujoNoLaborable, setFlujoNoLaborable } = require("../services/flujoNoLaborableService");
const { getDatosNegocio, setDatosNegocio } = require("../services/datosNegocioService");
const { getConfigCatalogo, setConfigCatalogo } = require("../services/catalogoConfigService");
const { getBannerTienda, setBannerTienda } = require("../services/bannerTiendaService");
const { getBannerLateral, setBannerLateral } = require("../services/bannerLateralService");
const cloudinaryService = require("../services/cloudinaryService");
import { esOrdenValido } from "../utils/ordenImagenes";
const { obtenerReporteAbuso } = require("../services/catalogoAbusoService");

/**
 * Obtiene la configuración completa para el panel administrativo.
 * Retorna las variables editables con sus valores (o vacíos) y el estado booleano de los secretos.
 */
export const getConfigAdmin = async (req: Request, res: Response) => {
  try {
    const data = await configStore.getAllConfig();
    res.json({
      success: true,
      ...data,
    });
  } catch (error: any) {
    console.error("❌ Error obteniendo configuración administrativa:", error);
    res.status(500).json({ error: "Error al obtener la configuración" });
  }
};

/**
 * Actualiza variables de configuración editables (Categoría A).
 * Bloquea estrictamente cualquier intento de alterar secretos o variables no permitidas.
 */
export const updateConfigAdmin = async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        error: "Payload inválido. Debe ser un objeto con pares clave-valor."
      });
    }

    // 1. Detección y bloqueo estricto de secretos
    for (const key of Object.keys(updates)) {
      if ((SECRET_KEYS as readonly string[]).includes(key)) {
        return res.status(400).json({
          success: false,
          error: `Seguridad: La variable '${key}' es un secreto y no puede ser modificada desde el panel.`
        });
      }
    }

    // 2. Validar TODO antes de escribir: si algo falla, no se guarda nada
    const errores: Record<string, string> = {};
    const validos: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!(EDITABLE_KEYS as readonly string[]).includes(key)) {
        errores[key] = `${key} no es una variable editable desde el panel.`;
        continue;
      }
      const resultado = validarValorConfig(key, value);
      if (resultado.ok) {
        validos[key] = resultado.value;
      } else {
        errores[key] = resultado.error;
      }
    }

    if (Object.keys(errores).length > 0) {
      return res.status(400).json({
        success: false,
        error: Object.values(errores).join(" "),
        errors: errores,
      });
    }

    // 3. Persistir las claves validadas
    const previousConfig: Record<string, any> = {};
    const newConfig: Record<string, any> = {};
    for (const [key, value] of Object.entries(validos)) {
      previousConfig[key] = getConfig(key);
      await setConfig(key, value);
      newConfig[key] = getConfig(key);
    }

    // 4. Registrar auditoría (sin secretos)
    await registrarAuditoria(req, {
      tipoRecurso: "config",
      accion: "update",
      anterior: previousConfig,
      nuevo: newConfig,
      detalles: `Actualizadas ${Object.keys(newConfig).length} variables de configuración.`
    });

    res.json({
      success: true,
      message: "Configuración actualizada correctamente",
      config: newConfig
    });
  } catch (error: any) {
    console.error("❌ Error actualizando configuración administrativa:", error);
    res.status(500).json({
      success: false,
      error: "Error al actualizar la configuración"
    });
  }
};

/**
 * Prueba la conexión interna hacia Meta Graph API para el Phone Number ID de WhatsApp.
 * Utiliza el token de entorno del backend sin exponerlo hacia el frontend.
 */
export const testWhatsAppConnection = async (req: Request, res: Response) => {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = getConfig("WHATSAPP_PHONE_NUMBER_ID") || process.env.PHONE_NUMBER_ID;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "WHATSAPP_TOKEN no está configurado en las variables de entorno del servidor (Render)."
      });
    }

    if (!phoneId) {
      return res.status(400).json({
        success: false,
        error: "WHATSAPP_PHONE_NUMBER_ID no está configurado."
      });
    }

    const response = await axios.get(`https://graph.facebook.com/v20.0/${phoneId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      params: {
        fields: "verified_name,display_phone_number,quality_rating,code_verification_status"
      },
      timeout: 10000
    });

    res.json({
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.error("❌ Error probando conexión de WhatsApp:", error?.response?.data || error?.message);
    const metaError = error?.response?.data?.error?.message || error?.message || "Error de conexión con Meta";
    res.status(400).json({
      success: false,
      error: metaError
    });
  }
};

/**
 * Obtiene la configuración de horario comercial de atención.
 */
export const getHorarioConfig = async (req: Request, res: Response) => {
  try {
    const horario = await getHorario();
    const texto = formatearHorarioAtencion(horario);
    res.json({
      success: true,
      horario,
      texto,
    });
  } catch (error: any) {
    console.error("❌ Error obteniendo horario de atención:", error);
    res.status(500).json({ success: false, error: "Error al obtener horario de atención" });
  }
};

/**
 * Actualiza la configuración de horario comercial de atención.
 * Valida días 0-6 sin repetir, formato HH:mm, apertura < cierre.
 */
export const updateHorarioConfig = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.horario !== undefined ? req.body.horario : req.body;
    const validacion = validarHorarioAtencion(payload);
    if (!validacion.ok) {
      return res.status(400).json({
        success: false,
        error: validacion.error,
      });
    }

    const previousHorario = await getHorario();
    const saved = await setHorario(validacion.value);
    const texto = formatearHorarioAtencion(saved);

    await registrarAuditoria(req, {
      tipoRecurso: "config",
      accion: "update",
      anterior: { horarioAtencion: previousHorario },
      nuevo: { horarioAtencion: saved },
      detalles: `Horario comercial actualizado: ${texto}`,
    });

    res.json({
      success: true,
      message: "Horario de atención actualizado correctamente",
      horario: saved,
      texto,
    });
  } catch (error: any) {
    console.error("❌ Error actualizando horario de atención:", error);
    res.status(500).json({
      success: false,
      error: "Error al actualizar horario de atención",
    });
  }
};

/**
 * Obtiene la configuración del flujo en días no laborables.
 */
export const getFlujoNoLaborableConfig = async (req: Request, res: Response) => {
  try {
    const flujo = await getFlujoNoLaborable();
    res.json({
      success: true,
      flujo,
    });
  } catch (error: any) {
    console.error("❌ Error obteniendo flujo no laborable:", error);
    res.status(500).json({ success: false, error: "Error al obtener configuración de flujo no laborable" });
  }
};

/**
 * Actualiza la configuración de flujo en días no laborables (entrega diferida y retiro en punto).
 */
export const updateFlujoNoLaborableConfig = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.flujo !== undefined ? req.body.flujo : req.body;
    const validacion = validarFlujoNoLaborable(payload);
    if (!validacion.ok) {
      return res.status(400).json({
        success: false,
        error: validacion.error,
      });
    }

    const previousFlujo = await getFlujoNoLaborable();
    const saved = await setFlujoNoLaborable(validacion.value);

    await registrarAuditoria(req, {
      tipoRecurso: "config",
      accion: "update",
      recursoId: "flujoNoLaborable",
      detalles: {
        previo: previousFlujo,
        nuevo: saved,
      },
    });

    res.json({
      success: true,
      message: "Configuración de días no laborables actualizada correctamente",
      flujo: saved,
    });
  } catch (error: any) {
    console.error("❌ Error actualizando flujo no laborable:", error);
    res.status(500).json({
      success: false,
      error: "Error al actualizar configuración de flujo no laborable",
    });
  }
};

/**
 * Obtiene los datos legales y de contacto del negocio (política de privacidad, enlaces a WhatsApp).
 */
export const getDatosNegocioConfig = async (req: Request, res: Response) => {
  try {
    const datos = await getDatosNegocio();
    res.json({ success: true, datos });
  } catch (error: any) {
    console.error("❌ Error obteniendo datos del negocio:", error);
    res.status(500).json({ success: false, error: "Error al obtener los datos del negocio" });
  }
};

/**
 * Actualiza los datos legales y de contacto del negocio. La fecha de actualización la pone el servidor.
 */
export const updateDatosNegocioConfig = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.datos !== undefined ? req.body.datos : req.body;
    const validacion = validarDatosNegocio(payload);
    if (!validacion.ok) {
      return res.status(400).json({ success: false, error: validacion.error });
    }

    const anterior = await getDatosNegocio();
    const guardado = await setDatosNegocio(validacion.value);

    await registrarAuditoria(req, {
      tipoRecurso: "config",
      accion: "update",
      recursoId: "datosNegocio",
      detalles: { previo: anterior, nuevo: guardado },
    });

    res.json({ success: true, message: "Datos del negocio guardados correctamente", datos: guardado });
  } catch (error: any) {
    console.error("❌ Error actualizando datos del negocio:", error);
    res.status(500).json({ success: false, error: "Error al guardar los datos del negocio" });
  }
};

/**
 * Obtiene la configuración del catálogo web (F2-4).
 */
export const getCatalogoConfig = async (req: Request, res: Response) => {
  try {
    const catalogo = await getConfigCatalogo();
    res.json({ success: true, catalogo });
  } catch (error: any) {
    console.error("❌ Error obteniendo configuración del catálogo:", error);
    res.status(500).json({ success: false, error: "Error al obtener la configuración del catálogo" });
  }
};

/**
 * Actualiza la configuración del catálogo web (activo, prefijo, prefill de WhatsApp).
 */
export const updateCatalogoConfig = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.catalogo !== undefined ? req.body.catalogo : req.body;
    const validacion = validarConfigCatalogo(payload);
    if (!validacion.ok) {
      return res.status(400).json({ success: false, error: validacion.error });
    }

    const anterior = await getConfigCatalogo();
    const guardado = await setConfigCatalogo(validacion.value);

    await registrarAuditoria(req, {
      tipoRecurso: "config",
      accion: "update",
      recursoId: "catalogo",
      detalles: { previo: anterior, nuevo: guardado },
    });

    res.json({ success: true, message: "Configuración del catálogo web guardada correctamente", catalogo: guardado });
  } catch (error: any) {
    console.error("❌ Error actualizando configuración del catálogo:", error);
    res.status(500).json({ success: false, error: "Error al guardar la configuración del catálogo" });
  }
};

/**
 * Obtiene el reporte de eventos anti-abuso del catálogo web de los últimos 14 días.
 */
/**
 * Obtiene el cintillo promocional de la tienda (F2g).
 */
export const getBannerTiendaConfig = async (req: Request, res: Response) => {
  try {
    const banner = await getBannerTienda();
    res.json({ success: true, banner });
  } catch (error: any) {
    console.error("❌ Error obteniendo el cintillo de la tienda:", error);
    res.status(500).json({ success: false, error: "Error al obtener el cintillo de la tienda" });
  }
};

/**
 * Actualiza el cintillo promocional de la tienda (F2g). Con auditoría.
 */
export const updateBannerTiendaConfig = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.banner !== undefined ? req.body.banner : req.body;
    const validacion = validarBannerTienda(payload);
    if (!validacion.ok) {
      return res.status(400).json({ success: false, error: validacion.error });
    }

    const anterior = await getBannerTienda();
    const guardado = await setBannerTienda(validacion.value);

    await registrarAuditoria(req, {
      tipoRecurso: "config",
      accion: "update",
      recursoId: "bannerTienda",
      detalles: { previo: anterior, nuevo: guardado },
    });

    res.json({ success: true, message: "Cintillo de la tienda guardado correctamente", banner: guardado });
  } catch (error: any) {
    console.error("❌ Error actualizando el cintillo de la tienda:", error);
    res.status(500).json({ success: false, error: "Error al guardar el cintillo de la tienda" });
  }
};

export const getCatalogoAbuso = async (req: Request, res: Response) => {
  try {
    const reporte = await obtenerReporteAbuso(14);
    res.json({ success: true, reporte });
  } catch (error: any) {
    console.error("❌ Error obteniendo reporte de abuso del catálogo:", error);
    res.status(500).json({ success: false, error: "Error al obtener el reporte de abuso" });
  }
};

// ==========================================
// Banner lateral de la tienda (imágenes verticales con enlace opcional a producto)
// ==========================================

const MAX_IMAGENES_BANNER_LATERAL = 5;

export const getBannerLateralConfig = async (req: Request, res: Response) => {
  try {
    const banner = await getBannerLateral();
    res.json({ success: true, banner });
  } catch (error: any) {
    console.error("❌ Error obteniendo el banner lateral:", error);
    res.status(500).json({ success: false, error: "Error al obtener el banner lateral" });
  }
};

/** PUT: activo y enlace (productoId o null) de cada imagen, por posición. */
export const updateBannerLateralConfig = async (req: Request, res: Response) => {
  try {
    const { activo, enlaces } = (req.body || {}) as { activo?: unknown; enlaces?: unknown };
    const anterior = await getBannerLateral();

    if (!Array.isArray(enlaces) || enlaces.length !== anterior.imagenes.length) {
      return res.status(400).json({
        success: false,
        error: "La lista de enlaces debe tener una posición por cada imagen del banner.",
      });
    }

    const propuesto = {
      activo,
      imagenes: anterior.imagenes.map((img, i) => ({
        url: img.url,
        publicId: img.publicId,
        productoId: enlaces[i] === undefined ? null : enlaces[i],
      })),
    };
    const validacion = validarBannerLateral(propuesto);
    if (!validacion.ok) {
      return res.status(400).json({ success: false, error: validacion.error });
    }

    const guardado = await setBannerLateral(validacion.value);

    await registrarAuditoria(req, {
      tipoRecurso: "config",
      accion: "update",
      recursoId: "bannerLateral",
      detalles: { previo: anterior, nuevo: guardado },
    });

    res.json({ success: true, message: "Banner lateral guardado correctamente", banner: guardado });
  } catch (error: any) {
    console.error("❌ Error actualizando el banner lateral:", error);
    res.status(500).json({ success: false, error: "Error al guardar el banner lateral" });
  }
};

/** POST multipart (campo "imagen") con productoId opcional en el cuerpo. */
export const postBannerLateralImagen = async (req: any, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: "No se proporcionó ningún archivo de imagen" });
    }

    const productoIdRaw = req.body?.productoId;
    const productoId = typeof productoIdRaw === "string" && productoIdRaw.trim() !== "" ? productoIdRaw.trim() : null;

    const actual = await getBannerLateral();
    if (actual.imagenes.length >= MAX_IMAGENES_BANNER_LATERAL) {
      return res.status(400).json({
        success: false,
        error: `El banner lateral ya tiene el límite máximo de ${MAX_IMAGENES_BANNER_LATERAL} imágenes`,
      });
    }

    let subida;
    try {
      subida = await cloudinaryService.subirImagenBanner(req.file.buffer);
    } catch (cloudErr: any) {
      console.error("❌ Error subiendo imagen del banner lateral:", cloudErr?.message || cloudErr);
      if (cloudErr?.message === "Cloudinary no está configurado") {
        return res.status(400).json({ success: false, error: "Cloudinary no está configurado" });
      }
      return res.status(500).json({ success: false, error: "Error al subir la imagen a Cloudinary" });
    }

    const propuesto = {
      activo: actual.activo,
      imagenes: [...actual.imagenes, { url: subida.url, publicId: subida.publicId, productoId }],
    };
    const validacion = validarBannerLateral(propuesto);
    if (!validacion.ok) {
      // Imagen subida pero no válida para guardar: se borra para no dejar basura en Cloudinary
      await cloudinaryService.borrarImagen(subida.publicId).catch(() => undefined);
      return res.status(400).json({ success: false, error: validacion.error });
    }

    const guardado = await setBannerLateral(validacion.value);

    await registrarAuditoria(req, {
      tipoRecurso: "config",
      accion: "subir_imagen_banner_lateral",
      recursoId: "bannerLateral",
      detalles: `Imagen subida al banner lateral. Total: ${guardado.imagenes.length}/${MAX_IMAGENES_BANNER_LATERAL}`,
      nuevo: guardado,
    });

    res.status(201).json({ success: true, message: "Imagen subida correctamente", banner: guardado });
  } catch (error: any) {
    console.error("❌ Error subiendo imagen del banner lateral:", error);
    res.status(500).json({ success: false, error: "Error al subir la imagen del banner lateral" });
  }
};

/** DELETE: quita la imagen de la posición indicada y la borra de Cloudinary si es de este banner. */
export const deleteBannerLateralImagen = async (req: Request, res: Response) => {
  try {
    const indice = Number(req.params.indice);
    const actual = await getBannerLateral();
    if (!Number.isInteger(indice) || indice < 0 || indice >= actual.imagenes.length) {
      return res.status(404).json({ success: false, error: "Imagen no encontrada en el banner lateral" });
    }

    const quitada = actual.imagenes[indice];
    const restantes = actual.imagenes.filter((_, i) => i !== indice);
    const guardado = await setBannerLateral({ activo: actual.activo, imagenes: restantes });

    if (cloudinaryService.esPublicIdDeBanner(quitada.publicId)) {
      try {
        await cloudinaryService.borrarImagen(quitada.publicId);
      } catch (cloudErr: any) {
        console.warn("⚠️ [BannerLateral] No se pudo borrar la imagen en Cloudinary:", cloudErr?.message || cloudErr);
      }
    } else if (quitada.publicId) {
      console.warn("⚠️ [BannerLateral] La imagen quitada no es de la carpeta del banner; no se borra en Cloudinary.");
    }

    await registrarAuditoria(req, {
      tipoRecurso: "config",
      accion: "eliminar_imagen_banner_lateral",
      recursoId: "bannerLateral",
      detalles: `Imagen quitada del banner lateral (posición ${indice + 1}). Total: ${guardado.imagenes.length}/${MAX_IMAGENES_BANNER_LATERAL}`,
      anterior: quitada,
    });

    res.json({ success: true, message: "Imagen eliminada del banner lateral", banner: guardado });
  } catch (error: any) {
    console.error("❌ Error eliminando imagen del banner lateral:", error);
    res.status(500).json({ success: false, error: "Error al eliminar la imagen del banner lateral" });
  }
};

/** PUT body { orden: number[] }: orden[i] = índice actual de la imagen que pasa a la posición i. */
export const reorderBannerLateralImagenes = async (req: Request, res: Response) => {
  try {
    const { orden } = (req.body || {}) as { orden?: unknown };
    const actual = await getBannerLateral();
    if (!esOrdenValido(orden, actual.imagenes.length)) {
      return res.status(400).json({ success: false, error: "Orden invalido" });
    }

    const cambio = orden.some((valor, i) => valor !== i);
    let guardado = actual;
    if (cambio) {
      const propuesto = {
        activo: actual.activo,
        imagenes: orden.map((i) => actual.imagenes[i]),
      };
      const validacion = validarBannerLateral(propuesto);
      if (!validacion.ok) {
        return res.status(400).json({ success: false, error: validacion.error });
      }
      guardado = await setBannerLateral(validacion.value);

      await registrarAuditoria(req, {
        tipoRecurso: "config",
        accion: "reordenar_imagenes_banner_lateral",
        recursoId: "bannerLateral",
        detalles: `Orden de imágenes del banner lateral cambiado (${guardado.imagenes.length} imágenes)`,
        anterior: actual.imagenes,
        nuevo: guardado.imagenes,
      });
    }

    res.json({ success: true, message: "Orden del banner lateral guardado", banner: guardado });
  } catch (error: any) {
    console.error("❌ Error reordenando el banner lateral:", error);
    res.status(500).json({ success: false, error: "Error al reordenar las imágenes del banner lateral" });
  }
};

module.exports = {
  getConfigAdmin,
  updateConfigAdmin,
  testWhatsAppConnection,
  getHorarioConfig,
  updateHorarioConfig,
  getDatosNegocioConfig,
  updateDatosNegocioConfig,
  getFlujoNoLaborableConfig,
  updateFlujoNoLaborableConfig,
  getCatalogoConfig,
  updateCatalogoConfig,
  getCatalogoAbuso,
  getBannerTiendaConfig,
  updateBannerTiendaConfig,
  getBannerLateralConfig,
  updateBannerLateralConfig,
  postBannerLateralImagen,
  deleteBannerLateralImagen,
  reorderBannerLateralImagenes,
};
