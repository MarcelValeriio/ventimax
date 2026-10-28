# Lanzamiento de VentiMax: lista del dueño

> Para el dueño. Es la lista concreta para poner **VentiMax** en producción, en orden. El detalle de cada
> paso (qué botón tocar, qué copiar) está en `docs/nuevo-cliente.md`; aquí van los datos de VentiMax y el
> orden. Marcar cada casilla al terminarla.
>
> Escrita el 2026-10-28, con la Fase 0 cerrada. El código ya está listo para producción: lo que falta son
> cuentas, claves y datos reales.

Tiempo estimado: una tarde para las cuentas (A a C) y otra para cargar el panel y probar (D y E). Lo que más
tarda no depende de ti: la aprobación de la plantilla de WhatsApp por Meta (minutos u horas) y, si el número
es nuevo, su verificación.

---

## A. Cuentas que se crean una sola vez (no dependen de nada)

- [ ] **MongoDB Atlas:** proyecto y cluster nuevos solo para VentiMax (nunca la base de Mr. Pachi).
      Usuario de base con contraseña generada y la base llamada `ventimax`. En *Network Access*, permitir
      a Render. Guardar la cadena `mongodb+srv://…/ventimax` → será `MONGODB_URI`. (Guía §2)
- [ ] **Cloudinary:** cuenta nueva para VentiMax (comprobantes de pago y fotos de los ventiladores).
      Guardar *Cloud name*, *API key* y *API secret*. (Guía §4, tabla de variables)
- [ ] **DeepSeek:** una clave para VentiMax (así se ve el consumo de cada negocio por separado) →
      `DEEPSEEK_API_KEY`.
- [ ] **Notificaciones push:** en la terminal, `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY` y
      `VAPID_PRIVATE_KEY`; `VAPID_EMAIL=mailto:<correo de VentiMax>`.
- [ ] **Contraseña del primer administrador:** inventar un usuario y una clave de **12 caracteres o más**
      → `ADMIN_USER` y `ADMIN_PASS`.

## B. Meta (WhatsApp)

- [ ] **Número de VentiMax:** un número que **no** esté activo en la app de WhatsApp del teléfono (si lo
      está, hay que borrar esa cuenta primero). Es el número que verán los clientes.
- [ ] **App de Meta nueva para VentiMax** en el Business Manager de VentiMax, con el producto WhatsApp y el
      número registrado. (Guía §3.1)
- [ ] **Token permanente** con un Usuario del sistema (`whatsapp_business_messaging` y
      `whatsapp_business_management`). El token de prueba del panel de desarrolladores vence en horas.
- [ ] Anotar `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
      `WHATSAPP_APP_SECRET`, `META_APP_ID` e inventar una frase para `VERIFY_TOKEN`.
- [ ] **Plantilla `order_notification`** (categoría *Utilidad*, un parámetro de texto en el cuerpo): con
      ella llegan las comandas al administrador aunque no le haya escrito al bot en 24 horas. Enviarla a
      aprobación ya, porque Meta tarda.
- [ ] Teléfonos de alertas: el del administrador y el de despacho (formato `58412…`, sin `+`) →
      `ADMIN_PHONE_NUMBER`, `ADMIN_PHONE_NUMBER_2`, `DELIVERY_PHONE_NUMBER`.

El webhook y el modo *Live* se configuran **después** de Render (sección C), porque Meta necesita la URL
funcionando.

## C. Render

- [ ] Render → *New* → *Blueprint* → el repositorio de VentiMax. `render.yaml` ya trae el nombre `ventimax`,
      `BRAND_NAME=ventimax`, `NODE_ENV=production`, el plan *free* (decisión del dueño: se duerme tras
      15 min sin tráfico; pasar a *starter* cuando haya ventas diarias) y un `JWT_SECRET` generado.
- [ ] Pegar las variables que pide (todas las de A y B). (Guía §4)
- [ ] Desplegar y revisar en los logs: `Configuración cargada para: ventimax`, `Conectado a MongoDB`,
      `Sembrando catálogo inicial` y `Administrador inicial '<usuario>' creado`. Si algo falla, la tabla de la
      guía §4.1 dice qué variable revisar. Claude puede leer los logs de Render si se los pides.
- [ ] Abrir `https://ventimax.onrender.com/health` → `{"status":"ok"}`. (Si Render asigna otra dirección
      porque el nombre está tomado, usar esa en todos los pasos siguientes.)
