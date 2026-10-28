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
