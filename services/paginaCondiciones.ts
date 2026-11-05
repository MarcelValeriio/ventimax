/**
 * Condiciones del servicio generadas desde la marca activa (config/brand/<marca>/settings.json).
 * Misma fuente de datos que la política de privacidad (paginaPrivacidad.ts).
 * El texto es genérico y describe lo que el sistema hace de verdad: pedidos por chat y por tienda web,
 * precios en USD con conversión a bolívares, pago verificado por una persona, envíos y retiro, asistente con IA.
 * No inventa plazos de garantía ni devoluciones: remite a lo acordado con el negocio al comprar.
 */
const configManager = require("./configManager");
const { getDatosNegocioSync } = require("./datosNegocioService");
const { escapar, contactos, formatearFecha } = require("./paginaPrivacidad");

export function generarPaginaCondiciones(): string {
  const marca = escapar(configManager.get("settings.brandName"));
  const bot = escapar(configManager.get("settings.botIdentity") || "nuestro asistente virtual");
  const color = escapar(configManager.get("settings.theme.primaryColor") || "#333333");
  const horasVigencia = Number(configManager.get("settings.catalogo.vigenciaHoras")) || 72;
  const vigencia = horasVigencia % 24 === 0 ? `${horasVigencia / 24} días` : `${horasVigencia} horas`;
  const datos = getDatosNegocioSync();
  const razonSocial = escapar(datos.legal.razonSocial);
  const rif = escapar(datos.legal.rif);
  const direccion = escapar(datos.legal.direccion);
  const actualizacion = escapar(formatearFecha(datos.fechaActualizacion));
  const anio = new Date().getFullYear();

  const responsable = razonSocial
    ? `<strong>${razonSocial}</strong>${rif ? ` (RIF ${rif})` : ""}, que opera la marca <strong>${marca}</strong>`
    : `<strong>${marca}</strong>`;

  const listaContactos: string[] = contactos();
  const bloqueContacto = listaContactos.length
    ? `<ul>${listaContactos.map((c) => `<li>${c}</li>`).join("")}</ul>`
    : `<p>Escríbenos por el mismo chat de WhatsApp, Instagram o Facebook donde nos contactaste.</p>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Condiciones del Servicio · ${marca}</title>
<style>
  body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 32px 16px; color: #222; background: #fff; }
  h1 { color: ${color}; }
  h2 { border-bottom: 2px solid ${color}33; padding-bottom: 4px; margin-top: 32px; }
  a { color: ${color}; }
  .pie { margin-top: 48px; font-size: 0.85em; color: #666; border-top: 1px solid #eee; padding-top: 16px; }
</style>
</head>
<body>
<h1>Condiciones del Servicio</h1>
${actualizacion ? `<p><strong>Última actualización:</strong> ${actualizacion}</p>` : ""}

<p>Estas condiciones regulan el uso del catálogo web y de los canales de atención (WhatsApp, Instagram y
Facebook Messenger) de ${responsable}. Al usarlos o al hacer un pedido, aceptas lo que aquí se indica.</p>

<h2>1. Quiénes somos</h2>
<p>${responsable}.${direccion ? ` Dirección: ${direccion}.` : ""} Vendemos los productos que se muestran en el catálogo.</p>

<h2>2. El servicio</h2>
<p>Ofrecemos un catálogo web para consultar productos y armar un pedido, y atención por chat con ${bot},
un asistente virtual, y con personas del negocio. El catálogo y el chat son informativos hasta que el pedido se
confirma y, cuando corresponde, se verifica el pago.</p>

<h2>3. Asistente con inteligencia artificial</h2>
<p>Algunas respuestas las genera un sistema de inteligencia artificial y pueden contener errores. Ninguna respuesta
automática, por sí sola, es una oferta ni una confirmación de pedido. Puedes pedir en cualquier momento que te
atienda una persona. Más datos sobre el tratamiento de tu información en nuestra
<a href="/privacidad">Política de Privacidad</a>.</p>

<h2>4. Productos, precios y disponibilidad</h2>
<ul>
  <li>Los precios se publican en dólares estadounidenses (USD). El monto en bolívares se calcula con la tasa del
  Banco Central de Venezuela (BCV) vigente al momento de generar o pagar el pedido, y puede variar de un día a otro.</li>
  <li>Las fotos y descripciones son referenciales. Los productos pueden tener pequeñas diferencias de color o presentación.</li>
  <li>La disponibilidad depende del inventario. Podemos corregir un precio o cancelar un pedido si hubo un error
  evidente en la publicación, avisándote antes de cobrar.</li>
  <li>Los descuentos y promociones (por producto o por volumen) tienen las condiciones que se muestran en el
  catálogo y no se acumulan salvo que se indique.</li>
</ul>

<h2>5. Cómo se hace un pedido</h2>
<ul>
  <li>Desde la tienda web armas tu carrito y se genera un código de pedido que envías por WhatsApp. Ese pedido
  queda disponible durante ${vigencia}; pasado ese tiempo se borra y hay que armarlo de nuevo.</li>
  <li>También puedes pedir directamente por el chat.</li>
  <li>El pedido se considera confirmado cuando recibes la confirmación del negocio y, si aplica, tu pago ha sido verificado.</li>
  <li>Debes dar datos verdaderos y completos (nombre, cédula, teléfono y dirección o forma de entrega). No nos
  hacemos responsables por demoras causadas por datos erróneos.</li>
</ul>

<h2>6. Pagos</h2>
<ul>
  <li>Aceptamos los métodos de pago que el negocio tenga activos en ese momento (por ejemplo transferencia, Pago Móvil,
  divisas o efectivo). Los datos de pago te los damos solo por el chat, nunca por mensajes de terceros.</li>
  <li>Los pagos se verifican por una persona del negocio a partir del comprobante que envíes. El pedido no se
  despacha hasta que el pago esté verificado.</li>
  <li>El negocio nunca te pedirá claves bancarias, códigos de seguridad ni datos de acceso a tus cuentas.</li>
</ul>

<h2>7. Entrega y retiro</h2>
<ul>
  <li>Según el pedido, puedes elegir los métodos que el negocio tenga disponibles: entrega a domicilio en las zonas
  indicadas, retiro en el punto de retiro, o envío nacional por una empresa de encomiendas.</li>
  <li>El costo del delivery depende de la zona y se acuerda antes de la entrega.</li>
  <li>En los envíos nacionales la empresa de encomiendas puede cobrar el flete a destino, es decir, lo pagas tú al
  retirar en su agencia. El monto que mostramos en el carrito es solo un estimado y puede variar según la empresa.</li>
  <li>Los plazos de entrega son aproximados. Retrasos causados por la empresa de transporte, el clima u otros
  hechos ajenos al negocio no son responsabilidad nuestra, pero te ayudaremos a dar seguimiento.</li>
  <li>Revisa el producto al recibirlo y avísanos de inmediato por el chat si llegó dañado o distinto de lo pedido.</li>
</ul>

<h2>8. Cambios, devoluciones y garantía</h2>
<p>Si el producto llegó dañado, incompleto o distinto de lo pedido, escríbenos por el chat lo antes posible con
fotos del producto y de la caja, y buscaremos una solución (reparación, cambio o reembolso, según el caso). Las
condiciones específicas de garantía son las del fabricante del producto y las que el negocio te indique al comprar.
No cubrimos daños por mal uso, golpes, humedad o instalación indebida.</p>

<h2>9. Uso adecuado</h2>
<p>No debes usar el catálogo ni los chats para enviar contenido ilegal u ofensivo, hacer pedidos falsos, intentar
vulnerar la seguridad del sistema, ni extraer su contenido de forma automatizada. Podemos dejar de atender a quien
lo haga.</p>

<h2>10. Propiedad intelectual</h2>
<p>El nombre, los logos, las fotos y los textos del catálogo pertenecen al negocio o a sus marcas y proveedores.
No puedes copiarlos ni usarlos con fines comerciales sin autorización.</p>

<h2>11. Responsabilidad</h2>
<p>Hacemos lo posible por que el catálogo y el chat funcionen sin interrupciones, pero pueden fallar por causas
técnicas o de terceros (WhatsApp, Instagram, Messenger, internet, proveedores de alojamiento). En la medida
permitida por la ley, no respondemos por daños indirectos derivados de esas interrupciones.</p>

<h2>12. Cambios en estas condiciones</h2>
<p>Podemos actualizar estas condiciones. La versión vigente es la publicada en esta dirección, y se aplica a los
pedidos hechos desde su publicación.</p>

<h2>13. Ley aplicable</h2>
<p>Estas condiciones se rigen por las leyes de la República Bolivariana de Venezuela.</p>

<h2>14. Contacto</h2>
${bloqueContacto}

<div class="pie">© ${anio} ${razonSocial || marca}</div>
</body>
</html>`;
}

module.exports = { generarPaginaCondiciones };
