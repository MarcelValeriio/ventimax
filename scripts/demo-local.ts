/**
 * Datos de demostración para el MongoDB LOCAL de Docker (docker-compose.local.yml).
 *   npx tsx scripts/demo-local.ts            → carga conversaciones (WhatsApp, Instagram, Messenger),
 *                                              pedidos en distintos estados y 2 métodos de pago
 *   npx tsx scripts/demo-local.ts --borrar   → elimina solo lo que este script creó
 *
 * Se niega a correr contra una base que no sea 127.0.0.1/localhost. No carga el .env.
 * Todo lo creado queda marcado: teléfonos 58000000000x, IDs "demo_", nota "[DEMO]".
 * Los productos se toman del catálogo ya sembrado (arrancar dev-local.sh una vez antes).
 */
import mongoose from "mongoose";

const Producto = require("../models/Producto");
const Pedido = require("../models/Pedido");
const Etiqueta = require("../models/Etiqueta");
const EtiquetaIg = require("../models/EtiquetaIg");
const Mensaje = require("../models/Mensaje");
const MensajeIg = require("../models/MensajeIg");
const MetodoPago = require("../models/MetodoPago");
const Counter = require("../models/Counter");

const URI = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/ventimax_local";
const TEL = (n: number) => `58000000000${n}`;
const MARCA_PAGO = "[DEMO]";
const TASA = 888.12;

const haceMin = (min: number) => new Date(Date.now() - min * 60_000);

async function borrar() {
  const r = await Promise.all([
    Mensaje.deleteMany({ telefono: /^58000000000/ }),
    Etiqueta.deleteMany({ telefono: /^58000000000/ }),
    Pedido.deleteMany({ whatsappId: /^58000000000/ }),
    MensajeIg.deleteMany({ usuarioIgId: /^demo_/ }),
    EtiquetaIg.deleteMany({ usuarioIgId: /^demo_/ }),
    MetodoPago.deleteMany({ notaAdicional: MARCA_PAGO }),
  ]);
  const total = r.reduce((s, x) => s + (x.deletedCount || 0), 0);
  console.log(`🧹 Datos de demostración eliminados (${total} documentos).`);
}

