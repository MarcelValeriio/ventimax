/**
 * scripts/test-config-validators.ts
 * Pruebas de validación de valores editables desde el panel de configuración.
 * Ejecutar con: NODE_ENV=test npx tsx scripts/test-config-validators.ts
 */
import assert from "node:assert/strict";
const { validarValorConfig } = require("../services/configValidators");

type Caso = { nombre: string; fn: () => void };

const casos: Caso[] = [
  {
    nombre: "Teléfono con + y espacios se normaliza a solo dígitos",
    fn: () => {
      const r = validarValorConfig("ADMIN_PHONE_NUMBER", " +58 412-123 4567 ");
      assert.deepEqual(r, { ok: true, value: "584121234567" });
    },
  },
  {
    nombre: "Teléfono demasiado corto se rechaza",
    fn: () => {
      const r = validarValorConfig("ADMIN_PHONE_NUMBER", "1234");
      assert.equal(r.ok, false);
    },
  },
  {
    nombre: "Vacío es válido y significa usar process.env",
    fn: () => {
      assert.deepEqual(validarValorConfig("ADMIN_PHONE_NUMBER", "   "), { ok: true, value: "" });
    },
  },
  {
    nombre: "ID de Meta debe ser numérico",
    fn: () => {
      assert.equal(validarValorConfig("IG_ACCOUNT_ID", "abc123").ok, false);
      assert.deepEqual(validarValorConfig("IG_ACCOUNT_ID", "17841400000000000"), { ok: true, value: "17841400000000000" });
      // IDs reales observados: 16 y 17 dígitos. Rango aceptado 10..20.
      assert.equal(validarValorConfig("FB_PAGE_ID", "1029384756102938").ok, true);
      assert.equal(validarValorConfig("FB_PAGE_ID", "123456789").ok, false);
      assert.equal(validarValorConfig("FB_PAGE_ID", "1".repeat(21)).ok, false);
    },
  },
  {
    nombre: "Nombre de plantilla solo admite minúsculas, números y guion bajo",
    fn: () => {
      assert.equal(validarValorConfig("WHATSAPP_TEMPLATE_ORDER", "Order Notification").ok, false);
      assert.equal(validarValorConfig("WHATSAPP_TEMPLATE_ORDER", "order_notification_v2").ok, true);
    },
  },
  {
    nombre: "WEBHOOK_DEBOUNCE_MS acepta 0..10000 y rechaza fuera de rango o texto",
    fn: () => {
      assert.equal(validarValorConfig("WEBHOOK_DEBOUNCE_MS", "1200").ok, true);
      assert.equal(validarValorConfig("WEBHOOK_DEBOUNCE_MS", "0").ok, true);
      assert.equal(validarValorConfig("WEBHOOK_DEBOUNCE_MS", "10001").ok, false);
      assert.equal(validarValorConfig("WEBHOOK_DEBOUNCE_MS", "rapido").ok, false);
    },
  },
  {
    nombre: "VAPID_EMAIL acepta correo con o sin prefijo mailto:",
    fn: () => {
      assert.equal(validarValorConfig("VAPID_EMAIL", "soporte@mrpachi.com").ok, true);
      assert.equal(validarValorConfig("VAPID_EMAIL", "mailto:soporte@mrpachi.com").ok, true);
      assert.equal(validarValorConfig("VAPID_EMAIL", "no-es-correo").ok, false);
    },
  },
  {
    nombre: "Valores que no son texto se rechazan",
    fn: () => {
      assert.equal(validarValorConfig("ADMIN_PHONE_NUMBER", 584121234567).ok, false);
      assert.equal(validarValorConfig("ADMIN_PHONE_NUMBER", { $gt: "" }).ok, false);
    },
  },
  {
    nombre: "Texto demasiado largo en clave sin regla se rechaza",
    fn: () => {
      assert.equal(validarValorConfig("META_DATASET_ID_X", "a".repeat(201)).ok, false);
    },
  },
];

let fallos = 0;
for (const caso of casos) {
  try {
    caso.fn();
    console.log(`  ✅ ${caso.nombre}`);
  } catch (err: any) {
    fallos++;
    console.error(`  ❌ ${caso.nombre}: ${err.message}`);
  }
}

if (fallos > 0) {
  console.error(`\n${fallos} prueba(s) fallaron.`);
  process.exit(1);
}
console.log(`\n🎉 ${casos.length} pruebas de validación de configuración superadas.`);
