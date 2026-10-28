require("dotenv").config();
process.env.TZ = "America/Caracas";
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");

// Sobreescribir console.log y console.error para inyectar hora de Caracas en los logs de Render
const originalLog = console.log;
const originalError = console.error;
console.log = function (...args) {
  const time = new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" });
  originalLog.apply(console, [`[${time}]`, ...args]);
};
console.error = function (...args) {
  const time = new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" });
  originalError.apply(console, [`[${time}]`, ...args]);
};

// Inicializar captura temprana de errores globales no controlados (Watchdog Error Catcher)
const watchdogService = require("./services/watchdogService");
watchdogService.initErrorCatcher();

// 1. Inicialización de App y Servidores
const { CSP_DIRECTIVES } = require("./middlewares/csp");
const app = express();
app.use(
  helmet({
    contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
  })
);
app.set("trust proxy", 1); // Confiar en el proxy de Render para cookies Secure
const server = http.createServer(app);
// Sin opción `cors`: el panel se sirve desde el mismo origen, así que no se conceden orígenes cruzados.
const io = socketIo(server, {
  transports: ["polling", "websocket"],
});

app.set("socketio", io);

// ========= CONFIGURACIÓN DE RUTAS EXPLÍCITAS (Fix "Unexpected token <") =========
// Usamos process.cwd() para garantizar rutas absolutas desde la raíz del proyecto en Render
const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const SRC_DIR = path.join(PUBLIC_DIR, "src");

// 1b. POLÍTICA DE PRIVACIDAD de la marca activa (URL que se registra en Meta).
// Las rutas viejas por canal y .html apuntan a la misma página.
const { generarPaginaPrivacidad } = require("./services/paginaPrivacidad");
app.get(["/privacidad", "/privacidad.html", "/privacidad-instagram", "/privacidad-instagram.html"], (req, res) => {
  res.type("html").send(generarPaginaPrivacidad());
});

// 2. MAPEOS ESTÁTICOS
// Redirigir accesos directos a archivos HTML para que /panel y /login gobiernen las entradas
app.get("/index.html", (req, res) => res.redirect("/panel"));
app.get("/login.html", (req, res) => res.redirect("/login"));

// Obligamos a Express a servir la carpeta de scripts de forma independiente
app.use("/src", express.static(SRC_DIR));
app.use("/assets", express.static(path.join(PUBLIC_DIR, "assets")));
app.use(express.static(PUBLIC_DIR, { index: false }));

// 2b. API PÚBLICA (F2-1: Catálogo y Carrito Web)
// Se monta ANTES del express.json global para tener su propio parser con límite de 5 KB y aislamiento total
const publicRoutes = require("./routes/publicRoutes");
app.use("/api/public", publicRoutes);

// 3. MIDDLEWARES BÁSICOS
// Capturar raw body ANTES del parseo JSON (necesario para validación HMAC)
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Manejo manual del favicon para evitar 404s ruidosos
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Health check público para monitoreo externo: solo el estado y el código HTTP.
// No llama a Meta ni expone detalles; el diagnóstico completo está en /api/admin/health (con sesión).
app.get("/health", (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({ status: mongoOk ? "ok" : "down" });
});

// Middlewares locales
const {
  isAuthenticated,
  authorize,
  verificarSesion,
  obtenerJwtSecret,
  DURACION_SESION_MS,
  DURACION_SESION_JWT,
} = require("./middlewares/auth");
const { webhookLimiter, loginLimiter, apiLimiter } = require("./middlewares/rateLimiter");
const { validate, loginSchema } = require("./validators");

// Controladores
const { getConfig, getWatchdogConfig, updateWatchdogConfig } = require("./controllers/configController");
const adminController = require("./controllers/adminController");

// Rutas (Modulares)
const webhookRoutes = require("./routes/webhookRoutes");
const instagramWebhookRoutes = require("./routes/instagramWebhookRoutes");
const messengerWebhookRoutes = require("./routes/messengerWebhookRoutes");
const adminRoutes = require("./routes/adminRoutes");

// Servicios
const { seedDatabase } = require("./services/dbSeed");
const orderService = require("./services/orderService");
const { configStore } = require("./services/configStore");
const configManager = require("./services/configManager");

