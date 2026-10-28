# Mejoras de VentiMax aplicables a Mr. Pachi

> Para el dueño (y para quien aplique los cambios en `reply-bot-pachi`).
> **Estado:** parte 1 (seguridad) escrita el 2026-10-27. Las partes 2 y 3 se completan al cerrar la Fase 0.
> VentiMax nació como copia de Mr. Pachi hasta el commit `77e1102`, así que los fallos de la auditoría
> (`docs/auditoria-seguridad-2026-10.md`) casi seguro están igual allá. **Pachi está en producción con clientes
> reales:** cada cambio necesita su propio plan, pruebas y un horario de poco tráfico para desplegar.

## Cómo llevar los cambios

No copiar archivos enteros de VentiMax: desde la copia ya divergieron (textos de marca, multicategoría, horario).
Aplicar **cada corrección como un parche pequeño** en Pachi, en el orden de la tabla, con sus pruebas, y
desplegar de una en una para saber qué causó cualquier problema.

---

## Parte 1 · Seguridad (urgente)

| Orden | Problema | Riesgo en Pachi | Qué llevar de VentiMax | Cuidado al aplicarlo en Pachi |
|---|---|---|---|---|
| 1 | **XSS en el PDF de la comanda** (S-01) | **Alto y explotable hoy:** cualquier cliente puede escribir código en las notas o la dirección de su pedido y se ejecuta con la sesión del admin al imprimir | Función `esc()` y su uso en cada dato del pedido (`public/src/features/dashboard/KanbanBoard.js`); `showToast` con `textContent` (`public/index.html`) | Ninguno: no cambia nada visible. Probar imprimir una comanda con notas como `<b>hola</b>` (debe verse el texto tal cual) |
| 2 | **Dependencias vulnerables** (S-03) | 1 crítica y 10 altas (suplantación de IP, DoS en subidas y sockets, `axios`) | `npm audit fix` (sin `--force`) | Hacerlo en una rama, correr las suites y probar en un entorno de prueba: suben `mongoose`, `axios`, `multer`, `zod`, `ws` dentro de su versión mayor |
| 3 | **Sesiones de ~10 años sin revisar la base** (S-02) | Un empleado despedido o desactivado conserva el acceso al panel | `verificarSesion()` en `middlewares/auth.ts` (caducidad obligatoria, usuario activo y rol desde la base, caché de 60 s), su uso en `index.ts` (login con `expiresIn: "30d"`, cookie de 30 días, `/login` y Socket.IO) | **Todas las sesiones actuales se cierran** al desplegar (tokens sin caducidad). Avisar al equipo que tendrá que volver a entrar. Si alguna suite firma tokens de usuarios que no existen en la base de prueba, añadirlos a la semilla (como `u-cajero` en `test-inbox-service.js`) |
| 4 | **`JWT_SECRET` con valor por defecto en el código** (S-08) | Si un día falta la variable en Render, cualquiera puede fabricar sesiones de admin | `services/bootstrapAdmin.ts` → `comprobarJwtSecret()`; quitar `\|\| "secreto_por_defecto_cambialo"` de `index.ts` | **Antes de desplegar**, confirmar en Render que Pachi tiene `JWT_SECRET` de 32+ caracteres y `NODE_ENV=production`; si no, el servidor no arrancará |
| 5 | **Verificación de webhook sin token y XSS reflejado** (S-04) y **token escrito en los logs** (S-05) | Medio | Cambios en `controllers/webhookController.ts`, `instagramWebhookController.ts`, `messengerWebhookController.ts` | Confirmar que `VERIFY_TOKEN` (y los de IG/FB si se usan) están en Render. Solo afecta cuando Meta vuelve a verificar el webhook |
| 6 | **Firma HMAC desactivada con `NODE_ENV=development`** (S-06) | Medio: con ese valor en Render, cualquiera puede mandar mensajes falsos al bot | `middlewares/hmacValidator.ts`: solo `NODE_ENV=test` omite la firma; `APP_SECRET` se comprueba | Revisar el `NODE_ENV` actual del servicio de Pachi en Render |
| 7 | **`/health` público con datos internos** (S-07) | Expone errores, disco y actividad del negocio; cada visita llama a Meta | `/health` reducido a `{ status }` en `index.ts` (el detalle sigue en `/api/admin/health` con sesión) | Si hay un monitor externo (UptimeRobot u otro) que lea el JSON detallado, ajustarlo: el código HTTP 200/503 sigue igual |
| 8 | **Primer administrador con contraseñas conocidas** (S-08) | Bajo en Pachi (ya tiene usuarios) | `crearAdminInicial()` | Solo útil si algún día se monta Pachi en una base nueva. **Nunca** volver a correr `scripts/seed-users.js` en producción: borra todos los usuarios |
| 9 | **Política de privacidad con afirmaciones falsas** | Legal y de Meta: dice que escribir CANCELAR borra los datos (solo reinicia el chat) y no declara la IA (DeepSeek) ni Cloudinary | `services/paginaPrivacidad.ts` + ruta `/privacidad` + clave `legal` en la marca | En Pachi la marca es `default`: añadir `legal` con la razón social de Pachi. Mantener las URL `/privacidad.html` y `/privacidad-instagram.html` (ya registradas en Meta) |
| 10 | **`controllers/botController.ts` muerto** con login alternativo y clave "pachi123" (S-12) | Bajo (no está montado) | Borrarlo | Confirmar con `grep` que nada lo importa |
| — | CSP desactivada, errores internos al navegador, `/index.html` público (S-09 a S-11) | Medio/bajo | Pendiente: se hará en VentiMax en F0-11 | Se añadirá aquí cuando esté probado |

