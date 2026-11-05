/**
 * scripts/test-peso-producto.ts
 *
 * Suite F1-7 (+ ampliación): peso (kg) y medidas de la caja (alto, ancho, profundidad en cm) del producto.
 * POST/PUT con y sin datos, quitar (null), fuera de rango y texto → 400; esquemas Zod; importación con coma
 * decimal y error de fila; exportación; regresión; y que la API pública no los expone.
 * Uso: NODE_ENV=test BRAND_NAME=ventimax npx tsx scripts/test-peso-producto.ts
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
const medidas = require("../services/medidasProducto");
const imp = require("../services/importacionProductos");
const PERMISSIONS = require("../data/permissions");

const ADMIN = { user: "admin", role: "admin", permissions: PERMISSIONS["admin"] };
const CAT_MESA = "65f000000000000000000201";
const CAMPOS = ["pesoKg", "altoCm", "anchoCm", "profundidadCm"];

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

function sembrar() {
  const data = dbLocal.read();
  data.categorias = [{ _id: CAT_MESA, nombre: "Mesa", slug: "mesa", activo: true, padre: null }];
  data.productos = [
    {
      _id: "t-f17-p1",
      id: "test-f17-p1",
      name: "Ventilador de mesa",
      price: 25,
      descuentoPct: 0,
      categoria: CAT_MESA,
      categorias: [],
      activo: true,
      trackStock: false,
      stock: 0,
      imagenes: [],
      sku: "VM-17",
      codigosOEM: [],
      compatibilidad: [],
      atributos: [],
      grupoEquivalencia: "",
      marcaFabricante: "Fortunne",
    },
  ];
  dbLocal.write(data);
}

function productoEnBd(id: string): any {
  return (dbLocal.read().productos || []).find((p: any) => p.id === id) || null;
}

const BASE = { name: "Pieza de prueba", price: 10, categoria: CAT_MESA };

/** Filas en el formato de importación (encabezado = títulos de COLUMNAS_PRODUCTOS). */
function csvProductos(filas: Record<string, string>[]): Buffer {
  const enc = imp.COLUMNAS_PRODUCTOS.map((c: any) => c.titulo);
  const lineas = [enc.join(";")];
  for (const f of filas) lineas.push(imp.COLUMNAS_PRODUCTOS.map((c: any) => f[c.clave] ?? "").join(";"));
  return Buffer.from(lineas.join("\n"), "utf8");
}

const existente = {
  id: "test-f17-p1",
  sku: "VM-17",
  name: "Ventilador de mesa",
  price: 25,
  stock: 0,
  trackStock: false,
  activo: true,
  description: "",
  marcaFabricante: "Fortunne",
  codigosOEM: [],
  grupoEquivalencia: "",
  categoriaNombres: ["Mesa"],
  compatibilidad: [],
  pesoKg: null,
  altoCm: null,
  anchoCm: null,
  profundidadCm: null,
};
const CATEGORIAS = [{ _id: CAT_MESA, nombre: "Mesa", slug: "mesa" }];

