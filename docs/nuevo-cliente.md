# Guía: poner el bot en marcha para un cliente nuevo

> Para el dueño del proyecto (y para Claude/Antigravity cuando preparen la marca).
> Estado: **Fase 0, actualizada el 2026-10-28.** Las secciones marcadas ⏳ dependen de tareas de
> `AGENTS.md` que aún no están aprobadas (F0-5 envíos, F0-12 retiro, F0-9 fotos): se confirman al cerrarlas.

El código es el mismo para todos los clientes. Lo que cambia por cliente es:

| Qué | Dónde | Quién |
|---|---|---|
| Identidad, textos del bot, colores, catálogo inicial, prompt de IA | `config/brand/<marca>/` | Claude / Antigravity |
| Productos, precios, categorías, métodos de pago y envío, horario, FAQ | Panel administrativo | Dueño o cliente |
| Base de datos | MongoDB Atlas (una por cliente) | Dueño |
| Número de WhatsApp, Instagram, Facebook | Meta (una app por cliente) | Dueño |
| Servidor y variables secretas | Render (un servicio por cliente) | Dueño |

---

## 0. Datos que hay que pedirle al cliente

- [ ] Nombre comercial y nombre del bot (si no tiene, se propone uno).
- [ ] Rubro en 1-2 frases (lo usa la IA para saber qué vende).
- [ ] Logo (PNG o SVG, fondo transparente) y colores, o una foto del empaque/local para sacarlos.
- [ ] Catálogo: nombre, precio, descripción corta y categorías de cada producto (un producto puede ir en
      varias). Para catálogos grandes conviene una hoja de cálculo.
- [ ] Unidad de venta (unidad, caja, kilo, juego...).
- [ ] Métodos de pago con sus datos reales (se cargan en el panel, **nunca** se envían por chat al equipo
      técnico ni se escriben en el repositorio).
- [ ] Métodos de envío y zonas (delivery local, envío nacional, retiro en tienda) y si tienen costo fijo o a
      convenir.
- [ ] Si tiene un lugar donde el cliente pueda retirar: dirección y horario (se cargan en el panel, no en el
      código).
- [ ] Días y horario de atención; qué pasa los días no laborables (pedido para el siguiente día hábil,
      retiro en un punto, o nada).
- [ ] Teléfonos que reciben las alertas y comandas (administrador, despacho).
- [ ] Correo, web e Instagram de contacto.
- [ ] Razón social y RIF para la política de privacidad (Meta la revisa).
- [ ] Cuenta de Facebook con acceso de administrador al Business Manager del negocio.

---

## 1. Crear la marca en el código

Tomar VentiMax como base (no `default`, que conserva textos de Mr. Pachi para las pruebas):

```bash
cp -r config/brand/ventimax config/brand/<marca>
mkdir -p public/assets/brand/<marca>
```

`<marca>` en minúsculas, sin espacios ni acentos (ej. `repuestos-perez`). Es el valor de `BRAND_NAME`.

### 1.1 `settings.json`

