process.env.NODE_ENV = "test";

const assert = require("assert");
const { configStore, getConfig, setConfig, EDITABLE_KEYS, SECRET_KEYS } = require("../services/configStore");
const dbLocal = require("../services/dbLocal");

async function runTests() {
  console.log("🚀 Iniciando suite de pruebas unitarias para configStore...");

  // Inicializar estado limpio
  configStore.invalidateCache();

  // Test 1: Retorno de valor desde process.env cuando no existe en Setting
  console.log("▶ Test 1: Fallback a process.env...");
  process.env.ADMIN_PHONE_NUMBER = "584120000001";
  assert.strictEqual(
    getConfig("ADMIN_PHONE_NUMBER"),
    "584120000001",
    "Debe retornar el valor desde process.env si no está en Setting"
  );
  console.log("  ✅ Test 1 superado");

  // Test 2: Prioridad de Setting sobre process.env tras persistencia
  console.log("▶ Test 2: Prioridad de Setting sobre process.env...");
  await setConfig("ADMIN_PHONE_NUMBER", "584149999999");
  assert.strictEqual(
    getConfig("ADMIN_PHONE_NUMBER"),
    "584149999999",
    "Debe priorizar el valor en Setting sobre process.env"
  );
  console.log("  ✅ Test 2 superado");

  // Test 3: Invalidación y recarga en memoria
  console.log("▶ Test 3: Invalidación y recarga con init()...");
  configStore.invalidateCache();
  await configStore.init();
  assert.strictEqual(
    getConfig("ADMIN_PHONE_NUMBER"),
    "584149999999",
    "Debe recuperar el valor guardado en Setting tras init()"
  );
  console.log("  ✅ Test 3 superado");

  // Test 4: Comprobación de que clave inexistente retorna undefined sin lanzar
  console.log("▶ Test 4: Clave inexistente retorna undefined...");
  const inexistente = getConfig("CLAVE_QUE_NO_EXISTE_12345");
  assert.strictEqual(inexistente, undefined, "Debe retornar undefined para claves inexistentes");
  console.log("  ✅ Test 4 superado");

  // Test 5: Rechazo estricto de claves de secretos en modificaciones
  console.log("▶ Test 5: Rechazo de secretos en setConfig...");
  let secretoRechazado = false;
  try {
    await setConfig("WHATSAPP_TOKEN", "fake_token_attempt");
  } catch (err: any) {
    secretoRechazado = true;
    assert.match(err.message, /secreto/i);
  }
  assert.strictEqual(secretoRechazado, true, "setConfig debe arrojar excepción si se intenta editar un secreto");

  let claveDesconocidaRechazada = false;
  try {
    await setConfig("VARIABLE_RANDOM", "valor");
  } catch (err: any) {
    claveDesconocidaRechazada = true;
  }
  assert.strictEqual(claveDesconocidaRechazada, true, "setConfig debe arrojar excepción si la variable no es editable");
  console.log("  ✅ Test 5 superado");

  // Test 6: Alias legacy
  console.log("▶ Test 6: Soporte de alias legacy...");
  // WHATSAPP_PHONE -> ADMIN_PHONE_NUMBER
  assert.strictEqual(
    getConfig("WHATSAPP_PHONE"),
    "584149999999",
    "WHATSAPP_PHONE debe resolver a ADMIN_PHONE_NUMBER"
  );
  // PHONE_NUMBER_ID -> WHATSAPP_PHONE_NUMBER_ID
  // WHATSAPP_PHONE_NUMBER_ID es solo lectura en el panel: el alias se prueba con process.env
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1020304050";
  assert.strictEqual(
    getConfig("PHONE_NUMBER_ID"),
    "1020304050",
    "PHONE_NUMBER_ID debe resolver a WHATSAPP_PHONE_NUMBER_ID"
  );
  console.log("  ✅ Test 6 superado");

  // Test 7: getAllConfig no expone valores reales de secretos
  console.log("▶ Test 7: getAllConfig y protección de secretos...");
  process.env.DEEPSEEK_API_KEY = "sk-super-secret-key-real";
  const allConfig = await configStore.getAllConfig();

  assert.ok(allConfig.editables, "Debe incluir objeto editables");
  assert.ok(allConfig.lectura, "Debe incluir objeto lectura");
  assert.deepStrictEqual(
    Object.keys(allConfig.editables).sort(),
    [...EDITABLE_KEYS].sort(),
    "editables debe contener exactamente EDITABLE_KEYS"
  );
  assert.ok("WHATSAPP_PHONE_NUMBER_ID" in allConfig.lectura, "IDs de Meta deben aparecer como lectura");
  assert.ok(!("WHATSAPP_PHONE_NUMBER_ID" in allConfig.editables), "IDs de Meta no deben ser editables");
  await assert.rejects(
    () => setConfig("WHATSAPP_PHONE_NUMBER_ID", "999"),
    /no está en la lista de variables editables|secreto/,
    "setConfig debe rechazar claves de solo lectura"
  );
  assert.ok(allConfig.estadoSecretos, "Debe incluir objeto estadoSecretos");
  assert.strictEqual(allConfig.estadoSecretos.DEEPSEEK_API_KEY, true, "DEEPSEEK_API_KEY debe indicar true");

  // Asegurar que ningún valor de secreto se filtre como string
  for (const [key, val] of Object.entries(allConfig.estadoSecretos)) {
    assert.strictEqual(typeof val, "boolean", `El estado del secreto ${key} debe ser exclusivamente booleano`);
  }
  assert.strictEqual(
    JSON.stringify(allConfig).includes("sk-super-secret-key-real"),
    false,
    "El valor del secreto NUNCA debe aparecer en la respuesta de getAllConfig"
  );
  console.log("  ✅ Test 7 superado");

  // Test 8: Paso 1.2 - Validación del middleware authorize con permiso config:manage
  console.log("▶ Test 8: Paso 1.2 - Middleware authorize(['config:manage'])...");
  const { authorize } = require("../middlewares/auth");
  const authMiddleware = authorize(["config:manage"]);

  // Caso 8.1: Rol admin (posee config:manage) -> debe llamar next()
  let nextCalled = false;
  const mockReqAdmin: any = {
    user: {
      id: "admin-1",
      nombre: "Admin Principal",
      role: "admin",
      permissions: require("../data/permissions").admin,
    },
  };
  const mockResAdmin: any = {
    status: (code: number) => ({
      json: (data: any) => {
        throw new Error(`No debió retornar status ${code} para admin`);
      },
    }),
  };
  authMiddleware(mockReqAdmin, mockResAdmin, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true, "Admin debe pasar la validación y llamar next()");

  // Caso 8.2: Rol cajero (no posee config:manage) -> debe responder 403
  let cajeroStatusCode = 0;
  let cajeroResponseData: any = null;
  const mockReqCajero: any = {
    user: {
      id: "cajero-1",
      nombre: "Cajero Turno",
      role: "cajero",
      permissions: require("../data/permissions").cajero,
    },
  };
  const mockResCajero: any = {
    status: (code: number) => {
      cajeroStatusCode = code;
      return {
        json: (data: any) => {
          cajeroResponseData = data;
        },
      };
    },
  };
  authMiddleware(mockReqCajero, mockResCajero, () => {
    throw new Error("Cajero NO debe llamar a next() sin el permiso config:manage");
  });
  assert.strictEqual(cajeroStatusCode, 403, "Cajero debe recibir status 403");
  assert.ok(cajeroResponseData?.error, "Cajero debe recibir mensaje de error");

  // Caso 8.3: Rol repartidor (no posee config:manage) -> debe responder 403
  let repartidorStatusCode = 0;
  const mockReqRepartidor: any = {
    user: {
      id: "repartidor-1",
      nombre: "Repartidor 1",
      role: "repartidor",
      permissions: require("../data/permissions").repartidor,
    },
  };
  const mockResRepartidor: any = {
    status: (code: number) => {
      repartidorStatusCode = code;
      return {
        json: () => {},
      };
    },
  };
  authMiddleware(mockReqRepartidor, mockResRepartidor, () => {
    throw new Error("Repartidor NO debe llamar a next()");
  });
  assert.strictEqual(repartidorStatusCode, 403, "Repartidor debe recibir status 403");
  console.log("  ✅ Test 8 superado (Paso 1.2 verificado exitosamente)");

  // Test 9: Endpoints configAdminController (GET y PUT)
  console.log("▶ Test 9: Endpoints configAdminController (GET y PUT)...");
  const { getConfigAdmin, updateConfigAdmin } = require("../controllers/configAdminController");

  // Test 9.1: getConfigAdmin responde con estructura completa
  let getAdminJson: any = null;
  await getConfigAdmin(
    mockReqAdmin,
    {
      json: (data: any) => {
        getAdminJson = data;
      },
      status: () => ({ json: () => {} }),
    } as any
  );
  assert.strictEqual(getAdminJson.success, true);
  assert.ok(getAdminJson.editables);
  assert.ok(getAdminJson.estadoSecretos);

  // Test 9.2: updateConfigAdmin actualiza variables de Categoría A
  let putAdminJson: any = null;
  const mockReqPut: any = {
    user: mockReqAdmin.user,
    body: {
      ADMIN_PHONE_NUMBER: "584121112233",
      DELIVERY_PHONE_NUMBER: "584149998877",
    },
  };
  await updateConfigAdmin(
    mockReqPut,
    {
      json: (data: any) => {
        putAdminJson = data;
      },
      status: () => ({ json: () => {} }),
    } as any
  );
  assert.strictEqual(putAdminJson.success, true);
  assert.strictEqual(getConfig("ADMIN_PHONE_NUMBER"), "584121112233");
  assert.strictEqual(getConfig("DELIVERY_PHONE_NUMBER"), "584149998877");

  // Test 9.3: updateConfigAdmin rechaza intento de modificar secretos con 400
  let putSecretStatus = 0;
  let putSecretJson: any = null;
  const mockReqPutSecret: any = {
    user: mockReqAdmin.user,
    body: {
      WHATSAPP_TOKEN: "hacked_token",
    },
  };
  await updateConfigAdmin(
    mockReqPutSecret,
    {
      status: (code: number) => {
        putSecretStatus = code;
        return {
          json: (data: any) => {
            putSecretJson = data;
          },
        };
      },
    } as any
  );
  assert.strictEqual(putSecretStatus, 400, "Debe rechazar modificación de secretos con 400");
  assert.match(putSecretJson.error, /secreto/i);
  console.log("  ✅ Test 9 superado");

  console.log("\n🎉 TODOS LOS TESTS DE CONFIGSTORE PASARON CON ÉXITO.");
}

runTests().catch((err) => {
  console.error("❌ Fallo en las pruebas de configStore:", err);
  process.exit(1);
});
