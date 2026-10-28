# Design Spec: Paginación del Historial Contable (Sales Dashboard)

**Fecha:** 2026-06-05
**Estado:** Borrador
**Autor:** Gemini CLI

## 1. Objetivo
Implementar paginación desde el servidor en el Historial Contable del `SalesDashboard` para mejorar el rendimiento del panel administrativo, cargando inicialmente 20 pedidos y permitiendo la navegación mediante botones clásicos.

## 2. Requerimientos Visuales (Estilo SaaS)
La interfaz debe mantenerse fiel al diseño actual:
- **Colores:** Emerald (Esmeralda) para acentos y estados activos.
- **Formas:** Bordes redondeados (`rounded-xl`, `rounded-full`).
- **Interactividad:** Efectos `hover`, `active:scale-95`, y soporte para modo oscuro (`dark:bg-gray-800`).
- **Iconografía:** FontAwesome para los botones de navegación.

## 3. Arquitectura Técnica

### 3.1 Backend (Node.js/Express/MongoDB)
Modificar `getSalesSummary` en `adminController.js`:
- **Inputs (Query Params):**
  - `page`: Número de página (default 1).
  - `limit`: Cantidad de registros (default 20).
  - `filtro`: 'hoy', 'semana', 'mes', 'todos', 'personalizado'.
  - `inicio`, `fin`: Fechas para el filtro personalizado.
- **Lógica:**
  - Realizar una consulta para calcular los KPIs (Totales) sobre todo el rango filtrado.
  - Realizar una segunda consulta con `.skip((page - 1) * limit).limit(limit)` para las transacciones de la tabla.
  - Retornar `totalPages`, `totalRecords` y `currentPage`.

### 3.2 Frontend (React Pure JS)
Modificar `SalesDashboard.js`:
- **Estado:** Añadir `currentPage` y `paginationData` (total de páginas, etc.).
- **Data Fetching:** Mover la lógica de filtrado que antes estaba en el cliente (`getVentasFiltradas`) hacia la llamada de API.
- **UI:** Crear un componente `PaginationControls` que se renderice debajo de la tabla.

## 4. Diseño de la Interfaz (PaginationControls)
```javascript
// Estructura propuesta
e("div", { className: "flex justify-center items-center gap-2 py-6" }, [
  e("button", { className: "btn-paginacion" }, e("i", { className: "fas fa-chevron-left" })),
  // ... botones numerados con estilo emerald-600 para el activo
  e("button", { className: "btn-paginacion" }, e("i", { className: "fas fa-chevron-right" }))
])
```

## 5. Plan de Pruebas
1. Verificar que al cargar el panel se muestren exactamente 20 pedidos (si existen).
2. Comprobar que al cambiar de página los datos se actualicen correctamente.
3. Validar que los KPIs de la parte superior (Total USD, etc.) sigan calculando el periodo completo y no solo lo visible en la tabla.
4. Confirmar que los filtros de fecha (Hoy, Semana, etc.) reinicien la paginación a la página 1.