// Modelos
const Usuario = require("./models/Usuario");

// ========= 4. RUTAS DE API Y WEBHOOKS =========
app.get("/api/config", getConfig);
app.get("/api/config/watchdog", isAuthenticated, authorize(["config:manage"]), getWatchdogConfig);
app.put("/api/config/watchdog", isAuthenticated, authorize(["config:manage"]), updateWatchdogConfig);

// Logger global de diagnóstico para cualquier POST a /webhook*
app.use((req, res, next) => {
  if (req.method === "POST" && (req.path.startsWith("/webhook") || req.originalUrl?.startsWith("/webhook"))) {
    const entriesCount = Array.isArray(req.body?.entry) ? req.body.entry.length : 0;
    console.log(
      `📥 [WEBHOOK] POST ${req.originalUrl || req.path} object=${req.body?.object || "N/A"} entries=${entriesCount}`,
    );
  }
  next();
});

app.use("/webhook/instagram", webhookLimiter, instagramWebhookRoutes(io));
// Tercer canal: Facebook Messenger (endpoint propio y separado de WhatsApp/Instagram)
app.use("/webhook/messenger", webhookLimiter, messengerWebhookRoutes(io));
app.use("/webhook", webhookLimiter, webhookRoutes(io));
// Protección contra indexación en motores de búsqueda para panel, login y API admin (R3)
app.use(["/panel", "/login", "/api/admin"], (req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex");
  next();
});

app.use("/api/admin/ai-studio", require("./routes/aiStudioRoutes"));
app.use("/api/admin", apiLimiter, adminRoutes(io));

// ========= 5. RUTAS DE NAVEGACIÓN EXPLÍCITAS =========

