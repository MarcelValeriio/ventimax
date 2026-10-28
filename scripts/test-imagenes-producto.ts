/**
 * scripts/test-imagenes-producto.ts
 * Suite de pruebas automatizadas para la tarea F0-9:
 * Imágenes de producto (Cloudinary, endpoints, panel, y envío por bot antes de cantidad).
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const adminController = require("../controllers/adminController");
const chatFlowService = require("../services/chatFlowService");
const orderService = require("../services/orderService");
const configManager = require("../services/configManager");
const cloudinaryService = require("../services/cloudinaryService");
const whatsapp = require("../services/whatsapp");
const { seedDatabase } = require("../services/dbSeed");

function mockReqRes(options: {
  body?: any;
  params?: any;
  query?: any;
  file?: any;
  user?: any;
} = {}) {
  const req: any = {
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    file: options.file || null,
    user: options.user || { role: "admin", id: "u-admin", nombre: "Admin Test" },
  };
  let statusCode = 200;
  let responseData: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
    send: (data: any) => {
      responseData = data;
      return res;
    },
    getStatus: () => statusCode,
    getData: () => responseData,
  };

  return { req, res };
}

async function runTests() {
  console.log("================================================================================");
  console.log("🖼️  SUITE DE PRUEBAS: IMÁGENES DE PRODUCTO (F0-9)");
  console.log("================================================================================");

  const Producto = dbLocal.getProductoModel();
  const Etiqueta = dbLocal.getEtiquetaModel();
  const Auditoria = dbLocal.getAuditoriaModel();

  await Producto.deleteMany({});
  await Etiqueta.deleteMany({});
  if (Auditoria && Auditoria.deleteMany) await Auditoria.deleteMany({});

  // --------------------------------------------------------------------------
  // TEST 1: Permisos y autorización granular (product:edit)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 1: Verificación de permisos y autorización granular...");

  const PERMISSIONS = require("../data/permissions");
  assert.ok(PERMISSIONS.admin.includes("product:edit"), "admin debe tener permiso product:edit");
  assert.ok(PERMISSIONS.cajero.includes("product:edit"), "cajero debe tener permiso product:edit");
  assert.ok(
    !PERMISSIONS.repartidor.includes("product:edit"),
    "repartidor NO debe tener permiso product:edit",
  );

  console.log("  ✅ Permiso product:edit correctamente asignado en la matriz de roles");

  // --------------------------------------------------------------------------
  // TEST 2: Validación de archivos (sin archivo y archivo inválido)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 2: Validación de entrada en postProductImage...");

  // 2.1 Sin archivo
  const { req: reqSinArchivo, res: resSinArchivo } = mockReqRes({
    params: { id: "prod-inexistente" },
    file: null,
  });
  await adminController.postProductImage(reqSinArchivo, resSinArchivo);
  assert.strictEqual(resSinArchivo.getStatus(), 400, "Debe rechazar petición sin archivo con 400");
  assert.ok(resSinArchivo.getData().error.includes("No se proporcionó"));

  // 2.2 Producto no encontrado
  const { req: reqNoProd, res: resNoProd } = mockReqRes({
    params: { id: "prod-404" },
    file: { buffer: Buffer.from("fake-image"), mimetype: "image/png" },
  });
  await adminController.postProductImage(reqNoProd, resNoProd);
  assert.strictEqual(resNoProd.getStatus(), 404, "Debe devolver 404 si el producto no existe");

  console.log("  ✅ Validaciones iniciales superadas (sin archivo y producto 404)");

  // --------------------------------------------------------------------------
  // TEST 3: Subida de imágenes a Cloudinary (hasta 5) y rechazo de la sexta
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 3: Subida de imágenes (hasta 5) y rechazo de la 6ta...");

  const productoTest = await Producto.create({
    id: "fortunne-fan-test",
    name: "Fortunne Test Fan 12\"",
    price: 45,
    description: "Ventilador de prueba silencioso",
    imagenes: [],
    activo: true,
  });

  // Subir 5 imágenes consecutivas
  for (let i = 1; i <= 5; i++) {
    const { req, res } = mockReqRes({
      params: { id: productoTest.id },
      file: {
        buffer: Buffer.from(`fake-image-bytes-${i}`),
        mimetype: "image/jpeg",
        originalname: `foto_${i}.jpg`,
      },
    });
    await adminController.postProductImage(req, res);
    assert.strictEqual(res.getStatus(), 201, `La imagen ${i} debe crearse con status 201`);
    const data = res.getData().data;
    assert.strictEqual(data.imagenes.length, i, `Debe haber ${i} imágenes en el producto`);
    assert.ok(data.imagenes[i - 1].url, "La imagen debe contener URL segura");
    assert.ok(data.imagenes[i - 1].publicId, "La imagen debe contener publicId");
  }

  // Intentar subir la sexta imagen -> debe rechazar con 400
  const { req: reqSexta, res: resSexta } = mockReqRes({
    params: { id: productoTest.id },
    file: {
      buffer: Buffer.from("fake-image-bytes-6"),
      mimetype: "image/webp",
    },
  });
  await adminController.postProductImage(reqSexta, resSexta);
  assert.strictEqual(resSexta.getStatus(), 400, "La sexta imagen debe ser rechazada con status 400");
  assert.ok(
    resSexta.getData().error.includes("5 imágenes") || resSexta.getData().error.includes("máximo"),
    "Mensaje de error debe indicar límite de 5 imágenes alcanzado",
  );

  // Verificar auditoría
  const auditoriasSubida = await Auditoria.find({ accion: "subir_imagen_producto" });
  assert.strictEqual(auditoriasSubida.length, 5, "Deben existir 5 registros de auditoría por subidas");

  console.log("  ✅ Límite estricto de 5 imágenes y auditoría verificados con éxito");

  // --------------------------------------------------------------------------
  // TEST 4: Modo local sin credenciales de Cloudinary
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 4: Comportamiento cuando Cloudinary no está configurado...");

  process.env.FORZAR_CLOUDINARY_DESCONFIGURADO = "true";

  // Verificar que la función de servicio lanza el error requerido
  await assert.rejects(
    async () => {
      await cloudinaryService.subirImagenProducto(Buffer.from("test"));
    },
    /Cloudinary no está configurado/,
    "subirImagenProducto debe lanzar 'Cloudinary no está configurado'",
  );

  await assert.rejects(
    async () => {
      await cloudinaryService.borrarImagen("test-id");
    },
    /Cloudinary no está configurado/,
    "borrarImagen debe lanzar 'Cloudinary no está configurado'",
  );

  // Verificar que el endpoint devuelve 400 con ese mensaje claro
  const prodParaSinCloud = await Producto.create({
    id: "prod-sin-cloud",
    name: "Sin Cloudinary",
    price: 10,
    imagenes: [],
    activo: true,
  });
  const { req: reqSinCloud, res: resSinCloud } = mockReqRes({
    params: { id: prodParaSinCloud.id },
    file: { buffer: Buffer.from("test"), mimetype: "image/png" },
  });
  await adminController.postProductImage(reqSinCloud, resSinCloud);
  assert.strictEqual(resSinCloud.getStatus(), 400);
  assert.strictEqual(resSinCloud.getData().error, "Cloudinary no está configurado");

  delete process.env.FORZAR_CLOUDINARY_DESCONFIGURADO;
  console.log("  ✅ Error 'Cloudinary no está configurado' manejado limpiamente");

  // --------------------------------------------------------------------------
  // TEST 5: Marcar imagen como principal (PUT /products/:id/imagenes/principal)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 5: Marcar imagen como principal...");

  const prodActual = await Producto.findOne({ id: productoTest.id });
  const imagenTerceraOriginal = prodActual.imagenes[2];

  // 5.1 Mover la imagen en índice 2 al primer lugar (índice 0)
  const { req: reqPrincipal, res: resPrincipal } = mockReqRes({
    params: { id: productoTest.id },
    body: { indice: 2 },
  });
  await adminController.setPrimaryProductImage(reqPrincipal, resPrincipal);
  assert.strictEqual(resPrincipal.getStatus(), 200, "Debe retornar 200 al marcar principal");
  const prodConNuevaPrincipal = resPrincipal.getData().data;
  assert.strictEqual(
    prodConNuevaPrincipal.imagenes[0].publicId,
    imagenTerceraOriginal.publicId,
    "La imagen seleccionada debe estar ahora en el primer lugar (índice 0)",
  );

  // 5.2 Índice inválido
  const { req: reqIndiceInval, res: resIndiceInval } = mockReqRes({
    params: { id: productoTest.id },
    body: { indice: 99 },
  });
  await adminController.setPrimaryProductImage(reqIndiceInval, resIndiceInval);
  assert.strictEqual(resIndiceInval.getStatus(), 400, "Índice fuera de rango debe dar 400");

  const auditoriasPrincipal = await Auditoria.find({ accion: "marcar_imagen_principal_producto" });
  assert.strictEqual(auditoriasPrincipal.length, 1, "Debe registrar auditoría de cambio de principal");

  console.log("  ✅ Cambio de imagen principal verificado exitosamente");

  // --------------------------------------------------------------------------
  // TEST 6: Eliminar imagen (DELETE /products/:id/imagenes/:indice)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 6: Eliminación de imagen y resiliencia ante fallos de Cloudinary...");

  // 6.1 Eliminar imagen en índice 0
  const { req: reqDel, res: resDel } = mockReqRes({
    params: { id: productoTest.id, indice: "0" },
  });
  await adminController.deleteProductImage(reqDel, resDel);
  assert.strictEqual(resDel.getStatus(), 200, "Debe retornar 200 al eliminar imagen");
  const prodTrasBorrar = resDel.getData().data;
  assert.strictEqual(prodTrasBorrar.imagenes.length, 4, "Debe quedar con 4 imágenes");

  // 6.2 Eliminar con fallo simulado en Cloudinary -> debe remover la imagen igualmente y no fallar
  const originalBorrar = cloudinaryService.borrarImagen;
  cloudinaryService.borrarImagen = async () => {
    throw new Error("Fallo de red simulado en Cloudinary");
  };

  const { req: reqDelFallo, res: resDelFallo } = mockReqRes({
    params: { id: productoTest.id, indice: "0" },
  });
  await adminController.deleteProductImage(reqDelFallo, resDelFallo);
  assert.strictEqual(
    resDelFallo.getStatus(),
    200,
    "Debe completar la eliminación aunque Cloudinary falle (resiliencia)",
  );
  assert.strictEqual(resDelFallo.getData().data.imagenes.length, 3, "Debe quedar con 3 imágenes");

  cloudinaryService.borrarImagen = originalBorrar;

  // 6.3 Índice inválido
  const { req: reqDelInval, res: resDelInval } = mockReqRes({
    params: { id: productoTest.id, indice: "99" },
  });
  await adminController.deleteProductImage(reqDelInval, resDelInval);
  assert.strictEqual(resDelInval.getStatus(), 400);

  const auditoriasBorrado = await Auditoria.find({ accion: "eliminar_imagen_producto" });
  assert.strictEqual(auditoriasBorrado.length, 2, "Debe registrar auditorías de eliminación");

  console.log("  ✅ Eliminación de imagen y resiliencia verificadas exitosamente");

  // --------------------------------------------------------------------------
  // TEST 7: GET /api/admin/products devuelve el campo imagenes
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 7: GET /api/admin/products expone el campo imagenes...");

  const { req: reqGet, res: resGet } = mockReqRes({});
  await adminController.getProducts(reqGet, resGet);
  assert.strictEqual(resGet.getStatus(), 200);
  const listaProductos = resGet.getData().data;
  const prodEncontrado = listaProductos.find((p: any) => p.id === productoTest.id);
  assert.ok(prodEncontrado, "El producto de prueba debe estar en el listado");
  assert.ok(Array.isArray(prodEncontrado.imagenes), "imagenes debe ser un array");
  assert.strictEqual(prodEncontrado.imagenes.length, 3, "Debe contener las 3 imágenes actuales");

  console.log("  ✅ GET /api/admin/products incluye correctamente el array de imágenes");

  // --------------------------------------------------------------------------
  // TEST 8: Siembra de catálogo con imágenes opcionales en dbSeed.ts
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 8: Siembra de products.json con soporte de imagenes opcionales...");

  await Producto.deleteMany({});
  const originalGet = configManager.get;
  configManager.get = (key: string) => {
    if (key === "products") {
      return [
        {
          id: "prod-seed-img",
          name: "Producto Semilla Con Foto",
          price: 25,
          imagenes: ["https://example.com/foto1.jpg", "https://example.com/foto2.jpg"],
          categorias: ["Mesa"],
        },
      ];
    }
    return originalGet.call(configManager, key);
  };

  await seedDatabase();
  configManager.get = originalGet;

  const prodSembrado = await Producto.findOne({ id: "prod-seed-img" });
  assert.ok(prodSembrado, "El producto sembrado debe existir");
  assert.strictEqual(prodSembrado.imagenes.length, 2, "Debe haber sembrado las 2 imágenes");
  assert.strictEqual(prodSembrado.imagenes[0].url, "https://example.com/foto1.jpg");
  assert.strictEqual(prodSembrado.imagenes[0].publicId, "", "publicId debe ser string vacío en la siembra");

  console.log("  ✅ Siembra con imagenes opcionales validada exitosamente");

  // --------------------------------------------------------------------------
  // TEST 9: Bot de WhatsApp - Envío de foto antes de la pregunta de cantidad
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 9: Bot de WhatsApp envía foto de producto antes de pedir cantidad...");

  const fromBot = "584129996601";
  const imagenesEnviadasWhatsApp: { to: string; url: string; caption: string }[] = [];
  const textosEnviadosWhatsApp: string[] = [];

  const originalEnviarImagenPorUrl = whatsapp.enviarImagenPorUrl;
  const originalEnviarTexto = whatsapp.enviarTexto;

  whatsapp.enviarImagenPorUrl = async (to: string, url: string, caption: string) => {
    imagenesEnviadasWhatsApp.push({ to, url, caption });
    return originalEnviarImagenPorUrl(to, url, caption);
  };

  whatsapp.enviarTexto = async (to: string, text: string) => {
    textosEnviadosWhatsApp.push(text);
    return originalEnviarTexto(to, text);
  };

  const fakeIo = { emit: () => {} };

  // Crear dos productos: uno con imagen y otro sin imagen
  await Producto.deleteMany({});
  const prodConFoto = await Producto.create({
    id: "prod-con-foto",
    name: "Fortunne Turbo Fan Con Foto",
    price: 40,
    description: "Excelente flujo de aire",
    imagenes: [{ url: "https://res.cloudinary.com/test/prod_fan.png", publicId: "test_fan" }],
    activo: true,
  });

  const prodSinFoto = await Producto.create({
    id: "prod-sin-foto",
    name: "Fortunne Turbo Fan Sin Foto",
    price: 30,
    description: "Sin foto disponible",
    imagenes: [],
    activo: true,
  });

  // 9.1 Producto CON foto y sendProductImage activo -> debe enviar imagen antes de la cantidad
  await Etiqueta.create({
    telefono: fromBot,
    paso: "esperando_producto",
    carrito: { items: [] },
  });

  imagenesEnviadasWhatsApp.length = 0;
  textosEnviadosWhatsApp.length = 0;

  await chatFlowService.handleEsperandoProducto({
    from: fromBot,
    text: prodConFoto.id,
    low: prodConFoto.id,
    io: fakeIo,
    estado: await Etiqueta.findOne({ telefono: fromBot }),
  });

  let estadoBot = await Etiqueta.findOne({ telefono: fromBot });
  assert.strictEqual(estadoBot.paso, "esperando_cantidad", "El paso debe avanzar a esperando_cantidad");
  assert.strictEqual(imagenesEnviadasWhatsApp.length, 1, "Debe haber enviado 1 imagen por WhatsApp");
  assert.strictEqual(imagenesEnviadasWhatsApp[0].url, prodConFoto.imagenes[0].url);
  assert.ok(
    imagenesEnviadasWhatsApp[0].caption.includes("Fortunne Turbo Fan Con Foto — $40"),
    "El caption debe contener '<nombre> — $<precio>'",
  );
  assert.ok(
    imagenesEnviadasWhatsApp[0].caption.includes("Excelente flujo de aire"),
    "El caption debe contener la descripción del producto",
  );

  // 9.2 Producto SIN foto -> NO envía imagen y avanza normalmente
  const fromBotSinFoto = "584129996602";
  await Etiqueta.create({
    telefono: fromBotSinFoto,
    paso: "esperando_producto",
    carrito: { items: [] },
  });

  imagenesEnviadasWhatsApp.length = 0;
  await chatFlowService.handleEsperandoProducto({
    from: fromBotSinFoto,
    text: prodSinFoto.id,
    low: prodSinFoto.id,
    io: fakeIo,
    estado: await Etiqueta.findOne({ telefono: fromBotSinFoto }),
  });

  let estadoBotSinFoto = await Etiqueta.findOne({ telefono: fromBotSinFoto });
  assert.strictEqual(estadoBotSinFoto.paso, "esperando_cantidad");
  assert.strictEqual(imagenesEnviadasWhatsApp.length, 0, "No debe enviar imagen si el producto no tiene fotos");

  // 9.3 Producto CON foto pero sendProductImage: false -> NO envía imagen
  const originalGetFeature = configManager.get;
  configManager.get = (key: string) => {
    if (key === "settings.features.sendProductImage") return false;
    return originalGetFeature.call(configManager, key);
  };

  const fromBotDesactivado = "584129996603";
  await Etiqueta.create({
    telefono: fromBotDesactivado,
    paso: "esperando_producto",
    carrito: { items: [] },
  });

  imagenesEnviadasWhatsApp.length = 0;
  await chatFlowService.handleEsperandoProducto({
    from: fromBotDesactivado,
    text: prodConFoto.id,
    low: prodConFoto.id,
    io: fakeIo,
    estado: await Etiqueta.findOne({ telefono: fromBotDesactivado }),
  });

  configManager.get = originalGetFeature;
  assert.strictEqual(
    imagenesEnviadasWhatsApp.length,
    0,
    "No debe enviar imagen si sendProductImage está en false",
  );

  // 9.4 Resiliencia: si enviarImagenPorUrl falla, el bot loguea ⚠️ y el flujo no se interrumpe
  whatsapp.enviarImagenPorUrl = async () => {
    throw new Error("Simulated WhatsApp Media API Failure");
  };

  const fromBotFallo = "584129996604";
  await Etiqueta.create({
    telefono: fromBotFallo,
    paso: "esperando_producto",
    carrito: { items: [] },
  });

  await chatFlowService.handleEsperandoProducto({
    from: fromBotFallo,
    text: prodConFoto.id,
    low: prodConFoto.id,
    io: fakeIo,
    estado: await Etiqueta.findOne({ telefono: fromBotFallo }),
  });

  let estadoBotFallo = await Etiqueta.findOne({ telefono: fromBotFallo });
  assert.strictEqual(
    estadoBotFallo.paso,
    "esperando_cantidad",
    "El flujo debe continuar a esperando_cantidad aunque el envío de la foto falle",
  );

  // Restaurar espías
  whatsapp.enviarImagenPorUrl = originalEnviarImagenPorUrl;
  whatsapp.enviarTexto = originalEnviarTexto;

  console.log("  ✅ Envío condicional de imagen por WhatsApp y resiliencia validados");

  // Limpieza final
  await Producto.deleteMany({});
  await Etiqueta.deleteMany({});

  console.log("\n================================================================================");
  console.log("🎉 TODOS LOS CASOS DE PRUEBA DE IMÁGENES DE PRODUCTO PASARON EXITOSAMENTE (9/9)");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("❌ Fallo en suite test-imagenes-producto.ts:", err);
  process.exit(1);
});
