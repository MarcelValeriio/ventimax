/**
 * scripts/test-panel-referencias.ts
 * esbuild --bundle comprueba los imports del panel, pero no detecta una llamada a una función que no existe:
 * el error aparece recién en el navegador (p. ej. "fetchProducts is not defined" al subir la foto de un producto,
 * 2026-10-30). Esta suite revisa, archivo por archivo, que cada función de carga `fetchX(...)` que se llama esté
 * definida o importada en el mismo archivo.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-panel-referencias.ts
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const raiz = path.join(__dirname, "..", "public", "src");

function archivosJs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const ruta = path.join(dir, d.name);
    if (d.isDirectory()) return archivosJs(ruta);
    return d.name.endsWith(".js") ? [ruta] : [];
  });
}

const faltan: string[] = [];
for (const archivo of archivosJs(raiz)) {
  const texto = fs.readFileSync(archivo, "utf8");
  // Llamadas directas (no métodos de un objeto: se excluye `algo.fetchX(`)
  const llamadas = new Set([...texto.matchAll(/(?<![.\w$])(fetch[A-Z]\w*)\s*\(/g)].map((m) => m[1]));
  for (const nombre of llamadas) {
    const definida = new RegExp(
      // const/let/var/function, parámetro o prop desestructurada, o import
      `(?:const|let|var|function)\\s+${nombre}\\b|[({,]\\s*${nombre}\\s*[,})=:]|import[^;]*\\b${nombre}\\b`
    ).test(texto);
    if (!definida) faltan.push(`${path.relative(path.join(raiz, "..", ".."), archivo)}: ${nombre}()`);
  }
}

assert.deepStrictEqual(faltan, [], `Funciones llamadas pero no definidas en su archivo:\n${faltan.join("\n")}`);
console.log("🎉 Panel: toda función fetchX() llamada está definida o importada en su archivo.");
