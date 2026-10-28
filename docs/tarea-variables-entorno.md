# Brief: Modal de variables de entorno (Opción D híbrida)

> **Para:** Antigravity (TPM / ejecutor). **Origen:** Claude (Cerebro del proyecto), 2026-10-23.
> **Regla previa:** crear el plan antes de ejecutar (ver `AGENTS.md`, pendientes de Antigravity). No editar archivos fuera del alcance de este brief.

## 1. Objetivo

Que personas autorizadas del panel puedan cambiar configuración operativa desde un modal, sin tocar código ni entrar a Render. Los secretos no se editan desde la web.

## 2. Decisión de arquitectura (ya tomada)

- **Almacenamiento:** usar el modelo existente `models/Setting.ts` (`key` único, `value` Mixed). No crear colección nueva.
- **Lectura:** un helper `services/configStore.ts` con `getConfig(clave)`:
  1. Caché en memoria, con invalidación al guardar.
  2. Si no hay valor en `Setting`, fallback a `process.env[clave]`.
  3. Nunca lanzar excepción por falta de valor: devolver `undefined` y dejar que el llamador decida.
- **Escritura:** `PUT /api/admin/config` (y `GET`), protegidos con `isAuthenticated` + `authorize([...])` con un permiso nuevo `config:manage` en `data/permissions.js`, asignado solo al rol admin.
- **Auditoría:** cada cambio registra usuario, clave, fecha y valor anterior/nuevo **sin valor en secretos** (usar `services/auditService.ts`).
- **Secretos:** nunca se guardan en `Setting` ni se devuelven por la API. Solo se muestra estado ("configurado" / "vacío") y se marcan como solo lectura en el modal.

## 3. Clasificación de variables

Fuente: `.env.example` más las claves que el código lee realmente (ver §4).

