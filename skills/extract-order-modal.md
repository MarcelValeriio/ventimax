# /extract-order-modal — Extraer OrderDetailsModal duplicado a componente compartido

## Objetivo
El componente `OrderDetailsModal` está duplicado (~120 líneas idénticas) en dos archivos:
- `public/src/features/dashboard/KanbanBoard.js`
- `public/src/features/sales/SalesDashboard.js`

Extraerlo a un solo archivo `public/src/components/OrderDetailsModal.js` y que ambos lo importen desde ahí.

## Paso 1: Crear el componente compartido

Crear `public/src/components/OrderDetailsModal.js` con el siguiente contenido:

```js
/**
 * public/src/components/OrderDetailsModal.js
 * Componente compartido de modal de detalles de pedido.
 * Usado por KanbanBoard y SalesDashboard.
 */
import React, { useEffect, useState } from "https://cdn.skypack.dev/react";

const e = React.createElement;

const OrderDetailsModal = ({ order, isOpen, onClose, onUpdateStatus, userRole }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const renderOrderId = (id) => {
    if (!id) return "#---";
    const cleanId = id.toString().replace(/^#+/, "");
    return `#${cleanId}`;
  };

  const formatDate = (ts) => {
    if (!ts) return "---";
    try {
      return new Date(ts).toLocaleString("es-VE", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
    } catch (e) {
      return "---";
    }
  };

  // Función segura para obtener ID del pedido (soporta correlativo, idFormateado, _id)
  const orderId = order?.correlativo || order?.idFormateado || order?.id || order?._id;

  // Función segura para obtener dirección (soporta múltiples ubicaciones en el schema)
  const direccion = order?.ubicacion?.direccion || order?.cliente?.direccion || order?.direccion;

  // Función segura para obtener teléfono
  const telefono = order?.cliente?.telefono || order?.whatsappId;

  return e("div", {
    className: `fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-2 md:p-4 transition-opacity duration-300 ease-out ${isOpen ? "opacity-100" : "opacity-0"}`,
    onClick: onClose,
  },
    e("div", {
      className: `bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[95vh] transition-all duration-300 ease-out transform ${isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"}`,
      onClick: (ev) => ev.stopPropagation(),
    },
      // Header
      e("div", { className: "p-6 md:p-8 bg-emerald-600 text-white flex justify-between items-center flex-shrink-0" },
        e("div", null,
          e("p", { className: "text-[10px] font-black uppercase tracking-[0.2em] opacity-80" }, "Orden de Servicio"),
          e("h3", { className: "text-3xl font-black" }, renderOrderId(orderId))
        ),
        e("div", { className: "text-right" },
          e("p", { className: "text-xs font-bold opacity-90" }, formatDate(order?.timestamp || order?.fecha)),
          e("span", { className: "inline-block mt-1 px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase" },
            (order?.estado || order?.status || "").replace(/_/g, " ")
          )
        )
      ),
      // Body
      e("div", { className: "flex-1 overflow-y-auto p-6 md:p-8 space-y-8" },
        // Sección Cliente + Dirección
        e("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6" },
          e("div", null,
            e("p", { className: "text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase mb-1" }, "Cliente"),
            e("h4", { className: "text-xl font-bold text-gray-800 dark:text-gray-100" },
              order?.cliente?.nombre || "Sin nombre registrado"
            ),
            e("p", { className: "text-xs font-black text-gray-400 uppercase mb-2" },
              `🆔 ${order?.cliente?.cedula ? "V-" + order.cliente.cedula : "CÉDULA NO REGISTRADA"}`
            ),
            telefono && e("a", {
              href: `https://wa.me/${String(telefono).replace(/[^0-9]/g, "")}`,
              target: "_blank",
              className: "text-emerald-500 font-bold text-sm flex items-center gap-2 mt-1 hover:underline w-fit"
            },
              e("i", { className: "fab fa-whatsapp" }),
              String(telefono)
            )
          ),
          direccion && e("div", null,
            e("p", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2" }, "📍 Dirección de Entrega"),
            e("p", { className: "text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-3" }, direccion),
            order?.ubicacion?.latitud && order?.ubicacion?.longitud && e("a", {
              href: `https://www.google.com/maps/search/?api=1&query=${order.ubicacion.latitud},${order.ubicacion.longitud}`,
              target: "_blank",
              className: "inline-flex items-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold transition w-fit"
            },
              e("i", { className: "fas fa-map-marked-alt text-red-500" }),
              "Ver en Google Maps"
            )
          )
        ),
        // Sección Productos
        e("div", null,
          e("p", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 border-b pb-2 dark:border-gray-700" }, "🛒 Detalle de Productos"),
          e("div", { className: "space-y-4" },
            (order?.items || []).map((item, idx) => {
              const unitPrice = Number(item.price || item.precio || 0);
              const qty = Number(item.cantidad || 0);
              const subtotal = item.subtotal ? Number(item.subtotal) : unitPrice * qty;
              return e("div", { key: idx, className: "flex justify-between items-start group" },
                e("div", { className: "flex gap-4" },
                  e("span", { className: "text-sm font-bold text-gray-800 dark:text-gray-100" }, item.producto),
                  e("span", { className: "text-xs text-gray-400" }, `x${qty}`)
                ),
                e("span", { className: "text-sm font-black text-emerald-600 dark:text-emerald-400" }, `$${subtotal.toFixed(2)}`)
              );
            })
          )
        ),
        // Sección Pago
        e("div", { className: "border-t pt-4 dark:border-gray-700" },
          e("div", { className: "flex justify-between items-center" },
            e("span", { className: "text-sm font-bold text-gray-600 dark:text-gray-400" }, "Método de Pago"),
            e("span", { className: "text-sm font-black text-gray-800 dark:text-gray-100 uppercase" },
              order?.pago?.metodo || "No especificado"
            )
          ),
          e("div", { className: "flex justify-between items-center mt-3" },
            e("span", { className: "text-lg font-black text-gray-800 dark:text-gray-100" }, "Total"),
            e("span", { className: "text-2xl font-black text-emerald-600 dark:text-emerald-400" },
              `$${Number(order?.pago?.montoUSD || 0).toFixed(2)}`
            )
          )
        )
      )
    )
  );
};

export default OrderDetailsModal;
```

## Paso 2: Modificar KanbanBoard.js

### 2a. Eliminar la definición local de `OrderDetailsModal`
En `public/src/features/dashboard/KanbanBoard.js`, buscar desde:
```js
// Componente Modal de Detalles (Versión COMANDA EXTENDIDA - Clean Animations)
const OrderDetailsModal = ({
```
Hasta el cierre de la función `OrderDetailsModal` (justo antes del `const KanbanBoard = ...` o del `export default`).

Eliminar TODO ese bloque completo.

### 2b. Añadir el import
Buscar la línea:
```js
import apiClient from "../../services/apiClient.js";
```

Añadir justo después:
```js
import OrderDetailsModal from "../../components/OrderDetailsModal.js";
```

## Paso 3: Modificar SalesDashboard.js

### 3a. Eliminar la definición local de `OrderDetailsModal`
Igual que en el paso 2a. Buscar el bloque `const OrderDetailsModal = ({` y eliminarlo completo.

### 3b. Añadir el import
Buscar la línea:
```js
import apiClient from "../../services/apiClient.js";
```

Añadir justo después:
```js
import OrderDetailsModal from "../../components/OrderDetailsModal.js";
```

## Verificación

Abrir el panel en el navegador (`/panel`):
1. Ir a la pestaña Kanban → hacer clic en un pedido → el modal debe abrirse y verse exactamente igual que antes.
2. Ir a Sales Dashboard → hacer clic en un pedido → el modal debe abrirse y verse exactamente igual que antes.
3. Revisar la consola del navegador: cero errores de import o de React.

## Notas importantes
- NO cambiar la lógica del modal. Solo extraerlo tal cual está.
- El componente compartido debe ser idéntico en funcionalidad al original.
- Si hay diferencias sutiles entre las dos versiones originales, usar la versión más completa/defensiva (la de SalesDashboard.js tiene más null checks).
- Los imports de React y `e()` deben permanecer en cada archivo.
