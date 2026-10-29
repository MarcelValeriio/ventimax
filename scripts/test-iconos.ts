/**
 * scripts/test-iconos.ts — M-4
 * Tienda y panel usan solo íconos de Lucide copiados al repo (scripts/vendor-lucide.js). Si el código nombra un
 * ícono que no está en el archivo generado, el ícono no se dibuja (el panel solo deja un aviso en la consola).
 * Esta suite lo detecta antes de publicar, y comprueba que no vuelva Font Awesome.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-iconos.ts
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const raiz = path.join(__dirname, "..");

function archivosJs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const ruta = path.join(dir, d.name);
    if (d.isDirectory()) return archivosJs(ruta);
    return d.name.endsWith(".js") ? [ruta] : [];
  });
}

/** Claves del objeto LUCIDE de un archivo generado (sin ejecutarlo: es un módulo ES). */
function iconosDisponibles(archivo: string): Set<string> {
  const texto = fs.readFileSync(archivo, "utf8");
  return new Set([...texto.matchAll(/^\s{2}"([a-z0-9-]+)":/gm)].map((m) => m[1]));
}

let ok = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
}

console.log("================================================================================");
console.log("🎨 SUITE DE PRUEBAS: ÍCONOS DE LUCIDE (M-4)");
console.log("================================================================================");

prueba("Panel: cada ícono que nombra el código existe en public/src/lib/lucide.js", () => {
  const disponibles = iconosDisponibles(path.join(raiz, "public/src/lib/lucide.js"));
  const faltan: string[] = [];
  for (const archivo of archivosJs(path.join(raiz, "public/src"))) {
    if (archivo.endsWith(path.join("lib", "lucide.js"))) continue;
    const texto = fs.readFileSync(archivo, "utf8");
    // e(Icono, { nombre: "x" }), nombre: cond ? "a" : "b", iconoHtml("x") e íconos guardados en datos (icon: "x")
    const usos = [
      ...texto.matchAll(/\bnombre:\s*"([a-z0-9-]+)"/g),
      ...texto.matchAll(/\bnombre:\s*[^,}\n]*?\?\s*"([a-z0-9-]+)"\s*:\s*"([a-z0-9-]+)"/g),
      ...texto.matchAll(/\biconoHtml\(\s*"([a-z0-9-]+)"/g),
      ...texto.matchAll(/\bicon:\s*"([a-z0-9-]+)"/g),
    ].flatMap((m) => m.slice(1).filter(Boolean));
    for (const n of usos) {
      if (!disponibles.has(n)) faltan.push(`${path.relative(raiz, archivo)}: ${n}`);
    }
  }
  assert.deepStrictEqual(faltan, [], `Íconos sin datos en lucide.js (regenerar con scripts/vendor-lucide.js):\n${faltan.join("\n")}`);
});

prueba("Panel: sin Font Awesome", () => {
  const html = fs.readFileSync(path.join(raiz, "public/index.html"), "utf8");
  assert.ok(!/font-awesome|fontawesome/i.test(html), "public/index.html no carga Font Awesome");
  for (const archivo of archivosJs(path.join(raiz, "public/src"))) {
    const texto = fs.readFileSync(archivo, "utf8");
    assert.ok(!/["'`\s](fas|fab|far) fa-[a-z]/.test(texto), `${path.relative(raiz, archivo)} usa clases de Font Awesome`);
  }
});

prueba("Tienda: cada ícono de iconos.js existe en catalogo/js/lucide.js", () => {
  const disponibles = iconosDisponibles(path.join(raiz, "catalogo/js/lucide.js"));
  const iconos = fs.readFileSync(path.join(raiz, "catalogo/js/iconos.js"), "utf8");
  const bloque = iconos.slice(iconos.indexOf("const NOMBRES"), iconos.indexOf("};", iconos.indexOf("const NOMBRES")));
  const nombres = [...bloque.matchAll(/:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(nombres.length > 0);
  for (const n of nombres) assert.ok(disponibles.has(n), `catalogo/js/lucide.js no tiene "${n}"`);
});

prueba("Logos de canales del panel: solo las marcas previstas", () => {
  const icono = fs.readFileSync(path.join(raiz, "public/src/components/Icono.js"), "utf8");
  for (const marca of ["whatsapp", "instagram", "messenger", "meta"]) {
    assert.ok(new RegExp(`\\b${marca}:\\s*"M`).test(icono), `falta el logo de ${marca}`);
  }
});

console.log("================================================================================");
console.log(`🎉 ${ok} pruebas de íconos superadas.`);
console.log("================================================================================");
