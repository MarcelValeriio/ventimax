/**
 * scripts/test-importacion-productos.ts
 *
 * Suite F1-3: importación y exportación de productos por Excel (.xlsx) o CSV con vista previa.
 * Cubre validación de archivo (extensión, MIME, tamaño), parseo (CSV y xlsx, fórmulas solo como valor),
 * límites (2000 filas), errores por fila, análisis sin BD, vista previa que no escribe, confirmación por SKU
 * que crea y actualiza sin borrar, categorías nuevas, desactivación aparte, plantilla, exportación ida y vuelta,
 * auditoría y comprobaciones estáticas (sin marca en el código, sin innerHTML, íconos de Lucide).
 * Uso: NODE_ENV=test BRAND_NAME=ventimax npx tsx scripts/test-importacion-productos.ts
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
const imp = require("../services/importacionProductos");
const PERMISSIONS = require("../data/permissions");

const ADMIN = { user: "admin", role: "admin", permissions: PERMISSIONS["admin"] };
const CAT_MESA = "65f000000000000000000301";
const CAT_FRENOS = "65f000000000000000000302";
const RAIZ = path.join(__dirname, "..");

/** Respuesta simulada de Express (mismo patrón que las demás suites). */
function mockRes() {
  const out: { status: number; json: any; headers: Record<string, string> } = { status: 200, json: null, headers: {} };
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
    setHeader: (k: string, v: string) => {
      out.headers[k.toLowerCase()] = v;
    },
  };
  return { res, out };
}

/** CSV con `;` (lo que produce Excel en configuración española). Las celdas con `;` o comillas se entrecomillan. */
function csvDe(encabezado: string[], filas: string[][]): Buffer {
  const celda = (c: string) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  const lineas = [encabezado, ...filas].map((f) => f.map(celda).join(";"));
  return Buffer.from(lineas.join("\n"), "utf8");
}

const ENC_PRODUCTOS = imp.COLUMNAS_PRODUCTOS.map((c: any) => c.titulo);
const ENC_COMPAT = imp.COLUMNAS_COMPATIBILIDAD.map((c: any) => c.titulo);
const filaProducto = (d: Record<string, string>) => imp.COLUMNAS_PRODUCTOS.map((c: any) => d[c.clave] ?? "");
const filaCompat = (d: Record<string, string>) => imp.COLUMNAS_COMPATIBILIDAD.map((c: any) => d[c.clave] ?? "");

const archivoCsv = (nombre: string, buffer: Buffer, mimetype = "text/csv", fieldname = "archivo") => ({
  fieldname,
  originalname: nombre,
  mimetype,
  buffer,
  size: buffer.length,
});

/** Siembra categorías y productos de prueba (ids con prefijo test-imp-). Los demás productos no se tocan. */
function sembrar() {
  const data = dbLocal.read();
  data.categorias = [
    { _id: CAT_MESA, nombre: "Mesa", slug: "mesa", activo: true, padre: null },
    { _id: CAT_FRENOS, nombre: "Frenos", slug: "frenos", activo: true, padre: null },
  ];
  data.productos = (data.productos || []).filter((p: any) => !String(p.id).startsWith("test-imp-") && !String(p.id).startsWith("prod-imp-"));
  data.productos.push(
    {
      _id: "t-imp-p1",
      id: "test-imp-p1",
      name: "Pastilla original",
      price: 10,
      descuentoPct: 15,
      categoria: CAT_FRENOS,
      categorias: [],
      activo: true,
      trackStock: false,
      stock: 0,
      imagenes: [],
      sku: "IMP-100",
      codigosOEM: [],
      marcaFabricante: "",
      atributos: [],
      grupoEquivalencia: "",
      compatibilidad: [],
    },
    {
      _id: "t-imp-p3",
      id: "test-imp-p3",
      name: "Filtro que ya no viene",
      price: 8,
      descuentoPct: 0,
      categoria: CAT_MESA,
      categorias: [],
      activo: true,
      trackStock: false,
      stock: 0,
      imagenes: [],
      sku: "IMP-300",
      codigosOEM: [],
      marcaFabricante: "",
      atributos: [],
      grupoEquivalencia: "",
      compatibilidad: [],
    },
  );
  dbLocal.write(data);
}

