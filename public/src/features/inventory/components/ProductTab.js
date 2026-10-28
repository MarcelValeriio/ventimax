/**
 * public/src/features/inventory/components/ProductTab.js
 * Módulo de negocio para la visualización y gestión del inventario - Pure JS Version
 * UI Refactored for Categories and Sorting with Blendy Morphing
 */
import React, {
  useEffect,
  useState,
  useRef,
} from "https://cdn.skypack.dev/react";
import { createBlendy } from "https://cdn.jsdelivr.net/npm/blendy/+esm";
import apiClient from "../../../services/apiClient.js";
import ConfirmModal from "./ConfirmModal.js";

const e = React.createElement;

// Componente Modal de Categorías (Componente Funcional Estricto)
const CategoriesModal = ({
  isOpen,
  onClose,
  categorias,
  fetchCategorias,
  onConfirmAction,
}) => {
  const [newCatName, setNewCatName] = useState("");
  const [newCatParent, setNewCatParent] = useState("");
  const [editingCatId, setEditingCatId] = useState(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatParent, setEditCatParent] = useState("");

  if (!isOpen) return null;

  const handleAddCategory = async (ev) => {
    ev.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const slug = newCatName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      await apiClient.post("/api/admin/categorias", {
        nombre: newCatName.trim(),
        slug,
        padre: newCatParent || null,
      });
      setNewCatName("");
      setNewCatParent("");
      fetchCategorias();
      window.showToast?.("✅ Categoría creada");
    } catch (error) {
      window.showToast?.(
        "❌ Error creando categoría: " + error.message,
        "error",
      );
    }
  };

  const handleUpdateCategory = async (id) => {
    if (!editCatName.trim()) return;
    try {
      await apiClient.put(`/api/admin/categorias/${id}`, {
        nombre: editCatName.trim(),
        padre: editCatParent || null,
      });
      setEditingCatId(null);
      fetchCategorias();
      window.showToast?.("✅ Categoría actualizada");
    } catch (error) {
      window.showToast?.(
        "❌ Error actualizando categoría: " + error.message,
        "error",
      );
    }
  };

  const handleDeleteCategory = async (id) => {
    onConfirmAction({
      isOpen: true,
      title: "¿Eliminar Categoría?",
      message:
        "⚠️ ¿Estás seguro de eliminar este menú/categoría?\n\nEsta acción no se puede deshacer y los productos asociados quedarán sin categoría.",
      onConfirm: async () => {
        try {
          await apiClient.delete(`/api/admin/categorias/${id}`);
          fetchCategorias();
          window.showToast?.("🗑️ Categoría eliminada");
        } catch (error) {
          window.showToast?.(
            "❌ Error eliminando categoría: " + error.message,
            "error",
          );
        }
      },
    });
  };

  const renderCategoryItem = (cat, level = 0) => {
    const isEditing = editingCatId === cat._id;
    const children = categorias.filter(
      (c) => (c.padre?._id || c.padre) === cat._id,
    );

    return e(
      "div",
      { key: cat._id, className: "w-full" },
      e(
        "div",
        {
          className:
            "p-3 border border-gray-100 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 group transition-all hover:shadow-md mb-2",
          style: { marginLeft: `${level * 20}px` },
        },
        isEditing
          ? e(
              "div",
              { className: "space-y-3" },
              e("input", {
                type: "text",
                value: editCatName,
                onChange: (e) => setEditCatName(e.target.value),
                className:
                  "w-full p-2 border-b-2 border-emerald-500 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none text-sm rounded-t",
              }),
              e(
                "select",
                {
                  value: editCatParent,
                  onChange: (e) => setEditCatParent(e.target.value),
                  className:
                    "w-full p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-xs dark:text-gray-300",
                },
                e("option", { value: "" }, "📍 Convertir en Menú Principal"),
                categorias
                  .filter((c) => c._id !== cat._id)
                  .map((c) =>
                    e(
                      "option",
                      { key: c._id, value: c._id },
                      `Mover como Submenú de: ${c.nombre}`,
                    ),
                  ),
              ),
              e(
                "div",
                { className: "flex justify-end gap-2" },
                e(
                  "button",
                  {
                    onClick: () => setEditingCatId(null),
                    className:
                      "px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition",
                  },
                  "Cancelar",
                ),
                e(
                  "button",
                  {
                    onClick: () => handleUpdateCategory(cat._id),
                    className:
                      "px-3 py-1 text-xs bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 transition",
                  },
                  "Guardar",
                ),
              ),
            )
          : e(
              "div",
              { className: "flex justify-between items-center" },
              e(
                "div",
                { className: "flex items-center gap-3" },
                level > 0 &&
                  e("i", {
                    className:
                      "fas fa-level-up-alt fa-rotate-90 text-gray-400 text-xs",
                  }),
                e(
                  "div",
                  null,
                  e(
                    "span",
                    {
                      className: `${level === 0 ? "font-bold text-gray-800 dark:text-gray-100" : "font-medium text-gray-600 dark:text-gray-300"} text-sm`,
                    },
                    cat.nombre,
                  ),
                  children.length > 0 &&
                    e(
                      "span",
                      {
                        className:
                          "ml-2 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 px-1.5 rounded",
                      },
                      `${children.length}`,
                    ),
                ),
              ),
              e(
                "div",
                { className: "flex gap-1" },
                e(
                  "button",
                  {
                    onClick: () => {
                      setEditingCatId(cat._id);
                      setEditCatName(cat.nombre);
                      setEditCatParent(cat.padre?._id || cat.padre || "");
                    },
                    className:
                      "text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 p-2 rounded-lg transition",
                  },
                  e("i", { className: "fas fa-edit" }),
                ),
                e(
                  "button",
                  {
                    onClick: () => handleDeleteCategory(cat._id),
                    className:
                      "text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-2 rounded-lg transition",
                  },
                  e("i", { className: "fas fa-trash-alt" }),
                ),
              ),
            ),
      ),
      children.map((child) => renderCategoryItem(child, level + 1)),
    );
  };

  return e(
    "div",
    {
      className:
        "fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-2 md:p-4 backdrop-blur-sm",
    },
    e(
      "div",
      {
        className:
          "bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[95%] md:w-full md:max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]",
      },
      // Header
      e(
        "div",
        {
          className:
            "p-6 border-b dark:border-gray-700 border-gray-100 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 flex-shrink-0",
        },
        e(
          "h3",
          {
            className:
              "text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2",
          },
          e("i", { className: "fas fa-tags text-emerald-500" }),
          "Gestionar Categorías",
        ),
        e(
          "button",
          {
            onClick: onClose,
            className:
              "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition",
          },
          e("i", { className: "fas fa-times" }),
        ),
      ),
      // Body
      e(
        "div",
        { className: "p-6 flex-1 overflow-y-auto space-y-6" },
        // Formulario Crear
        e(
          "form",
          {
            onSubmit: handleAddCategory,
            className:
              "space-y-3 p-4 bg-emerald-50/30 dark:bg-emerald-500/5 rounded-2xl border border-emerald-100/50 dark:border-emerald-500/20 shadow-inner",
          },
          e(
            "p",
            {
              className:
                "text-[10px] font-black text-emerald-600/70 dark:text-emerald-400 uppercase tracking-widest",
            },
            "✨ CREAR NUEVA CATEGORÍA O SECCIÓN",
          ),
          e("input", {
            type: "text",
            value: newCatName,
            onChange: (e) => setNewCatName(e.target.value),
            placeholder: "Nombre (ej: Comida, Bebidas, Dumplings...)",
            className:
              "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-sm",
          }),
          e(
            "select",
            {
              value: newCatParent,
              onChange: (e) => setNewCatParent(e.target.value),
              className:
                "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none text-sm shadow-sm cursor-pointer",
            },
            e("option", { value: "" }, "📌 Es Categoría Principal"),
            categorias.map((c) =>
              e("option", { key: c._id, value: c._id }, `Hijo de: ${c.nombre}`),
            ),
          ),
          e(
            "button",
            {
              type: "submit",
              className:
                "w-full bg-emerald-600 text-white py-2.5 rounded-xl hover:bg-emerald-700 transition font-bold text-sm shadow-lg active:scale-[0.98]",
            },
            "+ Crear Sección",
          ),
        ),
        // Lista
        e(
          "div",
          { className: "space-y-1 pb-4" },
          e(
            "div",
            { className: "flex justify-between items-center mb-4 px-1" },
            e(
              "p",
              {
                className:
                  "text-[10px] font-black text-gray-400 uppercase tracking-widest",
              },
              "Estructura Actual de Categorías",
            ),
            e(
              "span",
              { className: "text-[10px] text-gray-400" },
              `${categorias.length} Secciones`,
            ),
          ),
          categorias.length === 0
            ? e(
                "div",
                { className: "text-center py-10 text-gray-400 italic text-sm" },
                "No hay categorías creadas aún.",
              )
            : categorias
                .filter((c) => !c.padre)
                .map((cat) => renderCategoryItem(cat, 0)),
        ),
      ),
    ),
  );
};

