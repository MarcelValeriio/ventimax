# /add-indexes — Añadir índices estratégicos a MongoDB

## Objetivo
Añadir índices compuestos a los modelos Pedido, Mensaje, Etiqueta, Producto y Auditoria para eliminar COLLSCANs. Actualmente NINGÚN modelo tiene índices definidos. Las consultas frecuentes por `whatsappId`, `estado`, `timestamp` y `telefono` hacen barrido completo de colección.

## Modelos a modificar

### 1. models/Pedido.js
Después de cerrar el schema (`});`) y ANTES del `module.exports`, añadir:

```js
// Índices para consultas frecuentes
PedidoSchema.index({ whatsappId: 1, estado: 1 });          // Búsqueda de pedido activo por usuario
PedidoSchema.index({ estado: 1, timestamp: -1 });           // Kanban: filtrar por estado ordenado por fecha
PedidoSchema.index({ correlativo: 1 }, { unique: true, sparse: true }); // Búsqueda por #pedido
PedidoSchema.index({ "cliente.cedula": 1 });                // Búsqueda por cédula
PedidoSchema.index({ "pago.metodo": 1 });                   // Reportes por método de pago
```

### 2. models/Mensaje.js
Después de `});` y ANTES del `module.exports`, añadir:

```js
// Índice compuesto para historial de chat
MensajeSchema.index({ telefono: 1, timestamp: -1 });
// TTL: auto-borrar mensajes después de 90 días (7,776,000 segundos)
MensajeSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });
```

### 3. models/Etiqueta.js
Después de `});` y ANTES del `module.exports`, añadir:

```js
// Índice para búsqueda de clientes estancados
EtiquetaSchema.index({ stuck: 1, updatedAt: -1 });
// Índice para filtrar por paso actual
EtiquetaSchema.index({ paso: 1 });
```

### 4. models/Producto.js
Después de `});` y ANTES del `module.exports`, añadir:

```js
// Índice para catálogo activo por categoría
productoSchema.index({ activo: 1, categoria: 1, name: 1 });
// Índice para búsqueda por ID de producto (usado en chatFlow)
productoSchema.index({ id: 1 });
```

### 5. models/Auditoria.js
Después de `});` y ANTES del `module.exports`, añadir:

```js
// Índice para consultas de auditoría por pedido
AuditoriaSchema.index({ pedidoId: 1, timestamp: -1 });
// Índice para filtrar por tipo de recurso
AuditoriaSchema.index({ tipoRecurso: 1, timestamp: -1 });
// Índice para historial de acciones de un usuario
AuditoriaSchema.index({ usuarioId: 1, timestamp: -1 });
```

## Verificación

Ejecutar al terminar:
```bash
node -e "
require('./models/Pedido');
require('./models/Mensaje');
require('./models/Etiqueta');
require('./models/Producto');
require('./models/Auditoria');
console.log('✅ Todos los modelos con índices cargados correctamente');
"
```

## Notas importantes
- Los índices se crean en background en MongoDB. No bloquean.
- Si hay datos existentes, MongoDB construye los índices sobre ellos automáticamente.
- El índice TTL de Mensaje empezará a borrar documentos 90 días después de su timestamp.
- NO modificar nada más en los archivos. Solo añadir las líneas de índice.
