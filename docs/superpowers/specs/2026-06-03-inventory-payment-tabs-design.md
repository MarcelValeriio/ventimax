# Diseño Técnico: Refactorización de Inventario y Métodos de Pago

## 1. Contexto y Objetivos
Actualmente, el inventario y los métodos de pago se gestionan de manera dispar. Los productos están en la UI de "Inventario", pero los métodos de pago se configuran en un archivo estático (`payments.json`) y no tienen interfaz gráfica. El objetivo es unificar ambas funcionalidades bajo la vista de Inventario usando un sistema de pestañas y migrar los métodos de pago a la Base de Datos para mayor flexibilidad y control estructurado.

## 2. Arquitectura de la Interfaz (Frontend)
- **Navegación por Pestañas:** Se modificará la vista actual del Inventario para introducir dos pestañas principales en la parte superior:
  1. **Productos:** Mantendrá la funcionalidad actual (lista, edición, modal de categorías).
  2. **Métodos de Pago:** Una nueva vista dedicada a los pagos.
- **`InventoryManager.js`:** Nuevo componente (o refactor conceptual) que actuará como contenedor principal para manejar el estado de las pestañas.
- **`PaymentTab.js`:**
  - Mostrará los métodos de pago activos e inactivos en tarjetas (Cards).
  - Cada tarjeta tendrá un **Switch** rápido para Activar/Desactivar el método, y botones de Editar/Eliminar.
  - Al hacer clic en "+ Nuevo Método", se abrirá un Modal dinámico.

## 3. Lógica de Formularios Dinámicos para Pagos
El formulario de creación/edición cambiará según el "Tipo" de pago seleccionado, exigiendo campos estructurados según la realidad bancaria (especialmente de Venezuela):
- **Tipos de Pago Soportados:**
  - **Transferencia Nacional:** Requiere Banco, Nro. de Cuenta, Titular, Cédula/RIF.
  - **Pago Móvil:** Requiere Banco, Teléfono, Cédula.
  - **Zelle:** Requiere Correo Electrónico.
  - **Binance:** Requiere ID o Correo Electrónico.
  - **Efectivo:** Mensaje general para pago en moneda física.
  - **Otro:** Campo de texto libre para métodos no estandarizados.
- Se incluirá un campo opcional "Nota adicional" (ej. "Enviar foto del recibo obligatoriamente").

## 4. Estructura de Datos y Backend (Mongoose)
### Modelo `MetodoPago`
Se creará un nuevo Schema en Mongoose para persistir los datos de forma robusta:
```javascript
{
  tipo: { type: String, required: true }, // 'transferencia', 'pago_movil', 'zelle', etc.
  nombre: { type: String, required: true }, // "Pago Móvil Banesco"
  detalles: { type: Object }, // Guarda dinámicamente { banco, telefono, cedula... }
  notaAdicional: { type: String },
  activo: { type: Boolean, default: true }
}
```

### Endpoints (Rutas Admin)
Se agregarán las siguientes rutas en `adminRoutes.js` (delegando en `adminController` o un nuevo `paymentController`):
- `GET /api/admin/payments` (Lista todos los métodos)
- `POST /api/admin/payments` (Crea uno nuevo)
- `PUT /api/admin/payments/:id` (Actualiza datos o estado `activo`)
- `DELETE /api/admin/payments/:id` (Elimina un método)

## 5. Modificaciones al Flujo del Bot
- Tanto `botController.js` como `chatFlowController.js` deberán dejar de leer el archivo `payments.json` mediante `configManager`.
- En lugar de eso, consultarán a la Base de Datos los métodos donde `activo: true`.
- Con los datos estructurados provenientes de la BD, el bot formateará el mensaje dinámicamente antes de enviárselo al cliente. Por ejemplo, si es Pago Móvil, armará el texto: "📱 *Pago Móvil*\nBanco: X\nTeléfono: Y\nCédula: Z".

## 6. Consideraciones de Transición
Se sugiere crear un script rápido de migración o simplemente insertar los datos manualmente mediante la nueva UI y luego borrar o ignorar el archivo `payments.json` para evitar duplicidad de fuentes de la verdad.