| Clave | Qué poner |
|---|---|
| `brandName` | Nombre comercial (obligatorio) |
| `botIdentity` | Nombre del bot |
| `businessDescription` | Rubro en 1-2 frases |
| `productBrand` | Marca de los productos, si vende una sola (si no, `""`) |
| `whatsappPhone` | Número del negocio, o `""` |
| `contact.email`, `contact.website`, `contact.instagram` | Datos de contacto, o `""`. Nunca inventarlos |
| `sales.unitSingular`, `sales.unitPlural` | Unidad de venta ("unidad"/"unidades", "caja"/"cajas") |
| `brandEmoji`, `categoryEmoji` | Emoji del negocio y de las categorías |
| `theme.primaryColor`, `theme.secondaryColor` | Colores en hexadecimal (obligatorios) |
| `theme.logoUrl` | Logo del panel, p. ej. `/assets/brand/<marca>/logo.png` |
| `theme.productBrandLogoUrl` | Logo de la marca de producto para el catálogo, o `""` |
| `horarioAtencion` | Horario inicial: `dias` (0 = domingo … 6 = sábado), `apertura` y `cierre` en `HH:mm`, `zonaHoraria`. Después se cambia desde el panel |
| `flujoNoLaborable` | Comportamiento inicial en días no laborables (sección 5.6). Dejar el de VentiMax (entrega en día hábil, sin punto aliado) salvo que el cliente pida otra cosa; se cambia desde el panel |
| `legal` | Razón social, RIF, dirección y fecha para la política de privacidad (sección 1.7) |
| `watchdog` | Días sin alertas (0 = domingo) y franja horaria de alertas al admin. Es independiente del horario de atención |
| `messages.*` | Textos del bot. Revisar **todos**: no pueden quedar referencias al negocio anterior (ventiladores, Fortunne). `{{brandName}}`, `{{botIdentity}}` y las demás variables entre llaves se dejan tal cual |

No se borra ninguna clave de `messages`: si falta una, el bot usa un texto genérico.

### 1.2 `products.json`

Una entrada por producto:

```json
{ "id": "repuestos-0001", "name": "Pastillas de freno delanteras", "price": 18.5,
  "description": "Juego de 4", "categorias": ["Frenos"] }
```

- `id` único, sin espacios. La primera categoría de `categorias` es la principal.
- Solo se usa para **sembrar una base vacía** en el primer arranque. Después, los productos se editan en
  el panel y este archivo ya no se lee.

### 1.3 `payments.json`

Dejar los métodos con `PENDIENTE_DUEÑO`. En producción los métodos de pago se crean desde el panel
(sección 5); este archivo no se usa al arrancar.

### 1.4 `ai_prompt.txt`

Reescribirlo para el negocio: qué vende, qué no vende, cómo son los envíos, cuándo derivar a un asesor.
Reglas:

- Usar `{{brandName}}` en lugar del nombre escrito.
- **No poner precios**: la IA los recibe del catálogo real; si el prompt trae un precio y luego cambia en
  el panel, el bot se contradice.
- No inventar costos de envío ni políticas que el cliente no haya dado.

### 1.5 Logos

Copiar los archivos a `public/assets/brand/<marca>/` y apuntar `theme.logoUrl` a ellos.

### 1.6 Comprobar la marca

```bash
BRAND_NAME=<marca> NODE_ENV=test npx tsx -e '
const c = require("./services/configManager");
console.log(c.get("settings.brandName"), "|", c.get("settings.botIdentity"));
console.log(c.format("settings.messages.welcomeDetailed", { saludo: "¡Hola!" }));
console.log("Productos:", c.get("products").length);'

# No debe quedar nada del negocio del que se copió:
grep -rIni "ventimax\|fortunne\|ventilador" config/brand/<marca>
```

Después, la verificación completa de `AGENTS.md` (build y suites).

### 1.7 Política de privacidad

Se genera sola desde la marca en `https://<servicio>.onrender.com/privacidad` (sirve para WhatsApp,
Instagram y Messenger). Solo hay que completar en `settings.json`:

```json
"legal": { "razonSocial": "Inversiones Ejemplo, C.A.", "rif": "J-12345678-9",
           "direccion": "Caracas, Venezuela", "fechaActualizacion": "1 de noviembre de 2026" }
```

y los datos de `contact` y `whatsappPhone`. En Meta se registran:
- URL de la política de privacidad: `https://<servicio>.onrender.com/privacidad`
- URL de instrucciones de eliminación de datos: `https://<servicio>.onrender.com/privacidad#eliminacion-de-datos`

El texto describe lo que el sistema hace (mensajes borrados a los 90 días, IA de DeepSeek, Cloudinary).
Si un cliente usa otros proveedores, hay que ajustar `services/paginaPrivacidad.ts`.

