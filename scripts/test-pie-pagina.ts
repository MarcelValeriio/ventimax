/**
 * scripts/test-pie-pagina.ts
 *
 * Suite de pruebas para el pie de página (footer) de la tienda (F2l).
 * Uso: NODE_ENV=test npx tsx scripts/test-pie-pagina.ts
 *
 * Cubre:
 * 1. Salida pública en GET /api/public/info (lista blanca estricta con contacto, legal, retiro).
 * 2. Protección estricta: nunca fuga ADMIN_PHONE_NUMBER en contacto.whatsapp.
 * 3. Campos vacíos en Datos del negocio devuelven strings vacíos limpios (nunca undefined/null).
 * 4. Punto de retiro: null si no hay método activo tipo "retiro", y detalles completos si está activo.
 * 5. GET /api/public/marca expone businessDescription en su lista blanca estricta.
 */
import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const publicController = require("../controllers/publicController");

function mockRes() {
  const out: { status: number; json: any; headers: Record<string, string> } = {
    status: 200,
    json: null,
    headers: {},
  };
  const res: any = {
    status: (s: number) => {
      out.status = s;
      return res;
    },
    json: (d: any) => {
      out.json = d;
      return res;
    },
    setHeader: (k: string, v: string) => {
      out.headers[k] = v;
    },
  };
  return { res, out };
}

function resetDb() {
  const data = dbLocal.read();
  data.metodosEnvio = [];
  data.settings = {};
  dbLocal.write(data);
}

