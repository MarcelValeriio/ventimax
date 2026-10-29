# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Dos audiencias, con prioridad para el comprador:

- **Compradores (principal):** hogares y pequeños negocios en Venezuela, sobre todo Caracas, con envíos a nivel nacional. Llegan desde el celular, muchas veces por un enlace de WhatsApp o Instagram, buscan un ventilador y quieren cerrar la compra sin esperar a que alguien les responda.
- **Dueño y personal de venta (secundaria):** operan el panel: bandeja de entrada unificada, pedidos, inventario, precios, horario, métodos de envío y pago.

## Product Purpose
VentiMax vende ventiladores Fortunne. Un bot de ventas atiende WhatsApp, Instagram y Messenger, y una tienda web pública muestra el catálogo con carrito. El objetivo es que el comprador arme su pedido en la web y lo confirme por WhatsApp sin copiar listas ni esperar respuesta manual.

Éxito significa: el comprador entiende precio y disponibilidad real, confirma un pedido con código único que el bot reconoce al instante, y el dueño ve ese pedido ordenado en el panel.

## Positioning
Armas el pedido en la web y lo confirmas por WhatsApp con un código único. El bot reconoce ese código al instante, con los precios reales del servidor y el monto en Bs a la tasa BCV del día. Una tienda genérica o un bot de respuestas sueltas no puede ofrecer ese cierre con precios y tasa vigentes.

## Operating Context
- Canales: WhatsApp, Instagram Direct, Messenger y la tienda web pública (`https://ventimax-tienda.onrender.com`).
- Pagos: Transferencia, Pago Móvil, USDT, Zelle y Efectivo. Los datos de cuenta todavía son `PENDIENTE_DUEÑO` y los carga el dueño desde el panel.
- Entregas: delivery en Caracas (costo a convenir por zona), envíos nacionales y retiro en persona en el punto que el dueño configure en el panel.
- Zona horaria `America/Caracas`. Tasa BCV en Bs y fecha de la tasa visibles en cada precio en Bs.
- El panel administrativo lo usa el personal en escritorio y celular durante el día; el dueño configura horario, envíos, pagos y productos desde ahí.

## Capabilities and Constraints
- Stack existente: Node.js + TypeScript, Express 5, MongoDB (Mongoose), Socket.IO, SPA React 18 en `public/` sin paso de build. No se introducen frameworks ni CDN en la tienda pública.
- Catálogo inicial de 6 productos en USD (Mini Jumbo 6", High Velocity 8", Turbo Fan 10", Turbo Fan 12", Turbo Fan 20", Pedestal 18"), con categorías Mesa, Pared y Pedestal; un producto puede estar en varias categorías.
- Seguridad obligatoria: nunca `innerHTML` con datos (solo `textContent` o creación de elementos); precios y total los calcula el servidor, el carrito del cliente solo guarda producto y cantidad; la CSP no admite dominios externos salvo Cloudinary para las fotos; sin scripts en línea.
- Productos agotados se muestran pero no se pueden agregar al carrito.
- Rendimiento: debe cargar rápido en Android económicos y con conexión lenta.
- Pendiente de producto (no inventar): redesign de la tienda (F2b), preguntas frecuentes en la tienda, canal TikTok (F5), búsqueda con IA (F3), costo de envío por kilómetro. Requisitos y estado en `AGENTS.md`.
- Terminología: "Yuri-Bot" es el nombre del bot; "Fortunne" es la marca del producto (no la de la tienda).

## Brand Commitments
- Nombre comercial VentiMax; bot Yuri-Bot; marca de producto Fortunne.
- Logo Fortunne (`public/assets/brand/ventimax/fortunne-logo.png`) solo para el catálogo, no para el panel. El panel usa `/assets/favicon.svg` hasta que VentiMax tenga logo propio.
- Nada de la marca puede quedar escrito en el código: textos en `config/brand/<marca>/`, nunca hardcodeados. El proyecto es plantilla multimarca.
- Accesibilidad como compromiso de marca de la tienda: ver abajo.

## Evidence on Hand
- Catálogo real confirmado por el dueño el 2026-10-27 (ver tabla en `AGENTS.md`, sección "Datos del negocio VentiMax").
- Fotos de producto en Cloudinary; logo Fortunne en `public/assets/brand/ventimax/`.
- Documentación de diseño de producto: `docs/f1-producto-ampliado.md`, `docs/f2-catalogo-web.md`, `docs/auditoria-seguridad-2026-10.md`.
- No existe DESIGN.md ni sistema visual documentado; no inventar testimonios, reseñas, cifras de ventas ni casos de cliente.

## Product Principles
1. El precio real y la disponibilidad real siempre visibles, nunca estimados ni inventados: los calcula el servidor.
2. Cero fricción para cerrar la compra: del catálogo al WhatsApp con el pedido ya armado.
3. Funciona en un celular modesto con conexión lenta antes que impresionar en escritorio.
4. Cada dato de la marca y del negocio sale de la configuración del panel, no del código.

## Accessibility & Inclusion
- Botones de al menos 44 px de área táctil.
- Foco visible con teclado en todos los controles interactivos.
- Respetar la preferencia de sistema "reducir movimiento" (`prefers-reduced-motion`).