---

## 2. MongoDB Atlas (dueño)

1. Crear un proyecto y un cluster nuevos para el cliente. **Nunca compartir la base entre clientes**.
2. Crear un usuario de base de datos con contraseña generada y permiso de lectura y escritura sobre su base.
3. En *Network Access*, permitir las conexiones desde Render.
4. Copiar la cadena de conexión (`mongodb+srv://...`) con el nombre de la base al final: será `MONGODB_URI`.

En el primer arranque el servidor crea las categorías y los productos de `products.json`.

### 2.1 Primer usuario administrador

Se crea solo en el primer arranque si en Render están `ADMIN_USER` y `ADMIN_PASS` (mínimo 12 caracteres) y
la base no tiene ningún usuario. Nunca modifica ni reemplaza usuarios existentes. Lo que puede salir en los
logs:

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| `✅ [Arranque] Administrador inicial '<usuario>' creado.` | Listo | Entrar al panel con ese usuario y crear las cuentas del equipo |
| `⚠️ [Arranque] No hay usuarios y faltan ADMIN_USER/ADMIN_PASS` | La base está vacía y nadie puede entrar | Añadir las dos variables en Render y volver a desplegar |
| `⚠️ [Arranque] ADMIN_PASS debe tener al menos 12 caracteres` | Clave demasiado corta; no se creó nada | Cambiar `ADMIN_PASS` y volver a desplegar |
| (ninguno) | Ya había usuarios | Nada: las variables no hacen efecto |

Una vez dentro, se pueden borrar `ADMIN_USER` y `ADMIN_PASS` de Render. **No usar**
`scripts/seed-users.js`: borra todos los usuarios y crea contraseñas conocidas.

Las sesiones del panel duran 30 días. Si se desactiva un usuario o se le cambia el rol, pierde el acceso en
menos de un minuto, sin esperar a que caduque su sesión.

---

## 3. Meta (dueño)

Una app de Meta por cliente, dentro del Business Manager del cliente.

### 3.1 WhatsApp

1. Añadir el producto **WhatsApp** a la app y registrar el número del negocio (no puede estar activo en la
   app de WhatsApp del teléfono).
2. Crear un **Usuario del sistema** en el Business Manager y generar un token **permanente** con los
   permisos `whatsapp_business_messaging` y `whatsapp_business_management`. El token del panel de
   desarrolladores caduca en horas.
3. Anotar:

   | Dato | Variable |
   |---|---|
   | Token permanente | `WHATSAPP_TOKEN` |
   | Phone number ID | `WHATSAPP_PHONE_NUMBER_ID` |
   | WhatsApp Business Account ID | `WHATSAPP_BUSINESS_ACCOUNT_ID` |
   | App secret (Configuración → Básica) | `WHATSAPP_APP_SECRET` |
   | Una frase inventada para verificar el webhook | `VERIFY_TOKEN` |
   | ID de la app | `META_APP_ID` |

4. Webhook: URL `https://<servicio>.onrender.com/webhook`, token = `VERIFY_TOKEN`, suscribir el campo
   `messages`. Hacerlo **después** de desplegar en Render (sección 4), porque Meta llama a la URL para
   verificarla.
5. Plantillas (para escribir al administrador fuera de la ventana de 24 h):
   - `order_notification`, en categoría *Utilidad*, con **un** parámetro de texto en el cuerpo (la
     comanda). El código la usa con ese nombre.
   - Plantilla de reactivación de carritos: su nombre va en `WHATSAPP_TEMPLATE_REACTIVACION`
     (por defecto `reactivacion_checkout`).
6. Pasar la app a modo **Live** cuando la política de privacidad esté publicada.

### 3.2 Instagram (opcional)

Cuenta profesional de Instagram vinculada a la página de Facebook. Webhook
`https://<servicio>.onrender.com/webhook/instagram`. Variables: `IG_ACCOUNT_ID`, `IG_ACCESS_TOKEN`,
`IG_VERIFY_TOKEN`, `IG_APP_SECRET`.

