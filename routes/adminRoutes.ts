/**
 * Rutas del Panel Administrativo (Protegidas por JWT)
 */
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadProductoImagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err: any = new Error("Solo se permiten imágenes en formato JPG, PNG o WebP");
      err.code = "INVALID_FILE_TYPE";
      cb(err, false);
    }
  },
});

const handleUploadProductoImagen = (req: any, res: any, next: any) => {
  uploadProductoImagen.single("imagen")(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "La imagen no puede exceder 5 MB",
        });
      }
      if (err.code === "INVALID_FILE_TYPE") {
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message || "Error al procesar la imagen",
      });
    }
    next();
  });
};

// Logo de empresa de envío (F2f): JPG, PNG o WebP, hasta 2 MB
const uploadLogoEnvio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err: any = new Error("Solo se permiten logos en formato JPG, PNG o WebP");
      err.code = "INVALID_FILE_TYPE";
      cb(err, false);
    }
  },
});

const handleUploadLogoEnvio = (req: any, res: any, next: any) => {
  uploadLogoEnvio.single("logo")(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "El logo no puede exceder 2 MB",
        });
      }
      if (err.code === "INVALID_FILE_TYPE") {
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message || "Error al procesar el logo",
      });
    }
    next();
  });
};

module.exports = function (io) {
  const express = require("express");
  const router = express.Router();
  const adminController = require("../controllers/adminController");
  const inboxController = require("../controllers/inboxController");
  const paymentController = require("../controllers/paymentController");
  const shippingController = require("../controllers/shippingController");
  const configAdminController = require("../controllers/configAdminController");
  const { isAuthenticated, authorize } = require("../middlewares/auth");
  const {
    validate,
    productoSchema,
    productoUpdateSchema,
    categoriaSchema,
    usuarioSchema,
    usuarioUpdateSchema,
    metodoPagoSchema,
  } = require("../validators");

  // Perfil de Usuario
  router.get("/me", isAuthenticated, adminController.getMe);

  // Clientes Únicos
  router.get(
    "/clients",
    isAuthenticated,
    authorize(["order:view"]),
    adminController.getClients,
  );

  // Gestión de Usuarios (Solo Admin)
  router.get(
    "/users",
    isAuthenticated,
    authorize(["user:view"]),
    adminController.getUsers,
  );
  router.post(
    "/users",
    isAuthenticated,
    authorize(["user:create"]),
    validate(usuarioSchema),
    adminController.postUser,
  );
  router.patch(
    "/users/:id",
    isAuthenticated,
    authorize(["user:edit"]),
    validate(usuarioUpdateSchema),
    adminController.patchUser,
  );

  // Auditoría (Admin puede ver todo)
  router.get(
    "/audit",
    isAuthenticated,
    authorize(["audit_log:view"]),
    adminController.getAuditLogs,
  );

  // Configuración e Información (Admin y Cajero pueden ver tasa)
  router.get(
    "/bcv",
    isAuthenticated,
    authorize(["bcv_rate:view"]),
    adminController.getBCVRate,
  );

  // Configuración de Variables de Entorno y Canales (Solo Admin con config:manage)
  router.get(
    "/config",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.getConfigAdmin,
  );
  router.put(
    "/config",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.updateConfigAdmin,
  );
  router.post(
    "/config/test-whatsapp",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.testWhatsAppConnection,
  );

  // Gestión de Horario de Atención comercial (Solo Admin con config:manage)
  router.get(
    "/config/horario",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.getHorarioConfig,
  );
  router.put(
    "/config/horario",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.updateHorarioConfig,
  );

  // Gestión de Flujo en Días No Laborables (Solo Admin con config:manage)
  router.get(
    "/config/flujo-no-laborable",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.getFlujoNoLaborableConfig,
  );
  router.put(
    "/config/flujo-no-laborable",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.updateFlujoNoLaborableConfig,
  );

  // Datos legales y de contacto del negocio (Solo Admin con config:manage)
  router.get(
    "/config/datos-negocio",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.getDatosNegocioConfig,
  );
  router.put(
    "/config/datos-negocio",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.updateDatosNegocioConfig,
  );

  // Configuración del Catálogo Web y Anti-abuso (Solo Admin con config:manage)
  router.get(
    "/config/catalogo",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.getCatalogoConfig,
  );
  router.put(
    "/config/catalogo",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.updateCatalogoConfig,
  );
  router.get(
    "/config/catalogo/abuso",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.getCatalogoAbuso,
  );

  // Preguntas frecuentes de la tienda (F2b, Solo Admin con config:manage)
  router.get(
    "/config/preguntas-frecuentes",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.getPreguntasFrecuentesConfig,
  );
  router.put(
    "/config/preguntas-frecuentes",
    isAuthenticated,
    authorize(["config:manage"]),
    configAdminController.updatePreguntasFrecuentesConfig,
  );

  // Gestión de Categorías (Solo Admin)
  router.get(
    "/categorias",
    isAuthenticated,
    authorize(["category:view"]),
    adminController.getCategorias,
  );
  router.post(
    "/categorias",
    isAuthenticated,
    authorize(["category:create"]),
    validate(categoriaSchema),
    adminController.postCategoria,
  );
  router.put(
    "/categorias/:id",
    isAuthenticated,
    authorize(["category:edit"]),
    validate(categoriaSchema.partial()),
    adminController.updateCategoria,
  );
  router.delete(
    "/categorias/:id",
    isAuthenticated,
    authorize(["category:delete"]),
    adminController.deleteCategoria,
  );

  // Gestión de Métodos de Pago (Solo Admin)
  router.get(
    "/payments",
    isAuthenticated,
    authorize(["payment_method:view"]),
    paymentController.getPayments,
  );
  router.post(
    "/payments",
    isAuthenticated,
    authorize(["payment_method:create"]),
    validate(metodoPagoSchema),
    paymentController.createPayment,
  );
  router.put(
    "/payments/:id",
    isAuthenticated,
    authorize(["payment_method:edit"]),
    validate(metodoPagoSchema.partial()),
    paymentController.updatePayment,
  );
  router.delete(
    "/payments/:id",
    isAuthenticated,
    authorize(["payment_method:delete"]),
    paymentController.deletePayment,
  );

  // Gestión de Métodos de Envío (F0-5)
  router.get(
    "/shipping",
    isAuthenticated,
    authorize(["shipping_method:view"]),
    shippingController.getShippingMethods,
  );
  router.post(
    "/shipping",
    isAuthenticated,
    authorize(["shipping_method:create"]),
    shippingController.createShippingMethod,
  );
  // Logo de una empresa de envío (F2f). Va antes de /shipping/:id por claridad de rutas.
  router.post(
    "/shipping/logo",
    isAuthenticated,
    authorize(["shipping_method:edit"]),
    handleUploadLogoEnvio,
    shippingController.uploadShippingLogo,
  );
  router.put(
    "/shipping/:id",
    isAuthenticated,
    authorize(["shipping_method:edit"]),
    shippingController.updateShippingMethod,
  );
  router.delete(
    "/shipping/:id",
    isAuthenticated,
    authorize(["shipping_method:delete"]),
    shippingController.deleteShippingMethod,
  );

  // Gestión de Inventario (Solo Admin)
  router.get(
    "/products",
    isAuthenticated,
    authorize(["product:view"]),
    adminController.getProducts,
  );
  router.post(
    "/products",
    isAuthenticated,
    authorize(["product:create"]),
    validate(productoSchema),
    adminController.postProduct,
  );
  router.put(
    "/products/:id",
    isAuthenticated,
    authorize(["product:edit"]),
    validate(productoUpdateSchema),
    adminController.updateProduct,
  );
  router.delete(
    "/products/:id",
    isAuthenticated,
    authorize(["product:delete"]),
    adminController.deleteProduct,
  );
  router.post(
    "/products/:id/imagenes",
    isAuthenticated,
    authorize(["product:edit"]),
    handleUploadProductoImagen,
    adminController.postProductImage,
  );
  router.delete(
    "/products/:id/imagenes/:indice",
    isAuthenticated,
    authorize(["product:edit"]),
    adminController.deleteProductImage,
  );
  router.put(
    "/products/:id/imagenes/principal",
    isAuthenticated,
    authorize(["product:edit"]),
    adminController.setPrimaryProductImage,
  );

  // Gestión de Chats (Admin y Cajero para seguimiento)
  router.get(
    "/historial",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getHistorial,
  );
  router.get(
    "/whatsapp/profile",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getWhatsAppProfile,
  );
  router.post(
    "/whatsapp/profile",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.postWhatsAppProfile,
  );
  router.post(
    "/whatsapp/profile-picture",
    isAuthenticated,
    authorize(["chat:manage"]),
    upload.single("file"),
    adminController.postWhatsAppProfilePicture,
  );
  router.get(
    "/ig/historial",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getInstagramHistorial,
  );
  router.post(
    "/ig/enviar",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => adminController.postInstagramEnviar(req, res, io),
  );
  router.post(
    "/ig/enviar-imagen",
    isAuthenticated,
    authorize(["chat:manage"]),
    upload.single("file"),
    (req, res) => adminController.postInstagramEnviarImagen(req, res, io),
  );
  router.get(
    "/ig/bot-toggle",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getInstagramBotToggle,
  );
  router.post(
    "/ig/bot-toggle",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => adminController.postInstagramBotToggle(req, res, io),
  );
  router.post(
    "/ig/modo",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => adminController.postInstagramModo(req, res, io),
  );
  router.get(
    "/pedidos-historial",
    isAuthenticated,
    authorize(["order:view"]),
    adminController.getPedidosHistorial,
  );
  router.get(
    "/etiquetas",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getEtiquetas,
  );
  router.post(
    "/etiqueta",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => adminController.postEtiqueta(req, res, io),
  );
  router.post(
    "/chat/upload",
    isAuthenticated,
    authorize(["chat:manage"]),
    upload.single("file"),
    (req, res) => adminController.uploadAndSendFile(req, res, io),
  );

  // Quick Replies (Respuestas Rápidas)
  router.get(
    "/quick-replies",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getQuickReplies,
  );
  router.post(
    "/quick-replies",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.createQuickReply,
  );
  router.put(
    "/quick-replies/:id",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.updateQuickReply,
  );
  router.delete(
    "/quick-replies/:id",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.deleteQuickReply,
  );
  router.patch(
    "/quick-replies/reorder",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.reorderQuickReplies,
  );
  router.get(
    "/chat-context",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getChatContext,
  );

  // Preguntas Frecuentes (FAQs)
  router.get(
    "/faqs",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getFaqs,
  );
  router.post(
    "/faqs",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.createFaq,
  );
  router.put(
    "/faqs/:id",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.updateFaq,
  );
  router.delete(
    "/faqs/:id",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.deleteFaq,
  );

  // Multimedia y Pagos
  router.get(
    "/media/:mediaId",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getMedia,
  );
  router.get(
    "/audio/:mediaId",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getAudioMedia,
  );
  router.post(
    "/confirmar_pago",
    isAuthenticated,
    authorize(["order:confirm_payment"]),
    (req, res) => adminController.confirmarPago(req, res, io),
  );
  router.get(
    "/sales-summary",
    isAuthenticated,
    authorize(["dashboard:view"]),
    adminController.getSalesSummary,
  );

  router.get(
    "/metrics/top-products",
    isAuthenticated,
    authorize(["dashboard:view"]),
    adminController.getTopProducts,
  );

  router.get(
    "/crm/customer/:telefono",
    isAuthenticated,
    authorize(["order:view"]),
    adminController.getCustomerCRM,
  );

  router.post(
    "/manual-sale",
    isAuthenticated,
    authorize(["order:create"]),
    upload.single("comprobante"),
    (req, res) => adminController.postManualSale(req, res, io),
  );
  router.get(
    "/backup",
    isAuthenticated,
    authorize(["system:manage"]),
    adminController.getBackup,
  );

  // Estado de Operación (Solo Admin y Cajero seguimiento)
  router.get(
    "/modos",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.getModos,
  );
  router.post(
    "/chats/reactivar",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => adminController.reactivarBot(req, res, io),
  );
  router.post(
    "/chats/modo",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => adminController.setModoChat(req, res, io),
  );
  router.post(
    "/reset-bot",
    isAuthenticated,
    authorize(["system:manage"]),
    (req, res) => adminController.resetBot(req, res, io),
  );

  // Gestión de Pedidos (Kanban) - Repartidor solo puede actualizar a "entregado" (se valida en controller)
  router.get(
    "/orders/:id",
    isAuthenticated,
    authorize(["order:view"]),
    adminController.getOrder,
  );
  router.get(
    "/orders/:id/audit",
    isAuthenticated,
    authorize(["audit_log:view"]),
    adminController.getOrderAuditLog,
  );
  router.put(
    "/orders/:id/edit",
    isAuthenticated,
    authorize(["order:manage_status"]),
    upload.single("comprobante"),
    (req, res) => adminController.editOrder(req, res, io)
  );
  router.patch(
    "/orders/:id/status",
    isAuthenticated,
    authorize(["order:manage_status"]),
    (req, res) => adminController.updateOrderStatus(req, res, io),
  );
  router.patch(
    "/orders/:id/repartidor",
    isAuthenticated,
    authorize(["order:manage_status"]),
    (req, res) => adminController.assignRepartidor(req, res, io),
  );
  router.delete(
    "/orders/:id",
    isAuthenticated,
    authorize(["order:delete"]),
    (req, res) => adminController.deleteOrder(req, res, io),
  );
  router.put(
    "/orders/:id/envio",
    isAuthenticated,
    authorize(["order:manage"]),
    (req, res) => adminController.updateOrderShipping(req, res, io),
  );

  // Salud del Sistema (Watchdog) — disponible para cualquier usuario autenticado
  router.get("/health", isAuthenticated, adminController.getHealth);

  // Notificaciones Web Push (VAPID)
  router.post("/push/subscribe", isAuthenticated, adminController.postPushSubscribe);
  router.post("/push/unsubscribe", isAuthenticated, adminController.postPushUnsubscribe);
  router.post("/push/test", isAuthenticated, adminController.postPushTest);

  // Copiloto Venta Manual (Extracción IA)
  router.post(
    "/chat/extract-order",
    isAuthenticated,
    authorize(["chat:manage"]),
    adminController.extractOrderFromChat
  );

  // ========= INBOX UNIFICADO (Fase 2A) =========
  // Endpoints nuevos del contrato docs/inbox-unificado-contrato.md §6.1 y §6.3.
  // Conviven con los legacy: no los sustituyen ni cambian su shape.

  // Lista unificada (canal=todos|whatsapp|instagram|messenger + filtros de servidor)
  router.get(
    "/inbox",
    isAuthenticated,
    authorize(["chat:manage"]),
    inboxController.getInbox,
  );
  // Hilo de mensajes (GET sin efectos secundarios)
  router.get(
    "/inbox/hilo",
    isAuthenticated,
    authorize(["chat:manage"]),
    inboxController.getHilo,
  );
  // Contexto/CRM de la conversación
  router.get(
    "/inbox/contexto",
    isAuthenticated,
    authorize(["chat:manage"]),
    inboxController.getContexto,
  );
  // Enviar mensaje de texto (el canal y el usuarioId viajan en el body)
  router.post(
    "/inbox/mensaje",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => inboxController.postMensaje(req, res, io),
  );
  // Enviar adjunto (multipart)
  router.post(
    "/inbox/adjunto",
    isAuthenticated,
    authorize(["chat:manage"]),
    upload.single("file"),
    (req, res) => inboxController.postAdjunto(req, res, io),
  );
  // Cambiar modo del bot (manual | automatico)
  router.post(
    "/inbox/modo",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => inboxController.postModo(req, res, io),
  );
  // Marcar leído (NUEVO, idempotente) — reemplaza el efecto secundario del GET de IG
  router.post(
    "/inbox/leido",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => inboxController.postLeido(req, res, io),
  );
  // Reset del bot (exclusivo de WhatsApp; 501 en otros canales)
  router.post(
    "/inbox/reset",
    isAuthenticated,
    authorize(["system:manage"]),
    (req, res) => inboxController.postReset(req, res, io),
  );
  // Bloquear usuario
  router.post(
    "/inbox/bloquear",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => inboxController.postBloquear(req, res, io),
  );
  // Acciones exclusivas de WhatsApp (canal en el path)
  router.post(
    "/inbox/whatsapp/pago/confirmar",
    isAuthenticated,
    authorize(["order:confirm_payment"]),
    (req, res) => inboxController.postWhatsappConfirmarPago(req, res, io),
  );
  router.patch(
    "/inbox/whatsapp/pedido/:id/estado",
    isAuthenticated,
    authorize(["order:manage_status"]),
    (req, res) => inboxController.patchWhatsappPedidoEstado(req, res, io),
  );
  router.patch(
    "/inbox/whatsapp/pedido/:id/repartidor",
    isAuthenticated,
    authorize(["order:manage_status"]),
    (req, res) => inboxController.patchWhatsappPedidoRepartidor(req, res, io),
  );
  // Bot global de Instagram (estado de canal, no de chat)
  router.get(
    "/inbox/instagram/bot-toggle",
    isAuthenticated,
    authorize(["chat:manage"]),
    inboxController.getInstagramBotToggle,
  );
  router.post(
    "/inbox/instagram/bot-toggle",
    isAuthenticated,
    authorize(["chat:manage"]),
    (req, res) => inboxController.postInstagramBotToggle(req, res, io),
  );
  // LOTE B6 · Perfil de WhatsApp Business (estado de canal, no de chat).
  // Equivalentes unificados de `/whatsapp/profile*` (legacy, intactos para la
  // consola de WhatsApp). El canal va en la query (GET) o en el body (POST);
  // si falta se asume whatsapp porque la ruta ya lo fija.
  router.get(
    "/inbox/whatsapp/profile",
    isAuthenticated,
    authorize(["chat:manage"]),
    inboxController.getWhatsappProfile,
  );
  router.post(
    "/inbox/whatsapp/profile",
    isAuthenticated,
    authorize(["chat:manage"]),
    inboxController.postWhatsappProfile,
  );
  router.post(
    "/inbox/whatsapp/profile-picture",
    isAuthenticated,
    authorize(["chat:manage"]),
    upload.single("file"),
    inboxController.postWhatsappProfilePicture,
  );

  // LOTE B7a · COPILOTO DE VENTA MANUAL (WA-131..139).
  // Equivalentes unificados de `/products`, `/payments`, `/chat/extract-order` y
  // `/manual-sale` (legacy, intactos para la consola de WhatsApp y el Kanban).
  // Los dos últimos son exclusivos de WhatsApp (409 en los demás canales).
  router.get(
    "/inbox/products",
    isAuthenticated,
    authorize(["product:view"]),
    inboxController.getProductsInbox,
  );
  router.get(
    "/inbox/payments",
    isAuthenticated,
    authorize(["payment_method:view"]),
    inboxController.getPaymentsInbox,
  );
  router.get(
    "/inbox/shipping",
    isAuthenticated,
    authorize(["shipping_method:view"]),
    inboxController.getShippingInbox,
  );
  router.post(
    "/inbox/whatsapp/copiloto/extraer",
    isAuthenticated,
    authorize(["chat:manage"]),
    inboxController.postCopilotoExtraer,
  );
  router.post(
    "/inbox/whatsapp/venta-manual",
    isAuthenticated,
    authorize(["order:create"]),
    upload.single("comprobante"),
    (req, res) => inboxController.postVentaManual(req, res, io),
  );

  return router;
};
