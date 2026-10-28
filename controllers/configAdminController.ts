import { Request, Response } from "express";
const axios = require("axios");
const { configStore, EDITABLE_KEYS, SECRET_KEYS, getConfig, setConfig } = require("../services/configStore");
const { registrarAuditoria } = require("../services/auditService");
const { validarValorConfig, validarHorarioAtencion, validarFlujoNoLaborable, validarDatosNegocio, validarConfigCatalogo } = require("../services/configValidators");
const { getHorario, setHorario, formatearHorarioAtencion } = require("../services/horarioService");
const { getFlujoNoLaborable, setFlujoNoLaborable } = require("../services/flujoNoLaborableService");
const { getDatosNegocio, setDatosNegocio } = require("../services/datosNegocioService");
const { getConfigCatalogo, setConfigCatalogo } = require("../services/catalogoConfigService");
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
export const getCatalogoAbuso = async (req: Request, res: Response) => {
  try {
    const reporte = await obtenerReporteAbuso(14);
    res.json({ success: true, reporte });
  } catch (error: any) {
    console.error("❌ Error obteniendo reporte de abuso del catálogo:", error);
    res.status(500).json({ success: false, error: "Error al obtener el reporte de abuso" });
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
};