async function runTests() {
  console.log("================================================================================");
  console.log("📦 SUITE DE PRUEBAS: PESO Y MEDIDAS DE LA CAJA (F1-7)");
  console.log("================================================================================");

  console.log("\n1. POST guarda peso y medidas");
  sembrar();
  {
    const { res, out } = mockRes();
    await adminController.postProduct(
      { user: ADMIN, body: { ...BASE, id: "test-f17-p2", pesoKg: "1,5", altoCm: "12,5", anchoCm: 8, profundidadCm: "" } },
      res,
    );
    assert.strictEqual(out.status, 201, JSON.stringify(out.json));
    const p = productoEnBd("test-f17-p2");
    assert.strictEqual(p.pesoKg, 1.5, "peso con coma decimal = 1.5");
    assert.strictEqual(p.altoCm, 12.5);
    assert.strictEqual(p.anchoCm, 8);
    assert.strictEqual(p.profundidadCm, null, "vacío = sin dato");
    console.log("  ✅ POST guarda pesoKg y medidas (coma decimal, vacío = null)");
  }
  {
    const { res, out } = mockRes();
    await adminController.postProduct({ user: ADMIN, body: { ...BASE, id: "test-f17-p3" } }, res);
    assert.strictEqual(out.status, 201);
    assert.strictEqual(productoEnBd("test-f17-p3").pesoKg ?? null, null, "sin peso = sin dato");
    console.log("  ✅ POST sin peso ni medidas no cambia el producto");
  }

  console.log("\n2. POST/PUT: fuera de rango, texto y decimales → 400");
  {
    const casos: [string, any][] = [
      ["pesoKg negativo", { pesoKg: -1 }],
      ["pesoKg mayor a 1000", { pesoKg: 1001 }],
      ["pesoKg texto", { pesoKg: "abc" }],
      ["pesoKg con 4 decimales", { pesoKg: 1.2345 }],
      ["altoCm cero", { altoCm: 0 }],
      ["anchoCm mayor a 500", { anchoCm: 501 }],
      ["profundidadCm texto", { profundidadCm: "diez" }],
      ["altoCm con 2 decimales", { altoCm: "1,25" }],
    ];
    for (const [nombre, extra] of casos) {
      const { res, out } = mockRes();
      await adminController.postProduct({ user: ADMIN, body: { ...BASE, id: `test-f17-bad-${nombre.length}`, ...extra } }, res);
      assert.strictEqual(out.status, 400, `${nombre} debe dar 400`);
      assert.ok(Array.isArray(out.json.errores) && out.json.errores.length >= 1, `${nombre}: errores legibles`);
    }
    const { res, out } = mockRes();
    await adminController.updateProduct({ user: ADMIN, params: { id: "test-f17-p1" }, body: { pesoKg: -5 } }, res);
    assert.strictEqual(out.status, 400, "PUT con peso negativo da 400");
    assert.strictEqual(productoEnBd("test-f17-p1").pesoKg ?? null, null, "PUT inválido no cambia nada");
    console.log(`  ✅ ${casos.length} casos inválidos en POST y un PUT → 400 con mensaje y sin guardar`);
  }

  console.log("\n3. PUT cambia, quita (null) y no toca si no llega");
  {
    const { res, out } = mockRes();
    await adminController.updateProduct({ user: ADMIN, params: { id: "test-f17-p1" }, body: { pesoKg: 2.25, altoCm: 30, anchoCm: 20, profundidadCm: 5.5 } }, res);
    assert.strictEqual(out.status, 200, JSON.stringify(out.json));
    const p = productoEnBd("test-f17-p1");
    assert.strictEqual(p.pesoKg, 2.25);
    assert.strictEqual(p.altoCm, 30);
    assert.strictEqual(p.profundidadCm, 5.5);
    console.log("  ✅ PUT cambia el peso y las medidas");
  }
  {
    const { res, out } = mockRes();
    await adminController.updateProduct({ user: ADMIN, params: { id: "test-f17-p1" }, body: { price: 26 } }, res);
    assert.strictEqual(out.status, 200);
    const p = productoEnBd("test-f17-p1");
    assert.strictEqual(p.pesoKg, 2.25, "PUT sin pesoKg no lo cambia");
    assert.strictEqual(p.altoCm, 30, "PUT sin medidas no las cambia");
    assert.strictEqual(p.price, 26);
    console.log("  ✅ PUT sin campos de peso no cambia el peso ni las medidas (regresión)");
  }
  {
    const { res, out } = mockRes();
    await adminController.updateProduct({ user: ADMIN, params: { id: "test-f17-p1" }, body: { pesoKg: null, altoCm: "" } }, res);
    assert.strictEqual(out.status, 200, JSON.stringify(out.json));
    const p = productoEnBd("test-f17-p1");
    assert.strictEqual(p.pesoKg, null, "null quita el peso");
    assert.strictEqual(p.altoCm, null, "vacío quita la medida");
    assert.strictEqual(p.anchoCm, 20, "las medidas no enviadas siguen");
    console.log("  ✅ PUT con null o vacío quita el dato");
  }
  {
    const { res, out } = mockRes();
    await adminController.updateProduct({ user: ADMIN, params: { id: "test-f17-p1" }, body: { pesoKg: 3, altoCm: 10 } }, res);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(productoEnBd("test-f17-p1").pesoKg, 3, "vuelve a guardar el peso");
    console.log("  ✅ PUT vuelve a guardar peso tras quitarlo");
  }

  console.log("\n4. Esquemas Zod (validate en las rutas)");
  {
    const ok = productoSchema.safeParse({ ...BASE, pesoKg: "1,5", altoCm: "12.5", anchoCm: null, profundidadCm: "" });
    assert.ok(ok.success, JSON.stringify(ok.error?.issues));
    assert.strictEqual(ok.data.pesoKg, 1.5);
    assert.strictEqual(ok.data.altoCm, 12.5);
    assert.strictEqual(ok.data.anchoCm, null);
    assert.strictEqual(ok.data.profundidadCm, null);
    const sinCampos = productoSchema.safeParse({ ...BASE });
    assert.ok(sinCampos.success && sinCampos.data.pesoKg === undefined, "sin peso no aparece en los datos");
    const malo = productoSchema.safeParse({ ...BASE, pesoKg: 1001 });
    assert.ok(!malo.success && /peso \(kg\)/.test(malo.error.issues[0].message), "mensaje en español con el campo");
    assert.ok(!productoUpdateSchema.safeParse({ pesoKg: -1 }).success, "update también valida");
    assert.ok(!productoSchema.safeParse({ ...BASE, altoCm: 0 }).success, "alto 0 no vale");
    assert.ok(productoUpdateSchema.safeParse({ pesoKg: null }).success, "update acepta null");
    console.log("  ✅ Zod: convierte coma, acepta vacío/null, rechaza rango, decimales y texto");
  }

  console.log("\n5. Importación: coma decimal, error de fila, diferencias");
  {
    const lectura = await imp.leerArchivoImportacion({
      nombre: "productos.csv",
      buffer: csvProductos([{ sku: "VM-17", nombre: "Ventilador de mesa", precio: "25", pesoKg: "1,5", altoCm: "12,5" }]),
    });
    assert.deepStrictEqual(lectura.errores, [], JSON.stringify(lectura.errores));
    const r = imp.analizarImportacion({ productos: lectura.productos, compatibilidad: null, existentes: [existente], categorias: CATEGORIAS });
    assert.strictEqual(r.errores.length, 0, JSON.stringify(r.errores));
    assert.strictEqual(r.aplicar.cambios.length, 1);
    assert.strictEqual(r.aplicar.cambios[0].datos.pesoKg, 1.5, "1,5 se lee como 1.5");
    assert.strictEqual(r.aplicar.cambios[0].datos.altoCm, 12.5);
    const campos = r.cambios[0].campos.map((c: any) => c.campo);
    assert.ok(campos.includes("Peso (kg)") && campos.includes("Alto (cm)"), `diff muestra peso y alto (${campos})`);
    console.log("  ✅ CSV con \"1,5\" → 1.5 y diff en vista previa");
  }
  {
    const lectura = await imp.leerArchivoImportacion({
      nombre: "productos.csv",
      buffer: csvProductos([{ sku: "VM-17", nombre: "Ventilador de mesa", precio: "25", pesoKg: "abc" }]),
    });
    const r = imp.analizarImportacion({ productos: lectura.productos, compatibilidad: null, existentes: [existente], categorias: CATEGORIAS });
    assert.ok(r.errores.some((e: any) => e.fila === 2 && /peso \(kg\)/i.test(e.motivo)), `error de fila para "abc": ${JSON.stringify(r.errores)}`);
    assert.strictEqual(r.aplicar.cambios.length, 0, "con error la fila no se aplica");
    console.log("  ✅ \"abc\" da error en la fila y no se aplica");
  }
  {
    const lectura = await imp.leerArchivoImportacion({
      nombre: "productos.csv",
      buffer: csvProductos([{ sku: "VM-17", nombre: "Ventilador de mesa", precio: "25", altoCm: "0" }]),
    });
    const r = imp.analizarImportacion({ productos: lectura.productos, compatibilidad: null, existentes: [existente], categorias: CATEGORIAS });
    assert.ok(r.errores.some((e: any) => /alto \(cm\)/i.test(e.motivo)), "alto 0 fuera de rango da error");
  }
  {
    const lectura = await imp.leerArchivoImportacion({
      nombre: "productos.csv",
      buffer: csvProductos([{ sku: "VM-17", nombre: "Ventilador de mesa", precio: "25" }]),
    });
    const r = imp.analizarImportacion({ productos: lectura.productos, compatibilidad: null, existentes: [{ ...existente, pesoKg: 4 }], categorias: CATEGORIAS });
    assert.strictEqual(r.aplicar.cambios.length, 0, "celda vacía no cambia el peso");
    assert.strictEqual(r.sinCambio.length, 1);
    console.log("  ✅ Celda vacía en actualización no cambia el peso");
  }

  console.log("\n6. Exportación incluye las columnas");
  {
    const enc = imp.COLUMNAS_PRODUCTOS.map((c: any) => c.titulo);
    for (const t of ["Peso (kg)", "Alto (cm)", "Ancho (cm)", "Profundidad (cm)"]) {
      assert.ok(enc.includes(t), `encabezado ${t}`);
    }
    const idxPeso = enc.indexOf("Peso (kg)");
    assert.strictEqual(enc[idxPeso + 1], "Alto (cm)", "las medidas van justo después del peso");
    const filas = imp.filasExportacion(
      [{ id: "x", sku: "VM-17", name: "Ventilador", price: 25, categoria: CAT_MESA, pesoKg: 1.5, altoCm: 12.5, anchoCm: null, profundidadCm: undefined }],
      CATEGORIAS,
    );
    const fila = filas.productos[0];
    assert.strictEqual(fila.length, imp.COLUMNAS_PRODUCTOS.length, "una celda por columna");
    assert.strictEqual(fila[idxPeso], "1.5");
    assert.strictEqual(fila[idxPeso + 1], "12.5");
    assert.strictEqual(fila[idxPeso + 2], "", "sin dato = celda vacía");
    const buffer = await imp.generarXlsx(filas);
    assert.ok(buffer.length > 0);
    console.log("  ✅ Exportación: cada medida en su columna y celda vacía si no hay dato");
  }

  console.log("\n7. Estático: panel, API pública, tipos");
  {
    const panel = fsSync.readFileSync(path.join(__dirname, "../public/src/features/inventory/components/ProductTab.js"), "utf8");
    assert.ok(/pesoKg/.test(panel) && /Peso \(kg\)/.test(panel), "ProductTab tiene el campo de peso");
    assert.ok(/Medidas de la caja \(cm\)/.test(panel), "ProductTab tiene el bloque de medidas");
    assert.ok(/inputMode: "decimal"/.test(panel) && /step: "0\.001"/.test(panel), "peso: decimal y paso 0.001");
    assert.ok(!/innerHTML/.test(panel), "ProductTab sin innerHTML");
    const pub = fsSync.readFileSync(path.join(__dirname, "../controllers/publicController.ts"), "utf8");
    assert.ok(!/pesoKg|altoCm|anchoCm|profundidadCm/.test(pub), "la API pública no expone las medidas");
    const tipos = fsSync.readFileSync(path.join(__dirname, "../types/models.d.ts"), "utf8");
    assert.ok(/pesoKg\?: number/.test(tipos) && /altoCm\?: number/.test(tipos), "IProducto tiene los campos");
    const modelo = fsSync.readFileSync(path.join(__dirname, "../models/Producto.ts"), "utf8");
    assert.ok(/pesoKg: \{ type: Number, min: 0, max: 1000/.test(modelo), "modelo: pesoKg min 0 max 1000");
    console.log("  ✅ Panel con los campos; API pública sin medidas; tipos y modelo declarados");
  }

  console.log("\n8. Una sola fuente de reglas: validators/index.js usa services/medidasProducto.ts");
  {
    const validadores = fsSync.readFileSync(path.join(__dirname, "../validators/index.js"), "utf8");
    assert.ok(!/MEDIDAS_ZOD|minExclusivo: true|decimales: 3/.test(validadores), "validators/index.js no repite la tabla de límites");
    assert.ok(/require\("\.\.\/services\/medidasProducto"\)/.test(validadores), "validators/index.js importa normalizarMedida");
    const valores = [undefined, null, "", "  ", "1,5", "1.5", "12.5", "12,25", "0", 0, -1, 0.5, 1000, 1000.001, 1001, 500, 500.1, "abc", "1.2345", 1.2345, true, NaN, Infinity, "-3", 3.14159];
    let comparados = 0;
    for (const clave of medidas.CLAVES_MEDIDAS) {
      for (const v of valores) {
        const esperado = medidas.normalizarMedida(clave, v);
        const r = productoSchema.safeParse({ ...BASE, [clave]: v });
        assert.strictEqual(r.success, esperado.ok, `${clave} con ${JSON.stringify(v)}: éxito distinto`);
        if (esperado.ok) {
          assert.strictEqual(r.data[clave], esperado.valor, `${clave} con ${JSON.stringify(v)}: valor distinto`);
        } else {
          assert.strictEqual(r.error.issues[0].message, esperado.error, `${clave} con ${JSON.stringify(v)}: mensaje distinto`);
        }
        const rUpd = productoUpdateSchema.safeParse({ [clave]: v });
        assert.strictEqual(rUpd.success, esperado.ok, `update ${clave} con ${JSON.stringify(v)}`);
        comparados++;
      }
    }
    assert.deepStrictEqual(Object.keys(medidas.MEDIDAS), CAMPOS, "las cuatro medidas de la tabla");
    console.log(`  ✅ Zod y normalizarMedida dan lo mismo en ${comparados} casos (POST y PUT); sin tabla duplicada`);
  }

  console.log("\n🎉 TODOS LOS TESTS DE PESO Y MEDIDAS (F1-7) PASARON EXITOSAMENTE.");
}

runTests().catch((e) => {
  console.error("❌ FALLO:", e);
  process.exit(1);
});
