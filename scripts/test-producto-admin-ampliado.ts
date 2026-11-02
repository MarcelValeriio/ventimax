/**
 * scripts/test-producto-admin-ampliado.ts
 *
 * Suite F1-2: panel de productos con campos ampliados. Crear y editar (POST/PUT) con SKU, marca fabricante,
 * códigos OEM, atributos, grupo de equivalencia y compatibilidad; validación antes de guardar; SKU repetido;
 * listado con búsqueda `q` (SKU, OEM con o sin guiones, vehículo con año, texto con caracteres de regex);
 * regresión del PUT sin campos nuevos; y comprobaciones estáticas de la pestaña del panel.
 * Uso: NODE_ENV=test BRAND_NAME=ventimax npx tsx scripts/test-producto-admin-ampliado.ts
 */

import assert from "node:assert";
import fsSync from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.JWT_SECRET = "x".repeat(40);
process.env.WHATSAPP_PHONE = "584122781982";

const dbLocal = require("../services/dbLocal");
const adminController = require("../controllers/adminController");
const { productoSchema, productoUpdateSchema } = require("../validators");
const PERMISSIONS = require("../data/permissions");

const ADMIN = { user: "admin", role: "admin", permissions: PERMISSIONS["admin"] };
const CAT_MESA = "65f000000000000000000201";

/** Respuesta simulada de Express (mismo patrón que test-descuentos.ts). */
function mockRes() {
  const out: { status: number; json: any } = { status: 200, json: null };
  const res: any = {
    status: (s: number) => {
      out.status = s;
      return res;
    },
    json: (d: any) => {
      out.json = d;
      return res;
    },
    send: (d: any) => {
      out.json = d;
      return res;
    },
    setHeader: () => {},
  };
  return { res, out };
}

/** Deja dos productos de prueba con datos ampliados. Los ids empiezan por test-f12- para no pisar otras suites. */
function sembrar() {
  const data = dbLocal.read();
  data.categorias = [{ _id: CAT_MESA, nombre: "Mesa", slug: "mesa", activo: true, padre: null }];
  data.productos = [
    {
      _id: "t-f12-p1",
      id: "test-f12-p1",
      name: "Filtro de aceite alfa",
      price: 10,
      descuentoPct: 0,
      categoria: CAT_MESA,
      categorias: [],
      activo: true,
      trackStock: false,
      stock: 0,
      imagenes: [],
      sku: "AF-100",
      codigosOEM: ["0446502220"],
      marcaFabricante: "Alfa",
      atributos: [{ nombre: "Altura", valor: "10 cm" }],
      grupoEquivalencia: "filtro aceite 1",
      compatibilidad: [
        { marca: "Toyota", modelo: "Corolla", marcaNorm: "toyota", modeloNorm: "corolla", anioDesde: 2009, anioHasta: 2014, motor: "", version: "", nota: "" },
      ],
    },
    {
      _id: "t-f12-p2",
      id: "test-f12-p2",
      name: "Bujía (premium)",
      price: 5,
      descuentoPct: 0,
      categoria: CAT_MESA,
      categorias: [],
      activo: true,
      trackStock: false,
      stock: 0,
      imagenes: [],
      sku: "BJ-200",
      codigosOEM: [],
      compatibilidad: [],
      grupoEquivalencia: "filtro aceite 1",
    },
  ];
  dbLocal.write(data);
}

function productoEnBd(id: string): any {
  return (dbLocal.read().productos || []).find((p: any) => p.id === id) || null;
}

async function buscar(q: string): Promise<string[]> {
  const { res, out } = mockRes();
  await adminController.getProducts({ query: { q }, user: ADMIN }, res);
  assert.strictEqual(out.status, 200, `getProducts con q=${q} debe responder 200`);
  return out.json.data.map((p: any) => p.id).sort();
}

