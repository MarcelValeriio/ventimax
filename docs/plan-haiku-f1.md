# Plan de ejecución en serie · F1 (para el subagente Haiku 5.5)

> Escrito por Claude el 2026-11-02. Se ejecuta **un paso a la vez, en orden**. No se empieza el paso N+1 hasta que Claude marque el paso N como `Aprobada`. Nada en paralelo.

## Reglas que valen en todos los pasos

1. Leer `AGENTS.md` (reglas no negociables) y `docs/f1-producto-ampliado.md` (diseño) antes de empezar.
2. Git solo lectura. Sin `add`, `commit`, `push`, `stash`, `reset`, `restore`.
3. No leer ni imprimir el `.env`. Solo `NODE_ENV=test` y la base local de Docker. Nunca los scripts de la lista prohibida de `AGENTS.md`.
4. No instalar dependencias sin aprobación escrita del dueño en `AGENTS.md` (aplica a `exceljs` en el paso 2).
5. Sin textos de marca en el código. Nada de `innerHTML` con datos, ni `<script>` en línea, ni `on*=`. Íconos solo con `Icono` (Lucide).
6. No tocar `features/whatsapp/**` ni `features/instagram/**` salvo las líneas que el paso nombre.
7. Todo `tipoRecurso` nuevo que se audite se añade al enum de `models/Auditoria.ts`.
8. Todo endpoint nuevo: validador, `authorize(["config:manage"])` (o el permiso que indique el paso), auditoría y error `500` genérico.
9. Cada paso termina con: `npm run build` verde, `./scripts/ci.sh` verde (suite nueva incluida en `SUITES`), `esbuild --bundle` en cada archivo de `public/src` tocado, lista de archivos tocados y la salida pegada en el bloque de la tarea en `AGENTS.md`. El estado queda en `Lista para revisión`; **solo Claude pone `Aprobada`**.
10. Duda o desvío de alcance: escribirla en **Dudas para Claude** de `AGENTS.md` y parar.

---

## Paso 1 · Cerrar F1-2 (solo verificación en navegador)

No hay código nuevo. Falta lo que dejó la tarea en `Lista para revisión`.

1. `docker compose -f docker-compose.local.yml up -d`, luego `./scripts/dev-local.sh` y `npx tsx scripts/demo-local.ts`.
2. Abrir `http://localhost:3000/panel` en Chrome con la **consola abierta desde antes de cargar la página** (abrir DevTools primero, luego recargar). Un solo recorrido por ancho.
3. A **390 px** y a **1440 px**: Inventario → Nuevo producto → llenar General (nombre, precio, SKU, marca fabricante, OEM, un atributo) → Compatibilidad (una fila) → Equivalencias (grupo) → Guardar → reabrir en edición y comprobar que todo se cargó sin fila vacía extra → buscar por SKU, por OEM con guiones y por `marca modelo año`.
4. Revisar en 390 px: botones de 44 px, pestañas sin desborde horizontal, tabla de compatibilidad usable.
5. Entregar: lista de pantallas recorridas por ancho y el recuento de errores de consola (debe ser **0 errores de CSP**). Si algo falla, no arreglarlo a ojo: anotar el fallo exacto en la tarea y parar para que Claude decida.

**Cierre:** F1-2 sigue `Lista para revisión` con la evidencia pegada. Esperar a Claude.

---

## Paso 2 · F1-3 · Importación y exportación Excel/CSV con vista previa

Diseño: `docs/f1-producto-ampliado.md` §3. Depende del paso 1 aprobado.

**Antes de escribir código:** pedir al dueño (en **Dudas para Claude**) la aprobación para instalar `exceljs`. Sin aprobación, implementar solo CSV y parar antes de `.xlsx`.

1. **Servicio** `services/importacionProductos.ts` (funciones puras, sin BD en la parte de parseo):
   - Lee hojas `Productos` y `Compatibilidad` (xlsx) o dos CSV, con las columnas de la plantilla del §3.1.
   - Une por SKU. Reutiliza `validarProductoAmpliado` y `normalizarCodigoOEM` de `services/productoAmpliado.ts`.
   - `Categorías` y `Códigos OEM` se separan con `;`.
   - Devuelve `{ nuevos[], cambios[] (antes/después de precio y campos), errores[] (fila + motivo), sinCambio, noEnArchivo[] }`. Errores a cubrir: precio vacío, año desde > año hasta, SKU repetido en el archivo, fila de compatibilidad con SKU que no existe. Una categoría inexistente no es error: se crea al confirmar.
   - Límites: tamaño del archivo (2 MB), máximo 2000 filas, celdas truncadas a los límites de F1-1. Ignorar fórmulas (leer solo el valor).
2. **Endpoints** (controlador admin y su archivo de rutas):
   - `GET /api/admin/productos/plantilla` (xlsx vacío con las dos hojas).
   - `GET /api/admin/productos/exportar` (catálogo actual en el mismo formato).
   - `POST /api/admin/productos/importar/vista-previa` (sube el archivo con `multer` en memoria, **no escribe en la BD**, devuelve el resumen).
   - `POST /api/admin/productos/importar/confirmar` (aplica **por SKU**: crea o actualiza; **nunca borra**; crea las categorías nuevas; devuelve conteos). Los productos que no vienen en el archivo se devuelven en `noEnArchivo` y el panel ofrece desactivarlos con una acción aparte, con confirmación.
   - Permiso `config:manage`. Auditoría con resumen (cuántos creados, actualizados, errores). Validar tipo MIME y extensión; `500` genérico.