// Login (Punto de entrada)
app.get("/login", async (req, res) => {
  const token = req.cookies.token;
  if (token) {
    if (await verificarSesion(token)) {
      return res.redirect("/panel");
    } else {
      res.clearCookie("token", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
    }
  }
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

// Panel Administrativo (Protegido)
// Apuntamos directamente al archivo físico para evitar colisiones
app.get("/panel", isAuthenticated, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Redirección raíz
app.get("/", (req, res) => res.redirect("/panel"));

// ========= 6. AUTENTICACIÓN (POST/LOGOUT) =========
app.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
  const { usuario, password } = req.body;

  try {
    const user = await Usuario.findOne({ username: usuario, activo: true });
    
    if (!user) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    // Actualizar último login
    user.ultimoLogin = new Date();
    await user.save();

    const secret = obtenerJwtSecret();
    if (!secret) {
      console.error("❌ Login rechazado: JWT_SECRET no configurado o inseguro.");
      return res.status(500).json({ error: "Error de configuración de seguridad en el servidor" });
    }
    const token = jwt.sign(
      {
        id: user._id,
        user: user.username,
        nombre: user.nombre,
        role: user.role,
      },
      secret,
      { expiresIn: DURACION_SESION_JWT },
    );

    res.cookie("token", token, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: DURACION_SESION_MS, // misma duración que el token
    });

    return res.json({ 
      success: true, 
      redirect: "/panel",
      user: {
        nombre: user.nombre,
        role: user.role
      }
    });
  } catch (error) {
    console.error("❌ Error en login:", error);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("token", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.redirect("/login");
});

// ========= 7. EVENTOS DE SOCKETS =========

// Eventos que envían mensajes a clientes o cambian el modo del bot: requieren permiso.
const EVENTOS_CON_PERMISO: Record<string, string> = {
  cambiar_modo: "chat:manage",
  cambiar_modo_ig: "chat:manage",
  enviar_desde_panel: "chat:manage",
  enviar_desde_panel_ig: "chat:manage",
};
// Autenticación del socket con la misma cookie y las mismas reglas que el panel HTTP
io.use(async (socket, next) => {
  try {
    const cookies = String(socket.handshake.headers.cookie || "");
    const par = cookies.split(";").map((c) => c.trim()).find((c) => c.startsWith("token="));
    const token = par ? decodeURIComponent(par.slice("token=".length)) : undefined;
    const usuario = await verificarSesion(token);
    if (!usuario) return next(new Error("No autorizado"));
    socket.data.user = usuario;
    return next();
  } catch (err) {
    return next(new Error("No autorizado"));
  }
});

io.on("connection", (socket) => {
  // Comprueba el permiso antes de cada evento sensible
  socket.use(([evento], next) => {
    const permisoRequerido = EVENTOS_CON_PERMISO[evento];
    if (permisoRequerido && !(socket.data.user?.permissions || []).includes(permisoRequerido)) {
      return next(new Error("Sin permiso para esta acción"));
    }
    return next();
  });


  socket.on("cambiar_modo", async (data) => {
    if (data.telefono && data.modo) {
      console.log(`[Socket] Cambiando modo para ${data.telefono} a ${data.modo}`);
      await orderService.setModo(data.telefono, data.modo, io);
    }
  });
  socket.on("cambiar_modo_ig", async (data) => {
    if (data?.usuarioIgId && data?.modo) {
      console.log(`[Socket IG] Cambiando modo para ${data.usuarioIgId} a ${data.modo}`);
      let EtiquetaIg = require("./models/EtiquetaIg");
      if (process.env.NODE_ENV === "test") {
        EtiquetaIg = require("./services/dbLocal").getEtiquetaIgModel();
      }
      await EtiquetaIg.findOneAndUpdate(
        { usuarioIgId: data.usuarioIgId },
        { $set: { modo: data.modo } },
        { upsert: true },
      );
      io.emit("ig_actualizado", { usuarioIgId: data.usuarioIgId });
    }
  });
  socket.on("enviar_desde_panel_ig", async (data) => {
    if (!data?.usuarioIgId || !data?.text) return;
    const { enviarTextoIg } = require("./services/instagram");
    let MensajeIg = require("./models/MensajeIg");
    if (process.env.NODE_ENV === "test") {
      MensajeIg = require("./services/dbLocal").getMensajeIgModel();
    }
    await enviarTextoIg(configStore.getConfig("IG_ACCOUNT_ID"), data.usuarioIgId, data.text);
    const nuevoMensaje = await MensajeIg.create({
      usuarioIgId: data.usuarioIgId,
      direccion: "bot",
      texto: data.text,
      tipo: "texto",
      mid: `igmid_panel_${Date.now()}`,
      status: "sent",
      timestamp: new Date(),
    });
    io.emit("mensaje_ig", {
      usuarioIgId: data.usuarioIgId,
      mensaje: nuevoMensaje,
    });
    io.emit("ig_actualizado", { usuarioIgId: data.usuarioIgId });
  });
  socket.on("enviar_desde_panel", async (data) => {
    const { enviarTexto } = require("./services/whatsapp");
    const orderService = require("./services/orderService");
    if (!data?.to || !data?.text) return;

    console.log(`📡 [SOCKET] enviar_desde_panel a ${data.to}. replyToMid:`, data.replyToMid);
    
    const resEnviado = await enviarTexto(data.to, data.text, null, data.replyToMid);
    const wamid = typeof resEnviado === "string" ? resEnviado : null;
    const status = resEnviado ? "sent" : "failed";

    if (data.retryMsgId && !String(data.retryMsgId).startsWith("temp-")) {
      try {
        let Mensaje = require("./models/Mensaje");
        if (process.env.NODE_ENV === "test") {
          Mensaje = require("./services/dbLocal").getMensajeModel();
        }
        await Mensaje.findByIdAndUpdate(data.retryMsgId, {
          status,
          wamid: wamid || undefined,
          timestamp: new Date(),
        });
        io.emit("status_actualizado", {
          _id: data.retryMsgId,
          telefono: data.to,
          wamid,
          status,
        });
        return;
      } catch (err) {
        console.error("❌ Error actualizando mensaje reintentado:", err.message);
      }
    }

    await orderService.emitirYGuardar(
      data.to,
      data.text,
      "bot",
      io,
      "texto",
      null,
      wamid,
      status,
      null,
      null,
      null,
      null,
      data.replyToMid || null,
      data.replyToText || null,
    );
  });
});

// ========= 8. CONEXIÓN A DB E INICIO DE SERVIDOR =========
const { comprobarJwtSecret, crearAdminInicial } = require("./services/bootstrapAdmin");
comprobarJwtSecret(); // en producción, sin un JWT_SECRET fuerte el proceso termina aquí

mongoose
  .connect(process.env.MONGODB_URI, {
    family: 4,
    serverSelectionTimeoutMS: 5000,
  })
  .then(async () => {
    console.log("✅ Conectado a MongoDB");

    // Inicializar ConfigStore (Caché en memoria de variables operativas)
    await configStore.init();
    console.log("✅ ConfigStore inicializado");

    // Primer administrador desde ADMIN_USER/ADMIN_PASS, solo si la base no tiene usuarios
    await crearAdminInicial();

    // Inicializar HorarioService (Caché en memoria del horario comercial)
    const { init: initHorario } = require("./services/horarioService");
    await initHorario();
    console.log("✅ Horario comercial inicializado");

    // Flujo de días no laborables: el bot lo lee de memoria, así que se carga de la base al arrancar
    const { init: initFlujoNoLaborable } = require("./services/flujoNoLaborableService");
    await initFlujoNoLaborable();
    console.log("✅ Flujo de días no laborables inicializado");

    // Datos legales y de contacto del negocio (política de privacidad, enlaces a WhatsApp)
    const { init: initDatosNegocio } = require("./services/datosNegocioService");
    await initDatosNegocio();
    console.log("✅ Datos del negocio inicializados");

    // Inicializar Agenda para trabajos en segundo plano
    const { initAgenda } = require("./services/agendaService");
    await initAgenda(io);
    console.log("✅ Agenda iniciada");

    // Reparación de órdenes viejas con Bs. 0,00
    const repairOrders = async () => {
      try {
        const Pedido = require("./models/Pedido");
        const { obtenerTasaUSD } = require("./services/bcv");
        const ordenesCero = await Pedido.find({ "pago.tasa": 0, "pago.montoUSD": { $gt: 0 } });
        
        if (ordenesCero.length > 0) {
          console.log(`🔧 [Mantenimiento] Reparando ${ordenesCero.length} órdenes con tasa 0...`);
          const tasaRes = await obtenerTasaUSD();
          const tasaActual = tasaRes?.tasa || 0;
          
          if (tasaActual > 0) {
            const bulkOps = ordenesCero.map(orden => ({
              updateOne: {
                filter: { _id: orden._id },
                update: { 
                  $set: { 
                    "pago.tasa": tasaActual, 
                    "pago.montoVES": Math.round(orden.pago.montoUSD * tasaActual * 100) / 100 
                  } 
                }
              }
            }));
            await Pedido.bulkWrite(bulkOps);
            console.log(`✅ [Mantenimiento] ${ordenesCero.length} órdenes reparadas con tasa ${tasaActual} vía BulkWrite.`);
          }
        }
      } catch (err) {
        console.error("❌ Error en script de reparación:", err.message);
      }
    };
    await repairOrders();

    // Purga y Recarga de emergencia si se solicita por ENV
    if (process.env.FORCE_CLEAN_SEED === "true") {
      console.log("🧹 MODO EMERGENCIA: Purgando y recargando catálogo...");
      const Producto = require("./models/Producto");
      const Categoria = require("./models/Categoria");
      await Producto.deleteMany({});
      await Categoria.deleteMany({});
      await seedDatabase();
      console.log("✨ Catálogo purgado y actualizado con productos de la marca.");
    } else {
      await seedDatabase();
    }

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🟢 Servidor activo en puerto ${PORT}`);
      console.log(`📂 Mapeo estático forzado para: /src -> ${SRC_DIR}`);
      
      // Iniciar Watchdog Service
      const watchdogService = require("./services/watchdogService");
      watchdogService.init(io);
    });
  })
  .catch((err) => {
    console.error("❌ Error fatal de base de datos:", err.message);
    if (process.env.NODE_ENV !== "test") process.exit(1);
  });

// ========= 9. GRACEFUL SHUTDOWN =========
const { stopAgenda } = require("./services/agendaService");
const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');
  try {
    await stopAgenda();
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