**Prioridad sugerida:** 1 y 2 en cuanto se pueda (bajo riesgo de romper algo, alto beneficio); 3 y 4 juntos, avisando
al equipo; 5 a 7 en un mismo despliegue; 8 a 10 cuando convenga.

---

## Parte 2 · Mejoras de la plantilla que Pachi podría adoptar

> Escrita el 2026-10-28 con lo aprobado hasta ahora. Faltan F0-5 (envíos), F0-9 (imágenes) y F0-11 (CSP).

### 2.1 Decisión de fondo: ¿llevar parches o pasar Pachi a la plantilla?

Con la Fase 0, el código de VentiMax ya no tiene nada de una marca concreta: Mr. Pachi **es** la marca `default`
(`config/brand/default/` conserva sus textos tal cual, y las suites corren con ella). Hay dos caminos:

| Camino | Ventaja | Costo / riesgo |
|---|---|---|
| **A. Parches sueltos** (tabla 2.2) | Cambios pequeños y controlados en el repo de Pachi | Dos códigos que se siguen separando: cada mejora futura hay que hacerla dos veces |
| **B. Pachi corre sobre la plantilla** (un solo código, `BRAND_NAME=default` o una carpeta `config/brand/mrpachi/`) | Una sola base de código para todos los clientes: Pachi recibe gratis todo lo nuevo (F1, F2, seguridad) | Migración planificada: comparar con el repo actual de Pachi lo que tenga que no esté en VentiMax, probar con su base real en un entorno de prueba y desplegar en horario de poco tráfico |

**Recomendación:** aplicar ya la parte 1 (seguridad) como parches, y planificar el camino B después de cerrar F0.
Antes de decidir, hay que revisar si Pachi recibió cambios después del commit `77e1102` que VentiMax no tenga.

### 2.2 Mejoras aplicables

| Mejora | Qué le da a Pachi | Archivos en VentiMax | Nota |
|---|---|---|---|
| **Entorno local seguro** (Docker) | Probar el panel en una máquina sin tocar producción. Hoy el `.env` local de Pachi apunta a la base real, y arrancar el servidor dispara WhatsApp reales | `docker-compose.local.yml`, `scripts/dev-local.sh`, `scripts/crear-admin-local.ts`, `scripts/demo-local.ts` | Casi sin cambios. **La más útil para trabajar en Pachi sin miedo** |
| **CI en GitHub** + suites reparadas | Cada push corre build, 20 suites y los imports del panel | `.github/workflows/ci.yml`, `scripts/ci.sh`; suites corregidas: `test-e2e-saas.js` (sembraba nada y usaba IDs fijos), `test-cash-logic.js` (botón que ya no existe, teléfono compartido), `test-web-push-fullstack.js` (rutas `.js` de antes de TypeScript), `test-full-flow.js` (siempre salía con éxito), `test-mixed-payment.js` (no forzaba `NODE_ENV=test`) | Las 4 primeras correcciones aplican tal cual: en Pachi esas suites están igual de rotas |
| **Lista de scripts prohibidos** | Evitar que alguien corra un script que manda WhatsApp reales o escribe en producción (`test-comandas.ts`, `seed-users.js`, `db-reset-prod.js`…) | `AGENTS.md` → "Scripts prohibidos" | Solo documentación |
| **Horario de atención editable** (F0-3) | Cambiar días y horas desde el panel sin desplegar; el texto del bot se actualiza solo | `services/horarioService.ts`, `utils/helpers.ts` (`esDiaNoLaborable`), endpoints `/api/admin/config/horario`, bloque en `SettingsPanel.js` | Hoy Pachi tiene "Lunes a Viernes de 10:00 am a 5:00 pm" fijo en el código |
| **Días no laborables configurables** (F0-4) | Activar o apagar el flujo de fin de semana, "entrega el próximo día hábil" y el punto de retiro (hoy Kelly Bakery, fijo en el código) desde el panel | `services/flujoNoLaborableService.ts`, endpoints `/api/admin/config/flujo-no-laborable`, bloque en `SettingsPanel.js`, cambios en `chatFlowService.ts`/`chatFlowController.ts` | Si cambia el punto aliado o el horario del local, se edita en el panel |
| **Productos en varias categorías** (F0-7) | Un mismo producto en dos categorías del menú sin duplicarlo (p. ej. un combo en "Combos" y en "Promociones") | `services/catalogQuery.ts`, `models/Producto.ts` (`categorias`), panel de productos | Opcional: sin uso, no cambia nada |
| **Textos del bot en la configuración** (F0-2, F0-10) | Cambiar mensajes sin tocar código | `config/brand/<marca>/settings.json` → `messages` | Solo tiene sentido con el camino B |
| **Kanban sin métodos de pago inventados** (F0-13) | Hoy, si un pedido no tiene el método de pago poblado, la tarjeta del Kanban muestra uno **al azar** (Pago Móvil, Zelle, Efectivo o Transferencia). El equipo de Pachi puede estar viendo datos falsos | `public/src/features/dashboard/KanbanBoard.js` | Revisar en Pachi cuántos pedidos tienen `pago.metodo` como ID o vacío: esas tarjetas muestran un método inventado. Aplicar en cuanto esté aprobada en VentiMax |
| **Plantilla de Render** (`render.yaml`) | Recrear el servicio con la configuración correcta si hiciera falta | `render.yaml` | Pachi ya está desplegado: útil solo para un servicio de prueba |

## Parte 3 · Lo que es solo de VentiMax

_(Se completa al cerrar la Fase 0.)_
