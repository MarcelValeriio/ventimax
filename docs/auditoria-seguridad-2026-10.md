# Auditoría de seguridad antes de producción (octubre 2026)

> Para el dueño y para quien implemente las correcciones. Hecha por Claude el 2026-10-27 sobre el working
> tree de VentiMax (solo lectura de código, pruebas contra el entorno local de Docker).
> Las correcciones se asignan en `AGENTS.md`: F0-8 (Claude) y F0-11 (Antigravity).

**Estado (2026-10-27):** S-01 a S-08 y S-12 corregidos en F0-8. S-09 a S-11 pendientes en F0-11.

## Resumen

| # | Hallazgo | Gravedad | Dónde | Se corrige en |
|---|---|---|---|---|
| S-01 | XSS almacenado en el PDF de la comanda: nombre, dirección, notas y productos del cliente se insertan sin escapar con `innerHTML` | **Alta** | `public/src/features/dashboard/KanbanBoard.js:300-420` | F0-8 |
| S-02 | La sesión del panel dura ~10 años y no se revisa contra la base: un usuario desactivado o con el rol cambiado conserva el acceso | **Alta** | `index.ts:188-206`, `middlewares/auth.ts` | F0-8 |
| S-03 | 16 dependencias con vulnerabilidades conocidas (1 crítica: `proxy-addr`, suplantación de IP; altas en `axios`, `multer`, `ws`, `socket.io-parser`, `zod`...). Todas tienen arreglo sin cambio de versión mayor | **Alta** | `package-lock.json` | F0-8 |
| S-04 | Verificación de webhook de WhatsApp e Instagram aceptada sin token si `VERIFY_TOKEN` falta, y `hub.challenge` devuelto como HTML (XSS reflejado en el dominio del panel) | Media | `controllers/webhookController.ts:40`, `instagramWebhookController.ts:12` | F0-8 |
| S-05 | Instagram y Messenger escriben en los logs el token de verificación esperado ante cada intento fallido | Media | `instagramWebhookController.ts:24`, `messengerWebhookController.ts:47` | F0-8 |
| S-06 | La firma HMAC de Meta se salta si `NODE_ENV=development` (un error de configuración en Render la desactiva). `APP_SECRET` se acepta como configurado pero nunca se usa para comprobar | Media | `middlewares/hmacValidator.ts:22, 33` | F0-8 |
| S-07 | `/health` es público y sin límite: expone errores de MongoDB y de la API de WhatsApp, disco del servidor y la hora del último mensaje de un cliente; cada visita llama a Meta con el token y ejecuta `df` | Media | `index.ts:77`, `watchdogService.getHealthStatus` | F0-8 |
| S-08 | `JWT_SECRET` con valor por defecto en el código; primer administrador solo con un script de contraseñas conocidas | Media | `index.ts:144, 195`; `scripts/seed-users.js` | F0-8 (ya especificado) |
| S-09 | Content-Security-Policy desactivada: cualquier XSS futuro tiene todo el poder del panel | Media | `index.ts:30` | F0-11 |
| S-10 | 29 respuestas de error devuelven `error.message` interno al navegador | Baja | `controllers/*`, `index.ts` | F0-11 |
| S-11 | `/index.html` se sirve estático sin sesión (solo el cascarón del panel; los datos siguen protegidos) | Baja | `express.static(PUBLIC_DIR)` | F0-11 |
| S-12 | `controllers/botController.ts`: código muerto con un login alternativo y contraseña por defecto "pachi123" (no está montado, pero no debe quedar) | Baja | `controllers/botController.ts:116` | F0-8 |

## Lo que está bien

- Las 92 rutas de `/api/admin` exigen sesión; 87 además exigen un permiso concreto. Las 5 restantes son personales (`/me`, notificaciones push).
- Socket.IO autenticado con la cookie JWT y permiso `chat:manage` por evento sensible.
- Firma HMAC de Meta con comparación de tiempo constante y rechazo si falta el secreto.
- Cookie de sesión `HttpOnly` y `SameSite=Lax`; sin CORS abierto; `trust proxy` configurado para Render.
- Login con límite de 5 intentos por minuto y mismo mensaje para usuario o clave incorrectos.
- No hay consultas a MongoDB armadas directamente con `req.body`/`req.query`.
- Los enlaces a comprobantes y adjuntos vienen de Cloudinary o se validan con `http`.

---

## Requisitos de seguridad para el catálogo público (F2)

El catálogo web será la primera URL pensada para que entre **cualquiera**. Estas reglas son obligatorias en el
diseño de F2:

### Separación
1. **Otro origen.** El catálogo se sirve en un dominio o subdominio distinto del panel (p. ej.
   `tienda.ventimax.com` vs `panel.ventimax.com`). Un fallo en el catálogo no puede leer ni usar la cookie del panel.
2. **API pública aparte:** `/api/public/*`, en un router propio, **sin** `isAuthenticated` y sin acceso a ningún
   controlador del panel. CORS permitido solo para el origen del catálogo.
3. El panel y el login llevan `X-Robots-Tag: noindex` y no se enlazan desde el catálogo.

### Qué expone
4. **Lista blanca de campos.** El catálogo devuelve solo: id público, nombre, descripción, precio, imágenes,
   categorías, atributos y compatibilidad. Nunca stock exacto (solo "disponible"/"agotado"), costos, notas
   internas, `_id` de Mongo ni datos de pedidos o clientes.
5. Solo productos `activo: true`.

### Cómo se crea un pedido
6. **El servidor recalcula todo.** Precios y totales salen de la base, nunca del navegador. Cantidades con
   mínimo 1 y máximo razonable por línea; stock comprobado al crear.
7. **Datos personales mínimos en la web.** El catálogo solo arma el carrito. Nombre, cédula y dirección se piden
   en WhatsApp, dentro del flujo que ya existe. Así la URL pública no recibe ni guarda datos personales.
8. **Código de pedido no adivinable** (p. ej. `VM-7K3Q9`, aleatorio, no correlativo). No existe ninguna URL pública
   que muestre un pedido a partir de su código.
9. **Anti-abuso:** límite por IP (p. ej. 5 carritos cada 10 minutos), campo trampa (*honeypot*), validación
   estricta con Zod (tamaño máximo del cuerpo y de cada campo) y, si hay abuso, captcha (Cloudflare Turnstile).
10. Los carritos web que no se confirman por WhatsApp caducan solos (VentiMax: 3 días; configurable).

### Cabeceras y operación
11. CSP estricta en el catálogo (sin `unsafe-inline` ni `unsafe-eval`), HSTS, `X-Content-Type-Options`,
    `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`.
12. Respuestas de catálogo cacheables (CDN) para resistir picos y ataques de volumen.
13. Errores genéricos al navegador; el detalle solo en los logs.
14. Registro de intentos rechazados (límite, honeypot, validación) visible para el administrador.
15. Prueba de seguridad antes de publicar: inyección en cada campo, carrito con precio manipulado,
    enumeración de códigos y ráfagas contra la API.
