/**
 * Política de privacidad generada desde la marca activa (config/brand/<marca>/settings.json).
 * Una sola página para WhatsApp, Instagram y Messenger; es la URL que se registra en la app de Meta.
 *
 * El texto legal es genérico y describe lo que el sistema hace de verdad:
 * - mensajes con borrado automático a los 90 días (índice TTL de Mensaje y MensajeIg);
 * - pedidos conservados para contabilidad;
 * - proveedores: Meta, MongoDB Atlas, Render, Cloudinary (comprobantes) y DeepSeek (IA);
 * - la eliminación de datos se pide por los canales de contacto (CANCELAR solo reinicia el chat).
 * Los datos del negocio salen de `settings.legal` y `settings.contact`; si faltan, se omiten.
 */
const configManager = require("./configManager");

const escapar = (valor: unknown): string =>
  String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function contactos(): string[] {
  const email = configManager.get("settings.contact.email");
  const telefono = configManager.get("settings.whatsappPhone");
  const instagram = configManager.get("settings.contact.instagram");
  const web = configManager.get("settings.contact.website");
  const lista: string[] = [];
  if (email) lista.push(`Correo: <a href="mailto:${escapar(email)}">${escapar(email)}</a>`);
  if (telefono) lista.push(`WhatsApp: +${escapar(String(telefono).replace(/\D/g, ""))}`);
  if (instagram) lista.push(`Instagram: ${escapar(instagram)}`);
  if (web) lista.push(`Sitio web: <a href="${escapar(web)}">${escapar(web)}</a>`);
  return lista;
}

export function generarPaginaPrivacidad(): string {
  const marca = escapar(configManager.get("settings.brandName"));
  const bot = escapar(configManager.get("settings.botIdentity") || "nuestro asistente virtual");
  const color = escapar(configManager.get("settings.theme.primaryColor") || "#333333");
  const legal = configManager.get("settings.legal") || {};
  const razonSocial = escapar(legal.razonSocial);
  const rif = escapar(legal.rif);
  const direccion = escapar(legal.direccion);
  const actualizacion = escapar(legal.fechaActualizacion);
  const anio = new Date().getFullYear();

  const responsable = razonSocial
    ? `<strong>${razonSocial}</strong>${rif ? ` (RIF ${rif})` : ""}, que opera la marca <strong>${marca}</strong>`
    : `<strong>${marca}</strong>`;

  const listaContactos = contactos();
  const bloqueContacto = listaContactos.length
    ? `<ul>${listaContactos.map((c) => `<li>${c}</li>`).join("")}</ul>`
    : `<p>Escríbenos por el mismo chat de WhatsApp, Instagram o Facebook donde nos contactaste.</p>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Política de Privacidad · ${marca}</title>
<style>
  body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 32px 16px; color: #222; background: #fff; }
  h1 { color: ${color}; }
  h2 { border-bottom: 2px solid ${color}33; padding-bottom: 4px; margin-top: 32px; }
  a { color: ${color}; }
  .pie { margin-top: 48px; font-size: 0.85em; color: #666; border-top: 1px solid #eee; padding-top: 16px; }
</style>
</head>
<body>
<h1>Política de Privacidad</h1>
${actualizacion ? `<p><strong>Última actualización:</strong> ${actualizacion}</p>` : ""}

<p>Esta política explica cómo ${responsable} recopila, usa y protege la información de las personas que
escriben a ${bot}, el asistente virtual del negocio en WhatsApp, Instagram y Facebook Messenger.</p>

<h2>1. Responsable de los datos</h2>
<p>${responsable}.${direccion ? ` Dirección: ${direccion}.` : ""}</p>

<h2>2. Información que recopilamos</h2>
<ul>
  <li><strong>Datos de la conversación:</strong> tu número de teléfono (WhatsApp) o tu identificador y nombre público
  (Instagram y Messenger), y los mensajes, imágenes y documentos que envías en el chat.</li>
  <li><strong>Datos del pedido:</strong> nombre, cédula de identidad, dirección o ubicación de entrega, productos,
  notas y método de pago.</li>
  <li><strong>Comprobantes de pago:</strong> las imágenes que envías para verificar un pago.</li>
  <li><strong>Origen publicitario:</strong> si llegaste desde un anuncio de Meta, el identificador del anuncio.</li>
</ul>

<h2>3. Para qué la usamos</h2>
<ul>
  <li>Responder tus consultas y mostrarte el catálogo.</li>
  <li>Registrar, cobrar, despachar y entregar tus pedidos.</li>
  <li>Verificar pagos y llevar la contabilidad del negocio.</li>
  <li>Retomar contigo una compra que quedó a medias.</li>
  <li>Medir el resultado de nuestros anuncios en Meta (solo cuando llegaste desde uno).</li>
</ul>
<p>No vendemos ni alquilamos tus datos, ni los usamos para publicidad de terceros.</p>

<h2>4. Asistente con inteligencia artificial</h2>
<p>Algunas respuestas las genera un sistema de inteligencia artificial. Para eso, el texto de tus mensajes y el
catálogo del negocio se envían a un proveedor de IA (DeepSeek), que los procesa para redactar la respuesta.
Puedes pedir en cualquier momento que te atienda una persona.</p>

<h2>5. Con quién compartimos la información</h2>
<p>Solo con el personal del negocio que atiende y despacha tu pedido, y con los proveedores técnicos que hacen
funcionar el servicio:</p>
<ul>
  <li>Meta Platforms (WhatsApp, Instagram y Messenger), por donde viajan los mensajes.</li>
  <li>MongoDB Atlas y Render, donde se almacenan los datos y funciona el sistema.</li>
  <li>Cloudinary, donde se guardan los comprobantes e imágenes.</li>
  <li>DeepSeek, para las respuestas de inteligencia artificial.</li>
</ul>

<h2>6. Cuánto tiempo la conservamos</h2>
<ul>
  <li><strong>Mensajes del chat:</strong> se borran automáticamente a los 90 días.</li>
  <li><strong>Pedidos y comprobantes:</strong> se conservan mientras lo exijan las obligaciones contables y fiscales
  del negocio.</li>
</ul>

<h2 id="eliminacion-de-datos">7. Tus derechos y cómo pedir que borremos tus datos</h2>
<p>Puedes pedir una copia de tus datos, su corrección o su eliminación escribiéndonos por cualquiera de los canales
de contacto. Indica el número de teléfono o usuario con el que nos escribiste. Atendemos la solicitud en un plazo
máximo de 30 días, salvo los datos de pedidos que debamos conservar por ley.</p>
<p>Escribir <strong>CANCELAR</strong> en el chat solo reinicia la conversación con el asistente; no borra tus datos.</p>

<h2>8. Contacto</h2>
${bloqueContacto}

<h2>9. Cambios en esta política</h2>
<p>Si cambiamos esta política, publicaremos la nueva versión en esta misma dirección.</p>

<div class="pie">© ${anio} ${razonSocial || marca}</div>
</body>
</html>`;
}

module.exports = { generarPaginaPrivacidad };
