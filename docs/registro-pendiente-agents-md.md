# Traspaso — cierre de la migración al Inbox Unificado (V3)

**Fecha:** 2026-09-13 · **Autor:** Hermes Agent (TPM/orquestador) · **Dueño:** Marcel
**Repo:** `reply-bot-pachi` · **Último commit del dueño:** `538f32e`

---

## 1. Registro en AGENTS.md — ✅ COMPLETADO, no hacer nada

Los lotes **B7c** y **B8** no pudieron registrarse durante la sesión (el guard de
archivos de instrucciones exige aprobación del dueño y caducaba por su ausencia).
**Ya se registraron el 2026-09-13** cuando el dueño volvió y aprobó la escritura.

Las filas están al final de `## Historial de Tareas Completadas [v2.0]:` en `AGENTS.md`:

| Fila | Hora | Lote |
|---|---|---|
| `\| 2026-09-13 \| 17:17 \|` | 17:17 | B7a — Copiloto de Venta Manual |
| `\| 2026-09-13 \| 17:42 \|` | 17:42 | B7b — Paridad completa de Instagram |
| `\| 2026-09-13 \| 18:05 \|` | 18:05 | B7c — Sockets y entorno |
| `\| 2026-09-13 \| 18:32 \|` | 18:32 | B8 — Nav unificado |

> ⚠️ **NO volver a pegar esas filas**: produciría entradas duplicadas en el historial.

Por eso este documento **ya no contiene filas para copiar**; queda como el informe de
traspaso de la migración (secciones 2 a 5).

---

## 2. Estado de la migración — COMPLETA

| Lote | Contenido | Estado |
|---|---|---|
| B1 | Layout V3 (raíl de canales + 3 columnas) | ✅ commiteado `881f7bc` |
| B2 | Respuestas Rápidas | ✅ commiteado `e7e2560` |
| B3 | Citar / Responder / Reintentar | ✅ commiteado `484bc32` |
| B4 | Pedido, pago, despacho + ficha de cliente | ✅ commiteado `6736e7e` |
| B5 | Multimedia del hilo | ✅ commiteado `538f32e` |
| B6 | Ajustes de canal (perfil WA + bot IG) | ✅ commiteado `538f32e` |
| B7a | Copiloto de Venta Manual + sidebar/cabecera WA | ⬜ **en working tree** |
| B7b | Paridad completa de Instagram | ⬜ **en working tree** |
| B7c | Sockets y entorno (14 filas) | ⬜ **en working tree** |
| B8 | Retirada de los NavButton legacy | ⬜ **en working tree** |

**Matriz de paridad final: 211 Sí / 0 Parcial / 0 No / 1 N/A** (la única N/A es `IG-15`,
retirada por decisión de producto). **0 brechas de paridad.**

### Trabajo pendiente a commitear: 17 modificados + 2 sin trackear

⚠️ **Usar `git add -A`.** Con `git add` selectivo se cuelan archivos nuevos y uno ausente =
import roto = **pantalla blanca en producción** (ya pasó dos veces). Sin trackear:

- `public/src/features/inbox/components/InboxManualOrderModal.js`
- `docs/registro-pendiente-agents-md.md` (este archivo)

```
git add -A
git commit -m "feat(inbox): copiloto de venta manual, paridad Instagram, sockets/entorno y nav unificado (B7a-B8)"
git push
```

---

## 3. Lo que FALTA de verdad (no se resolvió y no depende del inbox)

1. **Credenciales de Facebook Messenger** — el canal está implementado y probado en código
   pero **no funciona en producción**: falta añadir el producto Messenger a la app de Meta,
   generar `FB_PAGE_ACCESS_TOKEN` (de larga duración, vía Usuario del Sistema), `FB_PAGE_ID`,
   `FB_VERIFY_TOKEN`, suscribir la Página al app y pedir App Review + verificación de negocio.
