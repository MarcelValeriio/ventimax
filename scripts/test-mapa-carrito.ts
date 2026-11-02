/**
 * scripts/test-mapa-carrito.ts
 *
 * Suite de F2d: mapa con buscador en el carrito (OpenStreetMap + Leaflet copiado al repo).
 * Uso: NODE_ENV=test npx tsx scripts/test-mapa-carrito.ts
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const raiz = path.join(__dirname, "..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

function mockRes() {
  const out: any = { status: 200, json: null };
  const res: any = {
    status: (s: number) => ((out.status = s), res),
    json: (d: any) => ((out.json = d), res),
    setHeader: () => {},
  };
  return { res, out };
}

let n = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  console.log(`  ✅ ${nombre}`);
}

(async () => {
  const ctrl = require("../controllers/publicController");
  const geo = require("../services/geocodingService");

  await prueba("Leaflet vendorizado y cargado sin CDN", () => {
    assert.ok(fs.existsSync(path.join(raiz, "catalogo/lib/leaflet/leaflet.js")));
    const html = leer("catalogo/index.html");
    assert.ok(html.includes("lib/leaflet/leaflet.js"));
    assert.ok(!/https?:\/\/[^"']*leaflet/i.test(html), "Leaflet no debe venir de CDN");
  });

  await prueba("mapa.js sin innerHTML ni scripts en línea", () => {
    const js = leer("catalogo/js/mapa.js");
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(js));
    assert.ok(!/\son[a-z]+=/.test(js));
  });

  await prueba("CSP permite solo los tiles de OSM como imagen externa del mapa", () => {
    const y = leer("render.yaml");
    assert.ok(y.includes("https://*.tile.openstreetmap.org"));
    assert.ok(!/script-src[^;]*unsafe-inline/.test(y));
  });

  await prueba("GET /geocodificar valida coordenadas", async () => {
    for (const q of [{}, { lat: "x", lon: "1" }, { lat: "10" }]) {
      const { res, out } = mockRes();
      await ctrl.getGeocodificar({ query: q }, res);
      assert.strictEqual(out.status, 400);
    }
    assert.strictEqual(await geo.reverseGeocode(95, 0), "");
    assert.strictEqual(await geo.reverseGeocode(0, 190), "");
  });

  await prueba("GET /buscar-direccion: consulta corta devuelve vacío sin llamar a OSM", async () => {
    const { res, out } = mockRes();
    await ctrl.getBuscarDireccion({ query: { q: "ab" } }, res);
    assert.strictEqual(out.status, 200);
    assert.deepStrictEqual(out.json.resultados, []);
  });

  await prueba("Rutas del mapa con límite propio de peticiones", () => {
    const r = leer("routes/publicRoutes.ts");
    assert.ok(/"\/geocodificar", geocodificacionLimiter/.test(r));
    assert.ok(/"\/buscar-direccion", geocodificacionLimiter/.test(r));
  });

  await prueba("Consulta de búsqueda acotada a 120 caracteres", () => {
    assert.ok(/\.slice\(0, 120\)/.test(leer("controllers/publicController.ts")));
  });

  console.log(`\n🎉 F2d: ${n}/7 pruebas pasaron.`);
})().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