### 3.3 Messenger (opcional)

1. Añadir el producto **Messenger** y generar un token de página de larga duración (Usuario del sistema).
2. Webhook `https://<servicio>.onrender.com/webhook/messenger`, campos `messages` y `messaging_postbacks`.
3. **Suscribir la página a la app** (`/{PAGE_ID}/subscribed_apps`): es un paso aparte del webhook y el
   fallo más común.
4. App Review para `pages_messaging` (tarda días; sin aprobación solo responden cuentas con rol en la app).
5. Variables: `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `FB_VERIFY_TOKEN`, `FB_APP_SECRET`.

### 3.4 Anuncios (opcional)

Para medir ventas de anuncios Click-to-WhatsApp: `META_PIXEL_ID`, `META_CAPI_TOKEN`, `META_DATASET_ID`.

---

## 4. Render (dueño)

1. Crear el servicio con el **Blueprint** del repositorio: Render → *New* → *Blueprint* → elegir el repo.
   `render.yaml` ya trae build (`npm ci && npm run build`), start (`npm start`), Node 22, chequeo de salud
   en `/health`, `NODE_ENV=production`, un `JWT_SECRET` generado por Render, y pide una por una las variables
   secretas. Para otro cliente, antes cambiar en `render.yaml` el `name` del servicio y el valor de `BRAND_NAME`.
   - Plan: `starter`. El plan gratuito se duerme tras 15 minutos sin tráfico y el bot respondería tarde.
   - Si se prefiere crearlo a mano: Web Service, build `npm ci && npm run build`, start `npm start`,
     health check `/health`.
2. Variables de entorno (la lista completa y comentada está en `.env.example`):

   | Grupo | Variables |
   |---|---|
   | Marca | `BRAND_NAME=<marca>` |
   | Base de datos | `MONGODB_URI` |
   | Entorno | `NODE_ENV=production` (obligatorio: activa las cookies seguras y la comprobación de `JWT_SECRET`) |
   | Seguridad | `JWT_SECRET`: mínimo 32 caracteres aleatorios, distinto por cliente (`openssl rand -hex 32`); sin él el servidor no arranca |
   | Primer administrador | `ADMIN_USER` y `ADMIN_PASS` (mínimo 12 caracteres), ver sección 2.1 |
   | Imágenes | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (una cuenta por cliente) |
   | WhatsApp | Las de la sección 3.1 |
   | Alertas | `ADMIN_PHONE_NUMBER`, `ADMIN_PHONE_NUMBER_2`, `DELIVERY_PHONE_NUMBER` (formato internacional sin `+`: `58412...`) |
   | IA | `DEEPSEEK_API_KEY` (asistente y copiloto); `GEMINI_API_KEY`, `GLADIA_API_KEY`, `DEEPGRAM_API_KEY` si se usan |
   | Notificaciones push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (generar con `npx web-push generate-vapid-keys`), `VAPID_EMAIL=mailto:<correo>` |
   | Instagram, Messenger, anuncios | Las de las secciones 3.2 a 3.4 |
   | No tocar | `FORCE_CLEAN_SEED` vacío o `false` (si vale `true`, **borra el catálogo** en cada arranque) |

3. Desplegar y revisar en los logs:
   - `[ConfigManager] Configuración cargada para: <marca>`
   - `✅ Validación de esquema exitosa.`
   - `🌱 [SEED] Sembrando catálogo inicial...` (solo la primera vez)
   - El mensaje del administrador inicial (sección 2.1).
4. Comprobar que `https://<servicio>.onrender.com/health` responde `{"status":"ok"}`.
5. Volver a Meta y configurar los webhooks (sección 3).

### 4.1 Si el servidor no arranca

