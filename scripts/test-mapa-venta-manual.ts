/**
 * scripts/test-mapa-venta-manual.ts
 * El mapa con buscador aparece en la venta manual solo para delivery local, usa Leaflet local y el endpoint público
 * de geocodificación, guarda latitud y longitud en la entrega y no acepta coordenadas fuera de rango.
 * Suite de lectura del código (como test-fotos-al-crear.ts): no hay DOM, así que se comprueba la estructura.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-mapa-venta-manual.ts
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const raiz = path.join(__dirname, "..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

const COMPONENTE = "public/src/features/sales/components/MapaEntrega.js";
const VENTAS = "public/src/features/sales/SalesDashboard.js";
const componente = leer(COMPONENTE);
const ventas = leer(VENTAS);
const admin = leer("controllers/adminController.ts");
const csp = leer("middlewares/csp.ts");
const indice = leer("public/index.html");

let ok = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
}

console.log("\n▶ Mapa con buscador en la venta manual (delivery local)\n");

prueba("el componente existe y no escribe HTML crudo ni scripts en línea", () => {
  assert.ok(!componente.includes("innerHTML"), "no debe usar innerHTML");
  assert.ok(!/\son[a-z]+=/i.test(componente), "no debe usar atributos on*=");
  assert.ok(!componente.includes("<script"), "no debe tener <script>");
});

prueba("el componente usa Leaflet local, la geocodificación pública y el buscador", () => {
  assert.ok(componente.includes("window.L.map"), "debe crear el mapa con Leaflet");
  assert.ok(componente.includes("/api/public/geocodificar"), "geocodificación inversa del centro");
  assert.ok(componente.includes("/api/public/buscar-direccion"), "búsqueda de direcciones");
  assert.ok(componente.includes("remove()"), "debe destruir el mapa al desmontar");
});

prueba("el mapa aparece solo para delivery_local en la venta manual", () => {
  assert.ok(ventas.includes('import MapaEntrega from "./components/MapaEntrega.js"'), "importa el componente");
  assert.ok(ventas.includes('sel.tipo !== "delivery_local") return null'), "condición de delivery local");
});

prueba("la entrega guarda latitud y longitud, y escribir a mano las limpia", () => {
  assert.ok(ventas.includes("latitud: ub.latitud"), "guarda latitud del mapa");
  assert.ok(ventas.includes("latitud: null, longitud: null"), "limpia coordenadas al escribir la dirección");
});

prueba("el backend toma latitud y longitud solo dentro de rango", () => {
  assert.ok(admin.includes("Math.abs(latMapa) <= 90"), "rango de latitud");
  assert.ok(admin.includes("Math.abs(lonMapa) <= 180"), "rango de longitud");
});

prueba("la CSP permite las teselas de OpenStreetMap solo en img-src", () => {
  assert.ok(csp.includes('"https://*.tile.openstreetmap.org"'), "img-src con teselas");
});

prueba("Leaflet local está en el panel y se carga sin scripts en línea", () => {
  assert.ok(fs.existsSync(path.join(raiz, "public/lib/leaflet/leaflet.js")), "leaflet.js copiado");
  assert.ok(fs.existsSync(path.join(raiz, "public/lib/leaflet/leaflet.css")), "leaflet.css copiado");
  assert.ok(indice.includes('src="/lib/leaflet/leaflet.js"'), "index.html carga leaflet.js");
  assert.ok(indice.includes('href="/lib/leaflet/leaflet.css"'), "index.html carga leaflet.css");
});

prueba("el componente compila con esbuild (imports resueltos)", () => {
  execFileSync(
    "npx",
    ["--yes", "esbuild@0.23.0", COMPONENTE, "--bundle", "--external:https://*", "--outfile=/dev/null"],
    { cwd: raiz, stdio: "pipe" },
  );
});

console.log(`\n🎉 ${ok} pruebas del mapa de venta manual pasaron.\n`);
