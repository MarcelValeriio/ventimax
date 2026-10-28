const path = require("path");
const fs = require("fs");

class ConfigManager {
  brand: string;
  config: Record<string, any>;

  constructor() {
    this.brand = process.env.BRAND_NAME || "default";
    this.config = {};
    this.loadAll();
    this.validateSchema();
  }

  loadAll() {
    const brandDir = path.join(__dirname, `../config/brand/${this.brand}`);
    
    // Carga archivos JSON
    const files = ["settings.json", "payments.json", "products.json"];
    files.forEach(file => {
      const filePath = path.join(brandDir, file);
      if (fs.existsSync(filePath)) {
        try {
          const key = file.replace(".json", "");
          this.config[key] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch (e) {
          throw new Error(`[ConfigManager] Error parseando ${file}: ${e.message}`);
        }
      } else if (file === "settings.json" || file === "products.json") {
        throw new Error(`[ConfigManager] Archivo crítico faltante: ${file}`);
      }
    });

    // Carga Prompt de IA
    const promptPath = path.join(brandDir, "ai_prompt.txt");
    if (fs.existsSync(promptPath)) {
      this.config.ai_prompt = fs.readFileSync(promptPath, "utf-8");
    }

    console.log(`[ConfigManager] Configuración cargada para: ${this.brand}`);
  }

  validateSchema() {
    const requiredKeys = [
      { key: "settings.brandName", label: "Nombre de Marca" },
      { key: "settings.theme.primaryColor", label: "Color Primario" },
      { key: "settings.theme.secondaryColor", label: "Color Secundario" },
      { key: "products", label: "Catálogo de Productos" }
    ];

    const missing = [];
    requiredKeys.forEach(({ key, label }) => {
      if (!this.get(key)) missing.push(`${label} (${key})`);
    });

    if (missing.length > 0) {
      console.error("\n❌ ERROR DE CONFIGURACIÓN DETECTADO:");
      missing.forEach(m => console.error(`   - Faltante: ${m}`));
      console.error("\nEl bot no puede iniciar con configuraciones corruptas.\n");
      throw new Error("Configuración Inválida");
    }
    
    // Validación de tipos básica para productos
    if (!Array.isArray(this.config.products)) {
      throw new Error("[ConfigManager] El archivo products.json debe contener un Array.");
    }

    // Fallbacks para claves opcionales (retrocompatibilidad multimarca)
    if (!this.config.settings) {
      this.config.settings = {};
    }

    if (this.config.settings.businessDescription === undefined) {
      this.config.settings.businessDescription = "";
    }

    if (this.config.settings.productBrand === undefined) {
      this.config.settings.productBrand = this.config.settings.brandName || "";
    }

    if (!this.config.settings.contact || typeof this.config.settings.contact !== "object") {
      this.config.settings.contact = { email: "", website: "", instagram: "" };
    } else {
      this.config.settings.contact.email = this.config.settings.contact.email || "";
      this.config.settings.contact.website = this.config.settings.contact.website || "";
      this.config.settings.contact.instagram = this.config.settings.contact.instagram || "";
    }

    if (!this.config.settings.sales || typeof this.config.settings.sales !== "object") {
      this.config.settings.sales = { unitSingular: "unidad", unitPlural: "unidades" };
    } else {
      this.config.settings.sales.unitSingular = this.config.settings.sales.unitSingular || "unidad";
      this.config.settings.sales.unitPlural = this.config.settings.sales.unitPlural || "unidades";
    }

    if (this.config.settings.theme && typeof this.config.settings.theme === "object") {
      if (this.config.settings.theme.productBrandLogoUrl === undefined) {
        this.config.settings.theme.productBrandLogoUrl = this.config.settings.theme.logoUrl || "";
      }
    }

    if (!this.config.settings.horarioAtencion || typeof this.config.settings.horarioAtencion !== "object") {
      this.config.settings.horarioAtencion = {
        zonaHoraria: "America/Caracas",
        dias: [1, 2, 3, 4, 5],
        apertura: "09:00",
        cierre: "17:00",
      };
    }

    if (!this.config.settings.flujoNoLaborable || typeof this.config.settings.flujoNoLaborable !== "object") {
      this.config.settings.flujoNoLaborable = {
        activo: true,
        entregaDiferida: {
          activo: true,
          texto: "Entrega en día hábil",
        },
        retiroEnPunto: {
          activo: false,
          nombre: "",
          direccion: "",
          horario: "",
        },
      };
    }

    if (!this.config.settings.catalogo || typeof this.config.settings.catalogo !== "object") {
      this.config.settings.catalogo = {
        prefijoPedido: this.brand === "ventimax" ? "VM" : "MP",
        vigenciaHoras: 72,
        activo: true,
      };
    } else {
      if (!this.config.settings.catalogo.prefijoPedido) {
        this.config.settings.catalogo.prefijoPedido = this.brand === "ventimax" ? "VM" : "MP";
      }
      if (!this.config.settings.catalogo.vigenciaHoras) {
        this.config.settings.catalogo.vigenciaHoras = 72;
      }
      if (this.config.settings.catalogo.activo === undefined) {
        this.config.settings.catalogo.activo = true;
      }
    }

    console.log("✅ Validación de esquema exitosa.");
  }

  get(key) {
    return key.split(".").reduce((o, i) => (o ? o[i] : undefined), this.config);
  }

  format(key, variables = {}) {
    let template = this.get(key);
    if (!template) return "";
    
    const vars = {
      brandName: this.get("settings.brandName"),
      botIdentity: this.get("settings.botIdentity"),
      ...variables
    };

    return template.replace(/{{(\w+)}}/g, (match, p1) => {
      return vars[p1] !== undefined ? vars[p1] : match;
    });
  }

  getFullConfig() {
    return this.config;
  }

  updateWatchdogSettings(watchdogConfig) {
    const brandDir = path.join(__dirname, `../config/brand/${this.brand}`);
    const filePath = path.join(brandDir, "settings.json");
    
    if (!this.config.settings) this.config.settings = {};
    
    // Evitar loop infinito en nodemon: no sobreescribir si no hay cambios reales
    const currentWatchdogStr = JSON.stringify(this.config.settings.watchdog || {});
    const newWatchdogStr = JSON.stringify(watchdogConfig);
    
    if (currentWatchdogStr === newWatchdogStr) {
      return; // Ya está actualizado en disco/memoria, omitir escritura
    }

    this.config.settings.watchdog = watchdogConfig;
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(this.config.settings, null, 2), "utf-8");
      console.log(`[ConfigManager] Ajustes de Watchdog actualizados.`);
    } catch (e) {
      throw new Error(`[ConfigManager] Error guardando settings.json: ${e.message}`);
    }
  }
}

module.exports = new ConfigManager();
