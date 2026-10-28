const productos = [
  { id: 1, nombre: "Kit Dumplings", precio: 15, emoji: "🥟" }
];

const PAYMENT_DETAILS = {
  transferencia: {
    nombre: "Transferencia Bancaria",
    instrucciones:
      "🏦 Transfiere a la cuenta:\nBanco: Ejemplo Banco\nCuenta: 0000-0000-0000-0000\nTitular: PENDIENTE_DUEÑO\nCédula: 12.345.678\n\n⚠️ Envía el comprobante a este chat para confirmar.",
  },
  "pago movil": {
    nombre: "Pago Móvil",
    instrucciones:
      "📱 Pago móvil al número 0412-1234567\nBanco: Ejemplo Banco\nCédula: 12.345.678\n\n⚠️ Envía el comprobante a este chat para confirmar.",
  },
  usdt: {
    nombre: "USDT",
    instrucciones:
      "💎 Transfiere USDT (red TRC20) a la billetera:\n`TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`\n\n⚠️ Envía el comprobante a este chat para confirmar.",
  },
  zelle: {
    nombre: "Zelle",
    instrucciones:
      "💵 Envía el pago por Zelle al correo:\npagos@PENDIENTE_DUEÑO.com\n\n⚠️ Envía el comprobante a este chat para confirmar.",
  },
};

module.exports = { productos, PAYMENT_DETAILS };