| Síntoma en los logs | Causa | Solución |
|---|---|---|
| `❌ [Seguridad] ... El servidor no arranca` | Falta `JWT_SECRET` o tiene menos de 32 caracteres | Generarlo con `openssl rand -hex 32` y guardarlo en Render |
| Error de `ConfigManager` o de validación de esquema | `BRAND_NAME` no coincide con una carpeta de `config/brand/`, o falta una clave obligatoria (`brandName`, colores) | Revisar `BRAND_NAME` y el `settings.json` de la marca |
| Error de conexión a MongoDB | `MONGODB_URI` mal escrita o Render no está permitido en *Network Access* de Atlas | Revisar la cadena y la lista de acceso |
| Meta no verifica el webhook (403) | `VERIFY_TOKEN` vacío o distinto del que se escribió en Meta | Poner la misma frase en los dos lados. Sin token configurado, el servidor rechaza la verificación a propósito |
| Los mensajes llegan pero el bot no responde, con "Firma inválida" en los logs | `WHATSAPP_APP_SECRET` (o el de IG/FB) no corresponde a la app | Copiar el *App secret* correcto de Meta |

Los teléfonos de alerta y el tiempo de espera de mensajes (`WEBHOOK_DEBOUNCE_MS`) también se pueden cambiar
después desde el panel → Configuración → Canales y variables.

---

## 5. Configurar el panel

Entrar en `https://<servicio>.onrender.com/panel`.

1. **Usuarios:** cambiar contraseñas y crear las cuentas del equipo (admin, cajero, repartidor).
2. **Inventario → Categorías y productos:** revisar precios, descripciones, categorías adicionales
   ("También aparece en") y stock si se controla. Subir hasta 5 fotos por producto ⏳ (F0-9); la
   principal es la que el bot envía al cliente.
3. **Inventario → Pagos:** crear cada método de pago con sus datos reales y activarlo. Sin métodos activos
   el bot no puede cerrar ventas.
4. **Inventario → Envíos** ⏳ (F0-5, F0-12): crear un método por cada forma de entrega y activarlo.
   - Tipos: delivery local, envío nacional, retiro u otro. Costo **fijo** (se suma al total que paga el
     cliente) o **a convenir** (el resumen dice "a convenir con el asesor" y el asesor fija el precio).
   - "Datos que pide el bot": lo que el bot pregunta después, p. ej. "estado, ciudad y agencia de envío".
   - **Retiro:** dirección y horario del punto (si el horario queda vacío, se usa el de atención). El costo
     es siempre 0 y el bot no pide dirección. Si el cliente escribe "voy en persona" al elegir el envío o
     al pagar, el bot cambia el pedido a retiro.
   - Con un solo método activo, el bot lo elige solo; con varios, muestra una lista; sin ninguno, salta el
     paso.
   - El asesor puede cambiar el envío o poner el costo acordado de un pedido ya creado desde el Kanban.
5. **Configuración → Operación → Horario de atención:** días y horas en que el negocio despacha. Los días
   desmarcados son "no laborables" para el bot, y el texto del horario que ve el cliente se actualiza al
   guardar, sin reiniciar. El valor inicial sale de `horarioAtencion` en `settings.json`.
   - Solo los **días** cambian el flujo del bot. La hora de apertura y cierre se muestra en los mensajes,
     pero en un día laborable el bot atiende igual fuera de hora.
6. **Configuración → Operación → Días no laborables:** qué hace el bot cuando un cliente escribe en un día
   desmarcado. Cambia al guardar, sin reiniciar.
   - **Interruptor general apagado:** el bot atiende normal, como un día laborable.
   - **Entrega en día hábil:** el bot avisa que hoy no se despacha y ofrece pedir para el próximo día
     laborable (lo calcula del horario: "Pedir Lunes", o "Pedir Sábado" si el sábado es laborable). El
     texto de la opción es editable (máx. 60 caracteres). **No escribir promesas que el cliente no haya dado**
     (p. ej. "delivery gratis").
   - **Retiro en punto aliado:** nombre (obligatorio), dirección (obligatoria) y horario del lugar donde el
     cliente puede retirar ese día.
   - Si el interruptor está encendido, hace falta al menos una de las dos opciones: el panel no deja
     guardar sin ninguna.
   - Este punto aliado es independiente del método de envío "Retiro" del punto 4. Si el cliente usa el mismo
     lugar para los dos casos, cargar la misma dirección en ambos.
