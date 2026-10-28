# /secure-webhook — Validación HMAC SHA256 del webhook de Meta

## Objetivo
Añadir validación criptográfica de la firma `X-Hub-Signature-256` en los POST entrantes de Meta. Actualmente solo se verifica el `hub.verify_token` en la suscripción inicial (GET). Cualquier persona que descubra la URL del webhook puede enviar payloads falsos. Meta envía esta firma en TODOS los POST.

## Requisito previo
Necesitas tener configurada la variable de entorno `WHATSAPP_APP_SECRET` (el App Secret de tu aplicación de Meta). Se obtiene en Meta Developers > Tu App > Configuración > App Secret.

Si no lo tienes, añádelo a tu `.env`:
```
WHATSAPP_APP_SECRET=tu_app_secret_de_meta
```

## Paso 1: Crear middleware de validación HMAC

Crear `middlewares/hmacValidator.js`:

```js
const crypto = require("crypto");

/**
 * Middleware que valida la firma HMAC SHA256 de Meta en webhooks entrantes.
 * Meta firma el cuerpo del POST con el App Secret usando SHA256.
 * Cabecera esperada: X-Hub-Signature-256: sha256=<firma_hex>
 */
function validateMetaHmac(req, res, next) {
  // Solo validar en producción. En desarrollo/test, saltar.
  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") {
    console.log("🔓 [HMAC] Validación omitida en entorno:", process.env.NODE_ENV);
    return next();
  }

  const signature = req.headers["x-hub-signature-256"];
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    console.error("❌ [HMAC] WHATSAPP_APP_SECRET no configurado. El webhook no puede funcionar.");
    return res.status(500).json({ error: "Configuración de seguridad incompleta" });
  }

  if (!signature) {
    console.error("❌ [HMAC] Falta cabecera X-Hub-Signature-256. Petición rechazada.");
    return res.sendStatus(403);
  }

  // Meta envía el body como JSON string. Debemos usar el raw body.
  // Express ya parsea JSON, así que necesitamos el raw body de la request.
  // Usamos req.rawBody que configuraremos más abajo.
  const rawBody = req.rawBody || JSON.stringify(req.body);
  
  const expectedSignature = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  // Comparación en tiempo constante para evitar timing attacks
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      console.error("❌ [HMAC] Firma inválida. Petición rechazada.");
      return res.sendStatus(403);
    }
  } catch (e) {
    console.error("❌ [HMAC] Error comparando firmas:", e.message);
    return res.sendStatus(403);
  }

  console.log("✅ [HMAC] Firma validada correctamente.");
  next();
}

module.exports = { validateMetaHmac };
```

## Paso 2: Configurar raw body en index.js

Express parsea el body como JSON antes de llegar al webhook, modificándolo. Necesitamos capturar el raw body ANTES del parseo.

En `index.js`, buscar la línea:
```js
// 3. MIDDLEWARES BÁSICOS
app.use(express.json());
```

Reemplazar por:
```js
// 3. MIDDLEWARES BÁSICOS
// Capturar raw body ANTES del parseo JSON (necesario para validación HMAC)
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
```

## Paso 3: Aplicar el middleware HMAC a la ruta POST del webhook

En `routes/webhookRoutes.js`, buscar:
```js
router.post("/", (req, res) => webhookController.handleWebhook(req, res, io));
```

Reemplazar por:
```js
const { validateMetaHmac } = require("../middlewares/hmacValidator");
router.post("/", validateMetaHmac, (req, res) => webhookController.handleWebhook(req, res, io));
```

## Verificación

### Probar con un payload de prueba:
```bash
# Generar firma válida (requiere WHATSAPP_APP_SECRET en el entorno)
APP_SECRET="tu_secret"
BODY='{"object":"whatsapp_business_account","entry":[{"id":"123","changes":[{"value":{"messages":[{"from":"584120000000","id":"wamid.test","timestamp":"1234567890","type":"text","text":{"body":"hola"}}]}}]}]}'
SIGNATURE="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$APP_SECRET" | cut -d' ' -f2)"

curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -d "$BODY"
```

Debe responder `EVENT_RECEIVED`.

### Probar con firma inválida:
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=firmafalsaparatest" \
  -d '{"object":"test"}'
```

Debe responder `403 Forbidden`.

## Notas importantes
- El middleware se salta en entornos `test` y `development` para no bloquear pruebas locales.
- `crypto.timingSafeEqual` evita timing attacks que podrían filtrar el App Secret.
- El `rawBody` se captura en el `verify` callback de `express.json()` para tener el cuerpo exacto que Meta firmó.
- Si despliegas en Render, asegúrate de que `WHATSAPP_APP_SECRET` esté configurado en las variables de entorno.
