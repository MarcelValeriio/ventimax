/**
 * Rutas para el Webhook de WhatsApp (Públicas)
 */
module.exports = function(io) {
  const express = require("express");
  const router = express.Router();
  const webhookController = require("../controllers/webhookController");
  const { validateMetaHmac } = require("../middlewares/hmacValidator");

  router.get("/", webhookController.verifyWebhook);
  const instagramWebhookController = require("../controllers/instagramWebhookController");

  // Meta puede entregar los eventos de Instagram a esta URL (callback de la app). Se reenvían
  // al controlador de Instagram según el campo "object" del cuerpo ya firmado y validado.
  router.post("/", validateMetaHmac, (req, res) => {
    if (req.body?.object === "instagram") {
      return instagramWebhookController.handleWebhook(req, res, io);
    }
    return webhookController.handleWebhook(req, res, io);
  });
  
  return router;
};
