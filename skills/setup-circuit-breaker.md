# /setup-circuit-breaker — Circuit Breakers para APIs externas

## Objetivo
Envolver las llamadas a WhatsApp, DeepSeek y BCV en circuit breakers usando la librería `opossum`. Si una API externa falla repetidamente, el circuit breaker se abre y deja de intentar durante 60s, evitando degradación en cascada del servidor.

## Paso 1: Instalar dependencia
```bash
npm install opossum
```

## Paso 2: Crear servicio de circuit breakers

Crear `services/circuitBreaker.js`:

```js
const CircuitBreaker = require("opossum");

// Configuración base para todos los circuit breakers
const defaultOptions = {
  timeout: 15000,            // 15 segundos máximo por llamada
  errorThresholdPercentage: 50, // Abrir si 50% de requests fallan
  resetTimeout: 60000,       // 60 segundos cerrado antes de reintentar
  rollingCountTimeout: 30000, // Ventana de 30 segundos para contar fallos
  rollingCountBuckets: 10,
  volumeThreshold: 5,        // Mínimo 5 requests antes de evaluar
};

// Estado global de los circuit breakers
const state = {
  whatsapp: "closed",
  deepseek: "closed",
  bcv: "closed",
};

// Factory que crea un circuit breaker con logging
function createBreaker(name, asyncFn, options = {}) {
  const breaker = new CircuitBreaker(asyncFn, { ...defaultOptions, ...options });

  breaker.on("open", () => {
    console.warn(`🔴 [CircuitBreaker] ${name} ABIERTO. Bloqueando llamadas por ${defaultOptions.resetTimeout / 1000}s.`);
    state[name] = "open";
  });

  breaker.on("halfOpen", () => {
    console.log(`🟡 [CircuitBreaker] ${name} SEMI-ABIERTO. Probando...`);
    state[name] = "halfOpen";
  });

  breaker.on("close", () => {
    console.log(`🟢 [CircuitBreaker] ${name} CERRADO. Restaurado.`);
    state[name] = "closed";
  });

  breaker.on("failure", (err) => {
    console.error(`⚠️ [CircuitBreaker] ${name} falló:`, err.message?.substring(0, 100));
  });

  // Fallback: qué devolver cuando el circuit breaker está abierto
  breaker.fallback(() => {
    throw new Error(`[${name}] Servicio temporalmente no disponible (circuit breaker abierto)`);
  });

  return breaker;
}

function getState() {
  return { ...state };
}

module.exports = { createBreaker, getState, state };
```

## Paso 3: Envolver WhatsApp

En `services/whatsapp.js`, modificar la función `enviarTexto` (y similares `enviarBotones`, `enviarLista`).

Al principio del archivo, añadir:
```js
const { createBreaker } = require("./circuitBreaker");
```

Modificar `enviarTexto` para envolver la llamada real:
```js
// Envolver la función real con circuit breaker
const _enviarTextoReal = async (to, text, phoneId) => {
  // ... TODO el código actual de enviarTexto ...
};

// Crear el circuit breaker una sola vez
let whatsappBreaker = null;
function getWhatsappBreaker() {
  if (!whatsappBreaker) {
    whatsappBreaker = createBreaker("whatsapp", async (to, text, phoneId) => {
      return await _enviarTextoReal(to, text, phoneId);
    }, { timeout: 15000 });
  }
  return whatsappBreaker;
}

// Nueva función exportada con circuit breaker
async function enviarTexto(to, text, phoneId = null) {
  try {
    return await getWhatsappBreaker().fire(to, text, phoneId);
  } catch (error) {
    console.error("❌ [WhatsApp] Circuit breaker bloqueó el envío:", error.message);
    return false;
  }
}
```

## Paso 4: Envolver DeepSeek

En `services/ai.js`, al principio del archivo añadir:
```js
const { createBreaker } = require("./circuitBreaker");
```

Envolver la llamada HTTP real a DeepSeek:
```js
let deepseekBreaker = null;
function getDeepseekBreaker() {
  if (!deepseekBreaker) {
    deepseekBreaker = createBreaker("deepseek", async (messages) => {
      const response = await axios.post(
        "https://api.deepseek.com/v1/chat/completions",
        {
          model: "deepseek-chat",
          messages,
          temperature: 0.7,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 20000,
        }
      );
      return response.data.choices[0].message.content;
    }, { timeout: 20000 });
  }
  return deepseekBreaker;
}
```

Reemplazar la llamada `axios.post(...)` existente en `consultarAsistenteVentas` por:
```js
const respuesta = await getDeepseekBreaker().fire(messages);
```

## Paso 5: Envolver BCV

En `services/bcv.js`, envolver la función de fetch:
```js
const { createBreaker } = require("./circuitBreaker");

let bcvBreaker = null;
function getBcvBreaker() {
  if (!bcvBreaker) {
    bcvBreaker = createBreaker("bcv", async () => {
      // ... lógica actual de fetchAndUpdateRate ...
    }, { timeout: 20000, errorThresholdPercentage: 60 });
  }
  return bcvBreaker;
}
```

## Paso 6: Exponer estado en health check

En `services/watchdogService.js`, en el método `getHealthStatus()`, añadir:
```js
// 6. Circuit Breakers
const { getState } = require("./circuitBreaker");
status.circuitBreakers = getState();
```

## Verificación

No hay forma fácil de probar sin desconectar internet o forzar fallos. Pero puedes verificar que los breakers se crean sin error:
```bash
node -e "
require('./services/whatsapp');
require('./services/ai');
require('./services/bcv');
console.log('✅ Circuit breakers inicializados correctamente');
"
```

## Notas importantes
- `opossum` es la librería estándar de circuit breaker para Node.js (usada por Netflix).
- Los breakers son lazy: se crean en la primera llamada, no al iniciar el servidor.
- Si todos los breakers están abiertos a la vez, el bot responde con mensajes de error genéricos al cliente en lugar de colgarse.
- El estado se expone en `/health` para monitoreo.
- En desarrollo, puedes forzar la apertura: `breaker.open()`.
