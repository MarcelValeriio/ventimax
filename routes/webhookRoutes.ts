/**
 * Rutas para el Webhook de WhatsApp (Públicas)
 */
module.exports = function(io) {
  const express = require("express");
  const router = express.Router();
  const webhookController = require("../controllers/webhookController");
  const { validateMetaHmac } = require("../middlewares/hmacValidator");

  router.get("/", webhookController.verifyWebhook);
  router.post("/", validateMetaHmac, (req, res) => webhookController.handleWebhook(req, res, io));
  
  return router;
};