async function runTests() {
  console.log("================================================================================");
  console.log("📦 SUITE DE PRUEBAS: PANEL DE PRODUCTOS AMPLIADO (F1-2)");
  console.log("================================================================================");

  /* ==============================================================================
   * 1. Crear (POST) con campos ampliados
   * ============================================================================== */
  console.log("\n1. Crear producto con campos ampliados");
  sembrar();
  {
    const { res, out } = mockRes();
    await adminController.postProduct(
      {
        user: ADMIN,
        body: {
          id: "test-f12-p3",
          name: "Pastilla de freno",
          price: 12,
          categoria: CAT_MESA,
          sku: " pf-300 ",
          marcaFabricante: "Brembo",
          codigosOEM: [" 04465-02220 ", "0446502220", "90915 yzzd1", ""],
          atributos: [{ nombre: "Peso", valor: "1 kg" }],
          grupoEquivalencia: "pastilla freno 1",
          compatibilidad: [
            { marca: " Toyotá ", modelo: "Corolla", anioDesde: "2010", anioHasta: 2012, motor: "1.8", marcaNorm: "HACKED", modeloNorm: "HACKED" },
          ],
        },
      },
      res,
    );
    assert.strictEqual(out.status, 201, JSON.stringify(out.json));
    const creado = productoEnBd("test-f12-p3");
    assert.strictEqual(creado.sku, "PF-300", "el SKU se guarda en mayúsculas y sin espacios");
    assert.deepStrictEqual(creado.codigosOEM, ["0446502220", "90915YZZD1"], "OEM normalizados y sin repetidos");
    assert.strictEqual(creado.compatibilidad[0].marcaNorm, "toyota", "marcaNorm lo calcula el servidor");
    assert.strictEqual(creado.compatibilidad[0].anioDesde, 2010);
    assert.strictEqual(creado.marcaFabricante, "Brembo");
    assert.strictEqual(creado.atributos[0].nombre, "Peso");
    assert.strictEqual(creado.grupoEquivalencia, "pastilla freno 1");
    console.log("  ✅ POST guarda SKU, OEM, compatibilidad, atributos y grupo normalizados");
  }

  console.log("\n2. Crear: validación y SKU repetido");
  {
    const { res, out } = mockRes();
    await adminController.postProduct(
      { user: ADMIN, body: { id: "test-f12-p4", name: "Otra pieza", price: 3, categoria: CAT_MESA, sku: "pf-300" } },
      res,
    );
    assert.strictEqual(out.status, 400);
    assert.match(out.json.error, /Ya existe otro producto con el SKU PF-300/);
    assert.strictEqual(productoEnBd("test-f12-p4"), null, "SKU repetido no crea el producto");
    console.log("  ✅ SKU repetido responde 400 con mensaje legible y no crea nada");
  }
  {
    const { res, out } = mockRes();
    await adminController.postProduct(
      {
        user: ADMIN,
        body: {
          id: "test-f12-p5",
          name: "Pieza mal",
          price: 3,
          categoria: CAT_MESA,
          compatibilidad: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 1800 }],
          atributos: [{ nombre: "", valor: "algo" }],
        },
      },
      res,
    );
    assert.strictEqual(out.status, 400);
    assert.ok(Array.isArray(out.json.errores) && out.json.errores.length >= 2, "errores debe listar cada problema");
    assert.ok(out.json.errores.some((m: string) => /año/.test(m)), "año fuera de rango");
    assert.ok(out.json.errores.some((m: string) => /falta el nombre/.test(m)), "atributo sin nombre");
    assert.strictEqual(productoEnBd("test-f12-p5"), null);
    console.log("  ✅ campos inválidos responden 400 con 'errores' y no se guardan");
  }

  /* ==============================================================================
   * 3. Editar (PUT)
   * ============================================================================== */
  console.log("\n3. Editar producto");
  sembrar();
  {
    const { res, out } = mockRes();
    await adminController.updateProduct(
      {
        user: ADMIN,
        params: { id: "test-f12-p1" },
        body: {
          name: "Filtro de aceite alfa",
          price: 10,
          sku: "af-101",
          codigosOEM: ["04465 02220"],
          grupoEquivalencia: "filtro aceite 2",
          compatibilidad: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 2010, anioHasta: 2014, motor: "1.8" }],
        },
      },
      res,
    );
    assert.strictEqual(out.status, 200, JSON.stringify(out.json));
    const p = productoEnBd("test-f12-p1");
    assert.strictEqual(p.sku, "AF-101");
    assert.deepStrictEqual(p.codigosOEM, ["0446502220"]);
    assert.strictEqual(p.compatibilidad.length, 1);
    assert.strictEqual(p.compatibilidad[0].motor, "1.8");
    console.log("  ✅ PUT actualiza SKU, OEM, grupo y compatibilidad");
  }
  {
    // Regresión: un PUT sin campos nuevos no cambia nada de ellos
    const antes = productoEnBd("test-f12-p1");
    const { res, out } = mockRes();
    await adminController.updateProduct({ user: ADMIN, params: { id: "test-f12-p1" }, body: { price: 11 } }, res);
    assert.strictEqual(out.status, 200);
    const despues = productoEnBd("test-f12-p1");
    assert.strictEqual(despues.price, 11);
    assert.strictEqual(despues.sku, antes.sku, "PUT sin SKU no lo toca");
    assert.deepStrictEqual(despues.codigosOEM, antes.codigosOEM, "PUT sin OEM no lo toca");
    assert.deepStrictEqual(despues.compatibilidad, antes.compatibilidad, "PUT sin compatibilidad no la toca");
    console.log("  ✅ regresión: PUT sin campos nuevos no cambia SKU, OEM ni compatibilidad");
  }
  {
    const { res, out } = mockRes();
    await adminController.updateProduct({ user: ADMIN, params: { id: "test-f12-p2" }, body: { sku: "af-101" } }, res);
    assert.strictEqual(out.status, 400);
    assert.match(out.json.error, /Ya existe otro producto con el SKU AF-101/);
    assert.strictEqual(productoEnBd("test-f12-p2").sku, "BJ-200", "el SKU repetido no se guarda");
    console.log("  ✅ PUT con SKU de otro producto responde 400 legible");
  }
  {
    const { res, out } = mockRes();
    await adminController.updateProduct({ user: ADMIN, params: { id: "test-f12-p2" }, body: { codigosOEM: "abc" } }, res);
    assert.strictEqual(out.status, 400);
    assert.ok(out.json.errores.some((m: string) => /lista/.test(m)));
    assert.deepStrictEqual(productoEnBd("test-f12-p2").codigosOEM, []);
    console.log("  ✅ PUT con OEM inválido responde 400 y no cambia el producto");
  }
  {
    // SKU vacío borra el campo (con índice único disperso no se guarda "")
    const { res, out } = mockRes();
    await adminController.updateProduct({ user: ADMIN, params: { id: "test-f12-p2" }, body: { sku: "" } }, res);
    assert.strictEqual(out.status, 200, JSON.stringify(out.json));
    assert.strictEqual(productoEnBd("test-f12-p2").sku, undefined, "SKU vacío se quita del producto");
    console.log("  ✅ PUT con SKU vacío quita el SKU");
  }

  /* ==============================================================================
   * 4. Búsqueda en el listado (q)
   * ============================================================================== */
  console.log("\n4. Búsqueda q");
  sembrar();
  assert.deepStrictEqual(await buscar(""), ["test-f12-p1", "test-f12-p2"], "sin q lista todo");
  assert.deepStrictEqual(await buscar("af-1"), ["test-f12-p1"], "SKU por prefijo, sin distinguir mayúsculas");
  assert.deepStrictEqual(await buscar("0446502220"), ["test-f12-p1"], "OEM exacto normalizado");
  assert.deepStrictEqual(await buscar("04465-02220"), ["test-f12-p1"], "OEM con guiones");
  assert.deepStrictEqual(await buscar("04465 0222"), ["test-f12-p1"], "OEM parcial con espacio");
  assert.deepStrictEqual(await buscar("toyota corolla"), ["test-f12-p1"], "marca y modelo");
  assert.deepStrictEqual(await buscar("Corolla 2012"), ["test-f12-p1"], "vehículo con año dentro del rango");
  assert.deepStrictEqual(await buscar("Corolla 2020"), [], "año fuera del rango no coincide");
  assert.deepStrictEqual(await buscar("corólla 2009"), ["test-f12-p1"], "sin acentos en el vehículo");
  assert.deepStrictEqual(await buscar("bujia"), ["test-f12-p2"], "nombre sin acentos");
  assert.deepStrictEqual(await buscar("(premium)"), ["test-f12-p2"], "paréntesis se buscan literales");
  assert.deepStrictEqual(await buscar("[*+?"), [], "caracteres de regex no rompen la búsqueda");
  assert.deepStrictEqual(await buscar(".*"), [], "'.*' se busca literal, no como comodín");
  assert.deepStrictEqual(await buscar("pf"), [], "texto sin coincidencias");
  console.log("  ✅ búsqueda por SKU, OEM (con y sin guiones), vehículo con año, nombre y regex escapado");

  /* ==============================================================================
   * 5. Validadores de ruta: los campos nuevos no se descartan
   * ============================================================================== */
  console.log("\n5. Validadores de ruta");
  const crear = productoSchema.safeParse({
    id: "x-1",
    name: "Demo",
    price: 1,
    categoria: CAT_MESA,
    sku: "A1",
    codigosOEM: ["X"],
    compatibilidad: [],
  });
  assert.ok(crear.success, "productoSchema acepta los campos nuevos");
  assert.strictEqual(crear.data.sku, "A1", "productoSchema conserva sku");
  assert.deepStrictEqual(crear.data.codigosOEM, ["X"], "productoSchema conserva codigosOEM");
  const editar = productoUpdateSchema.safeParse({ sku: "B2", atributos: [] });
  assert.ok(editar.success && editar.data.sku === "B2", "productoUpdateSchema conserva sku");
  console.log("  ✅ productoSchema y productoUpdateSchema conservan los campos nuevos");

  /* ==============================================================================
   * 6. Panel: integridad del código
   * ============================================================================== */
  console.log("\n6. Integridad del panel");
  const archivoPanel = path.join(__dirname, "../public/src/features/inventory/components/ProductTab.js");
  const panel = fsSync.readFileSync(archivoPanel, "utf8");
  assert.ok(!/innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML/.test(panel), "sin innerHTML con datos");
  assert.ok(!/<script/i.test(panel), "sin scripts en línea");
  assert.ok(!/\bon(click|change|submit|input)\s*=\s*"/.test(panel), "sin atributos on* en cadenas");
  assert.ok(!/Fortunne|VentiMax|Pachi|Yuri-Bot/i.test(panel), "sin texto de marca en el código");
  assert.ok(/role: "tablist"/.test(panel) && /role: "tab"/.test(panel), "pestañas accesibles");
  assert.ok(/motion-reduce:transition-none/.test(panel), "prefers-reduced-motion respetado");
  assert.ok(/min-h-\[44px\]/.test(panel), "botones de 44 px");
  assert.ok(/apiClient\.get\(`\/api\/admin\/products\$\{queryString\}`\)/.test(panel), "el listado usa la query con q");
  assert.ok(/encodeURIComponent\(busquedaAplicada\)/.test(panel), "q va codificada");
  console.log("  ✅ ProductTab sin innerHTML, sin scripts en línea, sin marca escrita, con pestañas, 44 px y reduce-motion");

  /* ==============================================================================
   * 7. Devolución F1-2: ID vacío y formulario con el modal abierto
   * ============================================================================== */
  console.log("\n7. ID vacío, mensajes de Zod y formulario");
  {
    // Zod acepta id vacío (el servidor lo genera) y lo deja en ""
    const sinId = productoSchema.safeParse({ name: "Sin ID", price: 3, categoria: CAT_MESA });
    assert.ok(sinId.success && sinId.data.id === "", "productoSchema: sin id -> id \"\"");
    const idVacio = productoSchema.safeParse({ id: "", name: "Sin ID", price: 3, categoria: CAT_MESA });
    assert.ok(idVacio.success && idVacio.data.id === "", "productoSchema: id vacío es válido");
    const idLargo = productoSchema.safeParse({ id: "x".repeat(61), name: "Largo", price: 3, categoria: CAT_MESA });
    assert.ok(!idLargo.success && idLargo.error.issues.some((i: any) => i.path[0] === "id"), "id de más de 60 caracteres se rechaza");

    // El middleware validate nombra el campo en vez de "Datos inválidos" genérico
    const validar = require("../validators").validate(productoSchema);
    const { res, out } = mockRes();
    let siguio = false;
    validar({ body: { name: "A", price: 3, categoria: CAT_MESA } }, res, () => { siguio = true; });
    assert.strictEqual(out.status, 400, "nombre corto -> 400");
    assert.ok(!siguio, "validate no llama next() si falla");
    assert.ok(/^Datos inválidos\. name: /.test(out.json.error), `el error nombra el campo: ${out.json.error}`);
    assert.ok(out.json.details.some((d: any) => d.campo === "name"), "details conserva el campo");

    // Crear sin ID genera prod-<timestamp> (como el aviso del formulario)
    const { res: resCrear, out: outCrear } = mockRes();
    await adminController.postProduct(
      { user: ADMIN, body: { id: "", name: "Producto sin ID", price: 7, categoria: CAT_MESA } },
      resCrear,
    );
    assert.strictEqual(outCrear.status, 201, `crear sin ID debe responder 201 (status ${outCrear.status}: ${JSON.stringify(outCrear.json)})`);
    assert.ok(/^prod-\d+$/.test(outCrear.json.data.id), `id generado: ${outCrear.json.data.id}`);
    assert.ok(productoEnBd(outCrear.json.data.id), "el producto sin ID queda guardado");
    console.log("  ✅ ID vacío: se genera prod-<timestamp>; error de Zod nombra el campo");
  }

  {
    // Formulario: el estado no depende de la lista ni la búsqueda lo reinicia
    assert.ok(/loading && products\.length === 0 && !isModalOpen/.test(panel), "la carga no reemplaza la vista con el modal abierto");
    assert.ok(/if \(error && !isModalOpen\)/.test(panel), "el error de búsqueda no desmonta el modal");
    assert.ok(!/setFormData\(\{\s*\.\.\.formData/.test(panel), "ningún setFormData usa el formData del render (stale closure)");
    assert.ok(/setError\(null\);/.test(panel), "el error se limpia cuando la lista vuelve bien");
    assert.ok(/vacío = automático/.test(panel), "el campo ID avisa que vacío = automático");
    console.log("  ✅ Formulario: la búsqueda no desmonta el modal; actualizaciones de estado funcionales");
  }

  console.log("\n🎉 TODOS LOS TESTS DE PRODUCTO ADMIN AMPLIADO (F1-2) PASARON EXITOSAMENTE.");
}

runTests().catch((err) => {
  console.error("❌ Error en suite test-producto-admin-ampliado.ts:", err);
  process.exit(1);
});
