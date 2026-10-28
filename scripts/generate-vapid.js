/**
 * scripts/generate-vapid.js
 * 
 * Script utilitario para generar un nuevo par de claves VAPID (Web Push API).
 * Uso: node scripts/generate-vapid.js
 */

const webpush = require("web-push");

console.log("==========================================================");
console.log("🔑 GENERADOR DE CLAVES VAPID (Web Push API)");
console.log("==========================================================\n");

const vapidKeys = webpush.generateVAPIDKeys();

console.log("Copia y pega estas variables en tu archivo .env en Render / Local:\n");
console.log(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log(`VAPID_EMAIL="mailto:soporte@mrpachi.com"\n`);

console.log("==========================================================");
console.log("✅ Claves generadas exitosamente.");
console.log("==========================================================");
