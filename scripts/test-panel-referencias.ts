/**
 * scripts/test-panel-referencias.ts
 * esbuild --bundle comprueba los imports del panel, pero no detecta una llamada a una función que no existe:
 * el error aparece recién en el navegador (p. ej. "fetchProducts is not defined" al subir la foto de un producto,
 * 2026-10-30, o "triggerCambiarImagen is not defined" en el slider de portada, 2026-11-01).
 * Esta suite analiza cada archivo de public/src con acorn y comprueba que TODA función llamada directamente
 * (`algo(...)`, no `obj.algo(...)`) esté declarada en el archivo (función, variable, parámetro, desestructuración,
 * import, clase) o sea un global conocido del navegador/JavaScript. La revisión es por archivo, no por ámbito.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-panel-referencias.ts
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
const acorn = require("acorn");

const raiz = path.join(__dirname, "..", "public", "src");
const base = path.join(raiz, "..", "..");

// Globales que el panel usa sin declararlos (JavaScript, navegador y librerías cargadas por <script>)
const GLOBALES = new Set([
  "Array", "Boolean", "Date", "Error", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set",
  "String", "Symbol", "URL", "URLSearchParams", "FormData", "Blob", "File", "FileReader", "Image", "Audio",
  "Intl", "Notification", "Event", "CustomEvent", "AbortController", "WebSocket", "XMLHttpRequest", "Uint8Array",
  "ResizeObserver", "IntersectionObserver", "MutationObserver", "Proxy", "Reflect", "BigInt", "WeakMap", "WeakSet",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame",
  "fetch", "alert", "confirm", "prompt", "atob", "btoa", "structuredClone", "queueMicrotask", "matchMedia",
  "getComputedStyle", "io", "html2pdf", "tailwind", "Chart",
]);

function archivosJs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const ruta = path.join(dir, d.name);
    if (d.isDirectory()) return archivosJs(ruta);
    return d.name.endsWith(".js") ? [ruta] : [];
  });
}

function recorrer(nodo: any, visita: (n: any) => void) {
  if (!nodo || typeof nodo.type !== "string") return;
  visita(nodo);
  for (const clave of Object.keys(nodo)) {
    const hijo = nodo[clave];
    if (Array.isArray(hijo)) hijo.forEach((h) => recorrer(h, visita));
    else if (hijo && typeof hijo === "object") recorrer(hijo, visita);
  }
}

function agregarPatron(p: any, destino: Set<string>) {
  if (!p) return;
  switch (p.type) {
    case "Identifier": destino.add(p.name); break;
    case "ObjectPattern": p.properties.forEach((q: any) => agregarPatron(q.type === "RestElement" ? q.argument : q.value, destino)); break;
    case "ArrayPattern": p.elements.forEach((q: any) => agregarPatron(q, destino)); break;
    case "RestElement": agregarPatron(p.argument, destino); break;
    case "AssignmentPattern": agregarPatron(p.left, destino); break;
  }
}

const faltan: string[] = [];
let archivos = 0;
for (const archivo of archivosJs(raiz)) {
  archivos++;
  const texto = fs.readFileSync(archivo, "utf8");
  let ast: any;
  try {
    ast = acorn.parse(texto, { ecmaVersion: "latest", sourceType: "module" });
  } catch (err: any) {
    faltan.push(`${path.relative(base, archivo)}: no se pudo analizar (${err.message})`);
    continue;
  }
  const declarados = new Set<string>();
  const llamadas = new Set<string>();
  recorrer(ast, (n) => {
    if ((n.type === "FunctionDeclaration" || n.type === "ClassDeclaration" || n.type === "FunctionExpression" || n.type === "ClassExpression") && n.id) declarados.add(n.id.name);
    if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") n.params.forEach((p: any) => agregarPatron(p, declarados));
    if (n.type === "VariableDeclarator") agregarPatron(n.id, declarados);
    if (n.type === "CatchClause") agregarPatron(n.param, declarados);
    if (n.type === "ImportDefaultSpecifier" || n.type === "ImportNamespaceSpecifier" || n.type === "ImportSpecifier") declarados.add(n.local.name);
    if (n.type === "CallExpression" && n.callee.type === "Identifier") llamadas.add(n.callee.name);
  });
  for (const nombre of llamadas) {
    if (declarados.has(nombre) || GLOBALES.has(nombre)) continue;
    faltan.push(`${path.relative(base, archivo)}: ${nombre}()`);
  }
}

assert.ok(archivos > 20, "No se encontraron los archivos del panel");
assert.deepStrictEqual(faltan, [], `Funciones llamadas pero no definidas en su archivo:\n${faltan.join("\n")}`);
console.log(`🎉 Panel: toda función llamada está definida, importada o es un global conocido (${archivos} archivos).`);
