/**
 * routes/messengerWebhookRoutes.ts
 * Rutas para el Webhook de Facebook Messenger (Meta)
 */

module.exports = function (io) {
  const express = require("express");
  const router = express.Router();
  const messengerWebhookController = require("../controllers/messengerWebhookController");
  const { validateMetaHmac } = require("../middlewares/hmacValidator");

  router.get("/", messengerWebhookController.verifyWebhook);
  router.post("/", validateMetaHmac, (req, res) =>
    messengerWebhookController.handleWebhook(req, res, io),
  );

  return router;
};
