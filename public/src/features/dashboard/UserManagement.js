import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js";

const e = React.createElement;

const UserManagement = ({ onBack }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    nombre: "",
    role: "admin"
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get("/api/admin/users");
      if (data.success) setUsers(data.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    try {
      if (editingUser) {
        const { data } = await apiClient.patch(`/api/admin/users/${editingUser._id}`, formData);
        if (data.success) {
          window.showToast("Usuario actualizado");
          setShowModal(false);
          fetchUsers();
        }
      } else {
        const { data } = await apiClient.post("/api/admin/users", formData);
        if (data.success) {
          window.showToast("Usuario creado");
          setShowModal(false);
          fetchUsers();
        }
      }
    } catch (error) {
      window.showToast(error.response?.data?.error || "Error al procesar", "error");
    }
  };

  const toggleStatus = async (user) => {
    try {
      const { data } = await apiClient.patch(`/api/admin/users/${user._id}`, { activo: !user.activo });
      if (data.success) {
        window.showToast(`Usuario ${user.activo ? "desactivado" : "activado"}`);
        fetchUsers();
      }
    } catch (error) {
      window.showToast("Error al cambiar estado", "error");
    }
  };

  const openModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username,
        password: "", // Leave blank unless changing
        nombre: user.nombre,
        role: user.role
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: "",
        password: "",
        nombre: "",
        role: "admin"
      });
    }
    setShowModal(true);
  };

  if (loading) return e("div", { className: "p-10 text-center" }, "Cargando usuarios...");

  return e("div", { className: "p-6 max-w-6xl mx-auto h-full overflow-auto" },
    e("div", { className: "flex justify-between items-center mb-8" },
      e("div", { className: "flex items-center gap-4" }, [
        onBack && e("button", {
          onClick: onBack,
          className: "w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-emerald-500 transition-all active:scale-90"
        }, e("i", { className: "fas fa-arrow-left" })),
        e("h2", { className: "text-2xl font-black text-gray-800 dark:text-white uppercase tracking-tighter" }, "Gestión de Personal")
      ]),
      e("button", {
        onClick: () => openModal(),
        className: "bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2"
      }, e("i", { className: "fas fa-user-plus" }), "Nuevo Usuario")
    ),

    e("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" },
      users.map(u => e("div", { key: u._id, className: `bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border ${u.activo ? 'border-gray-100 dark:border-gray-700' : 'border-red-200 dark:border-red-900/50 bg-red-50/10'}` },
        e("div", { className: "flex justify-between items-start mb-4" },
          e("div", { className: `w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${u.role === 'admin' ? 'bg-purple-100 text-purple-600' : u.role === 'cajero' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}` },
            e("i", { className: `fas ${u.role === 'admin' ? 'fa-user-shield' : u.role === 'cajero' ? 'fa-cash-register' : 'fa-truck'}` })
          ),
          e("span", { className: `text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${u.activo ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}` }, 
            u.activo ? "Activo" : "Inactivo"
          )
        ),
        e("h3", { className: "font-black text-gray-800 dark:text-white text-lg" }, u.nombre),
        e("p", { className: "text-sm text-gray-400 mb-6" }, `@${u.username}`),
        
        e("div", { className: "flex gap-2" },
          e("button", {
            onClick: () => openModal(u),
            className: "flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-600 dark:text-gray-300 py-2 rounded-xl text-xs font-bold transition-all"
          }, "Editar"),
          e("button", {
            onClick: () => toggleStatus(u),
            className: `flex-1 py-2 rounded-xl text-xs font-bold transition-all ${u.activo ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`
          }, u.activo ? "Desactivar" : "Activar")
        )
      ))
    ),

    showModal && e("div", { className: "fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" },
      e("div", { className: "bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200" },
        e("h3", { className: "text-xl font-black text-gray-800 dark:text-white mb-6" }, editingUser ? "Editar Usuario" : "Crear Nuevo Usuario"),
        e("form", { onSubmit: handleSubmit, className: "space-y-4" },
          e("div", null,
            e("label", { className: "block text-[10px] font-black uppercase text-gray-400 mb-1" }, "Nombre Completo"),
            e("input", {
              type: "text",
              required: true,
              value: formData.nombre,
              onChange: (ev) => setFormData({ ...formData, nombre: ev.target.value }),
              className: "w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 ring-emerald-500 transition-all"
            })
          ),
          e("div", null,
            e("label", { className: "block text-[10px] font-black uppercase text-gray-400 mb-1" }, "Usuario (@)"),
            e("input", {
              type: "text",
              required: true,
              value: formData.username,
              onChange: (ev) => setFormData({ ...formData, username: ev.target.value }),
              className: "w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 ring-emerald-500 transition-all"
            })
          ),
          e("div", null,
            e("label", { className: "block text-[10px] font-black uppercase text-gray-400 mb-1" }, editingUser ? "Cambiar Contraseña (opcional)" : "Contraseña"),
            e("input", {
              type: "password",
              required: !editingUser,
              value: formData.password,
              onChange: (ev) => setFormData({ ...formData, password: ev.target.value }),
              className: "w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 ring-emerald-500 transition-all"
            })
          ),
          e("div", null,
            e("label", { className: "block text-[10px] font-black uppercase text-gray-400 mb-1" }, "Rol / Permisos"),
            e("select", {
              value: formData.role,
              onChange: (ev) => setFormData({ ...formData, role: ev.target.value }),
              className: "w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 ring-emerald-500 transition-all"
            },
              e("option", { value: "admin" }, "Administrador (Full)"),
              e("option", { value: "cajero" }, "Cajero (Pagos y Ventas)"),
              e("option", { value: "repartidor" }, "Repartidor (Entregas)")
            )
          ),
          e("div", { className: "flex gap-3 mt-8" },
            e("button", {
              type: "button",
              onClick: () => setShowModal(false),
              className: "flex-1 bg-gray-100 dark:bg-gray-800 text-gray-500 font-bold py-3 rounded-2xl active:scale-95 transition-all"
            }, "Cancelar"),
            e("button", {
              type: "submit",
              className: "flex-1 bg-emerald-600 text-white font-bold py-3 rounded-2xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
            }, "Guardar")
          )
        )
      )
    )
  );
};

export default UserManagement;