const ProductTab = () => {
  const [products, setProducts] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bcvRate, setBcvRate] = useState(0);

  // Estados para Filtros y Ordenamiento
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sortDirection, setSortDirection] = useState("asc");

  // Estados para Modal de Productos y Modal de Categorías
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productImages, setProductImages] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    price: "",
    description: "",
    categoria: "",
    stock: "",
    trackStock: false,
  });

  // Estado para Confirmación
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const blendyRef = useRef(null);

  useEffect(() => {
    // Inicializar Blendy con una configuración más suave y natural
    if (!blendyRef.current) {
      blendyRef.current = createBlendy({
        animation: "spring", // Usamos spring para inercia natural
        duration: 600, // Aumentamos a 600ms para suavidad
        overshoot: 0.2, // Pequeño efecto de rebote al final
      });
    }
  }, []);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const query = [];
      if (selectedCategory) query.push(`categoria=${selectedCategory}`);
      if (sortDirection) query.push(`sort=${sortDirection}`);

      const queryString = query.length > 0 ? `?${query.join("&")}` : "";
      const { data } = await apiClient.get(`/api/admin/products${queryString}`);
      if (data.success) {
        setProducts(data.data || []);
      }
    } catch (err) {
      console.error("❌ Error cargando inventario:", err.message);
      setError("No se pudo cargar el inventario.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategorias = async () => {
    try {
      const { data } = await apiClient.get("/api/admin/categorias");
      if (data.success) {
        const cats = data.data || [];
        setCategorias(cats);
        // Fallback para categoría por defecto en el formulario
        if (cats.length > 0 && !formData.categoria) {
          setFormData((prev) => ({ ...prev, categoria: cats[0]._id }));
        }
      }
    } catch (err) {
      console.error("❌ Error cargando categorías:", err.message);
    }
  };

  const fetchBcvRate = async () => {
    try {
      const { data } = await apiClient.get("/api/admin/bcv");
      console.log("📊 Respuesta BCV:", data);
      if (data.success && data.data && data.data.tasa) {
        setBcvRate(data.data.tasa);
      }
    } catch (err) {
      console.error("❌ Error cargando tasa BCV:", err.message);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [selectedCategory, sortDirection]);

  useEffect(() => {
    fetchCategorias();
    fetchBcvRate();
  }, []);

  // Efecto para manejar la transición Blendy cuando cambia isModalOpen
  useEffect(() => {
    if (isModalOpen) {
      // Importante: avisar a Blendy que el DOM cambió y hay un nuevo 'data-blendy-to'
      blendyRef.current?.update();

      const timer = setTimeout(() => {
        blendyRef.current?.toggle("product-modal-morph");
      }, 20); // Un pelín más de margen para el renderizado
      return () => clearTimeout(timer);
    }
  }, [isModalOpen]);

  const handleOpenModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setProductImages(product.imagenes || []);
      setFormData({
        id: product.id,
        name: product.name,
        price: product.price,
        description: product.description || "",
        categoria:
          product.categoria?._id ||
          product.categoria ||
          categorias[0]?._id ||
          "",
        categorias: Array.isArray(product.categorias)
          ? product.categorias.map((c) => c?._id || c)
          : [],
        stock: product.stock ?? 0,
        trackStock: product.trackStock === true,
      });
    } else {
      setEditingProduct(null);
      setProductImages([]);
      setFormData({
        id: "",
        name: "",
        price: "",
        description: "",
        categoria: categorias[0]?._id || "",
        categorias: [],
        stock: "",
        trackStock: false,
      });
    }
    setIsModalOpen(true);
  };

  const handleUploadImage = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file || !editingProduct) return;
    try {
      setUploadingImage(true);
      const data = new FormData();
      data.append("imagen", file);
      const res = await apiClient.post(
        `/api/admin/products/${editingProduct.id}/imagenes`,
        data,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const updatedProduct = res.data?.data;
      if (updatedProduct) {
        setProductImages(updatedProduct.imagenes || []);
        setEditingProduct(updatedProduct);
      }
      fetchProducts();
      window.showToast?.("✅ Imagen subida correctamente", "success");
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      window.showToast?.(`❌ ${msg}`, "error");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteImage = async (index) => {
    if (!editingProduct) return;
    if (!window.confirm("¿Seguro que deseas eliminar esta imagen?")) return;
    try {
      const res = await apiClient.delete(
        `/api/admin/products/${editingProduct.id}/imagenes/${index}`
      );
      const updatedProduct = res.data?.data;
      if (updatedProduct) {
        setProductImages(updatedProduct.imagenes || []);
        setEditingProduct(updatedProduct);
      }
      fetchProducts();
      window.showToast?.("🗑️ Imagen eliminada", "success");
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      window.showToast?.(`❌ ${msg}`, "error");
    }
  };

  const handleSetPrimaryImage = async (index) => {
    if (!editingProduct) return;
    try {
      const res = await apiClient.put(
        `/api/admin/products/${editingProduct.id}/imagenes/principal`,
        { indice: index }
      );
      const updatedProduct = res.data?.data;
      if (updatedProduct) {
        setProductImages(updatedProduct.imagenes || []);
        setEditingProduct(updatedProduct);
      }
      fetchProducts();
      window.showToast?.("⭐ Imagen marcada como principal", "success");
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      window.showToast?.(`❌ ${msg}`, "error");
    }
  };

  const handleCloseModal = () => {
    if (blendyRef.current) {
      blendyRef.current.untoggle("product-modal-morph");
      // Esperamos a que termine la animación antes de desmontar el modal de React
      setTimeout(() => {
        setIsModalOpen(false);
      }, 400);
    } else {
      setIsModalOpen(false);
    }
  };

  const handleSave = async (ev) => {
    if (ev) ev.preventDefault();
    try {
      if (editingProduct) {
        await apiClient.put(
          `/api/admin/products/${editingProduct.id}`,
          formData,
        );
      } else {
        await apiClient.post("/api/admin/products", formData);
      }
      handleCloseModal();
      fetchInventory();
      window.showToast?.("✅ Producto guardado exitosamente");
    } catch (err) {
      window.showToast?.("❌ Error al guardar: " + err.message, "error");
    }
  };

  const handleDelete = async (id) => {
    setConfirmConfig({
      isOpen: true,
      title: "¿Eliminar Producto?",
      message:
        "⚠️ ¿Estás seguro de que deseas eliminar este producto?\n\nEsta acción no se puede deshacer.",
      onConfirm: async () => {
        try {
          await apiClient.delete(`/api/admin/products/${id}`);
          fetchInventory();
          window.showToast?.("🗑️ Producto eliminado");
        } catch (err) {
          window.showToast?.("❌ Error al eliminar: " + err.message, "error");
        }
      },
    });
  };

  const toggleSort = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  if (loading && products.length === 0)
    return e(
      "div",
      { className: "p-10 text-center text-gray-400" },
      e("i", { className: "fas fa-spinner fa-spin mr-2" }),
      "Cargando catálogo...",
    );

  if (error)
    return e(
      "div",
      { className: "p-10 text-center text-red-500" },
      e("i", { className: "fas fa-exclamation-triangle mr-2" }),
      error,
    );

  return e(
    "div",
    {
      className:
        "p-4 md:p-6 relative bg-gray-50 dark:bg-gray-900 min-h-full pb-24",
    },

    // Header & Filters Toolbar
    e(
      "header",
      {
        className:
          "mb-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4",
      },
      e(
        "div",
        null,
        e(
          "h2",
          {
            className:
              "text-2xl font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-3",
          },
          e("i", { className: "fas fa-box-open" }),
          "Inventario",
        ),
        bcvRate > 0 &&
          e(
            "p",
            { className: "text-[10px] text-gray-500 font-bold mt-1" },
            `Tasa BCV: Bs. ${bcvRate.toFixed(2)}`,
          ),
      ),
      e(
        "div",
        { className: "flex flex-wrap items-center gap-2 w-full lg:w-auto" },
        // Category Filter
        e(
          "select",
          {
            value: selectedCategory,
            onChange: (ev) => setSelectedCategory(ev.target.value),
            className:
              "flex-1 lg:flex-none p-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-gray-100 outline-none text-sm shadow-sm",
          },
          e("option", { value: "" }, "Todas las Categorías"),
          categorias.length > 0 &&
            (() => {
              const options = [];
              const buildOptions = (parentId = null, level = 0) => {
                categorias
                  .filter((c) => (c.padre?._id || c.padre) === parentId)
                  .forEach((c) => {
                    options.push(
                      e(
                        "option",
                        { key: c._id, value: c._id },
                        `${"— ".repeat(level)}${c.nombre}`,
                      ),
                    );
                    buildOptions(c._id, level + 1);
                  });
              };
              buildOptions();
              return options;
            })(),
        ),
        e(
          "button",
          {
            onClick: () => setIsCatModalOpen(true),
            className:
              "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 p-2.5 rounded-xl border dark:border-gray-700 shadow-sm hover:bg-gray-50 transition flex items-center justify-center gap-2 text-sm font-bold active:scale-95",
            title: "Gestionar Categorías",
          },
          e("i", { className: "fas fa-tags text-emerald-500" }),
          e("span", { className: "hidden sm:inline" }, "Categorías"),
        ),
        e(
          "button",
          {
            onClick: () => handleOpenModal(),
            "data-blendy-from": "product-modal-morph",
            className:
              "flex-1 lg:flex-none bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-sm font-bold active:scale-95",
          },
          e("div", { className: "flex items-center gap-2" }, [
            e("i", { className: "fas fa-plus" }),
            "Nuevo",
          ]),
        ),
      ),
    ),

    // Modal de Gestión de Categorías
    e(CategoriesModal, {
      isOpen: isCatModalOpen,
      onClose: () => setIsCatModalOpen(false),
      categorias,
      fetchCategorias,
      onConfirmAction: (config) =>
        setConfirmConfig({ ...config, isOpen: true }),
    }),

    // Modal de Edición/Creación
    isModalOpen &&
      e(
        "div",
        {
          className:
            "fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm",
        },
        e(
          "div",
          {
            "data-blendy-to": "product-modal-morph",
            className:
              "bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden",
          },
          e("div", { className: "w-full" }, [
            e(
              "div",
              {
                className:
                  "p-6 border-b dark:border-gray-700 border-gray-100 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50",
              },
              e(
                "h3",
                {
                  className:
                    "text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2",
                },
                e("i", {
                  className: `fas ${editingProduct ? "fa-edit" : "fa-plus-circle"} text-emerald-500`,
                }),
                editingProduct ? "Editar Producto" : "Nuevo Producto",
              ),
              e(
                "button",
                {
                  onClick: handleCloseModal,
                  className:
                    "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition",
                },
                e("i", { className: "fas fa-times" }),
              ),
            ),
            e(
              "form",
              { onSubmit: handleSave, className: "p-6 space-y-4" },
              // ID Field
              e(
                "div",
                null,
                e(
                  "label",
                  {
                    className:
                      "block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1",
                  },
                  "ID Único",
                ),
                e("input", {
                  type: "text",
                  value: formData.id,
                  disabled: !!editingProduct,
                  required: true,
                  onChange: (ev) =>
                    setFormData({ ...formData, id: ev.target.value }),
                  className:
                    "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50 transition-all",
                  placeholder: "p-001",
                }),
              ),
              // Name Field
              e(
                "div",
                null,
                e(
                  "label",
                  {
                    className:
                      "block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1",
                  },
                  "Nombre del Plato",
                ),
                e("input", {
                  type: "text",
                  value: formData.name,
                  required: true,
                  onChange: (ev) =>
                    setFormData({ ...formData, name: ev.target.value }),
                  className:
                    "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all",
                  placeholder: "Ej: Producto Especial",
                }),
              ),
              // Price
              e(
                "div",
                null,
                e(
                  "label",
                  {
                    className:
                      "block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1",
                  },
                  "Precio ($)",
                ),
                e("input", {
                  type: "number",
                  step: "0.01",
                  value: formData.price,
                  required: true,
                  onChange: (ev) =>
                    setFormData({ ...formData, price: ev.target.value }),
                  className:
                    "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all",
                }),
              ),
              // Stock Toggle + Field
              e(
                "div",
                { className: "space-y-3" },
                // Toggle Switch
                e(
                  "label",
                  {
                    className:
                      "flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 cursor-pointer hover:border-emerald-300 transition-all",
                  },
                  e(
                    "div",
                    { className: "flex flex-col" },
                    e(
                      "span",
                      {
                        className:
                          "text-sm font-semibold text-gray-700 dark:text-gray-200",
                      },
                      "🔒 Control de Stock",
                    ),
                    e(
                      "span",
                      {
                        className:
                          "text-[10px] text-gray-400 dark:text-gray-500",
                      },
                      formData.trackStock
                        ? "Se descuenta automáticamente al vender"
                        : "Venta ilimitada (sin control)",
                    ),
                  ),
                  e(
                    "div",
                    {
                      className: `relative w-11 h-6 rounded-full transition-colors duration-200 ${formData.trackStock ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`,
                      onClick: (ev) => {
                        ev.preventDefault();
                        setFormData({
                          ...formData,
                          trackStock: !formData.trackStock,
                        });
                      },
                    },
                    e("div", {
                      className: `absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${formData.trackStock ? "translate-x-5" : "translate-x-0.5"}`,
                    }),
                  ),
                ),
                // Stock input (solo visible si trackStock está activo)
                formData.trackStock &&
                  e(
                    "div",
                    null,
                    e(
                      "label",
                      {
                        className:
                          "block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1",
                      },
                      "Cantidad disponible",
                    ),
                    e("input", {
                      type: "number",
                      min: "0",
                      value: formData.stock,
                      onChange: (ev) =>
                        setFormData({ ...formData, stock: ev.target.value }),
                      className:
                        "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all",
                      placeholder: "0",
                    }),
                  ),
              ),
              // Category Select
              e(
                "div",
                null,
                e(
                  "label",
                  {
                    className:
                      "block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1",
                  },
                  "Categoría Principal",
                ),
                e(
                  "select",
                  {
                    value: formData.categoria,
                    required: true,
                    onChange: (ev) => {
                      const newCat = ev.target.value;
                      const updatedSec = (formData.categorias || []).filter(
                        (id) => String(id) !== String(newCat),
                      );
                      setFormData({
                        ...formData,
                        categoria: newCat,
                        categorias: updatedSec,
                      });
                    },
                    className:
                      "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all",
                  },
                  categorias.length > 0 &&
                    (() => {
                      const options = [];
                      const buildOptions = (parentId = null, level = 0) => {
                        categorias
                          .filter((c) => (c.padre?._id || c.padre) === parentId)
                          .forEach((c) => {
                            options.push(
                              e(
                                "option",
                                { key: c._id, value: c._id },
                                `${"— ".repeat(level)}${c.nombre}`,
                              ),
                            );
                            buildOptions(c._id, level + 1);
                          });
                      };
                      buildOptions();
                      return options;
                    })(),
                ),
                // Multi-categoría: También aparece en
                categorias.length > 1 &&
                  e(
                    "div",
                    { className: "mt-3" },
                    e(
                      "label",
                      {
                        className:
                          "block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1",
                      },
                      "También aparece en",
                    ),
                    e(
                      "div",
                      {
                        className:
                          "grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50",
                      },
                      categorias
                        .filter(
                          (c) => String(c._id) !== String(formData.categoria),
                        )
                        .map((c) => {
                          const isChecked =
                            Array.isArray(formData.categorias) &&
                            formData.categorias.some(
                              (id) => String(id) === String(c._id),
                            );
                          return e(
                            "label",
                            {
                              key: c._id,
                              className:
                                "flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none",
                            },
                            e("input", {
                              type: "checkbox",
                              checked: isChecked,
                              onChange: (ev) => {
                                const current = Array.isArray(
                                  formData.categorias,
                                )
                                  ? [...formData.categorias]
                                  : [];
                                if (ev.target.checked) {
                                  setFormData({
                                    ...formData,
                                    categorias: [...current, c._id],
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    categorias: current.filter(
                                      (id) => String(id) !== String(c._id),
                                    ),
                                  });
                                }
                              },
                              className:
                                "rounded border-gray-300 text-emerald-600 focus:ring-emerald-500",
                            }),
                            e("span", null, c.nombre),
                          );
                        }),
                    ),
                  ),
              ),
              // Description
              e(
                "div",
                null,
                e(
                  "label",
                  {
                    className:
                      "block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1",
                  },
                  "Descripción",
                ),
                e("textarea", {
                  value: formData.description,
                  onChange: (ev) =>
                    setFormData({ ...formData, description: ev.target.value }),
                  className:
                    "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none h-20 transition-all resize-none",
                  placeholder: "Ingredientes, tamaño...",
                }),
              ),
              // Sección de Imágenes del Producto
              e(
                "div",
                { className: "border-t border-gray-100 dark:border-gray-700 pt-4" },
                e(
                  "div",
                  { className: "flex justify-between items-center mb-2" },
                  e(
                    "label",
                    {
                      className:
                        "block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest",
                    },
                    `Fotos del Producto (${productImages.length}/5)`
                  ),
                  editingProduct && productImages.length < 5 &&
                    e(
                      "button",
                      {
                        type: "button",
                        onClick: () => fileInputRef.current?.click(),
                        disabled: uploadingImage,
                        className:
                          "text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold rounded-lg hover:bg-emerald-500/20 transition flex items-center gap-1",
                      },
                      e("i", { className: `fas ${uploadingImage ? "fa-spinner fa-spin" : "fa-upload"}` }),
                      uploadingImage ? "Subiendo..." : "Subir foto"
                    )
                ),
                !editingProduct
                  ? e(
                      "div",
                      {
                        className:
                          "p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-dashed border-gray-200 dark:border-gray-700 text-xs text-gray-400 text-center",
                      },
                      "💡 Guarda el producto para añadir fotos"
                    )
                  : e(
                      "div",
                      null,
                      e("input", {
                        type: "file",
                        ref: fileInputRef,
                        accept: "image/jpeg,image/png,image/webp",
                        onChange: handleUploadImage,
                        className: "hidden",
                      }),
                      productImages.length === 0
                        ? e(
                            "div",
                            {
                              className:
                                "p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-dashed border-gray-200 dark:border-gray-700 text-xs text-gray-400 text-center cursor-pointer hover:border-emerald-400 transition",
                              onClick: () => fileInputRef.current?.click(),
                            },
                            "📷 No hay fotos. Haz clic en 'Subir foto' para agregar (máx 5)."
                          )
                        : e(
                            "div",
                            { className: "grid grid-cols-5 gap-2 mt-2" },
                            productImages.map((img, idx) =>
                              e(
                                "div",
                                {
                                  key: img.publicId || idx,
                                  className:
                                    "relative group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 aspect-square bg-gray-100 dark:bg-gray-900",
                                },
                                e("img", {
                                  src: img.url,
                                  alt: `Foto ${idx + 1}`,
                                  className: "w-full h-full object-cover",
                                }),
                                idx === 0 &&
                                  e(
                                    "span",
                                    {
                                      className:
                                        "absolute top-1 left-1 bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow",
                                    },
                                    "Principal"
                                  ),
                                e(
                                  "div",
                                  {
                                    className:
                                      "absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1",
                                  },
                                  idx > 0 &&
                                    e(
                                      "button",
                                      {
                                        type: "button",
                                        title: "Marcar como principal",
                                        onClick: () => handleSetPrimaryImage(idx),
                                        className:
                                          "p-1 bg-emerald-600 text-white rounded text-[10px] hover:bg-emerald-700 w-full font-bold",
                                      },
                                      "⭐ Principal"
                                    ),
                                  e(
                                    "button",
                                    {
                                      type: "button",
                                      title: "Eliminar foto",
                                      onClick: () => handleDeleteImage(idx),
                                      className:
                                        "p-1 bg-red-600 text-white rounded text-[10px] hover:bg-red-700 w-full font-bold",
                                    },
                                    "🗑️ Borrar"
                                  )
                                )
                              )
                            )
                          )
                    )
              ),
              // Footer Buttons
              e(
                "div",
                { className: "pt-4 flex gap-3" },
                e(
                  "button",
                  {
                    type: "button",
                    onClick: handleCloseModal,
                    className:
                      "flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition font-bold text-sm",
                  },
                  "Cancelar",
                ),
                e(
                  "button",
                  {
                    type: "submit",
                    className:
                      "flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition font-bold text-sm active:scale-[0.98]",
                  },
                  "Guardar Cambios",
                ),
              ),
            ),
          ]),
        ),
      ),

    // Vista de Tarjetas (Mobile)
    e(
      "div",
      { className: "lg:hidden space-y-4" },
      products.length > 0
        ? products.map((p) =>
            e(
              "div",
              {
                key: p.id,
                className:
                  "bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700",
              },
              e(
                "div",
                { className: "flex justify-between items-start mb-3" },
                e(
                  "div",
                  { className: "flex items-center gap-3" },
                  p.imagenes && p.imagenes.length > 0 && p.imagenes[0].url
                    ? e("img", {
                        src: p.imagenes[0].url,
                        alt: p.name,
                        className:
                          "w-12 h-12 object-cover rounded-xl border border-gray-100 dark:border-gray-700",
                      })
                    : e(
                        "span",
                        {
                          className:
                            "text-2xl bg-gray-50 dark:bg-gray-900 w-12 h-12 flex items-center justify-center rounded-xl",
                        },
                        p.emoji,
                      ),
                  e(
                    "div",
                    null,
                    e(
                      "h4",
                      {
                        className: "font-bold text-gray-800 dark:text-gray-100",
                      },
                      p.name,
                    ),
                    e(
                      "p",
                      {
                        className:
                          "text-[10px] font-black text-gray-400 uppercase",
                      },
                      `SKU: ${p.id}`,
                    ),
                  ),
                ),
                e(
                  "span",
                  {
                    className:
                      "px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-[10px] font-black uppercase border border-emerald-100 dark:border-emerald-500/20",
                  },
                  p.categoria?.nombre || "General",
                ),
              ),
              e(
                "div",
                {
                  className:
                    "grid grid-cols-2 gap-4 py-3 border-y border-gray-50 dark:border-gray-700 mb-4",
                },
                e(
                  "div",
                  null,
                  e(
                    "p",
                    {
                      className:
                        "text-[10px] text-gray-400 uppercase font-black",
                    },
                    "Precio USD",
                  ),
                  e(
                    "p",
                    {
                      className:
                        "font-bold text-emerald-600 dark:text-emerald-400",
                    },
                    `$${Number(p.price).toFixed(2)}`,
                  ),
                ),
                bcvRate > 0 &&
                  e(
                    "div",
                    null,
                    e(
                      "p",
                      {
                        className:
                          "text-[10px] text-gray-400 uppercase font-black",
                      },
                      "Precio VES",
                    ),
                    e(
                      "p",
                      {
                        className: "font-bold text-gray-700 dark:text-gray-200",
                      },
                      `Bs. ${(p.price * bcvRate).toLocaleString("es-VE", { minimumFractionDigits: 2 })}`,
                    ),
                  ),
                e(
                  "div",
                  null,
                  e(
                    "p",
                    {
                      className:
                        "text-[10px] text-gray-400 uppercase font-black",
                    },
                    "Stock",
                  ),
                  e(
                    "p",
                    { className: "text-xs font-bold text-blue-500" },
                    p.trackStock
                      ? p.stock > 0
                        ? `📦 ${p.stock} disponibles`
                        : `⚠️ Agotado`
                      : "♾️ Ilimitado",
                  ),
                ),
                e(
                  "div",
                  null,
                  e(
                    "p",
                    {
                      className:
                        "text-[10px] text-gray-400 uppercase font-black",
                    },
                    "Estado",
                  ),
                  e(
                    "p",
                    { className: "text-xs font-bold text-blue-500" },
                    p.activo !== false ? "✅ Activo" : "❌ Inactivo",
                  ),
                ),
              ),
              e(
                "div",
                { className: "flex gap-2" },
                e(
                  "button",
                  {
                    onClick: () => handleOpenModal(p),
                    className:
                      "flex-1 h-11 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center gap-2 font-bold text-sm active:scale-95 transition-all",
                  },
                  e("i", { className: "fas fa-edit" }),
                  "Editar",
                ),
                e(
                  "button",
                  {
                    onClick: () => handleDelete(p.id),
                    className:
                      "w-11 h-11 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl flex items-center justify-center active:scale-95 transition-all",
                  },
                  e("i", { className: "fas fa-trash-alt" }),
                ),
              ),
            ),
          )
        : e(
            "div",
            { className: "text-center py-10 text-gray-400" },
            "No hay productos",
          ),
    ),

    // Tabla de Productos (Desktop)
    e(
      "div",
      {
        className:
          "hidden lg:block bg-white dark:bg-gray-800 rounded-2xl shadow-xl border dark:border-gray-700 overflow-x-auto",
      },
      e(
        "table",
        { className: "w-full text-left border-collapse min-w-[800px]" },
        e(
          "thead",
          {
            className:
              "bg-gray-50 dark:bg-gray-700/50 text-[10px] uppercase text-gray-500 dark:text-gray-400 font-black tracking-widest",
          },
          e(
            "tr",
            null,
            e(
              "th",
              {
                onClick: toggleSort,
                className:
                  "px-6 py-4 cursor-pointer hover:text-emerald-400 select-none transition-colors group",
              },
              e(
                "div",
                { className: "flex items-center gap-2" },
                "ID",
                e("i", {
                  className: `fas fa-sort${sortDirection === "asc" ? "-up" : "-down"} ${sortDirection ? "text-emerald-500" : "opacity-20"} transition-all`,
                }),
              ),
            ),
            e("th", { className: "px-6 py-4" }, "Nombre"),
            e("th", { className: "px-6 py-4" }, "Categoría"),
            e("th", { className: "px-6 py-4" }, "Precio ($)"),
            e("th", { className: "px-6 py-4" }, "Precio (Bs)"),
            e("th", { className: "px-6 py-4 text-center" }, "Stock"),
            e("th", { className: "px-6 py-4 text-center" }, "Acciones"),
          ),
        ),
        e(
          "tbody",
          { className: "divide-y divide-gray-100 dark:divide-gray-100" },
          products.length > 0
            ? products.map((p) =>
                e(
                  "tr",
                  {
                    key: p.id,
                    className:
                      "hover:bg-gray-50 dark:hover:bg-gray-700/30 transition group",
                  },
                  e(
                    "td",
                    {
                      className:
                        "px-6 py-4 font-black text-gray-400 dark:text-gray-500 text-xs",
                    },
                    p.id,
                  ),
                  e(
                    "td",
                    {
                      className:
                        "px-6 py-4 text-gray-800 dark:text-gray-100 font-medium",
                    },
                    p.imagenes && p.imagenes.length > 0 && p.imagenes[0].url
                      ? e("img", {
                          src: p.imagenes[0].url,
                          alt: p.name,
                          className:
                            "w-7 h-7 object-cover rounded-lg inline-block mr-3 align-middle border border-gray-100 dark:border-gray-700",
                        })
                      : e("span", { className: "mr-3 text-lg" }, p.emoji),
                    p.name,
                  ),
                  e(
                    "td",
                    { className: "px-6 py-4" },
                    e(
                      "span",
                      {
                        className:
                          "px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-tight border border-emerald-100 dark:border-emerald-500/20",
                      },
                      p.categoria?.nombre || "General",
                    ),
                  ),
                  e(
                    "td",
                    {
                      className:
                        "px-6 py-4 text-emerald-600 dark:text-emerald-400 font-bold",
                    },
                    `$${Number(p.price).toFixed(2)}`,
                  ),
                  e(
                    "td",
                    {
                      className:
                        "px-6 py-4 text-gray-700 dark:text-gray-200 font-bold",
                    },
                    bcvRate > 0
                      ? `Bs. ${(p.price * bcvRate).toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
                      : "Cargando...",
                  ),
                  e(
                    "td",
                    {
                      className:
                        "px-6 py-4 text-center font-bold text-gray-700 dark:text-gray-200",
                    },
                    p.trackStock
                      ? p.stock > 0
                        ? `${p.stock} uds`
                        : "⚠️ Agotado"
                      : "♾️",
                  ),
                  e(
                    "td",
                    { className: "px-6 py-4 text-center space-x-2" },
                    e(
                      "button",
                      {
                        onClick: () => handleOpenModal(p),
                        className:
                          "text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition",
                      },
                      e("i", { className: "fas fa-edit" }),
                    ),
                    e(
                      "button",
                      {
                        onClick: () => handleDelete(p.id),
                        className:
                          "text-red-500 hover:text-red-700 dark:hover:text-red-300 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition",
                      },
                      e("i", { className: "fas fa-trash-alt" }),
                    ),
                  ),
                ),
              )
            : e(
                "tr",
                null,
                e(
                  "td",
                  {
                    colSpan: 7,
                    className:
                      "px-6 py-12 text-center text-gray-400 dark:text-gray-600 italic",
                  },
                  e("i", {
                    className: "fas fa-box-open text-4xl mb-3 block opacity-20",
                  }),
                  "No hay productos que coincidan con la búsqueda.",
                ),
              ),
        ),
      ),
    ),

    // Confirm Modal
    e(ConfirmModal, {
      ...confirmConfig,
      onCancel: () => setConfirmConfig({ ...confirmConfig, isOpen: false }),
    }),
  );
};

export default ProductTab;
