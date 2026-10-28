#!/usr/bin/env node
/**
 * catalogo/build.js
 * Genera catalogo/config.js a partir de la variable de entorno API_URL.
 * Sin dependencias externas.
 */

const fs = require("node:fs");
const path = require("node:path");

const apiUrl = (process.env.API_URL || "http://localhost:3000").trim();
const targetFile = path.join(__dirname, "config.js");

const content = `// Generado automáticamente por catalogo/build.js - NO EDITAR MANUALMENTE
window.CATALOGO_CONFIG = {
  apiUrl: ${JSON.stringify(apiUrl)}
};
`;

fs.writeFileSync(targetFile, content, "utf8");
console.log(`✅ [Catálogo] config.js generado con apiUrl: "${apiUrl}"`);
