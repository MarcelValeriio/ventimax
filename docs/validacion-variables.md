# Validación de variables editables (panel de Canales y variables)

Fuente de reglas: `services/configValidators.ts`. Pruebas: `scripts/test-config-validators.ts`.
Longitudes observadas en el `.env` de producción (solo longitud y tipo de carácter; no se registran valores).

## Reglas por variable

| Variable | Longitud observada | Regla aplicada | Se normaliza | Lo lee el código con `getConfig` |
|---|---|---|---|---|
| `ADMIN_PHONE_NUMBER` | 12 dígitos | 8–15 dígitos | Sí, solo dígitos | Sí |
| `ADMIN_PHONE_NUMBER_2` | 12 dígitos | 8–15 dígitos | Sí, solo dígitos | Sí |
| `DELIVERY_PHONE_NUMBER` | 12 dígitos | 8–15 dígitos | Sí, solo dígitos | Sí |
| `WHATSAPP_PHONE_NUMBER_ID` | 16 dígitos | 10–20 dígitos | No | Parcial (ver brecha 1) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | 16 dígitos | 10–20 dígitos | No | No (brecha 1) |
| `IG_ACCOUNT_ID` | 17 dígitos | 10–20 dígitos | No | Sí |
| `FB_PAGE_ID` | 16 dígitos | 10–20 dígitos | No | No (brecha 1) |
| `META_PIXEL_ID` | 16 dígitos | 10–20 dígitos | No | No (brecha 1) |
| `META_DATASET_ID` | no definida en `.env` | 10–20 dígitos | No | No (brecha 1) |
| `WHATSAPP_TEMPLATE_ORDER` | 18 caracteres | `[a-z0-9_]`, máx. 512 | No | Sí |
| `WHATSAPP_TEMPLATE_REACTIVACION` | no definida en `.env` | `[a-z0-9_]`, máx. 512 | No | No (brecha 1) |
| `VAPID_EMAIL` | 30 caracteres | Correo, opcional `mailto:`, máx. 254 | No | No (brecha 1) |
| `WEBHOOK_DEBOUNCE_MS` | no definida en `.env` | Entero 0–10000 | No | Sí |
| `META_CAPI_TEST_EVENT_CODE` | no definida en `.env` | `[A-Za-z0-9_-]`, máx. 64 | No | No (brecha 1) |

Un valor vacío es válido y significa "sin override": se usa el valor de `process.env`.

## Brecha 1: variables editables que el código sigue leyendo de `process.env`

Editar estas claves en el panel guarda el valor en `Setting`, pero el código no lo usa, así que el cambio no tiene efecto hasta reiniciar con el valor de Render:

- `META_PIXEL_ID`, `META_DATASET_ID`, `META_CAPI_TEST_EVENT_CODE`, `WHATSAPP_BUSINESS_ACCOUNT_ID`: `services/metaCapiService.ts:42`, `:121`, `:133-134`.
- `WHATSAPP_TEMPLATE_REACTIVACION`: `services/reactivationService.ts:40`.
- `VAPID_EMAIL`: `services/pushService.ts:29`.
- `FB_PAGE_ID`: `services/messenger.ts:33` y `controllers/messengerWebhookController.ts:81`.
- `WHATSAPP_PHONE_NUMBER_ID`: `services/watchdogService.ts:349`.

Corregirlo es cambiar cada lectura a `getConfig(...)` dentro de la función que la usa. No se hizo en esta revisión, porque es un cambio de comportamiento distinto a la validación.

## Limitaciones

- La validación revisa formato, no existencia. Un ID con formato correcto puede no pertenecer a la cuenta; solo la prueba contra Meta lo confirma, y hoy esa prueba existe solo para WhatsApp.
- `META_CAPI_TEST_EVENT_CODE` no tiene valor de ejemplo en el `.env`. La regla es amplia (letras, números, `_` y `-`) porque no verifiqué el formato exacto que emite Meta.

## Qué es editable hoy (decisión de auditoría)

Solo se pueden editar las claves que cambian sin romper el envío de mensajes y que el código lee con `getConfig`:

- `ADMIN_PHONE_NUMBER`, `ADMIN_PHONE_NUMBER_2`, `DELIVERY_PHONE_NUMBER`: a dónde llegan alertas y asignaciones.
- `WEBHOOK_DEBOUNCE_MS`: ventana de agrupación de mensajes.

Todo lo demás está en `READONLY_KEYS` (`services/configStore.ts`): se muestra con su valor efectivo, pero el panel no lo acepta. Un ID de Meta o una plantilla mal escrita rompe integraciones, y varias claves aún leen `process.env` directo (brecha 1). Para abrir una clave más, primero debe cumplir dos condiciones: que el código use `getConfig`, y que un valor incorrecto no deje de enviar mensajes.

El servidor rechaza cualquier intento de editar una clave de solo lectura (`PUT /api/admin/config`), así que el control no depende solo de la interfaz.
