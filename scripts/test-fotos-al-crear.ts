/**
 * scripts/test-fotos-al-crear.ts — F1-2b
 * El panel deja elegir fotos al CREAR un producto: se guardan en `fotosPendientes` y se suben, una por una, después
 * del POST (que no se repite). Si alguna falla, el producto ya existe y el modal pasa a edición.
 * Suite de lectura del código del panel (como test-iconos.ts): no hay DOM, así que se comprueba la estructura.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-fotos-al-crear.ts
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const raiz = path.join(__dirname, "..");
const ARCHIVO = path.join(raiz, "public/src/features/inventory/components/ProductTab.js");
const texto = fs.readFileSync(ARCHIVO, "utf8");

let ok = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
}

/** Cuerpo de una función `const nombre = ...` hasta la siguiente `const handleX` / `const renderX` de primer nivel. */
function bloque(inicio: string, fin: string): string {
  const i = texto.indexOf(inicio);
  const f = texto.indexOf(fin, i + inicio.length);
  assert.ok(i >= 0 && f > i, `no se encuentra el bloque ${inicio}`);
  return texto.slice(i, f);
}

console.log("================================================================================");
console.log("📷 SUITE DE PRUEBAS: FOTOS AL CREAR PRODUCTO (F1-2b)");
console.log("================================================================================");

prueba("esbuild --bundle de ProductTab.js resuelve todos los imports", () => {
  execFileSync(
    "npx",
    ["--yes", "esbuild@0.23.0", ARCHIVO, "--bundle", "--external:https://*", "--outfile=/dev/null", "--log-level=error"],
    { stdio: "pipe", cwd: raiz }
  );
});

prueba("ya no existe el texto 'Guarda el producto para añadir fotos'", () => {
  assert.ok(!texto.includes("Guarda el producto para añadir fotos"));
});

prueba("existe el estado fotosPendientes (array de File, sin subir al elegir)", () => {
  assert.match(texto, /const \[fotosPendientes, setFotosPendientes\] = useState\(\[\]\)/);
  const seleccion = bloque("const handleSeleccionarFotosNuevas", "const handleQuitarFotoPendiente");
  assert.ok(!/apiClient\.post/.test(seleccion), "elegir una foto al crear no la sube todavía");
  assert.match(seleccion, /setFotosPendientes\(/);
});

prueba("vista previa con URL.createObjectURL y liberación con URL.revokeObjectURL", () => {
  assert.ok(texto.includes("URL.createObjectURL("), "falta createObjectURL");
  assert.ok(texto.includes("URL.revokeObjectURL("), "falta revokeObjectURL");
  const efecto = bloque("// Vista previa de las fotos pendientes", "const handleOpenModal");
  assert.match(efecto, /return \(\) => urls\.forEach\(\(u\) => URL\.revokeObjectURL\(u\)\)/, "el cleanup del efecto libera las URL");
});

prueba("validación en el cliente: tipo JPG/PNG/WebP y tamaño de 5 MB", () => {
  assert.match(texto, /FORMATOS_FOTO = \["image\/jpeg", "image\/png", "image\/webp"\]/);
  assert.match(texto, /MAX_BYTES_FOTO = 5 \* 1024 \* 1024/);
  const seleccion = bloque("const handleSeleccionarFotosNuevas", "const handleQuitarFotoPendiente");
  assert.ok(seleccion.includes("FORMATOS_FOTO.includes(file.type)"), "valida el tipo antes de aceptar");
  assert.ok(seleccion.includes("file.size > MAX_BYTES_FOTO"), "valida el tamaño antes de aceptar");
  assert.ok(seleccion.includes("MAX_FOTOS - fotosPendientes.length"), "respeta el máximo de 5 en total");
});

prueba("el selector usa el manejador de crear solo en modo crear", () => {
  assert.ok(
    texto.includes("onChange: editingProduct ? handleUploadImage : handleSeleccionarFotosNuevas"),
    "en edición sigue handleUploadImage (modo de edición de fotos sin cambios)"
  );
});

prueba("handleSave: el POST de creación va antes de subir las fotos y no se repite", () => {
  const guardar = bloque("const handleSave = async", "const handleDelete = async");
  const posPost = guardar.indexOf('apiClient.post("/api/admin/products", payload)');
  const posSubida = guardar.indexOf("subirFotosPendientes(creado)");
  assert.ok(posPost >= 0, "falta el POST de creación");
  assert.ok(posSubida > posPost, "las fotos se suben después del POST");
  assert.strictEqual(guardar.split('apiClient.post("/api/admin/products", payload)').length - 1, 1, "un solo POST de creación");

  const subida = bloque("const subirFotosPendientes = async", "const handleSave = async");
  assert.ok(!/apiClient\.post\(\s*[`"]\/api\/admin\/products[`"]/.test(subida), "el reintento de fotos no crea otro producto");
  assert.ok(subida.includes("`/api/admin/products/${creado.id}/imagenes`"), "sube a /imagenes del producto creado");
  assert.ok(subida.includes('data.append("imagen", file)'), "el campo del archivo es 'imagen'");
  assert.ok(/for \(const file of archivos\)/.test(subida), "las fotos se suben de una en una");
});

prueba("si alguna foto falla: modo edición del producto creado, sin segundo POST y con el motivo", () => {
  const subida = bloque("const subirFotosPendientes = async", "const handleSave = async");
  assert.ok(subida.includes("errores.push("), "junta los errores sin cortar la subida");
  assert.ok(subida.includes("setEditingProduct(ultimo)"), "pasa a modo edición del producto recién creado");
  assert.ok(subida.includes("setProductImages(ultimo.imagenes"), "muestra las fotos que sí subieron");
  assert.ok(subida.includes("setFormData((prev) => ({ ...prev, id: ultimo.id }))"), "el ID del formulario es el del producto creado");
  assert.ok(subida.includes("errores.join(\" \")"), "el toast lleva el motivo");
});

prueba("Guardar queda deshabilitado con 'Subiendo...' durante la subida", () => {
  assert.ok(texto.includes("disabled: subiendoFotos,"), "el botón Guardar usa subiendoFotos");
  assert.ok(texto.includes('subiendoFotos ? "Subiendo..." : "Guardar Cambios"'));
  assert.match(texto, /if \(conFotos\) setSubiendoFotos\(false\);/, "se libera en finally");
});

prueba("sin innerHTML, sin HTML dinámico ni scripts en línea", () => {
  assert.ok(!/innerHTML/.test(texto), "no usar innerHTML");
  assert.ok(!/dangerouslySetInnerHTML/.test(texto), "no usar dangerouslySetInnerHTML");
  assert.ok(!/<script/i.test(texto), "sin scripts en línea");
});

prueba("sin marca escrita en el código del panel", () => {
  for (const marca of ["VentiMax", "Fortunne", "Pachi", "Yuri"]) {
    assert.ok(!texto.includes(marca), `no debe aparecer '${marca}' en ProductTab.js`);
  }
});

prueba("la suite está registrada en ci.sh después de test-producto-admin-ampliado.ts", () => {
  const ci = fs.readFileSync(path.join(raiz, "scripts/ci.sh"), "utf8");
  const lineas = ci.split("\n").map((l) => l.trim());
  const i = lineas.indexOf("test-producto-admin-ampliado.ts");
  assert.ok(i >= 0, "falta test-producto-admin-ampliado.ts en SUITES");
  assert.strictEqual(lineas[i + 1], "test-fotos-al-crear.ts", "test-fotos-al-crear.ts va justo después");
});

console.log(`\n✅ ${ok} pruebas de fotos al crear pasaron.`);