7. **Configuración → Notificaciones:** días y horas de las alertas al administrador.
8. **FAQ y respuestas rápidas:** borrar las que no apliquen al negocio y cargar las suyas. El token `{menu}`
   muestra el catálogo vigente con precios y stock.

---

## 6. Prueba final antes de entregar

Desde un teléfono que **no** sea del negocio:

- [ ] Escribir "hola": la bienvenida dice el nombre del negocio y del bot correctos.
- [ ] Recorrer el catálogo: aparecen las categorías y los productos con sus precios.
- [ ] Un producto en dos categorías aparece en ambas y suma en una sola línea del carrito.
- [ ] Completar un pedido hasta enviar un comprobante de prueba.
- [ ] El pedido aparece en el Inbox y en el Kanban; la comanda llega a los teléfonos de alerta.
- [ ] Confirmar el pago, despachar y entregar desde el panel: el cliente recibe cada aviso.
- [ ] Preguntar algo libre al bot: responde según el rubro del cliente, sin mencionar otros negocios.
- [ ] Con un método de envío de costo fijo: el resumen y el monto a pagar (en $ y en Bs) incluyen el envío.
- [ ] Escribir "voy en persona" al elegir el envío: el pedido pasa a retiro y muestra la dirección ⏳ (F0-12).
- [ ] Día no laborable: desmarcar hoy en el horario, escribir "hola" y comprobar que el bot ofrece la
      opción configurada. Volver a marcar el día al terminar.
- [ ] Instagram y Messenger, si se activaron: un mensaje desde una cuenta ajena llega al Inbox.
- [ ] Borrar el pedido de prueba desde el Kanban.

## 7. Lista final antes de abrir el bot a clientes reales

- [ ] CI en verde en GitHub (pestaña *Actions*) para el commit desplegado.
- [ ] Render: `NODE_ENV=production`, `BRAND_NAME` correcto, `JWT_SECRET` de 32+ caracteres,
      `FORCE_CLEAN_SEED` vacío. `/health` responde `{"status":"ok"}`.
- [ ] Las cuentas del equipo creadas con contraseñas propias; `ADMIN_USER`/`ADMIN_PASS` borrados de Render.
- [ ] Métodos de pago con datos reales y activos; ninguno con `PENDIENTE_DUEÑO`.
- [ ] Métodos de envío y punto de retiro cargados y activos.
- [ ] Horario de atención y días no laborables revisados.
- [ ] Ningún texto del negocio anterior: probar bienvenida, catálogo, resumen de pedido y una pregunta libre.
- [ ] `settings.legal` completo y `/privacidad` muestra razón social, RIF y contacto correctos.
- [ ] Meta: webhooks verificados, plantilla `order_notification` aprobada, app en modo *Live*.
- [ ] Teléfonos de alerta probados: la comanda de prueba llegó.
- [ ] Prueba final (sección 6) completa y pedido de prueba borrado.

---

## Pendientes que afectan a esta guía

| Tema | Tarea |
|---|---|
| Métodos de envío (sección 5.4): confirmar nombres de campos y pantallas al aprobar | F0-5 |
| Retiro en persona y cambio de envío desde el Kanban (sección 5.4) | F0-12 |
| Imágenes de producto (requieren cuenta de Cloudinary por cliente) | F0-9 |
| Cabeceras de seguridad (CSP): puede pedir revisar el panel tras desplegar | F0-11 |