- [ ] Entrar al panel (`/panel`) con `ADMIN_USER`/`ADMIN_PASS` y después **borrar esas dos variables de
      Render** (ya no hacen falta y no deben quedar a la vista).
- [ ] **Meta, webhook:** URL `https://ventimax.onrender.com/webhook`, token = `VERIFY_TOKEN`, suscribir
      `messages`.
- [ ] **Meta, política de privacidad:** `https://ventimax.onrender.com/privacidad` y, para eliminación de
      datos, `https://ventimax.onrender.com/privacidad#eliminacion-de-datos`. Antes, completar los datos
      legales (sección D, primer punto), porque Meta revisa esa página.
- [ ] Pasar la app de Meta a **Live**.

## D. Cargar el panel con los datos reales

En `https://ventimax.onrender.com/panel`:

- [ ] **Configuración → Operación → Datos del negocio:** razón social, RIF, dirección fiscal, correo,
      WhatsApp de VentiMax, web e Instagram. Guardar y revisar `/privacidad`.
- [ ] **Inventario → Métodos de Pago:** los 5 métodos (Transferencia, Pago Móvil, USDT, Zelle, Efectivo) con los
      **datos reales** de las cuentas; desactivar los que VentiMax no use. Ninguno puede quedar con
      `PENDIENTE_DUEÑO`.
- [ ] **Inventario → Envíos:** los tres métodos de VentiMax:

      | Nombre sugerido | Tipo | Costo | Datos que pide el bot |
      |---|---|---|---|
      | Delivery Caracas | Delivery local | A convenir (depende de la zona) | vacío (pide la dirección) |
      | Envío nacional | Envío nacional | A convenir | `estado, ciudad y agencia de envío` |
      | Retiro en Catia | Retiro | Sin costo | — |

      Para el retiro, la dirección es *Av. Sucre de Catia, Gato Negro, frente a la entrada del Parque del
      Oeste, Caracas*. El horario se deja vacío para que use el de atención.
- [ ] **Configuración → Operación → Horario de atención:** días y horas reales (hoy: lunes a viernes de
      9:00 am a 5:00 pm; cambiarlo si no es así).
- [ ] **Configuración → Operación → Días no laborables:** decidir qué ofrece el bot el fin de semana
      (pedido para el próximo día hábil, o nada).
- [ ] **Inventario → Productos:** revisar los 6 ventiladores (precios de la tabla de `AGENTS.md`) y subir
      **las fotos** (la primera es la que el bot manda al cliente).
- [ ] **Configuración → Operación → Gestión → Personal:** crear las cuentas del equipo (cajero, repartidor) con contraseñas
      propias.
- [ ] **Configuración → Operación → Gestión → Preguntas frecuentes y Respuestas rápidas:** revisar que no quede ninguna de Mr. Pachi y cargar las
      de VentiMax.

## E. Prueba final y apertura

- [ ] Hacer la **prueba final** de la guía (§6) desde un teléfono que no sea del negocio: un pedido completo
      con comprobante, un "voy en persona", un envío nacional y un día no laborable.
- [ ] Abrir el panel con la consola del navegador (F12): ningún error de "Content Security Policy".
- [ ] Repasar la **lista final** de la guía (§7).
- [ ] Borrar los pedidos de prueba y **anunciar el número**: bio de Instagram, estados, empaque.

---

## Después del lanzamiento (no bloquea)

- **Instagram y Messenger:** se conectan cuando quieras (guía §3.2 y §3.3). Hasta entonces el bot atiende
  solo por WhatsApp.
- **Catálogo web (F2):** cuando esté terminado se publica como un segundo servicio de Render y se añade
  `CATALOGO_ORIGEN`. Esta lista se ampliará entonces.
- **TikTok (F5):** pasar la cuenta a empresa y pedir el acceso a la API de mensajes.
- **Dominio propio:** pendiente de tu decisión. Mientras tanto todo funciona con `onrender.com`.
