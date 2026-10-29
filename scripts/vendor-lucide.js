#!/usr/bin/env node
/**
 * scripts/vendor-lucide.js
 * Copia al repo los íconos de Lucide que usa la tienda o el panel, como datos (figuras SVG), para no depender
 * de un CDN (la CSP de la tienda no lo permite) ni de un paso de build.
 *
 * Uso:
 *   npm pack lucide-static@<versión>   (en una carpeta temporal, y descomprimir el .tgz)
 *   node scripts/vendor-lucide.js <ruta a package/icon-nodes.json> <archivo de salida> <ícono> [ícono ...]
 *
 * El archivo de salida es un módulo ES con `export const LUCIDE = { "<nombre>": [[etiqueta, atributos], ...] }`.
 * No tiene dependencias. Lucide se distribuye con licencia ISC; el aviso queda en la cabecera del archivo.
 */
const fs = require("node:fs");
const path = require("node:path");

const [nodosPath, salida, ...nombres] = process.argv.slice(2);
if (!nodosPath || !salida || nombres.length === 0) {
  console.error("Uso: node scripts/vendor-lucide.js <icon-nodes.json> <salida.js> <ícono> [ícono ...]");
  process.exit(1);
}

const nodos = JSON.parse(fs.readFileSync(nodosPath, "utf8"));
const pkgPath = path.join(path.dirname(nodosPath), "package.json");
const version = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf8")).version : "desconocida";

const faltan = nombres.filter((n) => !nodos[n]);
if (faltan.length) {
  console.error(`❌ No existen en Lucide ${version}: ${faltan.join(", ")}`);
  process.exit(1);
}

const unicos = [...new Set(nombres)].sort();
const cuerpo = unicos.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(nodos[n])},`).join("\n");

fs.writeFileSync(
  salida,
  `/**
 * Íconos de Lucide v${version} (https://lucide.dev), licencia ISC:
 * Copyright (c) Lucide Icons and Contributors. Permission to use, copy, modify, and/or distribute this software for
 * any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission
 * notice appear in all copies.
 *
 * Archivo generado por scripts/vendor-lucide.js: no editar a mano. Para agregar un ícono, volver a generarlo con la
 * lista completa de nombres.
 */
export const LUCIDE = {
${cuerpo}
};
`
);
console.log(`✅ ${unicos.length} íconos de Lucide ${version} en ${salida}`);
