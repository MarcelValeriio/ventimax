/**
 * routes/instagramWebhookRoutes.js
 * Rutas para el Webhook de Instagram Direct (Meta)
 */

module.exports = function (io) {
  const express = require("express");
  const router = express.Router();
  const instagramWebhookController = require("../controllers/instagramWebhookController");
  const { validateMetaHmac } = require("../middlewares/hmacValidator");

  router.get("/", instagramWebhookController.verifyWebhook);
  router.post("/", validateMetaHmac, (req, res) =>
    instagramWebhookController.handleWebhook(req, res, io),
  );

  return router;
};
