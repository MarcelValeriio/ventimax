const configManager = require("../services/configManager");

/**
 * Expone al frontend SOLO los datos de marca necesarios para pintar el panel y el login.
 * Este endpoint es público (la página de login lo usa antes de autenticarse), así que
 * no debe devolver datos de pago, catálogo, plantillas, prompts ni configuración de alertas.
 */
const getConfig = (req, res) => {
  try {
    const settings = configManager.getFullConfig().settings || {};
    const theme = settings.theme || {};
    res.json({
      brandName: settings.brandName || "",
      botIdentity: settings.botIdentity || "",
      settings: {
        brandName: settings.brandName || "",
        botIdentity: settings.botIdentity || "",
        theme: {
          primaryColor: theme.primaryColor,
          secondaryColor: theme.secondaryColor,
          logoUrl: theme.logoUrl,
        },
      },
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
    });
  } catch (error) {
    res.status(500).json({ error: "Error loading config" });
  }
};

/**
 * Configuración de alertas Admin (Watchdog). Solo para usuarios con config:manage.
 */
const getWatchdogConfig = (req, res) => {
  try {
    const watchdog = configManager.get("settings.watchdog") || {};
    res.json({
      success: true,
      watchdog: {
        disabledDays: watchdog.disabledDays || [],
        startHour: watchdog.startHour,
        endHour: watchdog.endHour,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Error loading watchdog config" });
  }
};

const updateWatchdogConfig = async (req, res) => {
  try {
    const { watchdog } = req.body;
    if (!watchdog || typeof watchdog !== "object") {
      return res.status(400).json({ error: "Estructura inválida para watchdog config" });
    }
    
    // Persistir en MongoDB para sobrevivir reinicios de Render (File System Efímero)
    const Setting = require("../models/Setting");
    await Setting.findOneAndUpdate(
      { key: "watchdog_config" },
      { value: watchdog },
      { upsert: true, returnDocument: "after" }
    );

    // Actualizar en memoria
    configManager.updateWatchdogSettings(watchdog);
    res.json({ success: true, message: "Ajustes de Watchdog actualizados" });
  } catch (error) {
    console.error("Error updating watchdog config:", error);
    res.status(500).json({ error: "Error updating watchdog config" });
  }
};

module.exports = { getConfig, getWatchdogConfig, updateWatchdogConfig };