2. **3 sockets sin emisor en el backend**: `cliente_presencia`, `cliente_typing` y
   `whatsapp_message`. El inbox los escucha de forma defensiva, pero **el «escribiendo…» y la
   presencia online nunca se encenderán** hasta que el backend los emita. Verificado con
   `grep` sobre `services/`, `controllers/`, `routes/`: 0 emisores. Nota: la API de WhatsApp
   Business no expone indicadores de escritura, así que puede que no sea implementable tal cual.
3. **Copy del bot en Facebook**: `instagramFlowService.ts:883, 919, 1008` dicen
   *«Soy tu asistente virtual en Instagram»* también en Messenger. Es texto visible para el
   cliente final y el dueño nunca confirmó el cambio.
4. **Tooltip «Envío directo a WhatsApp»** en el bottom sheet de respuestas rápidas aparece
   también en Instagram (cosmético; el texto visible dice solo «Envío directo»).
5. **`public/src/context/BrandProvider.js`** es código huérfano **con JSX crudo**. No lo importa
   nadie (el `BrandProvider` real está dentro de `BrandContext.jsx`), así que no rompe nada hoy,
   pero si alguien lo importa **cae el panel entero**.
6. **Verificación visual en navegador real**: ninguna UI se ha visto renderizada (arrancar el
   servidor está prohibido porque el `.env` apunta al cluster Atlas de **producción**).
   Todo lo validado es por harness de render en Node + resolución de imports.

---

## 4. Metodología de verificación (aplicar en cualquier lote futuro)

1. **`esbuild --bundle` para resolver imports — NUNCA un parse suelto.**
   `npx --yes esbuild@0.23.0 <archivo> --bundle --external:https://* --outfile=/dev/null`
   Sin `--bundle`, una ruta relativa mal escrita (`../` donde va `../../`) pasa como válida y
   deja **toda la app en blanco** en el navegador. Ocurrió una vez, en producción.
2. **Parseo como JS puro** (sin `--loader=jsx`) del bloque `<script type="module">` de
   `public/index.html` y de cada `.js`: la SPA **no usa Babel**; un archivo con JSX crudo
   revienta en el navegador aunque esbuild lo acepte.
3. **`npx tsc --noEmit`** → exit 0.
4. **Las 4 suites**: `NODE_ENV=test npx tsx scripts/test-inbox-service.js` (hoy **364**),
   `simulate-messenger-webhook.js` (54), `simulate-ig-webhook.js` (37),
   `test-instagram-quick-replies.js` (32). Ninguna debe bajar.
5. **ESLint `no-undef`**: `npx --yes eslint@8 --no-eslintrc --env browser,es2022 --parser-options=ecmaVersion:2022,sourceType:module --rule '{"no-undef":"error"}' <archivos>`
   Detecta `ReferenceError` en runtime (una prop mal nombrada dejó el panel en blanco una vez).
   Verificar el detector con un **canario** (un identificador inventado debe fallar).
6. **`git diff --stat public/src/features/whatsapp/ public/src/features/instagram/` → VACÍO**
   (demuestra que las consolas legacy siguen intactas).
7. **Harness de render en Node** con los componentes reales **y controles negativos** (que la
   aserción falle si se rompe la paridad).
8. **Cache-busting**: subir el `?v=N` de cada archivo modificado que se importe con versión.

---

## 5. Reglas vigentes del repo

- **El dueño hace TODOS los commits y push.** Los agentes nunca ejecutan
  `git commit/push/add/stash/reset/restore`; dejan todo en el working tree y lo reportan.
- **Nunca arrancar el servidor**: el `.env` apunta al cluster MongoDB Atlas de **producción**
  (escribiría datos reales y dispararía WhatsApps reales al admin vía `watchdogService`).
- `npm test` está roto (placeholder). Las pruebas reales son los scripts de `scripts/`.
- **Máximo detalle, cero invención**: si algo no se puede comprobar, se reporta como no
  comprobado en lugar de darlo por bueno.
