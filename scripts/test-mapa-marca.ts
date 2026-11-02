/**
 * scripts/test-mapa-marca.ts
 *
 * Suite de F2o: configuración territorial del mapa desde la marca (regla 5).
 * Valida que sufijo, palabras de área y centro salgan de la marca y no del código.
 * Uso: NODE_ENV=test npx tsx scripts/test-mapa-marca.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const raiz = path.join(__dirname, "..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

const configManager = require("../services/configManager");
const geo = require("../services/geocodingService");
const { validarConfigMapa } = require("../services/configValidators");
const publicController = require("../controllers/publicController");

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
  console.log("================================================================================");
  console.log("🗺️ SUITE DE PRUEBAS: CONFIGURACIÓN TERRITORIAL DEL MAPA POR MARCA (F2o)");
  console.log("================================================================================\n");

  await prueba("1. Sufijo y regex se derivan de la marca activa (VentiMax)", () => {
    const sufijo = geo.getSufijoUbicacion();
    assert.strictEqual(sufijo, ", Caracas, Venezuela");

    const rx = geo.getAreaRegex();
    assert.ok(rx instanceof RegExp);
    assert.ok(rx.test("Zona de Caracas"));
    assert.ok(rx.test("Envío a Miranda"));
    assert.ok(rx.test("Todo en Venezuela"));
    assert.ok(!rx.test("Av. Bolívar"));

    const querySinArea = geo.construirQueryBusqueda("Av. Bolívar");
    assert.strictEqual(querySinArea, "Av. Bolívar, Caracas, Venezuela");

    const queryConArea = geo.construirQueryBusqueda("Chacao, Caracas");
    assert.strictEqual(queryConArea, "Chacao, Caracas");
  });

  await prueba("2. GET /api/public/marca expone bloque mapa en su lista blanca", async () => {
    const { res, out } = mockRes();
    await publicController.getMarca({} as any, res);
    assert.strictEqual(out.status, 200);

    assert.ok(out.json.mapa, "debe contener el bloque mapa");
    assert.strictEqual(out.json.mapa.ciudad, "Caracas");
    assert.strictEqual(out.json.mapa.pais, "Venezuela");
    assert.strictEqual(out.json.mapa.centro.lat, 10.491);
    assert.strictEqual(out.json.mapa.centro.lng, -66.885);
    assert.deepStrictEqual(out.json.mapa.palabrasArea, ["caracas", "venezuela", "miranda"]);
  });

  await prueba("3. Otra marca de prueba cambia el resultado sin alterar el código", () => {
    const origGet = configManager.get;
    try {
      configManager.get = (key: string) => {
        if (key === "settings.mapa") {
          return {
            ciudad: "Valencia",
            pais: "Venezuela",
            centro: { lat: 10.162, lng: -67.997 },
            palabrasArea: ["valencia", "carabobo"],
          };
        }
        return origGet.call(configManager, key);
      };

      assert.strictEqual(geo.getSufijoUbicacion(), ", Valencia, Venezuela");
      assert.strictEqual(geo.construirQueryBusqueda("Av. Cedeño"), "Av. Cedeño, Valencia, Venezuela");
      assert.strictEqual(geo.construirQueryBusqueda("Naguanagua, Carabobo"), "Naguanagua, Carabobo");
      const rx = geo.getAreaRegex();
      assert.ok(rx.test("Centro de Valencia"));
      assert.ok(!rx.test("Caracas"));

      // Marca internacional (ej. Bogotá / Colombia)
      configManager.get = (key: string) => {
        if (key === "settings.mapa") {
          return {
            ciudad: "Bogotá",
            pais: "Colombia",
            centro: { lat: 4.711, lng: -74.072 },
            palabrasArea: ["bogota", "colombia"],
          };
        }
        return origGet.call(configManager, key);
      };

      assert.strictEqual(geo.getSufijoUbicacion(), ", Bogotá, Colombia");
      assert.strictEqual(geo.construirQueryBusqueda("Carrera 7"), "Carrera 7, Bogotá, Colombia");
    } finally {
      configManager.get = origGet;
    }
  });

  await prueba("4. Texto con caracteres especiales de regex no rompe la construcción ni la búsqueda", () => {
    const origGet = configManager.get;
    try {
      configManager.get = (key: string) => {
        if (key === "settings.mapa") {
          return {
            ciudad: "Sector (Norte)+",
            pais: "País [Demo]",
            centro: { lat: 0, lng: 0 },
            palabrasArea: ["sector (norte)+", "calle.10", "zona [A]"],
          };
        }
        return origGet.call(configManager, key);
      };

      const rx = geo.getAreaRegex();
      assert.ok(rx instanceof RegExp);
      // Coincidencia exacta de caracteres escapados
      assert.ok(rx.test("Entrega en sector (norte)+"));
      assert.ok(rx.test("En la calle.10 principal"));
      assert.ok(rx.test("Punto en zona [A]"));
      // '.' no debe actuar como comodín regex
      assert.ok(!rx.test("calleX10"));

      assert.strictEqual(geo.construirQueryBusqueda("sector (norte)+"), "sector (norte)+");
      assert.strictEqual(geo.construirQueryBusqueda("avenida 1"), "avenida 1, Sector (Norte)+, País [Demo]");
    } finally {
      configManager.get = origGet;
    }
  });

  await prueba("5. Si falta el bloque mapa, usar solo el país y no agregar ciudad", () => {
    const origGet = configManager.get;
    try {
      configManager.get = (key: string) => {
        if (key === "settings.mapa") return undefined;
        return origGet.call(configManager, key);
      };

      assert.strictEqual(geo.getSufijoUbicacion(), ", Venezuela");
      assert.strictEqual(geo.construirQueryBusqueda("Av. Principal"), "Av. Principal, Venezuela");
      assert.strictEqual(geo.construirQueryBusqueda("En Venezuela"), "En Venezuela");
    } finally {
      configManager.get = origGet;
    }
  });

  await prueba("6. Validador de bloque mapa (validarConfigMapa)", () => {
    const valido = validarConfigMapa({
      ciudad: "Caracas",
      pais: "Venezuela",
      centro: { lat: 10.491, lng: -66.885 },
      palabrasArea: ["caracas", "venezuela"],
    });
    assert.strictEqual(valido.ok, true);

    assert.strictEqual(validarConfigMapa(null).ok, false);
    assert.strictEqual(validarConfigMapa({ ciudad: 123 }).ok, false);
    assert.strictEqual(validarConfigMapa({ ciudad: "C", pais: 123 }).ok, false);
    assert.strictEqual(validarConfigMapa({ ciudad: "C", pais: "P", centro: "invalido" }).ok, false);
    assert.strictEqual(validarConfigMapa({ ciudad: "C", pais: "P", centro: { lat: 10 } }).ok, false);
    assert.strictEqual(validarConfigMapa({ ciudad: "C", pais: "P", centro: { lat: 10, lng: 20 }, palabrasArea: "no-array" }).ok, false);
  });

  await prueba("7. grep de 'Caracas' en catalogo/js/mapa.js y services/geocodingService.ts da 0 coincidencias", () => {
    const mapaJs = leer("catalogo/js/mapa.js");
    const geoTs = leer("services/geocodingService.ts");

    const coincidenciasMapa = mapaJs.match(/caracas/i) || [];
    const coincidenciasGeo = geoTs.match(/caracas/i) || [];

    assert.strictEqual(coincidenciasMapa.length, 0, "catalogo/js/mapa.js no debe contener la palabra Caracas");
    assert.strictEqual(coincidenciasGeo.length, 0, "services/geocodingService.ts no debe contener la palabra Caracas");
  });

  await prueba("8. /api/public/marca: centro inválido o fuera de rango da centro null, nunca 0,0", async () => {
    const origGet = configManager.get;
    const casos: any[] = [
      undefined, null, "x", {}, { lat: 10 }, { lat: "abc", lng: 5 },
      { lat: null, lng: null }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 },
    ];
    try {
      for (const centro of casos) {
        configManager.get = (key: string) =>
          key === "settings.mapa"
            ? { ciudad: "C", pais: "P", centro, palabrasArea: [] }
            : origGet.call(configManager, key);
        const { res, out } = mockRes();
        await publicController.getMarca({} as any, res);
        assert.strictEqual(out.status, 200);
        assert.strictEqual(out.json.mapa.centro, null, `centro ${JSON.stringify(centro)} debe ser null`);
      }
    } finally {
      configManager.get = origGet;
    }
  });

  console.log(`\n🎉 F2o: ${n}/8 pruebas pasaron exitosamente.`);
})().catch((e) => {
  console.error("❌ Error en suite test-mapa-marca:", e);
  process.exit(1);
});