const productosBd = (): any[] => dbLocal.read().productos || [];
const productoBd = (id: string): any => productosBd().find((p) => p.id === id);

async function contarAuditoria(accion: string): Promise<number> {
  const registros = await dbLocal.getAuditoriaModel().find({ accion });
  return (registros || []).length;
}

/** Archivo de prueba con una fila válida y una inválida, para vista previa y confirmación. */
const CSV_MIXTO = () =>
  csvDe(ENC_PRODUCTOS, [
    filaProducto({ sku: "IMP-NEW1", nombre: "Pastilla nueva", categorias: "Frenos; Nueva Cat", precio: "12,5", stock: "4", controlarStock: "sí", activo: "sí", codigosOEM: "04465-02220; 04465 12610", marcaFabricante: "Bosch" }),
    filaProducto({ sku: "IMP-100", nombre: "Pastilla original", precio: "20" }),
    filaProducto({ sku: "IMP-ERR", nombre: "Sin precio", precio: "" }),
  ]);

async function runTests() {
  // ---------- A. Validación del archivo ----------
  {
    const ok = (nombre: string, mime: string, tamano = 1000, soloCsv = false) =>
      imp.validarArchivoImportacion({ nombre, mimetype: mime, tamano, soloCsv });
    const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    assert.deepStrictEqual(ok("catalogo.xlsx", xlsxMime).formato, "xlsx");
    assert.deepStrictEqual(ok("CATALOGO.CSV", "text/csv").formato, "csv", "la extensión no distingue mayúsculas");
    assert.strictEqual(ok("virus.exe", "application/octet-stream").ok, false, "extensión no permitida");
    assert.strictEqual(ok("catalogo.xlsx", "text/html").ok, false, "xlsx con MIME de HTML se rechaza");
    assert.strictEqual(ok("catalogo.csv", "image/png").ok, false, "csv con MIME de imagen se rechaza");
    assert.strictEqual(ok("catalogo.xlsx", xlsxMime, 2 * 1024 * 1024 + 1).ok, false, "más de 2 MB se rechaza");
    assert.strictEqual(ok("compat.xlsx", xlsxMime, 1000, true).ok, false, "el segundo archivo solo puede ser CSV");
    console.log("  ✅ Archivo: solo .xlsx y .csv, MIME coherente con la extensión, máximo 2 MB");
  }

  // ---------- B. Parseo CSV ----------
  {
    const filas = imp.parsearCsv('﻿A;B\r\n"x;y";"di ""hola"""\r\n1,5;2\n');
    assert.deepStrictEqual(filas[0], ["A", "B"], "BOM quitado, separador ; detectado");
    assert.deepStrictEqual(filas[1], ["x;y", 'di "hola"'], "comillas y punto y coma dentro de celda");
    assert.deepStrictEqual(filas[2], ["1,5", "2"], "coma decimal con separador ;");
    const coma = imp.parsearCsv("sku,nombre\nA1,Bujia");
    assert.deepStrictEqual(coma[1], ["A1", "Bujia"], "separador , si la primera línea trae comas");
    console.log("  ✅ CSV: BOM, separador ; o ,, comillas escapadas, CRLF");
  }

  // ---------- C. Lectura de xlsx (fórmulas solo como valor) ----------
  {
    const ExcelJS = require("exceljs");
    const libro = new ExcelJS.Workbook();
    const hp = libro.addWorksheet("Productos");
    hp.addRow(ENC_PRODUCTOS);
    hp.addRow(["IMP-F1", "Con fórmula", "Mesa", { formula: "10*3", result: 30 }, "2", "no", "", "", "", "", "sí"]);
    hp.addRow(["IMP-F2", { richText: [{ text: "Texto " }, { text: "enriquecido" }] }, "Mesa", "7", "", "", "", "", "", "", ""]);
    const hc = libro.addWorksheet("Compatibilidad");
    hc.addRow(ENC_COMPAT);
    hc.addRow(["IMP-F1", "Toyota", "Corolla", 2009, 2014, "1.8", "", ""]);
    const buffer = Buffer.from(await libro.xlsx.writeBuffer());
    const lectura = await imp.leerArchivoImportacion({ nombre: "prueba.xlsx", buffer });
    assert.deepStrictEqual(lectura.errores, [], `xlsx válido sin errores: ${lectura.errores.join(" | ")}`);
    const f1 = lectura.productos.filas[0].celdas;
    assert.strictEqual(f1.precio, "30", "la fórmula se lee por su valor guardado (30), no se evalúa");
    assert.strictEqual(lectura.productos.filas[1].celdas.nombre, "Texto enriquecido", "texto enriquecido se une");
    assert.strictEqual(lectura.compatibilidad.filas[0].celdas.anioDesde, "2009", "año numérico se lee como texto");
    console.log("  ✅ xlsx: dos hojas, fórmulas leídas solo por su valor, texto enriquecido");
  }

  // ---------- D. Errores de formato del archivo ----------
  {
    const libro = new (require("exceljs").Workbook)();
    libro.addWorksheet("Otra").addRow(["x"]);
    const sinHoja = Buffer.from(await libro.xlsx.writeBuffer());
    const r1 = await imp.leerArchivoImportacion({ nombre: "a.xlsx", buffer: sinHoja });
    assert.ok(r1.errores.some((m: string) => /Falta la hoja "Productos"/.test(m)), "falta la hoja Productos");

    const sinPrecio = csvDe(ENC_PRODUCTOS.filter((t: string) => t !== "Precio"), [["IMP-1", "X"]]);
    const r2 = await imp.leerArchivoImportacion({ nombre: "a.csv", buffer: sinPrecio });
    assert.ok(r2.errores.some((m: string) => /Falta la columna "Precio"/.test(m)), "falta la columna Precio");

    const mas = csvDe(ENC_PRODUCTOS, Array.from({ length: 2001 }, (_, i) => filaProducto({ sku: `IMP-${i}`, nombre: "x", precio: "1" })));
    const r3 = await imp.leerArchivoImportacion({ nombre: "a.csv", buffer: mas });
    assert.ok(r3.errores.some((m: string) => /más de 2000 filas/.test(m)), "2001 filas se rechazan");

    const justo = csvDe(ENC_PRODUCTOS, Array.from({ length: 2000 }, (_, i) => filaProducto({ sku: `IMP-${i}`, nombre: "x", precio: "1" })));
    const r4 = await imp.leerArchivoImportacion({ nombre: "a.csv", buffer: justo });
    assert.deepStrictEqual(r4.errores, [], "2000 filas se aceptan");

    const basura = await imp.leerArchivoImportacion({ nombre: "a.xlsx", buffer: Buffer.from("no es un excel") });
    assert.ok(r1.errores.length && basura.errores.some((m: string) => /No se pudo leer/.test(m)), "un xlsx que no abre da error legible");
    console.log("  ✅ Formato: falta hoja, falta columna, 2001 filas → error; 2000 → ok; archivo roto → error legible");
  }

  // ---------- E. Análisis (sin BD) ----------
  {
    const existentes = [
      { id: "test-imp-p1", sku: "IMP-100", name: "Pastilla original", price: 10, stock: 0, trackStock: false, activo: true, description: "", marcaFabricante: "", codigosOEM: [], grupoEquivalencia: "", categoriaNombres: ["Frenos"], compatibilidad: [] },
      { id: "test-imp-p2", sku: "IMP-200", name: "Igual", price: 12, stock: 0, trackStock: false, activo: true, description: "", marcaFabricante: "", codigosOEM: [], grupoEquivalencia: "", categoriaNombres: ["Mesa"], compatibilidad: [] },
      { id: "test-imp-p3", sku: "IMP-300", name: "Filtro que ya no viene", price: 8, stock: 0, trackStock: false, activo: true, description: "", marcaFabricante: "", codigosOEM: [], grupoEquivalencia: "", categoriaNombres: ["Mesa"], compatibilidad: [] },
    ];
    const categorias = [
      { _id: CAT_MESA, nombre: "Mesa", slug: "mesa" },
      { _id: CAT_FRENOS, nombre: "Frenos", slug: "frenos" },
    ];
    const productos = csvDe(ENC_PRODUCTOS, [
      filaProducto({ sku: "imp-new1", nombre: "Nuevo", categorias: "frénos; Nueva Cat", precio: "12,5" }), // acento y mayúsculas: Frenos existe
      filaProducto({ sku: "IMP-100", nombre: "Pastilla original", precio: "20", stock: "5" }), // cambio de precio y stock
      filaProducto({ sku: "IMP-200", nombre: "Igual", precio: "12" }), // sin cambio
      filaProducto({ sku: "IMP-E1", nombre: "Sin precio", precio: "" }), // precio vacío
      filaProducto({ sku: "IMP-E2", nombre: "Precio cero", precio: "0" }), // precio no mayor a cero
      filaProducto({ sku: "IMP-E6", nombre: "Precio raro", precio: "abc" }), // precio no válido
      filaProducto({ sku: "IMP-E3", nombre: "Sin categoría", precio: "5" }), // nuevo sin categoría
      filaProducto({ nombre: "Sin SKU", precio: "5" }), // falta SKU
      filaProducto({ sku: "IMP-E4", nombre: "Stock raro", precio: "5", stock: "abc" }),
      filaProducto({ sku: "IMP-E5", nombre: "Activo raro", precio: "5", categorias: "Mesa", activo: "quizás" }),
      filaProducto({ sku: "IMP-FORM", nombre: "Dos OEM", precio: "9", categorias: "Mesa", codigosOEM: "ab-12; AB 12; cd" }),
      filaProducto({ sku: "IMP-DUP", nombre: "Duplicado A", precio: "3" }), // SKU repetido: ambas filas se rechazan
      filaProducto({ sku: "IMP-DUP", nombre: "Duplicado B", precio: "4" }),
    ]);
    const compat = csvDe(ENC_COMPAT, [
      filaCompat({ sku: "IMP-100", marca: "Toyota", modelo: "Corolla", anioDesde: "2009", anioHasta: "2014" }),
      filaCompat({ sku: "IMP-100", marca: "Toyota", modelo: "Corolla", anioDesde: "2015", anioHasta: "2010" }), // desde > hasta
      filaCompat({ sku: "IMP-NO-EXISTE", marca: "Ford", modelo: "Ka" }), // SKU que no existe
      filaCompat({ sku: "IMP-E1", marca: "Toyota", modelo: "Yaris" }), // producto con error en la hoja Productos
      filaCompat({ sku: "IMP-300", marca: "Kia", modelo: "Rio", anioDesde: "20x9" }), // año no válido
      filaCompat({ sku: "IMP-FORM", marca: "Kia", modelo: "Picanto", anioDesde: "2010" }),
    ]);
    const lectura = await imp.leerArchivoImportacion({ nombre: "a.csv", buffer: productos, compatibilidad: compat });
    assert.deepStrictEqual(lectura.errores, []);
    const r = imp.analizarImportacion({ productos: lectura.productos, compatibilidad: lectura.compatibilidad, existentes, categorias });

    const motivos = (fila: number, hoja = "Productos") => r.errores.filter((e: any) => e.fila === fila && e.hoja === hoja).map((e: any) => e.motivo).join(" | ");
    assert.ok(/precio está vacío/.test(motivos(5)), `precio vacío: ${motivos(5)}`);
    assert.ok(/mayor a cero/.test(motivos(6)), `precio cero: ${motivos(6)}`);
    assert.ok(/no es válido/.test(motivos(7)), `precio no válido: ${motivos(7)}`);
    assert.ok(/repetido en el archivo/.test(motivos(13)) && /repetido en el archivo/.test(motivos(14)), "SKU repetido: se reportan las dos filas");
    assert.ok(!r.nuevos.some((n: any) => n.sku === "IMP-DUP"), "SKU repetido no se crea");
    assert.ok(/categoría/.test(motivos(8)), `nuevo sin categoría: ${motivos(8)}`);
    assert.ok(/Falta el SKU/.test(motivos(9)), "falta SKU");
    assert.ok(/stock/.test(motivos(10)), "stock no entero");
    assert.ok(/sí o no/.test(motivos(11)), "activo no es sí/no");
    assert.ok(/desde no puede ser mayor/.test(motivos(3, "Compatibilidad")), `desde > hasta: ${motivos(3, "Compatibilidad")}`);
    assert.ok(/no existe en la hoja Productos/.test(motivos(4, "Compatibilidad")), "SKU de compatibilidad inexistente");
    assert.ok(/tiene errores en la hoja Productos/.test(motivos(5, "Compatibilidad")), "compatibilidad de producto con error");
    assert.ok(/año desde no es válido/.test(motivos(6, "Compatibilidad")), "año con letras");

    assert.strictEqual(r.nuevos.length, 2, `nuevos: IMP-NEW1 e IMP-FORM (${r.nuevos.map((n: any) => n.sku)})`);
    assert.ok(r.nuevos.some((n: any) => n.sku === "IMP-NEW1"), "SKU en mayúsculas");
    assert.deepStrictEqual(r.categoriasNuevas, ["Nueva Cat"], "solo se crea la categoría que no existe (Frenos existe sin acento)");
    const cambioP1 = r.cambios.find((c: any) => c.sku === "IMP-100");
    assert.ok(cambioP1, "IMP-100 cambia");
    assert.deepStrictEqual(cambioP1.campos.find((c: any) => c.campo === "Precio"), { campo: "Precio", antes: "$10", despues: "$20" }, "precio antes y después");
    assert.ok(cambioP1.campos.some((c: any) => c.campo === "Compatibilidad"), "la compatibilidad válida de IMP-100 cuenta como cambio");
    assert.ok(r.sinCambio.some((s: any) => s.sku === "IMP-200"), "IMP-200 sin cambio");
    assert.deepStrictEqual(r.noEnArchivo.map((p: any) => p.sku), ["IMP-300"], "IMP-300 activo y fuera del archivo se ofrece desactivar");
    const formNuevo = r.nuevos.find((n: any) => n.sku === "IMP-FORM");
    assert.strictEqual(formNuevo.vehiculos, 1, "compatibilidad de un producto nuevo");
    const aplicarForm = r.aplicar.nuevos.find((n: any) => n.sku === "IMP-FORM").datos;
    assert.deepStrictEqual(aplicarForm.codigosOEM, ["AB12", "CD"], "OEM normalizados y sin repetidos");
    assert.strictEqual(r.resumen.errores, r.errores.length, "el resumen cuenta los errores");
    console.log(`  ✅ Análisis: nuevos ${r.resumen.nuevos}, cambios ${r.resumen.cambios}, sin cambio ${r.resumen.sinCambio}, errores ${r.resumen.errores}, no en archivo ${r.resumen.noEnArchivo}`);
  }

  // ---------- F. Integración con la base de prueba ----------
  sembrar();
  const { res: resPrev, out: outPrev } = mockRes();
  const productosAntes = productosBd().length;
  const auditoriaAntes = await contarAuditoria("importar_productos");
  const archivoMixto = archivoCsv("mixto.csv", CSV_MIXTO());
  const compatMixto = archivoCsv("compat.csv", csvDe(ENC_COMPAT, []), "text/csv", "compatibilidad");

  {
    // Vista previa: no escribe nada
    await adminController.previsualizarImportacionProductos({ user: ADMIN, files: { archivo: [archivoMixto] } }, resPrev);
    assert.strictEqual(outPrev.status, 200, `vista previa 200 (${JSON.stringify(outPrev.json)})`);
    assert.strictEqual(outPrev.json.data.resumen.nuevos, 1);
    assert.strictEqual(outPrev.json.data.resumen.cambios, 1);
    assert.ok(outPrev.json.data.errores.length >= 1, "la fila sin precio aparece como error");
    assert.strictEqual(outPrev.json.data.aplicar, undefined, "la vista previa no envía lo que se aplicaría");
    assert.strictEqual(productosBd().length, productosAntes, "vista previa no crea productos");
    assert.strictEqual(productoBd("test-imp-p1").price, 10, "vista previa no cambia precios");
    assert.strictEqual(await contarAuditoria("importar_productos"), auditoriaAntes, "vista previa no audita");
    console.log("  ✅ Vista previa: responde el resumen y no escribe en la BD ni en la auditoría");
  }

  {
    // Confirmar con errores: no aplica nada
    const { res, out } = mockRes();
    await adminController.confirmarImportacionProductos({ user: ADMIN, files: { archivo: [archivoMixto] } }, res);
    assert.strictEqual(out.status, 400, "confirmar con errores responde 400");
    assert.ok(Array.isArray(out.json.errores) && out.json.errores.length >= 1);
    assert.strictEqual(productosBd().length, productosAntes, "con errores no se crea nada");
    assert.strictEqual(productoBd("test-imp-p1").price, 10, "con errores no se cambia nada");
    console.log("  ✅ Confirmar con errores: 400 y no aplica nada");
  }

  {
    // Confirmar archivo válido: crea, actualiza por SKU, crea categoría, no borra, conserva descuento
    const valido = archivoCsv(
      "valido.csv",
      csvDe(ENC_PRODUCTOS, [
        filaProducto({ sku: "IMP-NEW1", nombre: "Pastilla nueva", categorias: "Frenos; Nueva Cat", precio: "12,5", stock: "4", controlarStock: "sí", activo: "sí", codigosOEM: "04465-02220; 04465 12610", marcaFabricante: "Bosch" }),
        filaProducto({ sku: "IMP-100", nombre: "Pastilla original", precio: "20" }),
      ]),
    );
    const compatValida = archivoCsv("compat.csv", csvDe(ENC_COMPAT, [filaCompat({ sku: "IMP-NEW1", marca: "Toyota", modelo: "Corolla", anioDesde: "2009", anioHasta: "2014", motor: "1.8" })]), "text/csv", "compatibilidad");
    const { res, out } = mockRes();
    await adminController.confirmarImportacionProductos({ user: ADMIN, files: { archivo: [valido], compatibilidad: [compatValida] } }, res);
    assert.strictEqual(out.status, 200, `confirmar 200 (${JSON.stringify(out.json)})`);
    assert.strictEqual(out.json.data.creados, 1);
    assert.strictEqual(out.json.data.actualizados, 1);
    assert.deepStrictEqual(out.json.data.categoriasCreadas, ["Nueva Cat"]);
    assert.ok(out.json.data.noEnArchivo.some((p: any) => p.id === "test-imp-p3"), "lista los productos fuera del archivo");

    const nuevo = productosBd().find((p) => p.sku === "IMP-NEW1");
    assert.ok(nuevo, "IMP-NEW1 se creó");
    assert.strictEqual(String(nuevo.categoria), CAT_FRENOS, "categoría principal = primera del archivo (Frenos)");
    assert.strictEqual(nuevo.price, 12.5, "precio con coma decimal");
    assert.deepStrictEqual(nuevo.codigosOEM, ["0446502220", "0446512610"], "OEM normalizados al guardar");
    assert.strictEqual(nuevo.compatibilidad[0].modeloNorm, "corolla", "la compatibilidad se guarda con la forma normalizada");
    assert.strictEqual(nuevo.compatibilidad[0].motor, "1.8");
    assert.ok(dbLocal.read().categorias.some((c: any) => c.nombre === "Nueva Cat"), "la categoría nueva queda en la BD");

    const actualizado = productoBd("test-imp-p1");
    assert.strictEqual(actualizado.price, 20, "IMP-100 actualizado por SKU");
    assert.strictEqual(actualizado.descuentoPct, 15, "regresión: el descuento no lo toca la importación");
    assert.ok(productoBd("test-imp-p3"), "nada se borra: IMP-300 sigue");
    assert.strictEqual(productoBd("test-imp-p3").activo, true, "IMP-300 sigue activo hasta que el usuario lo decida");
    assert.strictEqual(await contarAuditoria("importar_productos"), auditoriaAntes + 1, "la importación queda en la auditoría");
    console.log("  ✅ Confirmar: crea IMP-NEW1 con categorías y compatibilidad, actualiza IMP-100 por SKU, no borra, audita");
  }

  {
    // Desactivar: acción aparte, no borra
    const { res, out } = mockRes();
    await adminController.desactivarProductosImportacion({ user: ADMIN, body: { ids: ["test-imp-p3"] } }, res);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.json.data.desactivados, 1);
    assert.strictEqual(productoBd("test-imp-p3").activo, false, "IMP-300 desactivado");
    assert.ok(productoBd("test-imp-p3"), "desactivar no borra");
    const malo = mockRes();
    await adminController.desactivarProductosImportacion({ user: ADMIN, body: { ids: "todos" } }, malo.res);
    assert.strictEqual(malo.out.status, 400, "ids que no son una lista se rechazan");
    console.log("  ✅ Desactivar: solo marca activo=false; ids inválidos → 400");
  }

  {
    // Plantilla: dos hojas con las columnas del diseño
    const { res, out } = mockRes();
    await adminController.descargarPlantillaProductos({ user: ADMIN }, res);
    assert.strictEqual(out.status, 200);
    assert.ok(/spreadsheetml/.test(out.headers["content-type"]), "tipo xlsx");
    assert.ok(/attachment; filename="plantilla-productos\.xlsx"/.test(out.headers["content-disposition"]), "descarga adjunta");
    const lectura = await imp.leerArchivoImportacion({ nombre: "plantilla.xlsx", buffer: out.json });
    assert.deepStrictEqual(lectura.errores, [], "la plantilla se lee sin errores");
    assert.strictEqual(lectura.productos.filas.length, 0);
    assert.strictEqual(lectura.compatibilidad.filas.length, 0);
    console.log("  ✅ Plantilla: xlsx vacío con las hojas Productos y Compatibilidad");
  }

  {
    // Exportar y volver a importar: los productos IMP quedan sin cambios
    const { res, out } = mockRes();
    await adminController.exportarProductos({ user: ADMIN }, res);
    assert.strictEqual(out.status, 200, "exportar 200");
    const lectura = await imp.leerArchivoImportacion({ nombre: "export.xlsx", buffer: out.json });
    const bd = productosBd().length;
    assert.strictEqual(lectura.productos.filas.length, bd, "exporta todos los productos");
    const r = imp.analizarImportacion({
      productos: lectura.productos,
      compatibilidad: lectura.compatibilidad,
      existentes: productosBd().map((p) => ({
        id: p.id, sku: p.sku, name: p.name, price: p.price, stock: p.stock, trackStock: p.trackStock, activo: p.activo,
        description: p.description, marcaFabricante: p.marcaFabricante, codigosOEM: p.codigosOEM, grupoEquivalencia: p.grupoEquivalencia,
        categoriaNombres: [p.categoria, ...(p.categorias || [])].map((id: any) => (dbLocal.read().categorias || []).find((c: any) => String(c._id) === String(id))?.nombre).filter(Boolean),
        compatibilidad: p.compatibilidad || [],
      })),
      categorias: dbLocal.read().categorias,
    });
    const errorIMP = r.errores.filter((e: any) => /IMP-/.test(String(e.motivo)) || /IMP-/.test(String(e.fila)));
    assert.strictEqual(errorIMP.length, 0, `ningún producto IMP da error al re-importar: ${JSON.stringify(errorIMP)}`);
    assert.ok(r.sinCambio.some((s: any) => s.sku === "IMP-100"), "IMP-100 sin cambios al re-importar su exportación");
    assert.ok(r.sinCambio.some((s: any) => s.sku === "IMP-NEW1"), "IMP-NEW1 sin cambios al re-importar su exportación");
    assert.ok(!r.cambios.some((c: any) => c.sku === "IMP-100"), "ningún cambio fantasma");
    console.log("  ✅ Exportar: ida y vuelta sin cambios fantasma");
  }

  // ---------- G. Comprobaciones estáticas ----------
  {
    const servicio = fsSync.readFileSync(path.join(RAIZ, "services/importacionProductos.ts"), "utf8");
    const rutas = fsSync.readFileSync(path.join(RAIZ, "routes/adminRoutes.ts"), "utf8");
    const marca = /Fortunne|VentiMax|Yuri|Pachi/i;
    assert.ok(!marca.test(servicio), "sin texto de marca en el servicio");
    assert.ok(!marca.test(rutas.slice(rutas.indexOf("uploadImportacionProductos"), rutas.indexOf("uploadImportacionProductos") + 2000)), "sin marca en el multer de importación");
    assert.ok(!/eval\(|new Function\(/.test(servicio), "nada ejecuta código del archivo");
    assert.ok(/MIMES_XLSX/.test(servicio) && /MIMES_CSV/.test(servicio), "MIME por tipo de archivo");
    assert.ok(/authorize\(\["config:manage"\]\)/.test(rutas), "permiso config:manage");
    console.log("  ✅ Estático: sin marca, sin ejecución de código del archivo, permiso config:manage");
  }

  {
    const rutaModal = path.join(RAIZ, "public/src/features/inventory/components/ImportarProductosModal.js");
    const rutaTab = path.join(RAIZ, "public/src/features/inventory/components/ProductTab.js");
    assert.ok(fsSync.existsSync(rutaModal), "existe el modal de importación");
    const modal = fsSync.readFileSync(rutaModal, "utf8");
    const tab = fsSync.readFileSync(rutaTab, "utf8");
    assert.ok(!/innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML/.test(modal), "modal sin innerHTML");
    assert.ok(!/<script/i.test(modal), "modal sin scripts en línea");
    assert.ok(!/\bon(click|change|submit|input|load)\s*=/i.test(modal), "modal sin atributos on*");
    assert.ok(!/Fortunne|VentiMax|Yuri|Pachi/i.test(modal), "modal sin texto de marca");
    assert.ok(!/innerHTML/.test(tab), "ProductTab sin innerHTML");
    assert.ok(/from "\.\.\/\.\.\/\.\.\/components\/Icono\.js"/.test(modal), "íconos con Icono");
    assert.ok(/ImportarProductosModal/.test(tab), "ProductTab abre el modal");
    // Cada ícono usado existe en Lucide (vendorizado)
    const lucide = fsSync.readFileSync(path.join(RAIZ, "public/src/lib/lucide.js"), "utf8");
    const usados = [...modal.matchAll(/nombre:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
    assert.ok(usados.length > 0, "el modal usa íconos");
    for (const nombre of usados) {
      assert.ok(lucide.includes(`"${nombre}": [`), `ícono de Lucide inexistente: ${nombre}`);
    }
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(modal), "sin emojis en el modal");
    console.log(`  ✅ Panel: modal con Icono (${usados.length} íconos de Lucide), sin innerHTML ni on*, enlazado en Inventario`);
  }

  console.log("\n🎉 TODOS LOS TESTS DE IMPORTACIÓN DE PRODUCTOS (F1-3) PASARON EXITOSAMENTE.");
}

runTests().catch((err) => {
  console.error("❌ Error en suite test-importacion-productos.ts:", err);
  process.exit(1);
});
