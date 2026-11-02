/**
 * scripts/test-producto-ampliado.ts
 *
 * Suite F1-1: campos ampliados del producto (SKU, marca fabricante, códigos OEM, atributos,
 * grupo de equivalencia y compatibilidad por vehículo). Normalización, validación, hook pre("validate")
 * del modelo y mocks (dbLocal y dbMock).
 * Uso: NODE_ENV=test BRAND_NAME=ventimax npx tsx scripts/test-producto-ampliado.ts
 */

import assert from "node:assert";
import path from "node:path";
import fsSync from "node:fs";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const mongoose = require("mongoose");
const {
  normalizarTexto,
  normalizarCodigoOEM,
  normalizarCompatibilidad,
  validarProductoAmpliado,
} = require("../services/productoAmpliado");
const ProductoModel = require("../models/Producto");
const dbLocal = require("../services/dbLocal");
const dbMock = require("../services/dbMock");

const ID_PREFIJO = "test-f1-1-";

async function runTests() {
  console.log("================================================================================");
  console.log("📦 SUITE DE PRUEBAS: PRODUCTO AMPLIADO (F1-1)");
  console.log("================================================================================");

  /* ==============================================================================
   * 1. Normalizadores
   * ============================================================================== */
  console.log("\n1. Normalizadores");

  assert.strictEqual(normalizarTexto("  Toyota   Corolla  "), "toyota corolla");
  assert.strictEqual(normalizarTexto("Citroën"), "citroen");
  assert.strictEqual(normalizarTexto("TOYOTA"), "toyota");
  assert.strictEqual(normalizarTexto("Mercedes\t Benz "), "mercedes benz");
  assert.strictEqual(normalizarTexto(null), "");
  assert.strictEqual(normalizarTexto(undefined), "");
  console.log("  ✅ normalizarTexto: acentos, mayúsculas, espacios");

  assert.strictEqual(normalizarCodigoOEM(" 04465-02220 "), "0446502220");
  assert.strictEqual(normalizarCodigoOEM("ab cd-12"), "ABCD12");
  assert.strictEqual(normalizarCodigoOEM("nGk--7 "), "NGK7");
  console.log("  ✅ normalizarCodigoOEM: mayúsculas, sin espacios ni guiones");

  const compatNorm = normalizarCompatibilidad([
    { marca: " Toyotá ", modelo: "Corolla  Cross", anioDesde: 2009, anioHasta: 2014, motor: "1.8", marcaNorm: "HACKED", modeloNorm: "HACKED" },
  ]);
  assert.strictEqual(compatNorm.ok, true, compatNorm.errores.join(" | "));
  assert.strictEqual(compatNorm.valor[0].marcaNorm, "toyota");
  assert.strictEqual(compatNorm.valor[0].modeloNorm, "corolla cross");
  assert.strictEqual(compatNorm.valor[0].anioDesde, 2009);
  assert.strictEqual(compatNorm.valor[0].anioHasta, 2014);
  console.log("  ✅ normalizarCompatibilidad: marcaNorm/modeloNorm los calcula el servidor (ignora lo enviado)");

  /* ==============================================================================
   * 2. Validación
   * ============================================================================== */
  console.log("\n2. Validación");

  const sinCampos = validarProductoAmpliado({ name: "Pastillas", price: 30 });
  assert.strictEqual(sinCampos.ok, true);
  assert.deepStrictEqual(sinCampos.valor, {});
  console.log("  ✅ Producto sin campos nuevos: ok y sin cambios");

  const skuOk = validarProductoAmpliado({ sku: " ab-1 " });
  assert.strictEqual(skuOk.ok, true);
  assert.strictEqual(skuOk.valor.sku, "AB-1");

  const skuVacio = validarProductoAmpliado({ sku: "   " });
  assert.strictEqual(skuVacio.ok, true);
  assert.strictEqual(skuVacio.valor.sku, "");

  assert.strictEqual(validarProductoAmpliado({ sku: "X".repeat(41) }).ok, false, "SKU de 41 caracteres debe fallar");
  assert.strictEqual(validarProductoAmpliado({ sku: "X".repeat(40) }).ok, true, "SKU de 40 caracteres debe pasar");
  console.log("  ✅ SKU: mayúsculas, vacío permitido, máximo 40");

  const anioInvertido = validarProductoAmpliado({
    compatibilidad: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 2014, anioHasta: 2009 }],
  });
  assert.strictEqual(anioInvertido.ok, false);
  assert.ok(anioInvertido.errores.some((e) => /año desde/i.test(e)), "debe avisar año desde > año hasta");

  assert.strictEqual(
    validarProductoAmpliado({ compatibilidad: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 1949 }] }).ok,
    false,
    "año 1949 fuera de rango"
  );
  assert.strictEqual(
    validarProductoAmpliado({ compatibilidad: [{ marca: "Toyota", modelo: "Corolla", anioHasta: 2101 }] }).ok,
    false,
    "año 2101 fuera de rango"
  );
  assert.strictEqual(
    validarProductoAmpliado({ compatibilidad: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 1950, anioHasta: 2100 }] }).ok,
    true,
    "años límite 1950 y 2100 válidos"
  );
  console.log("  ✅ Compatibilidad: año desde > hasta y años fuera de 1950–2100 rechazados");

  assert.strictEqual(validarProductoAmpliado({ compatibilidad: [{ marca: "  ", modelo: "Corolla" }] }).ok, false, "marca vacía");
  assert.strictEqual(validarProductoAmpliado({ compatibilidad: [{ marca: "Toyota", modelo: "" }] }).ok, false, "modelo vacío");
  assert.strictEqual(validarProductoAmpliado({ compatibilidad: [{ marca: "M".repeat(61), modelo: "C" }] }).ok, false, "marca de 61");
  assert.strictEqual(validarProductoAmpliado({ compatibilidad: [{ marca: "T", modelo: "C", motor: "1".repeat(21) }] }).ok, false, "motor de 21");
  assert.strictEqual(validarProductoAmpliado({ compatibilidad: [{ marca: "T", modelo: "C", version: "V".repeat(41) }] }).ok, false, "versión de 41");
  assert.strictEqual(validarProductoAmpliado({ compatibilidad: [{ marca: "T", modelo: "C", nota: "n".repeat(121) }] }).ok, false, "nota de 121");
  assert.strictEqual(validarProductoAmpliado({ compatibilidad: "no-es-lista" }).ok, false, "compatibilidad no lista");
  const demasiadosVehiculos = Array.from({ length: 201 }, () => ({ marca: "Toyota", modelo: "Corolla" }));
  assert.strictEqual(validarProductoAmpliado({ compatibilidad: demasiadosVehiculos }).ok, false, "más de 200 vehículos");
  const doscientos = Array.from({ length: 200 }, () => ({ marca: "Toyota", modelo: "Corolla" }));
  assert.strictEqual(validarProductoAmpliado({ compatibilidad: doscientos }).ok, true, "200 vehículos válidos");
  console.log("  ✅ Compatibilidad: marca/modelo vacíos y límites de longitud y cantidad");

  const oemLargo = "A".repeat(31);
  assert.strictEqual(validarProductoAmpliado({ codigosOEM: [oemLargo] }).ok, false, "OEM de 31 caracteres");
  const oemMuchos = Array.from({ length: 31 }, (_, i) => `OEM${i}`);
  assert.strictEqual(validarProductoAmpliado({ codigosOEM: oemMuchos }).ok, false, "31 códigos OEM");
  const oemDup = validarProductoAmpliado({ codigosOEM: ["04465-02220", "0446502220", "", " 04465 02220 "] });
  assert.strictEqual(oemDup.ok, true);
  assert.deepStrictEqual(oemDup.valor.codigosOEM, ["0446502220"], "OEM normalizados, sin vacíos ni repetidos");
  console.log("  ✅ Códigos OEM: normalizados, sin vacíos ni repetidos, límites de cantidad y longitud");

  const atribMuchos = Array.from({ length: 21 }, (_, i) => ({ nombre: `N${i}`, valor: "v" }));
  assert.strictEqual(validarProductoAmpliado({ atributos: atribMuchos }).ok, false, "21 atributos");
  assert.strictEqual(validarProductoAmpliado({ atributos: [{ nombre: "N".repeat(41), valor: "v" }] }).ok, false, "nombre de atributo de 41");
  assert.strictEqual(validarProductoAmpliado({ atributos: [{ nombre: "Posición", valor: "V".repeat(121) }] }).ok, false, "valor de atributo de 121");
  assert.strictEqual(validarProductoAmpliado({ atributos: [{ nombre: "", valor: "v" }] }).ok, false, "atributo sin nombre");
  assert.strictEqual(validarProductoAmpliado({ atributos: [{ nombre: "Medida", valor: "5W-30" }] }).ok, true);
  console.log("  ✅ Atributos: límites de cantidad y longitud, nombre obligatorio");

  assert.strictEqual(validarProductoAmpliado({ marcaFabricante: "M".repeat(61) }).ok, false, "marca fabricante de 61");
  assert.strictEqual(validarProductoAmpliado({ grupoEquivalencia: "G".repeat(61) }).ok, false, "grupo de 61");
  console.log("  ✅ Marca fabricante y grupo de equivalencia: límites de longitud");

  /* ==============================================================================
   * 3. Hook pre("validate") en el modelo Mongoose (no necesita conexión)
   * ============================================================================== */
  console.log("\n3. Hook pre(\"validate\") del modelo");

  const base = () => ({
    id: `${ID_PREFIJO}hook-${Math.random().toString(36).slice(2, 8)}`,
    name: "Pastillas de freno",
    price: 30,
    categoria: new mongoose.Types.ObjectId(),
  });

  const docOk = new ProductoModel({
    ...base(),
    sku: "pf-001",
    codigosOEM: ["04465-02220"],
    compatibilidad: [{ marca: " Toyota ", modelo: "Corolla", anioDesde: 2009, anioHasta: 2014, motor: "1.8" }],
  });
  await docOk.validate();
  assert.strictEqual(docOk.sku, "PF-001", "SKU normalizado por el hook");
  assert.deepStrictEqual(docOk.codigosOEM, ["0446502220"], "OEM normalizados por el hook");
  assert.strictEqual(docOk.compatibilidad[0].marcaNorm, "toyota", "marcaNorm calculado por el hook");
  assert.strictEqual(docOk.compatibilidad[0].modeloNorm, "corolla");
  console.log("  ✅ Hook: normaliza SKU, OEM y compatibilidad antes de validar");

  const docSinSku = new ProductoModel({ ...base(), sku: "   " });
  await docSinSku.validate();
  assert.strictEqual(docSinSku.sku, undefined, "SKU vacío se guarda sin valor (índice disperso)");
  console.log("  ✅ Hook: SKU vacío queda sin valor");

  const docInvalido = new ProductoModel({
    ...base(),
    compatibilidad: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 2014, anioHasta: 2009 }],
  });
  await assert.rejects(() => docInvalido.validate(), /año desde/i, "el hook debe rechazar año desde > hasta");
  console.log("  ✅ Hook: rechaza compatibilidad inválida con error");

  const docSinMarca = new ProductoModel({ ...base(), compatibilidad: [{ marca: "", modelo: "Corolla" }] });
  await assert.rejects(() => docSinMarca.validate(), "el hook debe rechazar marca vacía");

  const docSinNuevos = new ProductoModel(base());
  await docSinNuevos.validate();
  assert.strictEqual(docSinNuevos.sku, undefined);
  assert.deepStrictEqual(docSinNuevos.codigosOEM, []);
  assert.deepStrictEqual(docSinNuevos.compatibilidad, []);
  console.log("  ✅ Hook: producto sin campos nuevos valida igual que antes");

  /* ==============================================================================
   * 4. Mocks: dbLocal y dbMock guardan y devuelven los campos completos
   * ============================================================================== */
  console.log("\n4. Mocks (dbLocal y dbMock)");

  const datosCompletos = (id: string) => ({
    id,
    name: "Pastillas de freno delanteras",
    price: 30,
    descuentoPct: 10,
    categoria: "cat-freno",
    categorias: ["cat-freno", "cat-frenos-2"],
    activo: true,
    stock: 4,
    trackStock: true,
    sku: "PF-001",
    marcaFabricante: "Bosch",
    codigosOEM: ["0446502220", "0446512610"],
    atributos: [{ nombre: "Posición", valor: "delantera" }],
    grupoEquivalencia: "pastillas-corolla-09-14",
    compatibilidad: [
      { marca: "Toyota", modelo: "Corolla", marcaNorm: "toyota", modeloNorm: "corolla", anioDesde: 2009, anioHasta: 2014, motor: "1.8", version: "", nota: "solo con ABS" },
    ],
  });

  const comprobarCompleto = (p: any, id: string) => {
    assert.ok(p, `producto ${id} debe existir`);
    assert.strictEqual(p.id, id);
    assert.strictEqual(p.sku, "PF-001");
    assert.strictEqual(p.marcaFabricante, "Bosch");
    assert.deepStrictEqual(p.codigosOEM, ["0446502220", "0446512610"]);
    assert.deepStrictEqual(p.atributos, [{ nombre: "Posición", valor: "delantera" }]);
    assert.strictEqual(p.grupoEquivalencia, "pastillas-corolla-09-14");
    assert.strictEqual(p.compatibilidad.length, 1);
    assert.strictEqual(p.compatibilidad[0].marca, "Toyota");
    assert.strictEqual(p.compatibilidad[0].modeloNorm, "corolla");
    assert.strictEqual(p.compatibilidad[0].anioDesde, 2009);
    assert.strictEqual(p.compatibilidad[0].anioHasta, 2014);
    assert.strictEqual(p.compatibilidad[0].motor, "1.8");
    assert.strictEqual(p.compatibilidad[0].nota, "solo con ABS");
    // Regresión: campos actuales
    assert.strictEqual(p.name, "Pastillas de freno delanteras");
    assert.strictEqual(p.price, 30);
    assert.deepStrictEqual(p.categorias, ["cat-freno", "cat-frenos-2"]);
    assert.strictEqual(p.descuentoPct, 10);
  };

  // dbLocal (archivo temporal de pruebas)
  const ProductoLocal = dbLocal.getProductoModel();
  const idLocal = `${ID_PREFIJO}local`;
  await ProductoLocal.create(datosCompletos(idLocal));
  comprobarCompleto(await ProductoLocal.findOne({ id: idLocal }), idLocal);
  const listadoLocal = await ProductoLocal.find({ id: idLocal });
  comprobarCompleto(listadoLocal[0], idLocal);
  await ProductoLocal.findOneAndUpdate({ id: idLocal }, { $set: { sku: "PF-002" } });
  const trasActualizar = await ProductoLocal.findOne({ id: idLocal });
  assert.strictEqual(trasActualizar.sku, "PF-002", "findOneAndUpdate guarda el SKU nuevo");
  assert.strictEqual(trasActualizar.compatibilidad.length, 1, "findOneAndUpdate no pierde la compatibilidad");
  await ProductoLocal.deleteMany({ id: idLocal });
  console.log("  ✅ dbLocal: create, findOne, find y findOneAndUpdate devuelven todos los campos");

  // dbMock
  const ProductoMock = dbMock.getProductoModel();
  const idMock = `${ID_PREFIJO}mock`;
  await ProductoMock.create(datosCompletos(idMock));
  comprobarCompleto(await ProductoMock.findOne({ id: idMock }), idMock);
  comprobarCompleto((await ProductoMock.find({ id: idMock }).lean())[0], idMock);
  await ProductoMock.findOneAndUpdate({ id: idMock }, { $set: { codigosOEM: ["NGK7"] } });
  const mockActualizado = await ProductoMock.findOne({ id: idMock });
  assert.deepStrictEqual(mockActualizado.codigosOEM, ["NGK7"]);
  assert.strictEqual(mockActualizado.compatibilidad[0].marca, "Toyota", "dbMock no pierde la compatibilidad al actualizar");
  await ProductoMock.deleteMany({ id: idMock });
  console.log("  ✅ dbMock: create, findOne, find y findOneAndUpdate devuelven todos los campos");
  console.log("  ℹ️ dbMock no aplica el índice único de SKU ni los hooks de Mongoose: no se prueba la unicidad en el mock.");

  /* ==============================================================================
   * 5. Integridad: sin texto de marca en el código nuevo
   * ============================================================================== */
  console.log("\n5. Integridad");
  const contenidoServicio = fsSync.readFileSync(path.join(__dirname, "../services/productoAmpliado.ts"), "utf8");
  assert.ok(!/VentiMax|Fortunne|Mr\. Pachi|Yuri-Bot|Pachi/i.test(contenidoServicio), "productoAmpliado.ts no debe contener textos de marca");
  console.log("  ✅ productoAmpliado.ts sin texto de marca");

  console.log("\n🎉 TODOS LOS TESTS DE PRODUCTO AMPLIADO (F1-1) PASARON EXITOSAMENTE.");
}

runTests().catch((err) => {
  console.error("❌ Error en suite test-producto-ampliado.ts:", err);
  process.exit(1);
});