3. **Panel** (`public/src/features/inventory/`): botón **Importar** en Inventario con modal de cuatro pasos (descargar plantilla o exportar actual → subir → vista previa con tablas de nuevos, cambios con antes y después, errores con motivo → confirmar). Solo `Icono`, sin `innerHTML` con datos, móvil primero.
4. **Suite** `scripts/test-importacion-productos.ts` en `SUITES` (después de `test-producto-admin-ampliado.ts`): parseo CSV y xlsx de ejemplo creado en el test, cada tipo de error, vista previa sin escribir en la BD, confirmar crea y actualiza por SKU, no borra, categorías nuevas, fila de compatibilidad con SKU inexistente, tope de tamaño y de filas, sin marca en el código.
5. Recorrido en Chrome a 390 y 1440 px, 0 errores de CSP, con un Excel de 10 filas.

**Cierre:** reglas generales. Esperar a Claude.

---

## Paso 3 · F1-4 · Vehículo del cliente (`Etiqueta`, `EtiquetaIg`, Inbox, copiloto)

Diseño: §1.3 y §4. Depende del paso 2 aprobado. Este paso **no** cambia el flujo del bot (eso es el paso 4).

1. **Modelos** `Etiqueta` y `EtiquetaIg` (más `types/models.d.ts`): `vehiculo: { marca, modelo, anio, motor, version }`, todo opcional, con los mismos límites de longitud que la compatibilidad. Guardar también `marcaNorm` y `modeloNorm` calculados por el servidor con `normalizarTexto`.
2. **Servicio** pequeño `services/vehiculoCliente.ts`: `validarVehiculo(datos)` y `describirVehiculo(v)` ("Toyota Corolla 2012 1.8"), funciones puras.
3. **Endpoint** para fijar o borrar el vehículo de un contacto desde el Inbox (permiso del Inbox que ya exista para editar etiquetas, auditoría, `500` genérico).
4. **Panel**: la ficha del cliente en el Inbox muestra y permite editar el vehículo. Si el contacto no tiene vehículo, solo se ve el botón de agregar.
5. **Copiloto de venta manual:** al extraer un pedido del chat, también propone el vehículo (solo propone; el humano confirma antes de guardar). Localizar el servicio actual del copiloto, ampliar su salida y su validación, y no cambiar nada más.
6. No tocar el flujo del bot ni `features/whatsapp/**` ni `features/instagram/**`.
7. **Suite** `scripts/test-vehiculo-cliente.ts` en `SUITES`: validación, normalización, persistencia en ambos modelos, endpoint con y sin permiso, copiloto propone y no guarda solo, regresión de etiquetas existentes (sin vehículo siguen igual).
8. Recorrido en Chrome a 390 y 1440 px con la ficha del Inbox, 0 errores de CSP.

**Cierre:** reglas generales. Esperar a Claude.

---

## Paso 4 · F1-5 · Bot por vehículo (`busquedaPorVehiculo`)

Diseño: §2. Depende del paso 3 aprobado. **Este paso toca `features/whatsapp/**`**, así que primero hay una fase de investigación.

**4a · Investigación (sin cambios de código).** Escribir en **Dudas para Claude** la lista exacta de archivos y líneas del flujo de WhatsApp (y de Instagram/Messenger si aplica) donde se engancharía el flujo por vehículo, cómo se activa hoy el menú de categorías y cómo se guarda el estado de la conversación. **Parar.** Claude escribe en la tarea las líneas autorizadas (regla 7 de `AGENTS.md`) y recién entonces se pasa a 4b.

**4b · Implementación (solo en las líneas autorizadas).**

1. Bandera `settings.features.busquedaPorVehiculo` (booleano, `false` por defecto) en la config de marca y en su validador. Con `false`, el flujo actual no cambia (la suite de regresión lo prueba).
2. **Servicio** `services/busquedaVehiculo.ts` (consultas a la BD, con mock en test): marcas existentes en el catálogo ordenadas por cantidad de productos; modelos de una marca; validación del año contra los rangos cargados; motores disponibles solo si hay piezas que dependen del motor; categorías y productos compatibles; productos sin compatibilidad marcados como universales.
3. **Flujo**: marca → modelo → año → (motor si aplica) → categorías con piezas compatibles → productos → cantidad → flujo actual de compra. Listas de WhatsApp de máximo 10 filas: 9 más "Otra (escríbela)". Guarda el vehículo en `Etiqueta` (paso 3) y, en compras siguientes, pregunta "¿Sigue siendo para tu <vehículo>?".
4. Sin piezas para ese vehículo: mensaje de la marca (clave nueva en `messages`, nunca en el código), pasa a modo manual y registra la búsqueda sin resultado (colección simple; el análisis es F3).
5. Los textos nuevos viven en `config/brand/<marca>/` (`messages`). No cambiar `config/brand/default/`.
6. **Suite** `scripts/test-bot-vehiculo.ts` en `SUITES`: flujo completo con mocks, límite de 10 filas, año fuera de rango, sin piezas, universales, bandera en `false` sin cambios, y todas las suites de regresión del bot (WhatsApp 30/0, Inbox 364/0, IG 37/0, Messenger 54/0).

**Cierre:** reglas generales. Esperar a Claude.

---

## Fuera de este plan

**F1-6** (marca nueva del cliente de repuestos y carga real de su Excel) espera una muestra del Excel del cliente y la lista de marcas de vehículos que atiende (`docs/f1-producto-ampliado.md` §6). No se empieza sin esos datos del dueño.