async function runTests() {
  console.log("================================================================================");
  console.log("🦶 SUITE DE PRUEBAS: PIE DE PÁGINA (FOOTER) Y ENDPOINTS PÚBLICOS (F2l)");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  console.log("\n▶ Test 1: GET /api/public/info lista blanca estricta con contacto, legal, retiro...");
  {
    resetDb();
    const { res, out } = mockRes();
    await publicController.getInfo({} as any, res);
    assert.strictEqual(out.status, 200);

    const keysEsperadas = [
      "preguntas",
      "pagos",
      "envios",
      "horario",
      "banner",
      "bannerLateral",
      "slider",
      "aliados",
      "instagram",
      "contacto",
      "legal",
      "retiro",
    ];
    assert.deepStrictEqual(Object.keys(out.json), keysEsperadas, "Las claves de primer nivel deben coincidir exactamente");

    // Contacto
    assert.ok(out.json.contacto, "info.contacto debe existir");
    assert.deepStrictEqual(
      Object.keys(out.json.contacto).sort(),
      ["email", "instagram", "website", "whatsapp"].sort(),
      "info.contacto debe tener solo { email, instagram, website, whatsapp }"
    );
    assert.strictEqual(typeof out.json.contacto.whatsapp, "string");
    assert.strictEqual(typeof out.json.contacto.email, "string");
    assert.strictEqual(typeof out.json.contacto.website, "string");
    assert.strictEqual(typeof out.json.contacto.instagram, "string");

    // Legal
    assert.ok(out.json.legal, "info.legal debe existir");
    assert.deepStrictEqual(
      Object.keys(out.json.legal).sort(),
      ["razonSocial", "rif"].sort(),
      "info.legal debe tener solo { razonSocial, rif }"
    );
    assert.strictEqual(typeof out.json.legal.razonSocial, "string");
    assert.strictEqual(typeof out.json.legal.rif, "string");

    console.log("  ✅ Test 1 superado (lista blanca estricta en info)");
  }

  // ---------------------------------------------------------------------------
  console.log("\n▶ Test 2: Protección estricta: nunca fuga ADMIN_PHONE_NUMBER en contacto.whatsapp...");
  {
    resetDb();
    const envOriginal = {
      wa: process.env.WHATSAPP_PHONE,
      admin: process.env.ADMIN_PHONE_NUMBER,
    };

    try {
      delete process.env.WHATSAPP_PHONE;
      process.env.ADMIN_PHONE_NUMBER = "584149999999";

      const { res, out } = mockRes();
      await publicController.getInfo({} as any, res);
      assert.strictEqual(out.status, 200);

      // contacto.whatsapp NUNCA debe contener el teléfono del administrador
      assert.strictEqual(
        out.json.contacto.whatsapp,
        "",
        "contacto.whatsapp debe ser string vacío cuando no hay número público configurado, nunca ADMIN_PHONE_NUMBER"
      );
    } finally {
      if (envOriginal.wa !== undefined) process.env.WHATSAPP_PHONE = envOriginal.wa;
      else delete process.env.WHATSAPP_PHONE;
      if (envOriginal.admin !== undefined) process.env.ADMIN_PHONE_NUMBER = envOriginal.admin;
      else delete process.env.ADMIN_PHONE_NUMBER;
    }

    console.log("  ✅ Test 2 superado (sin fuga de ADMIN_PHONE_NUMBER)");
  }

  // ---------------------------------------------------------------------------
  console.log("\n▶ Test 3: Manejo de campos vacíos en Datos del negocio...");
  {
    resetDb();
    const { res, out } = mockRes();
    await publicController.getInfo({} as any, res);
    assert.strictEqual(out.status, 200);

    // Con datos por defecto/vacíos
    assert.strictEqual(out.json.contacto.email, "");
    assert.strictEqual(out.json.contacto.website, "");
    assert.strictEqual(out.json.legal.razonSocial, "");
    assert.strictEqual(out.json.legal.rif, "");

    console.log("  ✅ Test 3 superado (campos vacíos son strings limpios)");
  }

  // ---------------------------------------------------------------------------
  console.log("\n▶ Test 4: Punto de retiro (null sin método activo y resolución con método activo)...");
  {
    resetDb();

    // 4a: Sin métodos de envío en BD -> retiro null
    {
      const { res, out } = mockRes();
      await publicController.getInfo({} as any, res);
      assert.strictEqual(out.json.retiro, null, "Sin método tipo retiro debe ser null");
    }

    // 4b: Con método de envío no retiro (e.g. delivery_local) -> retiro null
    const MetodoEnvio = dbLocal.getMetodoEnvioModel();
    await MetodoEnvio.create({
      _id: "env-delivery-1",
      nombre: "Delivery Caracas",
      tipo: "delivery_local",
      activo: true,
      costo: 5,
    });
    {
      const { res, out } = mockRes();
      await publicController.getInfo({} as any, res);
      assert.strictEqual(out.json.retiro, null, "Solo métodos de tipo 'retiro' activan el bloque de retiro");
    }

    // 4c: Con método tipo retiro activo -> detalles completos
    await MetodoEnvio.create({
      _id: "env-retiro-1",
      nombre: "Retiro en tienda Catia",
      tipo: "retiro",
      activo: true,
      direccion: "Av. Sucre de Catia, Gato Negro",
      horario: "Lunes a Viernes 9:00 - 17:00",
    });
    {
      const { res, out } = mockRes();
      await publicController.getInfo({} as any, res);
      assert.ok(out.json.retiro, "Debe retornar el objeto de retiro si hay método activo");
      assert.strictEqual(out.json.retiro.nombre, "Retiro en tienda Catia");
      assert.strictEqual(out.json.retiro.direccion, "Av. Sucre de Catia, Gato Negro");
      assert.strictEqual(out.json.retiro.horario, "Lunes a Viernes 9:00 - 17:00");
    }

    // 4d: Si el método de retiro se desactiva -> vuelve a null
    const dataLocal = dbLocal.read();
    const metodoRetiroEnDb = dataLocal.metodosEnvio.find((m: any) => m._id === "env-retiro-1");
    if (metodoRetiroEnDb) metodoRetiroEnDb.activo = false;
    dbLocal.write(dataLocal);

    {
      const { res, out } = mockRes();
      await publicController.getInfo({} as any, res);
      assert.strictEqual(out.json.retiro, null, "Método de retiro inactivo debe resultar en retiro === null");
    }

    console.log("  ✅ Test 4 superado (retiro null sin activo y resolución con activo)");
  }

  // ---------------------------------------------------------------------------
  console.log("\n▶ Test 5: GET /api/public/marca expone businessDescription...");
  {
    const { res, out } = mockRes();
    await publicController.getMarca({} as any, res);
    assert.strictEqual(out.status, 200);

    const keysEsperadas = ["ayuda", "brandName", "businessDescription", "descripcionAliados", "mapa", "theme"].sort();
    assert.deepStrictEqual(Object.keys(out.json).sort(), keysEsperadas, "Lista blanca estricta de /api/public/marca");

    assert.strictEqual(typeof out.json.businessDescription, "string");
    assert.ok(
      out.json.businessDescription.length > 0,
      "businessDescription debe venir con el texto de configuración de ventimax"
    );
    assert.ok(
      out.json.businessDescription.includes("ventiladores"),
      "businessDescription debe contener la descripción del negocio"
    );

    console.log("  ✅ Test 5 superado (businessDescription presente en /api/public/marca)");
  }

  console.log("\n================================================================================");
  console.log("🎉 TODOS LOS TESTS DE PIE DE PÁGINA (F2l) PASARON EXITOSAMENTE (5/5)");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("❌ Falló la suite test-pie-pagina.ts:", err);
  process.exit(1);
});
