import sys

with open("public/src/features/dashboard/KanbanBoard.js", "r") as f:
    content = f.read()

# 1. Add state
target_state = "  const [deletingId, setDeletingId] = useState(null);"
replacement_state = "  const [deletingId, setDeletingId] = useState(null);\n  const [orderToDelete, setOrderToDelete] = useState(null);"
content = content.replace(target_state, replacement_state)

# 2. Replace handleDeleteOrder
target_delete = """  const handleDeleteOrder = async (orderId) => {
    if (!confirm("¿Estás seguro de que deseas ELIMINAR este pedido? Esta acción es irreversible.")) return;
    setDeletingId(orderId);
    try {
      const res = await apiClient.delete(`/api/admin/orders/${orderId}`);
      if (res.data && res.data.success) {
        setOrders(prev => prev.filter(o => o._id !== orderId));
        setIsModalOpen(false);
      } else {
        alert("Error al eliminar el pedido: " + (res.data.error || "Desconocido"));
      }
    } catch (err) {
      alert("Error de red al eliminar el pedido");
    } finally {
      setDeletingId(null);
    }
  };"""

replacement_delete = """  const handleDeleteOrder = (orderId) => {
    setOrderToDelete(orderId);
  };

  const confirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    setDeletingId(orderToDelete);
    try {
      const res = await apiClient.delete(`/api/admin/orders/${orderToDelete}`);
      if (res.data && res.data.success) {
        setOrders(prev => prev.filter(o => o._id !== orderToDelete));
        setIsModalOpen(false);
        setOrderToDelete(null);
        window.showToast?.("Pedido eliminado correctamente", "success");
      } else {
        window.showToast?.("Error al eliminar el pedido: " + (res.data.error || "Desconocido"), "error");
      }
    } catch (err) {
      window.showToast?.("Error de red al eliminar el pedido", "error");
    } finally {
      setDeletingId(null);
    }
  };"""
content = content.replace(target_delete, replacement_delete)

# 3. Render Delete Confirmation Modal at the end
# We need to find the final `  );` before `}; \n\nexport default KanbanBoard;`
target_render = """      isModalOpen &&
        selectedOrder &&
        e(OrderDetailsModal, {
          order: selectedOrder,
          onClose: handleCloseModal,
          onStatusChange: handleStatusChange,
          onDelete: handleDeleteOrder,
          deleting: deletingId === selectedOrder._id,
        }),
    )
  );
};

export default KanbanBoard;"""

replacement_render = """      isModalOpen &&
        selectedOrder &&
        e(OrderDetailsModal, {
          order: selectedOrder,
          onClose: handleCloseModal,
          onStatusChange: handleStatusChange,
          onDelete: handleDeleteOrder,
          deleting: deletingId === selectedOrder._id,
        }),
      
      // Modal de Confirmación de Eliminación
      orderToDelete &&
        e("div", { className: "fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" }, 
          e("div", { className: "bg-[#111b21] border border-[#2a3942] rounded-2xl p-6 max-w-sm w-full shadow-2xl transform scale-100 animate-in fade-in zoom-in-95 duration-200" }, [
            e("div", { className: "w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4" }, 
              e("i", { className: "fas fa-exclamation-triangle text-2xl text-red-500" })
            ),
            e("h3", { className: "text-lg font-black text-[#e9edef] text-center mb-2" }, "¿Eliminar Pedido?"),
            e("p", { className: "text-sm text-[#8696a0] text-center mb-6" }, "Esta acción es irreversible. Se borrará permanentemente del sistema."),
            e("div", { className: "flex gap-3" }, [
              e("button", {
                onClick: () => setOrderToDelete(null),
                disabled: deletingId === orderToDelete,
                className: "flex-1 px-4 py-2.5 rounded-lg font-bold text-[#e9edef] bg-[#202c33] hover:bg-[#2a3942] transition disabled:opacity-50"
              }, "Cancelar"),
              e("button", {
                onClick: confirmDeleteOrder,
                disabled: deletingId === orderToDelete,
                className: "flex-1 px-4 py-2.5 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-50 flex justify-center items-center gap-2"
              }, [
                deletingId === orderToDelete ? e("i", { className: "fas fa-spinner fa-spin" }) : e("i", { className: "fas fa-trash" }),
                "Eliminar"
              ])
            ])
          ])
        )
    )
  );
};

export default KanbanBoard;"""

if target_render in content:
    content = content.replace(target_render, replacement_render)
    with open("public/src/features/dashboard/KanbanBoard.js", "w") as f:
        f.write(content)
    print("Patched KanbanBoard modal")
else:
    print("Target render not found")
    sys.exit(1)

