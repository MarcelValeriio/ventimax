#!/usr/bin/env bash
# scripts/catalogo-local.sh
# Servidor local para el catálogo estático en http://localhost:5173
# Sin dependencias externas.
set -uo pipefail
cd "$(dirname "$0")/.."

echo "▶ Generando configuración local para el catálogo..."
API_URL="http://localhost:3000" node catalogo/build.js

echo ""
echo "========================================================================"
echo "🌐 Catálogo local disponible en: http://localhost:5173"
echo "👉 Para probar con el backend en otra terminal ejecuta:"
echo "   CATALOGO_ORIGEN=http://localhost:5173 ./scripts/dev-local.sh"
echo "========================================================================"
echo ""

node -e '
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = 5173;
const ROOT = path.resolve(__dirname, "catalogo");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp"
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];
  let filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);

  // Seguridad: evitar directory traversal fuera de ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (!path.extname(filePath)) {
        filePath = path.join(ROOT, "index.html");
      } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end("Internal Server Error");
        return;
      }
      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
        "Content-Security-Policy": "default-src \x27self\x27; script-src \x27self\x27; style-src \x27self\x27; img-src \x27self\x27 data: https://res.cloudinary.com http://localhost:3000; connect-src \x27self\x27 http://localhost:3000; object-src \x27none\x27; frame-ancestors \x27none\x27; base-uri \x27self\x27",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      });
      res.end(content);
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Servidor estático del catálogo escuchando en http://localhost:${PORT}`);
});
'