async function cargar() {
  const yaHay = await Etiqueta.countDocuments({ telefono: /^58000000000/ });
  if (yaHay > 0) {
    console.log("ℹ️ Ya hay datos de demostración. Para recargarlos: --borrar y volver a ejecutar.");
    return;
  }

  const productos = await Producto.find({ activo: true }).sort({ price: 1 }).lean();
  if (productos.length < 3) {
    console.error("❌ No hay productos. Arranca primero ./scripts/dev-local.sh para sembrar el catálogo.");
    process.exit(1);
  }
  const [p1, p2, p3] = [productos[0], productos[Math.floor(productos.length / 2)], productos[productos.length - 1]];

  // ── Métodos de pago ──────────────────────────────────────────────
  await MetodoPago.create([
    {
      tipo: "pago_movil",
      nombre: "Pago Móvil (demo)",
      detalles: { banco: "Banco de prueba", cedula: "V-00000000", numeroCuenta: "0000-0000000", titular: "Cuenta de demostración" },
      notaAdicional: MARCA_PAGO,
      activo: true,
    },
    { tipo: "efectivo", nombre: "Efectivo (demo)", detalles: {}, notaAdicional: MARCA_PAGO, activo: true },
  ]);

  // ── WhatsApp: 4 clientes, uno por estado de pedido ───────────────
  const clientes = [
    { tel: TEL(1), nombre: "Ana Pérez", cedula: "10000001", paso: "esperando_comprobante", estado: "pendiente_pago", unread: 2 },
    { tel: TEL(2), nombre: "Luis Gómez", cedula: "10000002", paso: "pendiente_verificacion", estado: "pendiente_verificacion", unread: 1 },
    { tel: TEL(3), nombre: "María Rodríguez", cedula: "10000003", paso: "inicio", estado: "en_ruta", unread: 0 },
    { tel: TEL(4), nombre: "Carlos Díaz", cedula: "10000004", paso: "inicio", estado: "entregado", unread: 0 },
  ];
  const itemsPorCliente = [
    [{ producto: p1.name, price: p1.price, cantidad: 2 }],
    [{ producto: p2.name, price: p2.price, cantidad: 1 }],
    [{ producto: p3.name, price: p3.price, cantidad: 1 }, { producto: p1.name, price: p1.price, cantidad: 1 }],
    [{ producto: p2.name, price: p2.price, cantidad: 3 }],
  ];

  for (let i = 0; i < clientes.length; i++) {
    const c = clientes[i];
    const items = itemsPorCliente[i];
    const total = items.reduce((s, it) => s + it.price * it.cantidad, 0);
    const base = 30 + i * 45; // minutos atrás del primer mensaje
    const resumen = items.map((it) => `${it.cantidad}x ${it.producto}`).join(", ");

    await Etiqueta.create({
      telefono: c.tel,
      canal: "whatsapp",
      etiqueta: c.estado === "entregado" ? "cliente" : "nuevo",
      paso: c.paso,
      modo: i === 1 ? "manual" : "automatico",
      unreadCount: c.unread,
      carrito: {},
    });

    const conversacion = [
      ["cliente", "Hola, buenas tardes"],
      ["bot", "¡Hola! 👋 Bienvenido. Escribe *Menú* para ver el catálogo o cuéntame qué buscas."],
      ["cliente", `Quiero ${resumen}`],
      ["bot", `🛒 Tu pedido: ${resumen}\n💰 Total: $${total.toFixed(2)}`],
      ["cliente", `${c.nombre} ${c.cedula}`],
      ["bot", "💳 ¿Cómo deseas pagar?"],
      ["cliente", i === 3 ? "Efectivo" : "Pago móvil"],
    ];
    if (c.estado !== "pendiente_pago") conversacion.push(["cliente", "Listo, ya te envié el comprobante"]);
    if (c.estado === "en_ruta") conversacion.push(["admin", "¡Tu pedido va en camino! 🛵"]);
    if (c.estado === "entregado") conversacion.push(["cliente", "Recibido, muchas gracias 🙌"]);

    await Mensaje.insertMany(
      conversacion.map(([direccion, texto], k) => ({
        telefono: c.tel,
        canal: "whatsapp",
        direccion,
        texto,
        tipo: "texto",
        timestamp: haceMin(base - k * 2),
        status: direccion === "cliente" ? "received" : "read",
        wamid: `demo_wamid_${i}_${k}`,
      })),
    );

    const correlativo = `#${String(i + 1).padStart(3, "0")}`;
    await Pedido.create({
      whatsappId: c.tel,
      cliente: { nombre: c.nombre, cedula: c.cedula, telefono: c.tel },
      items,
      ubicacion: { direccion: `Caracas, dirección de prueba ${i + 1}` },
      notas: i === 2 ? "Entregar en conserjería" : null,
      pago: {
        metodo: i === 3 ? "Efectivo (demo)" : "Pago Móvil (demo)",
        montoUSD: total,
        montoVES: Math.round(total * TASA * 100) / 100,
        tasa: TASA,
      },
      correlativo,
      idFormateado: correlativo,
      repartidor: c.estado === "en_ruta" || c.estado === "entregado" ? "Repartidor demo" : null,
      estado: c.estado,
      timestamp: haceMin(base - 12),
      verifiedAt: ["en_ruta", "entregado"].includes(c.estado) ? haceMin(base - 20) : undefined,
      deliveredAt: c.estado === "entregado" ? haceMin(base - 40) : undefined,
    });
  }

  // El próximo pedido real continúa después de los de demostración.
  const contador = await Counter.findById("pedidoId").lean();
  if (!contador || (contador.seq || 0) < clientes.length) {
    await Counter.updateOne({ _id: "pedidoId" }, { $set: { seq: clientes.length } }, { upsert: true });
  }

  // ── Instagram y Messenger: una conversación cada uno ─────────────
  const sociales = [
    { id: "demo_ig_1", canal: "instagram", username: "cliente.demo", nombre: "Sofía Demo", origen: "anuncio" },
    { id: "demo_fb_1", canal: "messenger", username: null, nombre: "Pedro Demo", origen: "directo" },
  ];
  for (let i = 0; i < sociales.length; i++) {
    const s = sociales[i];
    await EtiquetaIg.create({
      usuarioIgId: s.id,
      canal: s.canal,
      username: s.username,
      nombre: s.nombre,
      paso: "inicio",
      modo: "automatico",
      origen: s.origen,
    });
    const msgs = [
      ["cliente", `Hola, ¿tienen el ${p3.name}?`],
      ["bot", `¡Hola! Sí, el ${p3.name} está disponible a $${p3.price}. ¿Te ayudo con el pedido?`],
      ["cliente", "¿Hacen envíos a Valencia?"],
    ];
    await MensajeIg.insertMany(
      msgs.map(([direccion, texto], k) => ({
        usuarioIgId: s.id,
        canal: s.canal,
        direccion,
        texto,
        tipo: "texto",
        mid: `demo_mid_${i}_${k}`,
        timestamp: haceMin(15 + i * 10 - k * 2),
      })),
    );
  }

  console.log("✅ Demostración cargada: 4 chats de WhatsApp con pedidos (#001-#004), 1 de Instagram, 1 de Messenger y 2 métodos de pago.");
  console.log("   Recarga el panel. Para quitarla: npx tsx scripts/demo-local.ts --borrar");
}

async function main() {
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URI)) {
    console.error("❌ Este script solo trabaja con la base local (127.0.0.1 o localhost).");
    process.exit(1);
  }
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 3000 });
  try {
    if (process.argv.includes("--borrar")) await borrar();
    else await cargar();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  console.error("   ¿Está levantado MongoDB? docker compose -f docker-compose.local.yml up -d");
  process.exit(1);
});