**A. Editables desde el modal (Setting, con fallback a env):**
`ADMIN_PHONE_NUMBER`, `ADMIN_PHONE_NUMBER_2`, `DELIVERY_PHONE_NUMBER`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_TEMPLATE_ORDER`, `WHATSAPP_TEMPLATE_REACTIVACION`, `IG_ACCOUNT_ID`, `FB_PAGE_ID`, `META_PIXEL_ID`, `META_DATASET_ID`, `META_CAPI_TEST_EVENT_CODE`, `VAPID_EMAIL`, `WEBHOOK_DEBOUNCE_MS`, `BRAND_NAME`.

**B. Solo lectura de estado en el modal (no editables, no se guardan):**
Secretos y tokens: `WHATSAPP_TOKEN`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GLADIA_API_KEY`, `DEEPGRAM_API_KEY`, `IG_ACCESS_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `META_CAPI_TOKEN`, `WHATSAPP_APP_SECRET`, `IG_APP_SECRET`, `FB_APP_SECRET`, `APP_SECRET`, `VAPID_PRIVATE_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_API_KEY`, `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_PASS`, `MONGODB_URI`.
Tokens de verificación de webhooks: `VERIFY_TOKEN`, `IG_VERIFY_TOKEN`, `FB_VERIFY_TOKEN` (cambiarlos rompe el webhook hasta actualizarlos también en Meta).

**C. Solo Render / arranque (no aparecen en el modal):**
`PORT`, `NODE_ENV`, `TZ`, `FORCE_CLEAN_SEED`, `META_APP_ID`, `APP_ID`, `CLOUDINARY_CLOUD_NAME`.

**D. Decidir antes de implementar:**
- `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`: cambiar la clave pública invalida las suscripciones push existentes. Propuesta: solo lectura (B).
- `WHATSAPP_PHONE` y `PHONE_NUMBER_ID`: se leen en el código pero no están en `.env.example`. Confirmar si son alias obsoletos y, si lo son, unificarlos.
- `ADMIN_USER`: no editable desde la web (riesgo de bloqueo del acceso). Propuesta: solo lectura.

## 4. Hallazgos del código que el plan debe resolver

- Hay **48 claves distintas** leídas con `process.env` en **31 archivos** de `services/`, `controllers/`, `routes/`, `middlewares/`, `index.ts` y `utils/`. Las que aparecen en el código y no en `.env.example`: `PHONE_NUMBER_ID`, `WHATSAPP_PHONE`, `WHATSAPP_TEMPLATE_REACTIVACION`, `WEBHOOK_DEBOUNCE_MS`, `META_CAPI_TEST_EVENT_CODE`, `META_DATASET_ID`, `META_APP_ID`, `FB_APP_SECRET`, `APP_SECRET`, `APP_ID`, `FORCE_CLEAN_SEED`, `BRAND_NAME`. Añadirlas a `.env.example` con comentario.
- `ADMIN_PHONE_NUMBER` tiene **13** lecturas y `IG_ACCOUNT_ID` **8**. El plan debe listar cada lectura (`archivo:línea`) y migrarlas al helper de forma gradual, empezando por los teléfonos y `WHATSAPP_TEMPLATE_ORDER`.
- `process.env.NODE_ENV` aparece 62 veces: no migrar. Son checks de test.
- Hay un fallback de `JWT_SECRET` en `index.ts:134` y `index.ts:185`. No tocar en esta tarea; ya está registrado en `GEMINI.md` §5, y va en tarea aparte.
- **Caché:** el helper debe invalidarse al guardar. En Render hay un solo proceso, así que basta caché en memoria; si en el futuro hay más de una instancia, documentar que el cambio tarda hasta el TTL de la caché.
- **Watchdog y Agenda** leen variables al arrancar en algunos casos. Verificar cada uno y documentar si el cambio requiere reinicio.

## 5. Frontend

- Modal de ajustes con pestañas (WhatsApp y Meta · Instagram · Messenger · Alertas · Avanzado) siguiendo el patrón de `public/src/features/`.
- Campos de secretos: `type="password"`, botón de ojo, y valor mostrado solo como "configurado" en la lectura inicial (nunca el valor).
- Botón "Probar conexión" para WhatsApp (`GET` al Phone Number ID con el token, desde backend) antes de guardar. El token nunca sale del servidor.
- Trim automático de espacios en todos los campos al guardar.
- Sin `localStorage` para datos de configuración. Consumir `GET /api/admin/config` con cookie HttpOnly.
- Verificar imports con `esbuild --bundle` (comando en `.agents/frontend.md`).
- No editar `features/whatsapp/**` ni `features/instagram/**`.

## 6. Criterios de aceptación

1. Un admin cambia `ADMIN_PHONE_NUMBER` en el modal y la siguiente notificación de comanda va al número nuevo, sin reiniciar.
2. Un usuario sin `config:manage` recibe 403 en `GET` y `PUT`.
3. Ningún secreto aparece en la respuesta de `GET`, en logs ni en el registro de auditoría.
4. Si la clave no existe en `Setting`, el valor de `process.env` sigue funcionando (retrocompatible).
5. Tests: `tsc` sin errores; suites de `scripts/` existentes siguen pasando; suite nueva `scripts/test-config-store.ts` con `NODE_ENV=test` que cubra: fallback a env, prioridad de `Setting`, invalidación de caché y rechazo de secretos en `PUT`.
6. `esbuild --bundle` sobre cada archivo de frontend nuevo o modificado.
7. No arrancar el servidor local (el `.env` apunta a producción).

## 7. Reglas

- **No hacer commit, add, stash, reset ni restore.** Dejar cambios en el working tree y reportar la lista de archivos.
- Mantener el estilo de cada archivo que se toque (conviven `import` y `require` en `.ts`).
- Registrar la tarea en `AGENTS.md` con la firma `— Ejecutado por **Antigravity**`.
- Si algo del plan contradice este brief, detenerse y reportarlo antes de seguir.

## 8. Entregable esperado

1. Plan detallado (archivos, orden, riesgos) para aprobación del dueño.
2. Tras aprobación: cambios en working tree, output literal de las verificaciones y la fila de historial en `AGENTS.md`.
