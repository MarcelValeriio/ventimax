/**
 * scripts/test-inbox-service.js
 *
 * Suite de integración del INBOX UNIFICADO (Fase 2A) — contrato:
 * docs/inbox-unificado-contrato.md
 *
 * Verifica, con los 3 canales (whatsapp · instagram · messenger):
 *  1. Normalización al objeto `ConversacionUnificada` (§6.2 / tabla de brechas §7).
 *  2. Orden por `ultimoMensaje.timestamp` DESC garantizado por el servidor (§6.1).
 *  3. Filtros por canal y filtros de servidor (noLeidos/modo/atencion/conPedido/buscar).
 *  4. Definición ÚNICA de `requiereAtencion` (§6.2.1) en el inbox Y en el
 *     historial legacy de Instagram.
 *  5. `POST /api/admin/inbox/leido` idempotente (§6.3) + defecto 1 corregido:
 *     `GET /api/admin/ig/historial?usuario=` ya NO escribe estado.
 *  6. Códigos de error 400 · 403 · 404 · 409 · 501.
 *  7. Evento Socket.IO `inbox_actualizado` (§6.4) y contador de no leídos de
 *     WhatsApp (§9.1).
 *  8. Retrocompatibilidad: los endpoints legacy siguen con su shape original.
 *  9. LOTE B4: ficha del cliente (`GET /inbox/contexto`) y acciones de pedido desde
 *     el inbox — confirmar pago, despachar, marcar entregado y asignar repartidor
 *     (WA-14/15/35/36/37 · WA-118..130), con la invalidación `inbox_actualizado`
 *     tipo `pedido` y las guardas 400/404/409.
 *
 * Ejecución: NODE_ENV=test npx tsx scripts/test-inbox-service.js
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_jwt_secret_inbox_12345";
process.env.ADMIN_PHONE_NUMBER = "584120000000";
process.env.WEBHOOK_DEBOUNCE_MS = "0";

const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const FormData = require("form-data");

const dbLocal = require("../services/dbLocal");
const adminRoutes = require("../routes/adminRoutes");
const inboxService = require("../services/inboxService");
const normalizar = require("../services/inbox/normalizar");
const orderService = require("../services/orderService");

// ===========================================================================
// LOTE B7a — Doble de test de los modelos que el código LEGACY require INLINE.
//
// `adminController.extractOrderFromChat` y `postManualSale` hacen
// `require("../models/Mensaje")` / `require("../models/Producto")` DENTRO de la
// función, y `paymentController` importa `../models/MetodoPago` en el top-level
// SIN el swap a `dbLocal` que sí hace el resto del código con
// `NODE_ENV === "test"` (adminController.ts:28-42). Con el modelo real y sin
// conexión, esas llamadas se quedan en «buffering timed out» (10 s) y devuelven
// 500: el copiloto quedaría sin poder probarse.
//
// Aquí se inyectan los MISMOS modelos mock de `dbLocal` en `require.cache`, así
// el `require` diferido del legacy resuelve al mock y la suite ejercita el
// copiloto (extracción IA + venta manual) sin red y sin MongoDB.
// ===========================================================================
["Mensaje", "Producto", "MetodoPago"].forEach((nombre) => {
  const getter = `get${nombre}Model`;
  if (typeof dbLocal[getter] !== "function") return;
  let ruta;
  try {
    ruta = require.resolve(`../models/${nombre}`);
  } catch (err) {
    return; // El modelo no resuelve en este runtime: no se inyecta nada.
  }
  require.cache[ruta] = {
    id: ruta,
    filename: ruta,
    loaded: true,
    exports: dbLocal[getter](),
  };
});

// ------------------------------------------------------------------ Semillas
const AHORA = Date.now();
const WA_MANUAL = "+584141112233"; // manual + CTWA + pedido pendiente_verificacion
const WA_NORMAL = "+584149998877"; // automático sin pedido
const WA_PAGO = "+584160001122"; // paso de pago (requiere atención por PASOS_DE_PAGO)
const WA_NUEVO = "+584240001111"; // aparece sólo al recibir un mensaje entrante
const IGSID = "17841400000000001"; // IG manual + anuncio + 3 no leídos
const IGSID_BLOQ = "17841400000000002"; // IG bloqueado (anti-spam) sin nombre real
const IGSID_SIN_DOC = "17841400000000003"; // IG con mensajes y sin EtiquetaIg
const PSID = "6700000000000001"; // Messenger con EtiquetaIg canal messenger
const PSID_SIN_DOC = "6700000000000002"; // Messenger sólo con mensajes

function semillar() {
  const fecha = (deltaMs) => new Date(AHORA - deltaMs);
  dbLocal.write({
    usuarios: [
      { _id: "u-admin", username: "admin", nombre: "Admin", role: "admin", activo: true },
      // F0-8: la sesión se comprueba contra la base, así que el cajero de las pruebas de permisos debe existir.
      { _id: "u-cajero", username: "cajero", nombre: "Cajero", role: "cajero", activo: true },
      // LOTE B4: repartidor para el selector de la ficha (WA-128) y para
      // `GET /api/admin/inbox/contexto` → `repartidores[]`.
      {
        _id: "u-rep-1",
        username: "carlos",
        nombre: "Carlos Repartidor",
        role: "repartidor",
        activo: true,
      },
    ],
    // LOTE B7a · WA-135 — catálogo y métodos de pago para el Copiloto de Venta
    // Manual (`GET /inbox/products` y `GET /inbox/payments`). Uno de cada uno es
    // INACTIVO para comprobar que el modal filtra por `activo`. `trackStock:false`
    // mantiene la venta manual determinista (el mock no implementa `$inc`).
    productos: [
      { _id: "prod-1", name: "Combo Sushi 25", price: 25, activo: true, trackStock: false, stock: 0 },
      { _id: "prod-2", name: "Gyozas x10", price: 12.5, activo: true, trackStock: false, stock: 0 },
      { _id: "prod-3", name: "Producto Desactivado", price: 99, activo: false, trackStock: false, stock: 0 },
    ],
    counters: [],
    settings: { "instagram.botEnabled": true },
    metodosPago: [
      { _id: "mp-1", nombre: "Zelle", tipo: "digital", activo: true },
      { _id: "mp-2", nombre: "Pago Móvil", tipo: "transferencia", activo: true },
      { _id: "mp-3", nombre: "Método Desactivado", tipo: "digital", activo: false },
    ],
    faqs: [],
    etiquetas: {
      [WA_MANUAL]: {
        telefono: WA_MANUAL,
        paso: "esperando_comprobante",
        modo: "manual",
        stuck: false,
        ctwaClid: "ctwa_123",
        unreadCount: 2,
        carrito: { nombre: "María García", cedula: "V-12345678" },
        etiqueta: "nuevo",
      },
      [WA_NORMAL]: {
        telefono: WA_NORMAL,
        paso: "inicio",
        modo: "automatico",
        stuck: false,
        ctwaClid: null,
        unreadCount: 0,
        carrito: {},
      },
      [WA_PAGO]: {
        telefono: WA_PAGO,
        paso: "pendiente_verificacion",
        modo: "automatico",
        stuck: false,
        ctwaClid: null,
        unreadCount: 1,
        carrito: {},
      },
    },
    mensajes: [
      {
        _id: "wa1-m1",
        telefono: WA_MANUAL,
        texto: "Hola quiero el menú",
        direccion: "cliente",
        timestamp: fecha(900000),
        tipo: "texto",
        wamid: "wamid_wa1_1",
        status: null,
      },
      {
        _id: "wa1-m2",
        telefono: WA_MANUAL,
        texto: "Ya envié el comprobante",
        direccion: "cliente",
        timestamp: fecha(60000),
        tipo: "image",
        wamid: "wamid_wa1_2",
        status: null,
        mediaUrl: "https://res.cloudinary.com/test-cloud/image/upload/comprobante.jpg",
        mimeType: "image/jpeg",
      },
      {
        _id: "wa2-m1",
        telefono: WA_NORMAL,
        texto: "¡Gracias!",
        direccion: "bot",
        timestamp: fecha(300000),
        tipo: "texto",
        wamid: "wamid_wa2_1",
        status: "delivered",
      },
      {
        _id: "wa3-m1",
        telefono: WA_PAGO,
        texto: "Aquí está mi pago",
        direccion: "cliente",
        timestamp: fecha(200000),
        tipo: "texto",
        wamid: "wamid_wa3_1",
        status: null,
      },
    ],
    pedidos: [
      {
        _id: "ped-1",
        whatsappId: WA_MANUAL,
        estado: "pendiente_verificacion",
        idFormateado: "#021",
        timestamp: fecha(500000),
        cliente: { nombre: "María García", cedula: "V-12345678" },
        items: [{ producto: "Dumplings", cantidad: 1, price: 12 }],
        // LOTE B4 (WA-121/WA-122): dirección real para el botón «Abrir en Google Maps».
        ubicacion: { direccion: "Av. Libertador, Caracas" },
        pago: { montoUSD: 12, montoVES: 0, tasa: 0 },
      },
      {
        _id: "ped-2",
        whatsappId: WA_NORMAL,
        estado: "cancelado",
        idFormateado: "#019",
        timestamp: fecha(400000),
        cliente: { nombre: "Pedro Pérez" },
        items: [],
        pago: {},
      },
    ],
    etiquetasIg: {
      [IGSID]: {
        usuarioIgId: IGSID,
        canal: "instagram",
        username: "maria.g",
        nombre: "María G.",
        profilePic: "https://scontent.cdninstagram.com/pic.jpg",
        paso: "inicio",
        modo: "manual",
        origen: "anuncio",
        bloqueado: false,
        stuck: false,
        unreadCount: 3,
        lastInteraction: fecha(120000),
        // LOTE B7b — extras de perfil que alimentan la ficha IG (IG-50..57) y la
        // insignia verificada (IG-24/IG-32).
        metadata: {
          bio: "Foodie empedernida | Caracas 🥟",
          followers: "12.4k",
          verified: true,
          online: true,
          lastSeen: "hace 5 min",
          referral: { source: "ads" },
        },
      },
      [IGSID_BLOQ]: {
        usuarioIgId: IGSID_BLOQ,
        canal: "instagram",
        username: "spammer_ig",
        nombre: null,
        paso: "inicio",
        modo: "automatico",
        origen: "directo",
        bloqueado: true,
        stuck: false,
        unreadCount: 0,
        lastInteraction: fecha(300000),
        metadata: {},
      },
      [PSID]: {
        usuarioIgId: PSID,
        canal: "messenger",
        username: null,
        nombre: "Cliente FB",
        profilePic: null,
        paso: "en_faq",
        modo: "automatico",
        origen: "directo",
        bloqueado: false,
        stuck: false,
        unreadCount: 1,
        lastInteraction: fecha(90000),
        metadata: {},
      },
    },
    mensajesIg: [
      {
        _id: "ig-1",
        usuarioIgId: IGSID,
        canal: "instagram",
        direccion: "cliente",
        texto: "Hola, vi el anuncio 👋",
        tipo: "texto",
        mid: "igmid_1",
        status: "received",
        timestamp: fecha(200000),
      },
      {
        _id: "ig-2",
        usuarioIgId: IGSID,
        canal: "instagram",
        direccion: "bot",
        texto: "¡Bienvenida a Mr. Pachi!",
        tipo: "texto",
        mid: "igmid_2",
        status: "sent",
        timestamp: fecha(120000),
      },
      {
        _id: "ig-3",
        usuarioIgId: IGSID_BLOQ,
        canal: "instagram",
        direccion: "cliente",
        texto: "llamada perdida",
        tipo: "texto",
        mid: "igmid_3",
        status: "received",
        timestamp: fecha(300000),
      },
      {
        _id: "ig-4",
        usuarioIgId: IGSID_SIN_DOC,
        canal: "instagram",
        direccion: "cliente",
        texto: "buenas",
        tipo: "texto",
        mid: "igmid_4",
        status: "received",
        timestamp: fecha(450000),
      },
      {
        _id: "fb-1",
        usuarioIgId: PSID,
        canal: "messenger",
        direccion: "cliente",
        texto: "Hola desde Facebook",
        tipo: "texto",
        mid: "fbmid_1",
        status: "received",
        timestamp: fecha(90000),
      },
      {
        _id: "fb-2",
        usuarioIgId: PSID_SIN_DOC,
        canal: "messenger",
        direccion: "cliente",
        texto: "hola?",
        tipo: "imagen",
        mid: "fbmid_2",
        status: "received",
        timestamp: fecha(80000),
      },
    ],
  });
}

async function runSuite() {
  console.log("================================================================================");
  console.log("🧪 SUITE DE INTEGRACIÓN: INBOX UNIFICADO (Fase 2A)");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`   ✅ ${message}`);
      passed++;
    } else {
      console.error(`   ❌ FALLÓ: ${message}`);
      failed++;
    }
  }

  function assertIgual(actual, esperado, message) {
    assert(
      actual === esperado,
      `${message} (esperado: ${JSON.stringify(esperado)} · recibido: ${JSON.stringify(actual)})`,
    );
  }

  semillar();

  // ---------------------------------------------------------------- Servidor
  const eventos = [];
  const mockIo = {
    emit: (event, payload) => {
      eventos.push({ event, payload });
    },
  };

  const app = express();
  app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf.toString(); } }));
  app.use(express.urlencoded({ extended: true }));
  app.use(require("cookie-parser")());
  app.use("/api/admin", adminRoutes(mockIo));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin`;

  const cookieAdmin = `token=${jwt.sign(
    { id: "u-admin", username: "admin", nombre: "Admin", role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  )}`;
  const cookieCajero = `token=${jwt.sign(
    { id: "u-cajero", username: "cajero", nombre: "Cajero", role: "cajero" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  )}`;

  const get = (url, cookie = cookieAdmin) =>
    axios.get(`${base}${url}`, { headers: { Cookie: cookie } });
  const post = (url, body, cookie = cookieAdmin) =>
    axios.post(`${base}${url}`, body, { headers: { Cookie: cookie } });
  // LOTE B4: los cambios de estado del pedido y la asignación de repartidor son PATCH.
  const patch = (url, body, cookie = cookieAdmin) =>
    axios.patch(`${base}${url}`, body, { headers: { Cookie: cookie } });

  /** Devuelve { status, data } sin lanzar en errores HTTP. */
  async function intentar(promesa) {
    try {
      const res = await promesa;
      return { status: res.status, data: res.data };
    } catch (err) {
      return { status: err.response?.status || 0, data: err.response?.data || {} };
    }
  }

  const conversacion = (respuesta, clave) =>
    (respuesta.data?.data || []).find((c) => c.clave === clave) || null;

  // ===========================================================================
  // LOTE B7a — Stub del proveedor de IA del copiloto.
  // `extractOrderFromChat` llama a DeepSeek por `axios.post`; la suite intercepta
  // ÚNICAMENTE esa URL (cualquier otro `axios.post`, p. ej. el envío a Meta,
  // delega en el axios real). Así la extracción se prueba de punta a punta
  // (ruta → servicio → handler legacy → parseo del JSON de la IA) sin red.
  // ===========================================================================
  const EXTRACCION_IA = {
    cliente: {
      nombre: "María García",
      cedula: "V-12345678",
      direccion: "Av. Principal, Torre Pachi, Caracas",
    },
    notas: "Sin cebolla en el combo",
    comprobanteUrl: "https://res.cloudinary.com/pachi/comprobante-extraido.jpg",
    items: [{ producto: "Combo Sushi 25", cantidad: 2 }],
  };
  const axiosPostOriginal = axios.post.bind(axios);
  axios.post = (url, ...resto) => {
    if (typeof url === "string" && url.indexOf("api.deepseek.com") !== -1) {
      return Promise.resolve({
        data: { choices: [{ message: { content: JSON.stringify(EXTRACCION_IA) } }] },
      });
    }
    return axiosPostOriginal(url, ...resto);
  };

  try {
    // =========================================================================
    // 1. Normalización + orden + totales (§6.1 / §6.2)
    // =========================================================================
    console.log("\n👉 1. GET /api/admin/inbox — normalización, orden y totales...");
    const lista = await get("/inbox");
    assertIgual(lista.status, 200, "GET /api/admin/inbox responde 200");
    assert(lista.data.success === true, "Respuesta con success: true");
    assertIgual(lista.data.canal, "todos", "Eco del filtro por defecto (canal: 'todos')");
    assert(typeof lista.data.generadoEn === "number", "Incluye generadoEn (epoch ms)");
    assert(Array.isArray(lista.data.data), "`data` es SIEMPRE un array (no cambia de forma)");
    assertIgual(lista.data.data.length, 8, "Devuelve las 8 conversaciones sembradas");

    assertIgual(lista.data.totales.whatsapp, 3, "totales.whatsapp = 3");
    assertIgual(lista.data.totales.instagram, 3, "totales.instagram = 3");
    assertIgual(lista.data.totales.messenger, 2, "totales.messenger = 2");
    assertIgual(lista.data.totales.todos, 8, "totales.todos = 8");
    assertIgual(
      lista.data.totalesNoLeidos.whatsapp,
      2,
      "totalesNoLeidos.whatsapp = 2 (WA_MANUAL y WA_PAGO; WA_NORMAL en 0)",
    );
    assertIgual(lista.data.totalesNoLeidos.instagram, 1, "totalesNoLeidos.instagram = 1");
    assertIgual(lista.data.totalesNoLeidos.messenger, 1, "totalesNoLeidos.messenger = 1");

    // Orden global DESC por ultimoMensaje.timestamp
    const timestamps = lista.data.data.map((c) => c.ultimoMensaje?.timestamp || 0);
    const descendente = timestamps.every((t, i) => i === 0 || timestamps[i - 1] >= t);
    assert(descendente, "Lista ordenada por ultimoMensaje.timestamp DESC (servidor)");
    assert(
      lista.data.data[0].canal === "whatsapp" &&
        lista.data.data[0].usuarioId === WA_MANUAL,
      "Primera conversación = el mensaje más reciente (WA_MANUAL)",
    );

    // --- WhatsApp: objeto completo
    const wa = conversacion(lista, `whatsapp:${WA_MANUAL}`);
    assert(wa !== null, `Existe la clave whatsapp:${WA_MANUAL}`);
    assertIgual(wa.canal, "whatsapp", "wa.canal = whatsapp");
    assertIgual(wa.usuarioId, WA_MANUAL, "wa.usuarioId = teléfono crudo");
    assertIgual(wa.nombreVisible, "María García", "wa.nombreVisible = nombre del carrito");
    assertIgual(wa.nombre, "María García", "wa.nombre = nombre real declarado");
    assertIgual(wa.username, null, "wa.username = null (WhatsApp no tiene handle)");
    assertIgual(wa.avatar, null, "wa.avatar = null (el frontend decide el fallback)");
    assertIgual(wa.noLeidos, 2, "wa.noLeidos = 2 (Etiqueta.unreadCount)");
    assertIgual(wa.modo, "manual", "wa.modo = manual");
    assertIgual(wa.paso, "esperando_comprobante", "wa.paso = clave cruda del embudo");
    assertIgual(wa.pasoLabel, "🧾 Comprobante", "wa.pasoLabel = getPasoLabel(paso)");
    assertIgual(wa.stuck, false, "wa.stuck = false");
    assertIgual(wa.bloqueado, false, "wa.bloqueado = false (WhatsApp no tiene anti-spam)");
    assertIgual(wa.origen, "anuncio", "wa.origen = anuncio (Etiqueta.ctwaClid no vacío)");
    assertIgual(wa.detalleOrigen, "ctwa", "wa.detalleOrigen = ctwa");
    assertIgual(wa.cedula, "V-12345678", "wa.cedula = V-12345678");
    assertIgual(wa.totalMensajes, 2, "wa.totalMensajes = 2");
    assertIgual(wa.requiereAtencion, true, "wa.requiereAtencion = true (modo manual)");

    assert(wa.ultimoMensaje !== null, "wa.ultimoMensaje presente");
    assertIgual(wa.ultimoMensaje.texto, "Ya envié el comprobante", "wa.ultimoMensaje.texto");
    assertIgual(wa.ultimoMensaje.tipo, "imagen", "wa.ultimoMensaje.tipo normalizado ('image' → 'imagen')");
    assertIgual(wa.ultimoMensaje.direccion, "entrante", "wa.ultimoMensaje.direccion = entrante ('cliente')");
    assertIgual(wa.ultimoMensaje.status, null, "wa.ultimoMensaje.status = null (los entrantes no tienen status)");
    assert(typeof wa.ultimoMensaje.timestamp === "number", "wa.ultimoMensaje.timestamp es number (epoch ms)");
    assert(wa.lastInteraction === wa.ultimoMensaje.timestamp, "wa.lastInteraction derivado del último mensaje");

    assert(wa.pedido !== null, "wa.pedido presente (extensión exclusiva de WhatsApp)");
    assertIgual(wa.pedido.tienePedido, true, "wa.pedido.tienePedido = true (pedido de los últimos 30 días)");
    assertIgual(wa.pedido.pedidosCount, 1, "wa.pedido.pedidosCount = 1");
    assertIgual(wa.pedido.ultimoEstado, "pendiente_verificacion", "wa.pedido.ultimoEstado");
    assertIgual(wa.pedido.ultimoCorrelativo, "#021", "wa.pedido.ultimoCorrelativo = #021");

    const wa2 = conversacion(lista, `whatsapp:${WA_NORMAL}`);
    assertIgual(wa2.modo, "automatico", "wa2.modo = automatico (default explícito)");
    assertIgual(wa2.requiereAtencion, false, "wa2.requiereAtencion = false (sin pago, sin manual, sin anuncio)");
    assertIgual(wa2.origen, "directo", "wa2.origen = directo");
    assertIgual(wa2.detalleOrigen, null, "wa2.detalleOrigen = null");
    assertIgual(wa2.ultimoMensaje.direccion, "saliente", "wa2 último mensaje del bot → saliente");
    assertIgual(wa2.ultimoMensaje.status, "delivered", "wa2 último mensaje saliente conserva status");
    assertIgual(wa2.pedido.ultimoEstado, "cancelado", "wa2.pedido.ultimoEstado = cancelado");
    assertIgual(wa2.pedido.ultimoCorrelativo, "#019", "wa2.pedido.ultimoCorrelativo = #019");

    const wa3 = conversacion(lista, `whatsapp:${WA_PAGO}`);
    assertIgual(
      wa3.requiereAtencion,
      true,
      "wa3.requiereAtencion = true por paso ∈ PASOS_DE_PAGO (pendiente_verificacion)",
    );

    // --- Instagram
    const ig = conversacion(lista, `instagram:${IGSID}`);
    assert(ig !== null, `Existe la clave instagram:${IGSID}`);
    assertIgual(ig.canal, "instagram", "ig.canal = instagram");
    assertIgual(ig.nombreVisible, "María G.", "ig.nombreVisible = nombre real");
    assertIgual(ig.username, "maria.g", "ig.username sin arroba");
    assertIgual(ig.avatar, "https://scontent.cdninstagram.com/pic.jpg", "ig.avatar = profilePic");
    assertIgual(ig.noLeidos, 3, "ig.noLeidos = 3 (EtiquetaIg.unreadCount)");
    assertIgual(ig.modo, "manual", "ig.modo = manual");
    assertIgual(ig.pasoLabel, "👋 Inicio", "ig.pasoLabel también para Instagram (asimetría neutralizada)");
    assertIgual(ig.origen, "anuncio", "ig.origen = anuncio");
    assertIgual(ig.detalleOrigen, "ig_ads", "ig.detalleOrigen = ig_ads");
    assertIgual(ig.pedido, null, "ig.pedido = null (sin modelo de pedidos)");
    assertIgual(ig.cedula, null, "ig.cedula = null");
    assertIgual(ig.totalMensajes, 2, "ig.totalMensajes = 2");
    assert(ig.lastInteraction > 0, "ig.lastInteraction proviene de EtiquetaIg.lastInteraction");

    // --- LOTE B7b: extensión `perfil` (IG-50..57: ficha, verificado, bio, etc.)
    assert(ig.perfil !== null && typeof ig.perfil === "object", "B7b: ig.perfil existe (extensión IG/Messenger)");
    assertIgual(ig.perfil.bio, "Foodie empedernida | Caracas 🥟", "IG-52: perfil.bio = metadata.bio");
    assertIgual(ig.perfil.followers, "12.4k", "IG-51: perfil.followers = metadata.followers");
    assertIgual(ig.perfil.verificado, true, "IG-24/32: perfil.verificado = metadata.verified");
    assertIgual(ig.perfil.online, true, "IG-55: perfil.online = metadata.online");
    assertIgual(ig.perfil.lastSeen, "hace 5 min", "IG-55: perfil.lastSeen = metadata.lastSeen");

    const wa3perfil = (conversacion(lista, `whatsapp:${WA_MANUAL}`) || {}).perfil;
    assertIgual(wa3perfil, null, "CONTROL NEGATIVO B7b: WhatsApp NO tiene extensión `perfil` (solo IG/Messenger)");

    const igBloq = conversacion(lista, `instagram:${IGSID_BLOQ}`);
    assertIgual(igBloq.nombre, null, "igBloq.nombre = null (no hay nombre real)");
    assertIgual(igBloq.nombreVisible, "@spammer_ig", "igBloq.nombreVisible cae al @username");
    assertIgual(igBloq.bloqueado, true, "igBloq.bloqueado = true (se expone el anti-spam)");
    assertIgual(igBloq.requiereAtencion, true, "igBloq.requiereAtencion = true por estar bloqueado");

    const igBloqPerfil = igBloq.perfil || {};
    assertIgual(igBloqPerfil.verificado, false, "CONTROL NEGATIVO B7b: sin metadata → verificado:false (no se inventa la insignia)");
    assertIgual(igBloqPerfil.bio, null, "CONTROL NEGATIVO B7b: sin metadata → bio:null (la ficha la omite)");
    assertIgual(igBloqPerfil.online, null, "CONTROL NEGATIVO B7b: sin metadata → online:null (estado desconocido)");

    const igSinDoc = conversacion(lista, `instagram:${IGSID_SIN_DOC}`);
    assert(igSinDoc !== null, "Conversación de IG sin EtiquetaIg también se lista");
    assertIgual(igSinDoc.nombre, null, "igSinDoc.nombre = null");
    assertIgual(igSinDoc.nombreVisible, IGSID_SIN_DOC, "igSinDoc.nombreVisible = usuarioId (NUNCA vacío)");
    assertIgual(igSinDoc.noLeidos, 0, "igSinDoc.noLeidos = 0");
    assertIgual(igSinDoc.modo, "automatico", "igSinDoc.modo default = automatico");
    assertIgual(igSinDoc.paso, null, "igSinDoc.paso = null (no se inventa 'inicio')");

    // --- Messenger
    const msgr = conversacion(lista, `messenger:${PSID}`);
    assert(msgr !== null, `Existe la clave messenger:${PSID}`);
    assertIgual(msgr.canal, "messenger", "msgr.canal = messenger");
    assertIgual(msgr.nombreVisible, "Cliente FB", "msgr.nombreVisible");
    assertIgual(msgr.username, null, "msgr.username = null (la API de FB no expone handle)");
    assertIgual(msgr.noLeidos, 1, "msgr.noLeidos = 1");
    assertIgual(msgr.paso, "en_faq", "msgr.paso");
    assertIgual(msgr.pedido, null, "msgr.pedido = null");
    assertIgual(msgr.ultimoMensaje.direccion, "entrante", "msgr último mensaje entrante");

    const msgrSinDoc = conversacion(lista, `messenger:${PSID_SIN_DOC}`);
    assert(msgrSinDoc !== null, "Conversación de Messenger sin EtiquetaIg se lista (discriminada por mensaje)");
    assertIgual(msgrSinDoc.canales === undefined ? msgrSinDoc.canal : msgrSinDoc.canal, "messenger", "msgrSinDoc.canal = messenger");
    assertIgual(msgrSinDoc.ultimoMensaje.tipo, "imagen", "msgrSinDoc.ultimoMensaje.tipo normalizado a 'imagen'");

    console.log("   ℹ️  capacidades expuestas:", JSON.stringify(lista.data.capacidades));
    assert(
      Array.isArray(lista.data.capacidades.whatsapp) &&
        lista.data.capacidades.whatsapp.includes("pedidos") &&
        lista.data.capacidades.instagram.length === 0,
      "capacidades por canal compatibles con §6.5 (WA con pedidos/reset · IG vacío)",
    );

    // =========================================================================
    // 2. Filtros por canal y filtros de servidor
    // =========================================================================
    console.log("\n👉 2. Filtros por canal y filtros de servidor...");
    const soloWa = await get("/inbox?canal=whatsapp");
    assertIgual(soloWa.data.data.length, 3, "?canal=whatsapp devuelve sólo WhatsApp");
    assert(
      soloWa.data.data.every((c) => c.canal === "whatsapp"),
      "Ninguna conversación de otro canal se filtra al canal WhatsApp",
    );
    assertIgual(soloWa.data.canal, "whatsapp", "Eco del filtro canal=whatsapp");
    assertIgual(soloWa.data.totales.todos, 8, "Los totales siguen reflejando todos los canales");

    const soloIg = await get("/inbox?canal=instagram");
    assertIgual(soloIg.data.data.length, 3, "?canal=instagram devuelve 3");
    assert(
      soloIg.data.data.every((c) => c.canal === "instagram"),
      "Sin fuga de canal: ninguna conversación de Messenger aparece como Instagram",
    );
    assert(
      !soloIg.data.data.some((c) => c.usuarioId === PSID || c.usuarioId === PSID_SIN_DOC),
      "Los PSID de Messenger quedan fuera del canal Instagram",
    );

    const soloMsgr = await get("/inbox?canal=messenger");
    assertIgual(soloMsgr.data.data.length, 2, "?canal=messenger devuelve 2");
    assert(
      soloMsgr.data.data.every((c) => c.canal === "messenger"),
      "Todas las conversaciones del canal Messenger están marcadas como tal",
    );

    const canalInvalido = await intentar(get("/inbox?canal=telegram"));
    assertIgual(canalInvalido.status, 400, "?canal=telegram → 400 (valor fuera del enum)");

    const noLeidos = await get("/inbox?noLeidos=true");
    assert(
      noLeidos.data.data.every((c) => c.noLeidos > 0),
      "?noLeidos=true devuelve sólo conversaciones con no leídos",
    );
    assertIgual(noLeidos.data.data.length, 4, "?noLeidos=true devuelve 4 (2 WA + 1 IG + 1 Messenger)");

    const manuales = await get("/inbox?modo=manual");
    assert(
      manuales.data.data.every((c) => c.modo === "manual"),
      "?modo=manual filtra por modo en el servidor",
    );
    assertIgual(manuales.data.data.length, 2, "?modo=manual devuelve 2 (WA_MANUAL + IGSID)");

    const atencion = await get("/inbox?atencion=true");
    assert(
      atencion.data.data.every((c) => c.requiereAtencion === true),
      "?atencion=true devuelve sólo conversaciones que requieren atención",
    );
    assert(atencion.data.data.length >= 4, "?atencion=true incluye manual/anuncio/pago/bloqueado");

    const buscar = await get("/inbox?buscar=María");
    assertIgual(buscar.data.data.length, 2, "?buscar=María encuentra WhatsApp + Instagram");
    assert(
      buscar.data.data.every((c) => c.nombreVisible.includes("María")),
      "?buscar aplica sobre nombreVisible",
    );

    const conPedido = await get("/inbox?conPedido=true");
    assertIgual(
      conPedido.data.data.length,
      2,
      "?conPedido=true devuelve las 2 conversaciones de WhatsApp con pedido en 30 días",
    );
    assert(
      conPedido.data.data.every((c) => c.canal === "whatsapp" && c.pedido?.tienePedido === true),
      "?conPedido sólo devuelve resultados de WhatsApp con pedido",
    );

    const combo = await get("/inbox?canal=instagram&noLeidos=true&modo=manual");
    assertIgual(combo.data.data.length, 1, "Filtros combinados canal+noLeidos+modo funcionan juntos");

    const limite = await get("/inbox?canal=whatsapp&limite=2");
    assertIgual(limite.data.data.length, 2, "?limite aplica por canal");

    // =========================================================================
    // 3. Definición ÚNICA de requiereAtencion (§6.2.1)
    // =========================================================================
    console.log("\n👉 3. Definición única de `requiereAtencion` (§6.2.1)...");
    const f = normalizar.computarRequiereAtencion;
    assertIgual(f({ modo: "manual" }), true, "modo manual → true");
    assertIgual(f({ modo: "automatico", stuck: true }), true, "stuck → true");
    assertIgual(f({ modo: "automatico", bloqueado: true }), true, "bloqueado → true");
    assertIgual(f({ modo: "automatico", origen: "anuncio" }), true, "origen anuncio → true");
    assertIgual(f({ modo: "automatico", paso: "esperando_pago_metodo" }), true, "paso esperando_pago_metodo → true");
    assertIgual(f({ modo: "automatico", paso: "esperando_comprobante" }), true, "paso esperando_comprobante → true");
    assertIgual(f({ modo: "automatico", paso: "pendiente_verificacion" }), true, "paso pendiente_verificacion → true");
    assertIgual(
      f({ canal: "whatsapp", modo: "automatico", pedido: { ultimoEstado: "pendiente_verificacion" } }),
      true,
      "WhatsApp con pedido pendiente_verificacion → true",
    );
    assertIgual(
      f({ canal: "instagram", modo: "automatico", pedido: { ultimoEstado: "pendiente_verificacion" } }),
      false,
      "La cláusula de pedido NO aplica fuera de WhatsApp",
    );
    assertIgual(f({ modo: "automatico", paso: "en_faq" }), false, "Conversación normal → false");
    assertIgual(f({ modo: "automatico", paso: "esperando_producto" }), false, "Paso no-pago del embudo → false");

    assertIgual(
      normalizar.PASOS_DE_PAGO.size,
      5,
      "PASOS_DE_PAGO tiene exactamente los 5 pasos del contrato",
    );

    // El historial legacy de Instagram usa la MISMA función (una sola definición)
    const igHistorial = await get("/ig/historial");
    assertIgual(
      igHistorial.data.data[IGSID_BLOQ].requiresAttention,
      true,
      "Legacy GET /api/admin/ig/historial usa la definición única (bloqueado → true)",
    );
    assertIgual(
      igHistorial.data.data[IGSID].requiresAttention,
      true,
      "Legacy IG: manual/anuncio → true (sin regresión)",
    );

    // =========================================================================
    // 4. Defecto 1: el GET del hilo de IG ya no escribe estado
    // =========================================================================
    console.log("\n👉 4. Defecto 1 — GET /api/admin/ig/historial?usuario= ya NO escribe...");
    const antesFecha = dbLocal.read().etiquetasIg[IGSID].unreadCount;
    assertIgual(antesFecha, 3, "unreadCount inicial de IGSID = 3");
    const hiloLegacy = await get(`/ig/historial?usuario=${IGSID}`);
    assertIgual(hiloLegacy.status, 200, "El GET legacy del hilo sigue respondiendo 200");
    assert(Array.isArray(hiloLegacy.data.data), "El GET legacy del hilo sigue devolviendo un array");
    assertIgual(
      dbLocal.read().etiquetasIg[IGSID].unreadCount,
      3,
      "Tras el GET legacy el unreadCount NO cambió (sin efectos secundarios)",
    );

    // =========================================================================
    // 5. GET /api/admin/inbox/hilo (sin efectos secundarios) + 404
    // =========================================================================
    console.log("\n👉 5. GET /api/admin/inbox/hilo — mensajes unificados...");
    const hilo = await get(`/inbox/hilo?canal=instagram&usuarioId=${IGSID}`);
    assertIgual(hilo.status, 200, "GET /inbox/hilo responde 200");
    assertIgual(hilo.data.data.length, 2, "Devuelve los 2 mensajes del hilo");
    assert(hilo.data.data[0].timestamp < hilo.data.data[1].timestamp, "Orden cronológico ascendente");
    assertIgual(hilo.data.data[1].direccion, "saliente", "Dirección normalizada a saliente");
    assertIgual(hilo.data.data[1].idExterno, "igmid_2", "idExterno = mid (Instagram)");
    assert(
      hilo.data.data[1].fuente && hilo.data.data[1].fuente.mid === "igmid_2",
      "`fuente` conserva el nombre original del id externo (§7 fila 15)",
    );
    assertIgual(hilo.data.data[1].tipo, "texto", "tipo normalizado en el mensaje");
    assertIgual(hilo.data.data[0].status, null, "Mensaje entrante → status null (§7 fila 17)");
    assertIgual(hilo.data.pagination.total, 2, "Paginación coherente (total)");
    assertIgual(
      dbLocal.read().etiquetasIg[IGSID].unreadCount,
      3,
      "GET /inbox/hilo NO marcó leído (CERO efectos secundarios)",
    );

    const hiloWa = await get(`/inbox/hilo?canal=whatsapp&usuarioId=${encodeURIComponent(WA_MANUAL)}`);
    assertIgual(hiloWa.data.data.length, 2, "Hilo de WhatsApp devuelve 2 mensajes");
    assertIgual(hiloWa.data.data[1].idExterno, "wamid_wa1_2", "idExterno = wamid (WhatsApp)");
    assert(hiloWa.data.data[1].fuente.wamid === "wamid_wa1_2", "`fuente.wamid` en WhatsApp");
    assertIgual(
      hiloWa.data.data[0].fileName,
      null,
      "fileName presente (null) — unión de campos entre canales",
    );
    const hilo404 = await intentar(get("/inbox/hilo?canal=instagram&usuarioId=no_existe_999"));
    assertIgual(hilo404.status, 404, "GET /inbox/hilo de una conversación inexistente → 404");
    const hilo400 = await intentar(get("/inbox/hilo?canal=whatsapp"));
    assertIgual(hilo400.status, 400, "GET /inbox/hilo sin usuarioId → 400");
    const hilo400b = await intentar(get("/inbox/hilo?usuarioId=x"));
    assertIgual(hilo400b.status, 400, "GET /inbox/hilo sin canal → 400");

    // =========================================================================
    // 6. POST /api/admin/inbox/leido (NUEVO, idempotente)
    // =========================================================================
    console.log("\n👉 6. POST /api/admin/inbox/leido — marcado explícito e idempotente...");
    eventos.length = 0;
    const leido1 = await post("/inbox/leido", { canal: "instagram", usuarioId: IGSID });
    assertIgual(leido1.status, 200, "Primer POST /inbox/leido → 200");
    assertIgual(leido1.data.data.marcados, 3, "marcados = 3 (no leídos limpiados)");
    assertIgual(leido1.data.data.noLeidos, 0, "noLeidos = 0 tras marcar");
    assertIgual(dbLocal.read().etiquetasIg[IGSID].unreadCount, 0, "unreadCount persistido en 0");
    assert(
      eventos.some(
        (e) =>
          e.event === "inbox_actualizado" &&
          e.payload?.clave === `instagram:${IGSID}` &&
          e.payload?.tipo === "leido",
      ),
      "Se emitió inbox_actualizado { canal, usuarioId, clave, tipo: 'leido' }",
    );

    const leido2 = await post("/inbox/leido", { canal: "instagram", usuarioId: IGSID });
    assertIgual(leido2.status, 200, "Segundo POST /inbox/leido → 200 (idempotente)");
    assertIgual(leido2.data.data.marcados, 0, "Segunda llamada: marcados = 0 (ya estaba leído)");
    assertIgual(
      dbLocal.read().etiquetasIg[IGSID].unreadCount,
      0,
      "El estado final es idéntico tras repetir la llamada",
    );

    const leidoWa = await post("/inbox/leido", { canal: "whatsapp", usuarioId: WA_MANUAL });
    assertIgual(leidoWa.data.data.marcados, 2, "Marcar leído en WhatsApp limpia sus 2 no leídos");
    const leidoMsgr = await post("/inbox/leido", { canal: "messenger", usuarioId: PSID });
    assertIgual(leidoMsgr.data.data.marcados, 1, "Marcar leído en Messenger funciona");

    const leido400 = await intentar(post("/inbox/leido", { canal: "instagram" }));
    assertIgual(leido400.status, 400, "POST /inbox/leido sin usuarioId → 400");
    const leido404 = await intentar(post("/inbox/leido", { canal: "instagram", usuarioId: "fantasma" }));
    assertIgual(leido404.status, 404, "POST /inbox/leido de conversación inexistente → 404");
    const listaLuego = await get("/inbox?canal=instagram");
    assert(
      listaLuego.data.data.every((c) => c.noLeidos === 0),
      "La lista refleja el marcado (fuente de verdad = servidor)",
    );

    // =========================================================================
    // 7. POST /api/admin/inbox/modo
    // =========================================================================
    console.log("\n👉 7. POST /api/admin/inbox/modo...");
    eventos.length = 0;
    const modo1 = await post("/inbox/modo", { canal: "whatsapp", usuarioId: WA_NORMAL, modo: "manual" });
    assertIgual(modo1.status, 200, "Cambio de modo → 200");
    assertIgual(modo1.data.data.modo, "manual", "Respuesta con el modo aplicado");
    assertIgual(dbLocal.read().etiquetas[WA_NORMAL].modo, "manual", "Modo persistido en Etiqueta");
    assert(
      eventos.some((e) => e.event === "inbox_actualizado" && e.payload?.tipo === "modo"),
      "Se emitió inbox_actualizado tipo 'modo'",
    );
    assert(
      eventos.some((e) => e.event === "modo_actualizado" && e.payload?.telefono === WA_NORMAL),
      "El evento legacy 'modo_actualizado' de WhatsApp se mantiene",
    );

    const modoIg = await post("/inbox/modo", { canal: "messenger", usuarioId: PSID, modo: "manual" });
    assertIgual(modoIg.status, 200, "Cambio de modo en Messenger → 200");
    assertIgual(dbLocal.read().etiquetasIg[PSID].modo, "manual", "Modo persistido en EtiquetaIg");

    const modo400 = await intentar(post("/inbox/modo", { canal: "whatsapp", usuarioId: WA_NORMAL, modo: "pausado" }));
    assertIgual(modo400.status, 400, "Modo inválido → 400");
    const modo400b = await intentar(post("/inbox/modo", { usuarioId: WA_NORMAL, modo: "manual" }));
    assertIgual(modo400b.status, 400, "Modo sin canal → 400");
    const modo404 = await intentar(post("/inbox/modo", { canal: "whatsapp", usuarioId: "+584000000000", modo: "manual" }));
    assertIgual(modo404.status, 404, "Modo de conversación inexistente → 404");

    // =========================================================================
    // 8. POST /api/admin/inbox/mensaje
    // =========================================================================
    console.log("\n👉 8. POST /api/admin/inbox/mensaje...");
    eventos.length = 0;
    const mensajeWa = await post("/inbox/mensaje", {
      canal: "whatsapp",
      usuarioId: WA_MANUAL,
      texto: "Hola, verifico tu comprobante",
    });
    assertIgual(mensajeWa.status, 200, "Enviar texto por WhatsApp → 200");
    assertIgual(mensajeWa.data.data.direccion, "saliente", "El mensaje unificado es saliente");
    assertIgual(mensajeWa.data.data.texto, "Hola, verifico tu comprobante", "Texto persistido");
    assert(
      eventos.some((e) => e.event === "nuevo_mensaje" && e.payload?.from === WA_MANUAL),
      "El evento legacy 'nuevo_mensaje' de la consola de WhatsApp se mantiene",
    );
    assert(
      eventos.some(
        (e) => e.event === "inbox_actualizado" && e.payload?.clave === `whatsapp:${WA_MANUAL}` && e.payload?.tipo === "mensaje_nuevo",
      ),
      "Se emitió inbox_actualizado tipo 'mensaje_nuevo'",
    );

    const mensajeIg = await post("/inbox/mensaje", {
      canal: "instagram",
      usuarioId: IGSID,
      texto: "Te escribo desde el inbox",
    });
    assertIgual(mensajeIg.status, 200, "Enviar texto por Instagram → 200");
    assertIgual(dbLocal.read().mensajesIg.filter((m) => m.usuarioIgId === IGSID).length, 3, "Mensaje de IG persistido");
    const msgrSend = await post("/inbox/mensaje", {
      canal: "messenger",
      usuarioId: PSID,
      texto: "Respuesta humana por Messenger",
    });
    assertIgual(msgrSend.status, 200, "Enviar texto por Messenger → 200");
    const msgrGuardado = dbLocal
      .read()
      .mensajesIg.filter((m) => m.usuarioIgId === PSID)
      .pop();
    assertIgual(msgrGuardado.canal, "messenger", "El mensaje enviado desde el inbox conserva canal messenger");
    assert(String(msgrGuardado.mid).startsWith("fbmid_admin"), "El mid del admin usa el prefijo de Messenger");

    const mensaje400 = await intentar(post("/inbox/mensaje", { canal: "instagram", usuarioId: IGSID, texto: "   " }));
    assertIgual(mensaje400.status, 400, "Texto vacío → 400");
    const mensaje404 = await intentar(post("/inbox/mensaje", { canal: "messenger", usuarioId: "psid_fantasma", texto: "hola" }));
    assertIgual(mensaje404.status, 404, "Mensaje a conversación inexistente → 404");

    // =========================================================================
    // 9. POST /api/admin/inbox/adjunto (multipart)
    // =========================================================================
    console.log("\n👉 9. POST /api/admin/inbox/adjunto (multipart)...");
    const formulario = (canal, usuarioId, contentType, nombre) => {
      const fd = new FormData();
      fd.append("canal", canal);
      fd.append("usuarioId", usuarioId);
      fd.append("file", Buffer.from("contenido-falso"), { filename: nombre, contentType });
      return fd;
    };

    const fdImagen = formulario("instagram", IGSID, "image/png", "foto.png");
    const adjuntoOk = await intentar(
      axios.post(`${base}/inbox/adjunto`, fdImagen, {
        headers: { ...fdImagen.getHeaders(), Cookie: cookieAdmin },
      }),
    );
    assertIgual(adjuntoOk.status, 200, "Adjunto de imagen por Instagram → 200");
    assertIgual(adjuntoOk.data.data.tipo, "imagen", "El adjunto se normaliza a tipo 'imagen'");

    const fdPdf = formulario("instagram", IGSID, "application/pdf", "doc.pdf");
    const adjunto409 = await intentar(
      axios.post(`${base}/inbox/adjunto`, fdPdf, {
        headers: { ...fdPdf.getHeaders(), Cookie: cookieAdmin },
      }),
    );
    assertIgual(adjunto409.status, 409, "Adjunto no-imagen por Instagram → 409 (acción no soportada)");

    const fdWaDoc = formulario("whatsapp", WA_MANUAL, "application/pdf", "comprobante.pdf");
    const adjuntoWa = await intentar(
      axios.post(`${base}/inbox/adjunto`, fdWaDoc, {
        headers: { ...fdWaDoc.getHeaders(), Cookie: cookieAdmin },
      }),
    );
    assertIgual(adjuntoWa.status, 200, "Adjunto de documento por WhatsApp → 200 (capacidad adjunto_documento)");

    const fdSinArchivo = new FormData();
    fdSinArchivo.append("canal", "whatsapp");
    fdSinArchivo.append("usuarioId", WA_MANUAL);
    const adjunto400 = await intentar(
      axios.post(`${base}/inbox/adjunto`, fdSinArchivo, {
        headers: { ...fdSinArchivo.getHeaders(), Cookie: cookieAdmin },
      }),
    );
    assertIgual(adjunto400.status, 400, "Adjunto sin archivo → 400");

    // =========================================================================
    // 10. Contexto / reset / acciones exclusivas de canal
    // =========================================================================
    console.log("\n👉 10. /inbox/contexto, /inbox/reset y acciones por canal...");
    const contextoWa = await get(`/inbox/contexto?canal=whatsapp&usuarioId=${encodeURIComponent(WA_MANUAL)}`);
    assertIgual(contextoWa.status, 200, "GET /inbox/contexto (WhatsApp) → 200");
    assertIgual(contextoWa.data.data.canal, "whatsapp", "El contexto ecoa el canal");
    assert(contextoWa.data.data.totalCompras >= 1, "Contexto de WhatsApp incluye LTV/datos CRM");
    assert(typeof contextoWa.data.data.ltvUSD === "number", "Contexto de WhatsApp expone ltvUSD");

    const contextoIg = await get(`/inbox/contexto?canal=instagram&usuarioId=${IGSID}`);
    assertIgual(contextoIg.status, 200, "GET /inbox/contexto (Instagram) → 200");
    assertIgual(contextoIg.data.data.origen, "anuncio", "Contexto de IG expone el origen");
    assert(contextoIg.data.data.perfil?.username === "maria.g", "Contexto de IG expone el perfil");
    // LOTE B7b — el contexto de IG alimenta el drawer de perfil reutilizado
    // (IG-51/52/55): bio, seguidores y estado deben viajar en `perfil`.
    assert(
      contextoIg.data.data.perfil?.bio === "Foodie empedernida | Caracas 🥟",
      "IG-52: el contexto de IG expone la BIO del perfil",
    );
    assert(
      contextoIg.data.data.perfil?.followers === "12.4k",
      "IG-51: el contexto de IG expone los SEGUIDORES",
    );
    assert(
      contextoIg.data.data.perfil?.verificado === true,
      "IG-32/51: el contexto de IG expone la cuenta VERIFICADA",
    );
    assert(
      contextoIg.data.data.perfil?.online === true &&
        contextoIg.data.data.perfil?.lastSeen === "hace 5 min",
      "IG-55: el contexto de IG expone el ESTADO (online + lastSeen)",
    );
    const contextoWaPerfil = await get(
      `/inbox/contexto?canal=whatsapp&usuarioId=${encodeURIComponent(WA_MANUAL)}`,
    );
    assert(
      contextoWaPerfil.data.data.perfil === undefined ||
        contextoWaPerfil.data.data.perfil?.perfil === undefined,
      "CONTROL NEGATIVO B7b: el contexto de WhatsApp no trae el perfil público de IG",
    );
    const contexto404 = await intentar(get("/inbox/contexto?canal=whatsapp&usuarioId=%2B584000000000"));
    assertIgual(contexto404.status, 404, "Contexto de conversación inexistente → 404");

    eventos.length = 0;
    const resetWa = await post("/inbox/reset", { canal: "whatsapp", usuarioId: WA_MANUAL });
    assertIgual(resetWa.status, 200, "POST /inbox/reset (WhatsApp) → 200");
    assertIgual(dbLocal.read().etiquetas[WA_MANUAL].paso, "inicio", "Reset devuelve el paso a 'inicio'");
    assertIgual(dbLocal.read().etiquetas[WA_MANUAL].modo, "automatico", "Reset devuelve el modo a automático");
    assert(
      eventos.some((e) => e.event === "inbox_actualizado" && e.payload?.tipo === "estado"),
      "Se emitió inbox_actualizado tipo 'estado' tras el reset",
    );
    const resetIg = await intentar(post("/inbox/reset", { canal: "instagram", usuarioId: IGSID }));
    assertIgual(resetIg.status, 501, "POST /inbox/reset en Instagram → 501 (no implementado)");
    const resetMsgr = await intentar(post("/inbox/reset", { canal: "messenger", usuarioId: PSID }));
    assertIgual(resetMsgr.status, 501, "POST /inbox/reset en Messenger → 501 (no implementado)");

    const pagoIg = await intentar(
      post("/inbox/whatsapp/pago/confirmar", { canal: "instagram", usuarioId: IGSID }),
    );
    assertIgual(pagoIg.status, 409, "Confirmar pago con canal=instagram → 409 (exclusivo de WhatsApp)");
    // El canal del path es fijo: si el body no lo envía, se asume WhatsApp.
    const pagoSinPedido = await intentar(
      post("/inbox/whatsapp/pago/confirmar", { usuarioId: "+584000000099" }),
    );
    assertIgual(
      pagoSinPedido.status,
      400,
      "Confirmar pago sin pedido pendiente → 400 (canal fijo del path = WhatsApp)",
    );

    const botToggleMsgr = await intentar(
      post("/inbox/instagram/bot-toggle", { canal: "messenger", enabled: true }),
    );
    assertIgual(botToggleMsgr.status, 409, "bot-toggle con canal=messenger → 409 (exclusivo de Instagram)");
    const botToggle = await get("/inbox/instagram/bot-toggle");
    assertIgual(botToggle.status, 200, "GET /inbox/instagram/bot-toggle → 200");
    assertIgual(botToggle.data.data.enabled, true, "bot-toggle refleja el Setting global");
    const botTogglePost = await post("/inbox/instagram/bot-toggle", { enabled: false });
    assertIgual(botTogglePost.data.data.enabled, false, "POST /inbox/instagram/bot-toggle persistido");
    await post("/inbox/instagram/bot-toggle", { enabled: true }); // restaurar

    // =========================================================================
    // 10.bis LOTE B6 — Perfil de WhatsApp Business (WA-45 · WA-39), estado de canal
    // =========================================================================
    console.log("\n👉 10.bis LOTE B6: perfil de WhatsApp Business (estado de canal)...");
    const perfilWa = await intentar(get("/inbox/whatsapp/profile"));
    assertIgual(perfilWa.status, 200, "GET /inbox/whatsapp/profile → 200");
    assertIgual(perfilWa.data.data.canal, "whatsapp", "el perfil declara su canal (whatsapp)");
    assertIgual(
      perfilWa.data.data.perfil.about,
      "Mr. Pachi - Comida asiática congelada",
      "el perfil viene del servicio de WhatsApp Business (about)",
    );
    assert(
      Array.isArray(perfilWa.data.data.perfil.websites) &&
        perfilWa.data.data.perfil.websites.length === 2,
      "el perfil conserva los sitios web (hasta 2 URLs)",
    );
    const perfilWaCanalIg = await intentar(get("/inbox/whatsapp/profile?canal=instagram"));
    assertIgual(
      perfilWaCanalIg.status,
      409,
      "perfil de WhatsApp con canal=instagram → 409 (exclusivo de WhatsApp)",
    );

    const perfilWaPost = await intentar(
      post("/inbox/whatsapp/profile", {
        about: "Dumplings congelados en Caracas",
        address: "Las Mercedes, Caracas",
        description: "Comida asiática congelada",
        email: "hola@mrpachi.com",
        websites: ["https://mrpachi.com", ""],
        vertical: "FOOD_GROCERY",
      }),
    );
    assertIgual(perfilWaPost.status, 200, "POST /inbox/whatsapp/profile → 200");
    assert(perfilWaPost.data.success === true, "el POST del perfil confirma success");
    assertIgual(
      perfilWaPost.data.data.perfil.about,
      "Dumplings congelados en Caracas",
      "el perfil guarda el about saneado",
    );
    assert(
      perfilWaPost.data.data.perfil.websites.length === 1,
      "las webs vacías se descartan (websites → ['https://mrpachi.com'])",
    );
    const perfilWaPostIg = await intentar(
      post("/inbox/whatsapp/profile", { canal: "instagram", about: "x" }),
    );
    assertIgual(perfilWaPostIg.status, 409, "POST perfil WhatsApp con canal=instagram → 409");
    const perfilWaPostVacio = await intentar(post("/inbox/whatsapp/profile", { canal: "whatsapp" }));
    assertIgual(perfilWaPostVacio.status, 400, "POST perfil WhatsApp sin campos → 400");

    const fdPerfil = new FormData();
    fdPerfil.append("canal", "whatsapp");
    fdPerfil.append("file", Buffer.from("foto-de-perfil"), {
      filename: "perfil.jpg",
      contentType: "image/jpeg",
    });
    const fotoPerfil = await intentar(
      axios.post(`${base}/inbox/whatsapp/profile-picture`, fdPerfil, {
        headers: { ...fdPerfil.getHeaders(), Cookie: cookieAdmin },
      }),
    );
    assertIgual(fotoPerfil.status, 200, "POST /inbox/whatsapp/profile-picture (multipart) → 200");
    assert(
      typeof fotoPerfil.data.data.profile_picture_url === "string" &&
        fotoPerfil.data.data.profile_picture_url.length > 0,
      "la foto devuelve la URL subida a Meta",
    );
    const fdPerfilSinArchivo = new FormData();
    fdPerfilSinArchivo.append("canal", "whatsapp");
    const fotoSinArchivo = await intentar(
      axios.post(`${base}/inbox/whatsapp/profile-picture`, fdPerfilSinArchivo, {
        headers: { ...fdPerfilSinArchivo.getHeaders(), Cookie: cookieAdmin },
      }),
    );
    assertIgual(fotoSinArchivo.status, 400, "profile-picture sin archivo → 400");

    // Retrocompatibilidad: el endpoint legacy sigue intacto para la consola de WhatsApp.
    const perfilLegacy = await intentar(get("/whatsapp/profile"));
    assertIgual(
      perfilLegacy.status,
      200,
      "sin regresión: el legacy GET /whatsapp/profile sigue respondiendo 200",
    );
    assert(
      perfilLegacy.data.success === true && perfilLegacy.data.data !== undefined,
      "sin regresión: el legacy conserva su shape { success, data }",
    );

    // =========================================================================
    // 11. Contador de no leídos de WhatsApp + hook de eventos entrantes (§9.1)
    // =========================================================================
    console.log("\n👉 11. Mensaje entrante: unreadCount de WhatsApp + inbox_actualizado...");
    eventos.length = 0;
    await orderService.emitirYGuardar(
      WA_NUEVO,
      "¿Tienen delivery?",
      "cliente",
      mockIo,
      "texto",
      null,
      "wamid_wa_nuevo_1",
      "received",
    );
    const nuevoDoc = dbLocal.read().etiquetas[WA_NUEVO];
    assert(nuevoDoc !== undefined, "El mensaje entrante crea la Etiqueta del contacto");
    assertIgual(nuevoDoc.unreadCount, 1, "unreadCount de WhatsApp se incrementa al recibir un mensaje");
    assert(
      eventos.some(
        (e) =>
          e.event === "inbox_actualizado" &&
          e.payload?.clave === `whatsapp:${WA_NUEVO}` &&
          e.payload?.tipo === "mensaje_nuevo",
      ),
      "Se emitió inbox_actualizado desde el punto único (orderService → inboxService)",
    );

    // Pequeña espera para que el timestamp del saliente sea estrictamente mayor
    // (evita empates de milisegundos en el mock de pruebas)
    await new Promise((r) => setTimeout(r, 20));
    await orderService.emitirYGuardar(WA_NUEVO, "Sí, tenemos", "bot", mockIo, "texto", null, "wamid_wa_nuevo_2", "sent");
    assertIgual(
      dbLocal.read().etiquetas[WA_NUEVO].unreadCount,
      1,
      "Los mensajes SALIENTES no incrementan no leídos",
    );

    const listaFinal = await get(`/inbox?canal=whatsapp&buscar=${encodeURIComponent(WA_NUEVO)}`);
    assertIgual(listaFinal.data.data.length, 1, "La conversación nueva aparece en el inbox por búsqueda");
    assertIgual(listaFinal.data.data[0].noLeidos, 1, "El inbox muestra 1 no leído para el contacto nuevo");
    assertIgual(listaFinal.data.data[0].ultimoMensaje.direccion, "saliente", "Último mensaje normalizado");
    assertIgual(listaFinal.data.data[0].modo, "automatico", "Modo por defecto del contacto nuevo");
    assertIgual(
      listaFinal.data.data[0].nombreVisible,
      WA_NUEVO,
      "nombreVisible cae al teléfono cuando no hay nombre ni handle",
    );

    // =========================================================================
    // 12. Códigos 403/401 (auth y permisos) + retrocompatibilidad legacy
    // =========================================================================
    console.log("\n👉 12. Permisos y retrocompatibilidad de los endpoints legacy...");
    const sinToken = await intentar(axios.get(`${base}/inbox`));
    assertIgual(sinToken.status, 401, "GET /inbox sin token → 401");
    const cajeroReset = await intentar(post("/inbox/reset", { canal: "whatsapp", usuarioId: WA_MANUAL }, cookieCajero));
    assertIgual(cajeroReset.status, 403, "POST /inbox/reset con rol cajero → 403 (requiere system:manage)");
    const cajeroInbox = await intentar(get("/inbox", cookieCajero));
    assertIgual(cajeroInbox.status, 200, "El cajero sí puede leer el inbox (chat:manage)");

    const legacyHistorial = await get("/historial");
    assertIgual(legacyHistorial.status, 200, "El legacy GET /api/admin/historial sigue respondiendo 200");
    assert(
      legacyHistorial.data.data[WA_MANUAL]?.resumen !== undefined,
      "El legacy /historial sigue devolviendo el objeto-map por teléfono",
    );
    const legacyResumen = legacyHistorial.data.data[WA_MANUAL];
    assert(
      typeof legacyResumen.resumen.text === "string" &&
        typeof legacyResumen.totalMensajes === "number" &&
        typeof legacyResumen.tienePedido === "boolean" &&
        typeof legacyResumen.pedidosCount === "number" &&
        "paso" in legacyResumen &&
        "nombre" in legacyResumen,
      "El shape del legacy /historial no cambió (resumen/text/totalMensajes/tienePedido/paso/nombre)",
    );
    const legacyHilo = await get(`/historial?telefono=${encodeURIComponent(WA_MANUAL)}`);
    assert(Array.isArray(legacyHilo.data.data), "El legacy /historial?telefono= sigue devolviendo un array");
    assert(
      legacyHilo.data.pagination !== undefined,
      "El legacy /historial?telefono= sigue devolviendo `pagination`",
    );
    const legacyModos = await get("/modos");
    assert(
      legacyModos.data.data && typeof legacyModos.data.data === "object",
      "El legacy GET /api/admin/modos sigue devolviendo el objeto-map",
    );
    assertIgual(
      legacyModos.data.data[WA_NORMAL],
      "manual",
      "El modo cambiado por POST /inbox/modo se refleja en el legacy /api/admin/modos",
    );
    const legacyChatContext = await get(`/chat-context?telefono=${encodeURIComponent(WA_MANUAL)}`);
    assertIgual(legacyChatContext.status, 200, "El legacy GET /chat-context sigue funcionando");
    const legacyIgLista = await get("/ig/historial");
    assert(
      legacyIgLista.data.data[IGSID]?.modo === "manual",
      "El legacy /ig/historial conserva su shape (modo/origen/requiresAttention)",
    );
    assertIgual(
      legacyIgLista.data.data[IGSID].operationMode,
      "manual",
      "El legacy conserva `operationMode` (duplicado histórico) para no romper la consola de IG",
    );
    const legacyIgModo = await post("/ig/modo", { usuarioIgId: IGSID, modo: "automatico" });
    assertIgual(legacyIgModo.status, 200, "El legacy POST /api/admin/ig/modo sigue funcionando");

    // =========================================================================
    // 13. LOTE B3 — REINTENTO con reconciliación in-place (WA-33) + cita (WA-34)
    // =========================================================================
    console.log("\n👉 13. LOTE B3 — Retry con reconciliación in-place (WA-33) y cita (WA-34)...");

    // Mensaje FALLIDO real (con _id) creado con el mismo servicio del flujo:
    // así no se altera la semilla inicial usada por las secciones 1..12.
    const fallido = await orderService.emitirYGuardar(
      WA_MANUAL,
      "Mensaje que falló al enviarse",
      "bot",
      mockIo,
      "texto",
      null,
      null,
      "failed",
      null,
      null,
      null,
      null,
      "wamid_wa1_2",
      "Ya envié el comprobante",
    );
    assert(Boolean(fallido && fallido._id), "Se creó un mensaje FALLIDO de prueba (con _id real)");

    const contarWa = () =>
      dbLocal.read().mensajes.filter((m) => m.telefono === WA_MANUAL).length;

    // ── 13.1 Reintentar ACTUALIZA en vez de crear (burbuja sin duplicar) ────
    const antesRetry = contarWa();
    eventos.length = 0;
    const reintento = await post("/inbox/mensaje", {
      canal: "whatsapp",
      usuarioId: WA_MANUAL,
      texto: "Mensaje que falló al enviarse",
      retryMsgId: fallido._id,
      retryWamid: "wamid_wa_fallido",
    });
    assertIgual(reintento.status, 200, "POST /inbox/mensaje con retryMsgId → 200");
    assertIgual(
      contarWa(),
      antesRetry,
      "El reintento NO crea un documento nuevo (mismo nº de mensajes antes/después)",
    );
    const docReconciliado = dbLocal
      .read()
      .mensajes.find((m) => String(m._id) === String(fallido._id));
    assert(docReconciliado !== undefined, "El mensaje original sigue existiendo (in-place, no borrado)");
    assertIgual(docReconciliado.status, "sent", "El mensaje existente se reconcilia 'failed' → 'sent'");
    assertIgual(
      reintento.data.data._id,
      fallido._id,
      "La respuesta es el MISMO mensaje (mismo _id): el panel no duplica la burbuja",
    );
    assertIgual(reintento.data.data.status, "sent", "El MensajeUnificado devuelto trae el status reconciliado");
    assertIgual(
      reintento.data.data.replyToId,
      "wamid_wa1_2",
      "El reintento conserva el replyToMid ORIGINAL del mensaje (WA-33, backend → no depende del cliente)",
    );
    assert(
      eventos.some(
        (ev) =>
          ev.event === "status_actualizado" &&
          String(ev.payload?._id) === String(fallido._id) &&
          ev.payload?.status === "sent",
      ),
      "Se emitió el evento legacy 'status_actualizado' con el nuevo status",
    );
    assert(
      eventos.some((ev) => ev.event === "inbox_actualizado" && ev.payload?.tipo === "estado"),
      "El reintento invalida como inbox_actualizado tipo 'estado' (§6.4), no 'mensaje_nuevo'",
    );
    assert(
      !eventos.some((ev) => ev.event === "nuevo_mensaje"),
      "El reintento NO emite 'nuevo_mensaje' (no es un mensaje nuevo)",
    );

    // ── 13.2 Sin retryMsgId el comportamiento NO cambia: crea uno nuevo ─────
    const antesNuevo = contarWa();
    const nuevoSinRetry = await post("/inbox/mensaje", {
      canal: "whatsapp",
      usuarioId: WA_MANUAL,
      texto: "Mensaje normal sin reintento",
    });
    assertIgual(nuevoSinRetry.status, 200, "POST /inbox/mensaje SIN retryMsgId → 200");
    assertIgual(
      contarWa(),
      antesNuevo + 1,
      "Sin retryMsgId se CREA un mensaje nuevo (retrocompatibilidad total)",
    );

    // ── 13.3 Un id temporal ('temp-…') no es reconciliable ──────────────────
    const antesTemp = contarWa();
    const retryTemporal = await post("/inbox/mensaje", {
      canal: "whatsapp",
      usuarioId: WA_MANUAL,
      texto: "Reintento de burbuja temporal",
      retryMsgId: `temp-${Date.now()}`,
    });
    assertIgual(retryTemporal.status, 200, "retryMsgId 'temp-…' → 200");
    assertIgual(
      contarWa(),
      antesTemp + 1,
      "Un retryMsgId temporal NO reconcilia: crea el mensaje real (sustituye al temp en el panel)",
    );

    // ── 13.4 WA-34: envío CON CITA (replyToMid/replyToText) ────────────────
    const conCita = await post("/inbox/mensaje", {
      canal: "whatsapp",
      usuarioId: WA_MANUAL,
      texto: "Respuesta con cita",
      replyToMid: "wamid_wa1_2",
      replyToText: "Ya envié el comprobante",
    });
    assertIgual(conCita.status, 200, "POST /inbox/mensaje con cita → 200");
    assertIgual(conCita.data.data.replyToId, "wamid_wa1_2", "WA-34: la cita persiste replyToId");
    assertIgual(
      conCita.data.data.replyToText,
      "Ya envié el comprobante",
      "WA-34: la cita persiste replyToText",
    );

    // ── 13.5 Reintento en Instagram/Messenger → 409 (no soportado) ─────────
    const retryIg = await intentar(
      post("/inbox/mensaje", {
        canal: "instagram",
        usuarioId: IGSID,
        texto: "reintento IG",
        retryMsgId: "ig-2",
      }),
    );
    assertIgual(retryIg.status, 409, "retryMsgId en Instagram → 409 (solo WhatsApp soporta reintento)");
    assertIgual(retryIg.data.canal, "instagram", "El 409 identifica el canal rechazado");
    const retryMsgr = await intentar(
      post("/inbox/mensaje", {
        canal: "messenger",
        usuarioId: PSID,
        texto: "reintento Messenger",
        retryMsgId: "fb-1",
      }),
    );
    assertIgual(retryMsgr.status, 409, "retryMsgId en Messenger → 409 (solo WhatsApp soporta reintento)");

    // =========================================================================
    // 14. LOTE B4 — Acciones de pedido/pago/despacho + ficha de cliente
    //     (WA-14/15/35/36/37 · WA-118..130)
    // =========================================================================
    console.log("\n👉 14. LOTE B4 — acciones de pedido/pago/despacho y ficha del cliente...");

    // ── 14.1 La ficha (GET /inbox/contexto) trae TODO lo que pinta el drawer ──
    const ficha = await get(
      `/inbox/contexto?canal=whatsapp&usuarioId=${encodeURIComponent(WA_MANUAL)}`,
    );
    assertIgual(ficha.status, 200, "Ficha del cliente (WA-118): GET /inbox/contexto → 200");
    const ctx = ficha.data.data;
    assertIgual(ctx.customerName, "María García", "WA-121: ficha — nombre del cliente");
    assertIgual(ctx.cedula, "V-12345678", "WA-121: ficha — cédula");
    assertIgual(ctx.direccion, "Av. Libertador, Caracas", "WA-121/122: ficha — dirección (Google Maps)");
    assertIgual(ctx.totalCompras, 1, "WA-123: historial — nº de compras (excluye cancelados)");
    assertIgual(ctx.ltvUSD, 12, "WA-123: historial — LTV USD");
    assert(Array.isArray(ctx.items), "WA-124: carrito en vivo — `items` es un array");
    assertIgual(ctx.items[0]?.producto, "Dumplings", "WA-124: carrito en vivo — item del carrito");
    assertIgual(ctx.totalUSD, 12, "WA-124: carrito en vivo — total USD");
    assert("totalBS" in ctx, "WA-124: carrito en vivo — total Bs presente (null si no hay tasa)");
    assert("tasaBCV" in ctx, "WA-124: carrito en vivo — tasa BCV presente");
    assertIgual(ctx.pedidoActivo?._id, "ped-1", "WA-125: pedido activo — `_id` (necesario para despachar)");
    assertIgual(ctx.pedidoActivo?.estado, "pendiente_verificacion", "WA-125: pedido activo — estado");
    assertIgual(ctx.pedidoActivo?.idFormateado, "#021", "WA-125: pedido activo — correlativo formateado");
    assert(
      Array.isArray(ctx.repartidores) && ctx.repartidores.some((r) => r.username === "carlos"),
      "WA-128: la ficha recibe la lista de repartidores para el selector",
    );
    assertIgual(
      ctx.repartidores[0]?.nombre,
      "Carlos Repartidor",
      "WA-128: el repartidor llega con nombre + username",
    );

    // ── 14.2 Asignar repartidor (WA-128) + indicador del asignado (WA-129) ───
    eventos.length = 0;
    const asignar = await intentar(
      patch("/inbox/whatsapp/pedido/ped-1/repartidor", {
        canal: "whatsapp",
        usuarioId: WA_MANUAL,
        repartidor: "carlos",
      }),
    );
    assertIgual(asignar.status, 200, "WA-128: PATCH /inbox/whatsapp/pedido/:id/repartidor → 200");
    assertIgual(
      dbLocal.read().pedidos.find((p) => p._id === "ped-1").repartidor,
      "carlos",
      "WA-128: el repartidor queda persistido en el pedido",
    );
    assert(
      eventos.some(
        (e) =>
          e.event === "inbox_actualizado" &&
          e.payload?.tipo === "pedido" &&
          e.payload?.canal === "whatsapp" &&
          e.payload?.clave === `whatsapp:${WA_MANUAL}`,
      ),
      "LOTE B4: la asignación emite inbox_actualizado tipo 'pedido' (§6.4)",
    );
    const fichaConRepartidor = await get(
      `/inbox/contexto?canal=whatsapp&usuarioId=${encodeURIComponent(WA_MANUAL)}`,
    );
    assertIgual(
      fichaConRepartidor.data.data.pedidoActivo?.repartidor,
      "carlos",
      "WA-129: la ficha refleja «Asignado a @carlos»",
    );
    const repSinUsuario = await intentar(
      patch("/inbox/whatsapp/pedido/ped-1/repartidor", { repartidor: "carlos" }),
    );
    assertIgual(repSinUsuario.status, 200, "WA-128: usuarioId es OPCIONAL en el repartidor (retrocompatible)");
    const repIg = await intentar(
      patch("/inbox/whatsapp/pedido/ped-1/repartidor", {
        canal: "messenger",
        usuarioId: PSID,
        repartidor: "carlos",
      }),
    );
    assertIgual(repIg.status, 409, "WA-128: asignar repartidor en Messenger → 409 (exclusivo de WhatsApp)");
    const rep404 = await intentar(
      patch("/inbox/whatsapp/pedido/ped-inexistente/repartidor", { repartidor: "carlos" }),
    );
    assertIgual(rep404.status, 404, "WA-128: pedido inexistente → 404");

    // ── 14.3 Confirmar pago — camino feliz (WA-14/WA-35) ────────────────────
    // Se confirma el pago de `ped-1` (el mismo pedido que luego se despacha y se
    // entrega) para no sembrar un pedido extra: el conteo de `?conPedido=true`
    // de la sección 2 sigue siendo válido.
    eventos.length = 0;
    const pagoOk = await intentar(
      post("/inbox/whatsapp/pago/confirmar", { canal: "whatsapp", usuarioId: WA_MANUAL }),
    );
    assertIgual(pagoOk.status, 200, "WA-14: confirmar pago con pedido pendiente → 200");
    assertIgual(
      dbLocal.read().pedidos.find((p) => p._id === "ped-1").estado,
      "verificado",
      "WA-14: el pedido pasa a 'verificado' (comandas enviadas)",
    );
    assert(
      typeof pagoOk.data.data?.idFormateado === "string" && pagoOk.data.data.idFormateado.length > 0,
      "WA-14: la respuesta trae el correlativo para el toast del operador",
    );
    assert(
      eventos.some(
        (e) => e.event === "inbox_actualizado" && e.payload?.tipo === "pedido",
      ),
      "LOTE B4: confirmar pago emite inbox_actualizado tipo 'pedido'",
    );
    assert(
      eventos.some((e) => e.event === "pago_confirmado"),
      "LOTE B4: el legacy sigue emitiendo `pago_confirmado` (sin regresión)",
    );
    const fichaVerificada = await get(
      `/inbox/contexto?canal=whatsapp&usuarioId=${encodeURIComponent(WA_MANUAL)}`,
    );
    assertIgual(
      fichaVerificada.data.data.pedidoActivo?.estado,
      "verificado",
      "WA-14/WA-35: tras verificar el pago, la ficha expone el estado 'verificado' (el banner pasa a Despachar)",
    );

    // ── 14.4 Despachar (WA-15/WA-36) y Marcar entregado (WA-37) ─────────────
    eventos.length = 0;
    const despachar = await intentar(
      patch("/inbox/whatsapp/pedido/ped-1/estado", {
        canal: "whatsapp",
        usuarioId: WA_MANUAL,
        estado: "en_ruta",
      }),
    );
    assertIgual(despachar.status, 200, "WA-36: PATCH /inbox/whatsapp/pedido/:id/estado (en_ruta) → 200");
    assertIgual(
      dbLocal.read().pedidos.find((p) => p._id === "ped-1").estado,
      "en_ruta",
      "WA-36: el pedido queda 'en_ruta' (Despachar Pedido)",
    );
    assert(
      eventos.some((e) => e.event === "inbox_actualizado" && e.payload?.tipo === "pedido"),
      "LOTE B4: el cambio de estado emite inbox_actualizado tipo 'pedido'",
    );

    const entregar = await intentar(
      patch("/inbox/whatsapp/pedido/ped-1/estado", {
        canal: "whatsapp",
        usuarioId: WA_MANUAL,
        estado: "entregado",
      }),
    );
    assertIgual(entregar.status, 200, "WA-37: PATCH .../estado (entregado) → 200");
    assertIgual(
      dbLocal.read().pedidos.find((p) => p._id === "ped-1").estado,
      "entregado",
      "WA-37: el pedido queda 'entregado' (Marcar como Entregado)",
    );
    const fichaFinal = await get(
      `/inbox/contexto?canal=whatsapp&usuarioId=${encodeURIComponent(WA_MANUAL)}`,
    );
    assertIgual(
      fichaFinal.data.data.pedidoActivo,
      null,
      "WA-125: entregado el pedido, la ficha ya no expone `pedidoActivo` (banner apagado)",
    );

    // ── 14.5 Guardas de canal y de payload (la UI no debe romperse) ─────────
    const estadoIg = await intentar(
      patch("/inbox/whatsapp/pedido/ped-1/estado", {
        canal: "instagram",
        usuarioId: IGSID,
        estado: "en_ruta",
      }),
    );
    assertIgual(estadoIg.status, 409, "WA-15: cambiar estado con canal=instagram → 409 (exclusivo de WhatsApp)");
    const estadoSinUsuario = await intentar(
      patch("/inbox/whatsapp/pedido/ped-1/estado", { estado: "en_ruta" }),
    );
    assertIgual(estadoSinUsuario.status, 400, "WA-15: cambiar estado sin usuarioId → 400");
    const estadoInvalido = await intentar(
      patch("/inbox/whatsapp/pedido/ped-1/estado", {
        usuarioId: WA_MANUAL,
        estado: "estado_inventado",
      }),
    );
    assertIgual(estadoInvalido.status, 400, "WA-15: estado fuera del enum → 400");
    const pagoSinUsuario = await intentar(
      post("/inbox/whatsapp/pago/confirmar", { canal: "whatsapp" }),
    );
    assertIgual(pagoSinUsuario.status, 400, "WA-14: confirmar pago sin usuarioId → 400");

    // =========================================================================
    // 15. LOTE B7a — COPILOTO DE VENTA MANUAL (WA-131..139)
    //     Catálogo, métodos de pago, extracción IA del chat y guardado de la
    //     venta manual por endpoints unificados bajo /api/admin/inbox/**.
    // =========================================================================
    console.log("\n👉 15. LOTE B7a — Copiloto de Venta Manual (WA-131..139)...");

    // ── 15.1 WA-135: catálogo (GET /inbox/products) ─────────────────────────
    const productos = await intentar(get("/inbox/products"));
    assertIgual(productos.status, 200, "WA-135: GET /api/admin/inbox/products responde 200");
    assert(productos.data.success === true, "WA-135: catálogo con success: true");
    const nombresCatalogo = (productos.data.data || []).map((p) => p.name);
    assert(
      nombresCatalogo.includes("Combo Sushi 25") && nombresCatalogo.includes("Gyozas x10"),
      "WA-135: el catálogo trae los productos activos (Combo Sushi 25 · Gyozas x10)",
    );
    assert(
      !nombresCatalogo.includes("Producto Desactivado"),
      "WA-135: el catálogo NO incluye productos con activo:false (filtro de servidor)",
    );
    assert(
      (productos.data.data || []).every((p) => typeof p.price === "number"),
      "WA-135: cada producto trae `price` (el copiloto lo usa para el subtotal)",
    );

    // ── 15.2 WA-135: métodos de pago (GET /inbox/payments) ──────────────────
    const pagos = await intentar(get("/inbox/payments"));
    assertIgual(pagos.status, 200, "WA-135: GET /api/admin/inbox/payments responde 200");
    const nombresPagos = (pagos.data.data || []).map((m) => m.nombre);
    assert(
      nombresPagos.includes("Zelle") && nombresPagos.includes("Pago Móvil"),
      "WA-135/WA-137: los métodos de pago traen Zelle y Pago Móvil (opciones del selector)",
    );
    assert(
      (pagos.data.data || []).some((m) => m.nombre === "Método Desactivado" && m.activo === false),
      "WA-135: el servicio devuelve TODOS los métodos (el modal filtra por `activo`)",
    );

    // ── 15.3 WA-132/WA-133/WA-134/WA-136/WA-138: extracción IA (feliz) ──────
    const extraccion = await intentar(
      post("/inbox/whatsapp/copiloto/extraer", { canal: "whatsapp", usuarioId: WA_MANUAL }),
    );
    assertIgual(
      extraccion.status,
      200,
      "WA-132: POST /inbox/whatsapp/copiloto/extraer responde 200",
    );
    assert(extraccion.data.success === true, "WA-132: extracción con success: true");
    const extraido = extraccion.data.data || {};
    assertIgual(
      extraido.cliente?.nombre,
      "María García",
      "WA-132/WA-133: la IA devuelve el nombre (prellena el campo)",
    );
    assertIgual(extraido.cliente?.cedula, "V-12345678", "WA-133: la IA devuelve la cédula");
    assertIgual(
      extraido.cliente?.direccion,
      "Av. Principal, Torre Pachi, Caracas",
      "WA-133: la IA devuelve la dirección de entrega",
    );
    assertIgual(extraido.notas, "Sin cebolla en el combo", "WA-136: la IA devuelve las notas");
    assert(
      extraido.comprobanteUrl === "https://res.cloudinary.com/pachi/comprobante-extraido.jpg",
      "WA-138: la IA devuelve `comprobanteUrl` (preview del comprobante del chat)",
    );
    assertIgual(
      JSON.stringify(extraido.items),
      JSON.stringify([{ producto: "Combo Sushi 25", cantidad: 2 }]),
      "WA-134: la IA devuelve los items del carrito",
    );
    assertIgual(
      extraccion.data.usuarioId,
      WA_MANUAL,
      "WA-132: la respuesta ecoa el usuarioId (anclaje del copiloto a la conversación)",
    );

    // ── 15.4 WA-132: guardas de la extracción ──────────────────────────────
    const extractSinUsuario = await intentar(
      post("/inbox/whatsapp/copiloto/extraer", { canal: "whatsapp" }),
    );
    assertIgual(extractSinUsuario.status, 400, "WA-132: extraer sin usuarioId → 400");
    const extractIg = await intentar(
      post("/inbox/whatsapp/copiloto/extraer", { canal: "instagram", usuarioId: IGSID }),
    );
    assertIgual(
      extractIg.status,
      409,
      "WA-132: extraer en Instagram → 409 (copiloto exclusivo de WhatsApp)",
    );
    const extractSinHistorial = await intentar(
      post("/inbox/whatsapp/copiloto/extraer", {
        canal: "whatsapp",
        usuarioId: "+584000000000",
      }),
    );
    assertIgual(
      extractSinHistorial.status,
      404,
      "WA-132: chat sin historial → 404 (el modal NO pinta error: ofrece llenado manual)",
    );

    // ── 15.5 WA-139: guardar la venta manual (multipart, camino feliz) ─────
    const venta = {
      correlativo: 0,
      whatsappId: WA_MANUAL,
      telefono: WA_MANUAL,
      cliente: {
        nombre: "María García",
        cedula: "V-12345678",
        telefono: WA_MANUAL,
        direccion: "Av. Principal, Torre Pachi, Caracas",
      },
      estado: "pendiente_verificacion",
      items: [{ producto: "Combo Sushi 25", cantidad: 2, price: 25, subtotal: 50 }],
      totalUSD: 50,
      totalBs: 0,
      notas: "Sin cebolla en el combo",
      ubicacion: { direccion: "Av. Principal, Torre Pachi, Caracas" },
      pago: { metodo: "Zelle", montoUSD: 50, referencia: "", verificado: false },
      timestamp: new Date(),
    };
    const formVenta = new FormData();
    formVenta.append("canal", "whatsapp");
    formVenta.append("usuarioId", WA_MANUAL);
    formVenta.append("data", JSON.stringify(venta));
    eventos.length = 0;
    const creada = await intentar(
      axios.post(`${base}/inbox/whatsapp/venta-manual`, formVenta, {
        headers: { Cookie: cookieAdmin },
      }),
    );
    assertIgual(creada.status, 201, "WA-139: POST /inbox/whatsapp/venta-manual responde 201");
    assert(creada.data.success === true, "WA-139: la venta se guarda con success: true");
    const pedidoCreado = creada.data.data || {};
    assertIgual(
      pedidoCreado.cliente?.nombre,
      "María García",
      "WA-139: el pedido conserva el nombre del cliente",
    );
    assertIgual(
      pedidoCreado.whatsappId,
      WA_MANUAL,
      "WA-139: la venta queda anclada a la conversación (whatsappId forzado por el endpoint)",
    );
    assertIgual(
      pedidoCreado.estado,
      "pendiente_verificacion",
      "WA-139: nace en pendiente_verificacion (misma semántica que el legacy)",
    );
    assertIgual(
      Number(pedidoCreado.pago?.montoUSD),
      50,
      "WA-139: el monto USD sale del catálogo (25 × 2)",
    );
    assertIgual(
      pedidoCreado.pago?.metodo,
      "Zelle",
      "WA-137: el método viaja como NOMBRE (no como objeto: bug histórico del copiloto)",
    );
    assert(
      Boolean(pedidoCreado.idFormateado || pedidoCreado.correlativo),
      "WA-139: la venta manual recibe correlativo legible",
    );
    assert(
      eventos.some(
        (ev) =>
          ev.event === "inbox_actualizado" &&
          ev.payload?.tipo === "pedido" &&
          String(ev.payload?.usuarioId) === WA_MANUAL,
      ),
      "WA-139: la venta emite `inbox_actualizado` tipo pedido (refresco de lista/hilo)",
    );
    const listaTrasVenta = await intentar(
      get(`/inbox?canal=whatsapp&buscar=${encodeURIComponent(WA_MANUAL)}`),
    );
    const convTrasVenta = conversacion(listaTrasVenta, `whatsapp:${WA_MANUAL}`);
    assert(
      Boolean(convTrasVenta && convTrasVenta.pedido && convTrasVenta.pedido.tienePedido),
      "WA-139: el pedido de la venta manual queda visible en la conversación",
    );

    // ── 15.6 WA-139: anclaje forzado a la conversación del copiloto ────────
    const ventaAjena = Object.assign({}, venta, {
      whatsappId: "+584000000000",
      telefono: "+584000000000",
      cliente: Object.assign({}, venta.cliente, { telefono: "+584000000000" }),
    });
    const formAjeno = new FormData();
    formAjeno.append("canal", "whatsapp");
    formAjeno.append("usuarioId", WA_NORMAL); // el inbox manda SU conversación
    formAjeno.append("data", JSON.stringify(ventaAjena));
    const anclada = await intentar(
      axios.post(`${base}/inbox/whatsapp/venta-manual`, formAjeno, {
        headers: { Cookie: cookieAdmin },
      }),
    );
    assertIgual(anclada.status, 201, "WA-139: el anclaje con usuarioId responde 201");
    assertIgual(
      anclada.data.data?.whatsappId,
      WA_NORMAL,
      "WA-139: el usuarioId del inbox GANA sobre el whatsappId del payload (no se cuelga de otro chat)",
    );

    // ── 15.7 WA-139/WA-134/WA-135: guardas de la venta manual ──────────────
    const ventaSinNombre = new FormData();
    ventaSinNombre.append("canal", "whatsapp");
    ventaSinNombre.append(
      "data",
      JSON.stringify(Object.assign({}, venta, { cliente: { nombre: "", telefono: WA_MANUAL } })),
    );
    const rSinNombre = await intentar(
      axios.post(`${base}/inbox/whatsapp/venta-manual`, ventaSinNombre, {
        headers: { Cookie: cookieAdmin },
      }),
    );
    assertIgual(rSinNombre.status, 400, "WA-139: venta sin nombre de cliente → 400");

    const ventaSinItems = new FormData();
    ventaSinItems.append("canal", "whatsapp");
    ventaSinItems.append("data", JSON.stringify(Object.assign({}, venta, { items: [] })));
    const rSinItems = await intentar(
      axios.post(`${base}/inbox/whatsapp/venta-manual`, ventaSinItems, {
        headers: { Cookie: cookieAdmin },
      }),
    );
    assertIgual(rSinItems.status, 400, "WA-134/WA-139: venta sin items → 400");

    const ventaProductoInexistente = new FormData();
    ventaProductoInexistente.append("canal", "whatsapp");
    ventaProductoInexistente.append(
      "data",
      JSON.stringify(
        Object.assign({}, venta, {
          items: [{ producto: "Producto Fantasma", cantidad: 1, price: 5 }],
        }),
      ),
    );
    const rFantasma = await intentar(
      axios.post(`${base}/inbox/whatsapp/venta-manual`, ventaProductoInexistente, {
        headers: { Cookie: cookieAdmin },
      }),
    );
    assertIgual(rFantasma.status, 400, "WA-135/WA-139: producto fuera del catálogo → 400");

    const ventaIg = new FormData();
    ventaIg.append("canal", "instagram");
    ventaIg.append("usuarioId", IGSID);
    ventaIg.append("data", JSON.stringify(venta));
    const rVentaIg = await intentar(
      axios.post(`${base}/inbox/whatsapp/venta-manual`, ventaIg, {
        headers: { Cookie: cookieAdmin },
      }),
    );
    assertIgual(rVentaIg.status, 409, "WA-139: venta manual en Instagram → 409 (exclusiva de WhatsApp)");

    const ventaDataInvalida = new FormData();
    ventaDataInvalida.append("canal", "whatsapp");
    ventaDataInvalida.append("usuarioId", WA_MANUAL);
    ventaDataInvalida.append("data", "{no-es-json");
    const rDataInvalida = await intentar(
      axios.post(`${base}/inbox/whatsapp/venta-manual`, ventaDataInvalida, {
        headers: { Cookie: cookieAdmin },
      }),
    );
    assertIgual(rDataInvalida.status, 400, "WA-139: `data` que no es JSON → 400");

    const ventaSinData = new FormData();
    ventaSinData.append("canal", "whatsapp");
    ventaSinData.append("usuarioId", WA_MANUAL);
    const rSinData = await intentar(
      axios.post(`${base}/inbox/whatsapp/venta-manual`, ventaSinData, {
        headers: { Cookie: cookieAdmin },
      }),
    );
    assertIgual(rSinData.status, 400, "WA-139: multipart sin campo `data` → 400");

    // ── 15.8 WA-48: variantes de teléfono y cédula en la búsqueda ──────────
    // Los teléfonos del seed están enmascarados; se añade uno REALISTA para
    // probar las variantes 58 / 0 inicial / cédula que el legacy resolvía en el
    // CLIENTE (WhatsAppSidebar.js:39-49,101-149) y que ahora hace el servidor.
    const WA_VARIANTES = "+584141234567";
    const dbActual = dbLocal.read();
    dbActual.etiquetas[WA_VARIANTES] = {
      telefono: WA_VARIANTES,
      paso: "inicio",
      modo: "automatico",
      stuck: false,
      ctwaClid: null,
      unreadCount: 0,
      carrito: { nombre: "Carlos Variantes", cedula: "V-87654321" },
    };
    dbActual.mensajes.push({
      _id: "wa-var-1",
      telefono: WA_VARIANTES,
      texto: "Busquenme por variantes",
      direccion: "cliente",
      tipo: "texto",
      timestamp: new Date(AHORA - 1000),
      wamid: "wamid_var_1",
      status: null,
    });
    dbLocal.write(dbActual);

    const buscar012 = await intentar(
      get(`/inbox?canal=whatsapp&buscar=${encodeURIComponent("0414-123.4567")}`),
    );
    assert(
      (buscar012.data.data || []).some((c) => c.usuarioId === WA_VARIANTES),
      "WA-48: buscar '0414-123.4567' encuentra '+584141234567' (0 inicial + formato)",
    );
    const buscar58 = await intentar(
      get(`/inbox?canal=whatsapp&buscar=${encodeURIComponent("+58 414 123 4567")}`),
    );
    assert(
      (buscar58.data.data || []).some((c) => c.usuarioId === WA_VARIANTES),
      "WA-48: buscar '+58 414 123 4567' encuentra la misma conversación (variante 58)",
    );
    const buscarSin58 = await intentar(
      get(`/inbox?canal=whatsapp&buscar=${encodeURIComponent("4141234567")}`),
    );
    assert(
      (buscarSin58.data.data || []).some((c) => c.usuarioId === WA_VARIANTES),
      "WA-48: buscar '4141234567' (sin 58 ni 0) encuentra la conversación",
    );
    const buscarCedula = await intentar(
      get(`/inbox?canal=whatsapp&buscar=${encodeURIComponent("87654321")}`),
    );
    assert(
      (buscarCedula.data.data || []).some((c) => c.usuarioId === WA_VARIANTES),
      "WA-48: buscar por CÉDULA ('87654321') encuentra la conversación",
    );
    // CONTROL NEGATIVO: una variante de un teléfono inexistente NO devuelve nada.
    const buscarInexistente = await intentar(
      get(`/inbox?canal=whatsapp&buscar=${encodeURIComponent("0414-999.9999")}`),
    );
    assertIgual(
      (buscarInexistente.data.data || []).length,
      0,
      "CONTROL NEGATIVO WA-48: '0414-999.9999' NO devuelve conversaciones (las variantes no sobre-coinciden)",
    );

    // =========================================================================
    console.log("\n================================================================================");
    console.log(`📊 RESULTADOS INBOX UNIFICADO: ${passed} pruebas superadas, ${failed} fallidas.`);
    console.log("================================================================================");

    server.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("💥 Error no controlado en la suite del Inbox Unificado:", err);
    server.close();
    process.exit(1);
  }
}

runSuite();
