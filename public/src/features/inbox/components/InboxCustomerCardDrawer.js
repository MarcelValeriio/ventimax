import { Icono } from "../../../components/Icono.js";
/**
 * public/src/features/inbox/components/InboxCustomerCardDrawer.js
 *
 * F1-4 · Ficha del Cliente del Inbox Unificado con gestión de Vehículo.
 * Reemplaza el drawer legacy en public/src/features/inbox/InboxConsole.js
 * sin tocar features/whatsapp/** ni features/instagram/** (regla 7).
 */
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js?v=6";

const e = React.createElement;

const LIMITES_VEHICULO = {
  marca: 60,
  modelo: 60,
  motor: 20,
  version: 40,
  anioMin: 1950,
  anioMax: 2100,
};

const InboxCustomerCardDrawer = ({
  isOpen,
  onClose,
  context,
  loading,
  onAssignDriver,
  onRefreshContext,
  canal = "whatsapp",
  usuarioId,
}) => {
  const [comprobanteModalOpen, setComprobanteModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [assigningDriver, setAssigningDriver] = useState(false);

  // Estados para gestión de vehículo del cliente (F1-4)
  const [vehiculoModalOpen, setVehiculoModalOpen] = useState(false);
  const [guardandoVehiculo, setGuardandoVehiculo] = useState(false);
  const [errorVehiculo, setErrorVehiculo] = useState("");
  const [vehiculoForm, setVehiculoForm] = useState({
    marca: "",
    modelo: "",
    anio: "",
    motor: "",
    version: "",
  });

  useEffect(() => {
    if (context?.pedidoActivo?.repartidor) {
      setSelectedDriver(context.pedidoActivo.repartidor);
    } else {
      setSelectedDriver("");
    }
  }, [context]);

  // Manejador de tecla Escape
  useEffect(() => {
    const handleKeyDown = (ev) => {
      if (ev.key === "Escape") {
        if (comprobanteModalOpen) {
          setComprobanteModalOpen(false);
          setZoomLevel(1);
        } else if (vehiculoModalOpen) {
          setVehiculoModalOpen(false);
          setErrorVehiculo("");
        } else if (isOpen) {
          onClose();
        }
      }
    };
    if (isOpen || comprobanteModalOpen || vehiculoModalOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, comprobanteModalOpen, vehiculoModalOpen, onClose]);

  if (!isOpen) return null;

  const data = context || {};
  const {
    customerName,
    telefono,
    cedula,
    direccion,
    totalCompras = 0,
    ltvUSD = 0,
    items = [],
    pasoActual = "inicio",
    totalUSD,
    totalBS,
    tasaBCV,
    pedidoActivo,
    repartidores = [],
    vehiculo,
  } = data;

  const targetUsuarioId = usuarioId || telefono || "";

  const handleAssignClick = async () => {
    if (!pedidoActivo?._id || !selectedDriver) return;
    try {
      setAssigningDriver(true);
      if (onAssignDriver) {
        await onAssignDriver(pedidoActivo._id, selectedDriver);
      }
    } finally {
      setAssigningDriver(false);
    }
  };

  const openGoogleMaps = () => {
    if (!direccion) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Abrir modal de edición/adición de vehículo
  const abrirModalVehiculo = (vExistente) => {
    setErrorVehiculo("");
    if (vExistente) {
      setVehiculoForm({
        marca: vExistente.marca || "",
        modelo: vExistente.modelo || "",
        anio: vExistente.anio !== null && vExistente.anio !== undefined ? String(vExistente.anio) : "",
        motor: vExistente.motor || "",
        version: vExistente.version || "",
      });
    } else {
      setVehiculoForm({
        marca: "",
        modelo: "",
        anio: "",
        motor: "",
        version: "",
      });
    }
    setVehiculoModalOpen(true);
  };

  // Guardar vehículo (POST /api/admin/inbox/vehiculo)
  const handleGuardarVehiculo = async (eEvent) => {
    if (eEvent && eEvent.preventDefault) eEvent.preventDefault();
    setErrorVehiculo("");

    const marcaTrim = (vehiculoForm.marca || "").trim();
    const modeloTrim = (vehiculoForm.modelo || "").trim();
    const anioRaw = (vehiculoForm.anio || "").trim();
    const motorTrim = (vehiculoForm.motor || "").trim();
    const versionTrim = (vehiculoForm.version || "").trim();

    if (marcaTrim.length > LIMITES_VEHICULO.marca) {
      setErrorVehiculo(`La marca no puede superar ${LIMITES_VEHICULO.marca} caracteres`);
      return;
    }
    if (modeloTrim.length > LIMITES_VEHICULO.modelo) {
      setErrorVehiculo(`El modelo no puede superar ${LIMITES_VEHICULO.modelo} caracteres`);
      return;
    }
    if (motorTrim.length > LIMITES_VEHICULO.motor) {
      setErrorVehiculo(`El motor no puede superar ${LIMITES_VEHICULO.motor} caracteres`);
      return;
    }
    if (versionTrim.length > LIMITES_VEHICULO.version) {
      setErrorVehiculo(`La versión no puede superar ${LIMITES_VEHICULO.version} caracteres`);
      return;
    }

    let anioNum = null;
    if (anioRaw) {
      const parsed = Number(anioRaw);
      if (!Number.isInteger(parsed) || parsed < LIMITES_VEHICULO.anioMin || parsed > LIMITES_VEHICULO.anioMax) {
        setErrorVehiculo(`El año debe ser un número entero entre ${LIMITES_VEHICULO.anioMin} y ${LIMITES_VEHICULO.anioMax}`);
        return;
      }
      anioNum = parsed;
    }

    try {
      setGuardandoVehiculo(true);
      const res = await apiClient.post("/api/admin/inbox/vehiculo", {
        canal,
        usuarioId: targetUsuarioId,
        vehiculo: {
          marca: marcaTrim,
          modelo: modeloTrim,
          anio: anioNum,
          motor: motorTrim,
          version: versionTrim,
        },
      });

      if (res.data && res.data.success) {
        window.showToast?.("Vehículo guardado correctamente");
        setVehiculoModalOpen(false);
        if (typeof onRefreshContext === "function") {
          onRefreshContext();
        }
      } else {
        setErrorVehiculo((res.data && res.data.error) || "Error al guardar el vehículo");
      }
    } catch (err) {
      const msg = (err.response && err.response.data && err.response.data.error) || "Error de red al guardar vehículo";
      setErrorVehiculo(msg);
    } finally {
      setGuardandoVehiculo(false);
    }
  };

  // Eliminar vehículo
  const handleBorrarVehiculo = async () => {
    if (!window.confirm("¿Seguro que deseas eliminar el vehículo de este cliente?")) {
      return;
    }
    try {
      setGuardandoVehiculo(true);
      const res = await apiClient.post("/api/admin/inbox/vehiculo", {
        canal,
        usuarioId: targetUsuarioId,
        vehiculo: null,
      });

      if (res.data && res.data.success) {
        window.showToast?.("Vehículo eliminado");
        if (typeof onRefreshContext === "function") {
          onRefreshContext();
        }
      } else {
        window.showToast?.((res.data && res.data.error) || "Error al eliminar vehículo", "error");
      }
    } catch (err) {
      const msg = (err.response && err.response.data && err.response.data.error) || "Error al eliminar vehículo";
      window.showToast?.(msg, "error");
    } finally {
      setGuardandoVehiculo(false);
    }
  };

  // Modal para agregar o editar vehículo (F1-4)
  const renderVehiculoModal = () => {
    if (!vehiculoModalOpen) return null;

    const inputClaseModal =
      "w-full bg-[#111b21] border border-[#2a3942] p-2.5 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none transition";

    return e(
      "div",
      {
        className: "fixed inset-0 z-[110] bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": vehiculo ? "Editar Vehículo" : "Agregar Vehículo",
        "data-testid": "modal-vehiculo",
        onClick: () => {
          if (!guardandoVehiculo) {
            setVehiculoModalOpen(false);
            setErrorVehiculo("");
          }
        },
      },
      e(
        "div",
        {
          className:
            "bg-[#202c33] border border-[#2a3942] rounded-xl max-w-md w-full p-5 text-[#e9edef] shadow-2xl space-y-4 animate-scale-up",
          onClick: (ev) => ev.stopPropagation(),
        },
        [
          e("div", { key: "modal-header", className: "flex justify-between items-center border-b border-[#2a3942] pb-3" }, [
            e("div", { className: "flex items-center gap-2" }, [
              e(Icono, { nombre: "truck", className: "text-[#00a884] text-lg" }),
              e(
                "h3",
                { className: "font-black text-sm text-[#e9edef]" },
                vehiculo ? "Editar Vehículo del Cliente" : "Agregar Vehículo del Cliente",
              ),
            ]),
            e(
              "button",
              {
                type: "button",
                onClick: () => {
                  setVehiculoModalOpen(false);
                  setErrorVehiculo("");
                },
                className:
                  "min-h-[44px] min-w-[44px] flex items-center justify-center text-[#8696a0] hover:text-[#e9edef] rounded-lg transition",
                title: "Cerrar",
                "aria-label": "Cerrar modal de vehículo",
              },
              e(Icono, { nombre: "x", className: "text-base" }),
            ),
          ]),

          errorVehiculo &&
            e(
              "div",
              {
                key: "error-box",
                className: "bg-red-500/15 border border-red-500/40 text-red-200 text-xs p-2.5 rounded-lg font-medium",
              },
              errorVehiculo,
            ),

          e(
            "form",
            {
              key: "modal-form",
              onSubmit: handleGuardarVehiculo,
              className: "space-y-3",
            },
            [
              e("div", { className: "grid grid-cols-2 gap-3" }, [
                e("div", null, [
                  e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Marca"),
                  e("input", {
                    type: "text",
                    maxLength: LIMITES_VEHICULO.marca,
                    value: vehiculoForm.marca,
                    onChange: (ev) => setVehiculoForm((p) => ({ ...p, marca: ev.target.value })),
                    placeholder: "Ej: Toyota",
                    className: inputClaseModal,
                    "aria-label": "Marca del vehículo",
                    "data-testid": "input-vehiculo-marca",
                  }),
                ]),
                e("div", null, [
                  e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Modelo"),
                  e("input", {
                    type: "text",
                    maxLength: LIMITES_VEHICULO.modelo,
                    value: vehiculoForm.modelo,
                    onChange: (ev) => setVehiculoForm((p) => ({ ...p, modelo: ev.target.value })),
                    placeholder: "Ej: Corolla",
                    className: inputClaseModal,
                    "aria-label": "Modelo del vehículo",
                    "data-testid": "input-vehiculo-modelo",
                  }),
                ]),
              ]),

              e("div", { className: "grid grid-cols-3 gap-3" }, [
                e("div", null, [
                  e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Año"),
                  e("input", {
                    type: "number",
                    min: LIMITES_VEHICULO.anioMin,
                    max: LIMITES_VEHICULO.anioMax,
                    value: vehiculoForm.anio,
                    onChange: (ev) => setVehiculoForm((p) => ({ ...p, anio: ev.target.value })),
                    placeholder: "2012",
                    className: inputClaseModal,
                    "aria-label": "Año del vehículo",
                    "data-testid": "input-vehiculo-anio",
                  }),
                ]),
                e("div", null, [
                  e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Motor"),
                  e("input", {
                    type: "text",
                    maxLength: LIMITES_VEHICULO.motor,
                    value: vehiculoForm.motor,
                    onChange: (ev) => setVehiculoForm((p) => ({ ...p, motor: ev.target.value })),
                    placeholder: "1.8",
                    className: inputClaseModal,
                    "aria-label": "Motor del vehículo",
                    "data-testid": "input-vehiculo-motor",
                  }),
                ]),
                e("div", null, [
                  e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Versión"),
                  e("input", {
                    type: "text",
                    maxLength: LIMITES_VEHICULO.version,
                    value: vehiculoForm.version,
                    onChange: (ev) => setVehiculoForm((p) => ({ ...p, version: ev.target.value })),
                    placeholder: "GLI",
                    className: inputClaseModal,
                    "aria-label": "Versión del vehículo",
                    "data-testid": "input-vehiculo-version",
                  }),
                ]),
              ]),

              e(
                "div",
                {
                  key: "modal-actions",
                  className: "pt-3 border-t border-[#2a3942] flex justify-end gap-2.5",
                },
                [
                  e(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        setVehiculoModalOpen(false);
                        setErrorVehiculo("");
                      },
                      disabled: guardandoVehiculo,
                      className:
                        "min-h-[44px] px-4 rounded-lg border border-[#2a3942] hover:bg-[#111b21] text-xs font-bold text-[#8696a0] hover:text-[#e9edef] transition disabled:opacity-50",
                    },
                    "Cancelar",
                  ),
                  e(
                    "button",
                    {
                      type: "submit",
                      "data-testid": "btn-guardar-vehiculo",
                      disabled: guardandoVehiculo,
                      className:
                        "min-h-[44px] px-5 rounded-lg bg-[#00a884] hover:bg-[#008069] text-[#111b21] text-xs font-black transition flex items-center justify-center gap-2 shadow-md disabled:opacity-50",
                    },
                    guardandoVehiculo
                      ? [
                          e(Icono, { key: "sp", nombre: "loader-circle", girar: true, className: "text-sm" }),
                          "Guardando...",
                        ]
                      : "Guardar Vehículo",
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  };

  // Render modal de comprobante con zoom
  const renderComprobanteModal = () => {
    if (!comprobanteModalOpen) return null;
    const mediaId = pedidoActivo?.comprobanteMediaId;
    const mediaUrl = pedidoActivo?.comprobanteUrl || (mediaId ? `/api/admin/media/${mediaId}` : null);

    return e(
      "div",
      {
        className: "fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md",
        onClick: () => {
          setComprobanteModalOpen(false);
          setZoomLevel(1);
        },
      },
      [
        e(
          "div",
          {
            className: "absolute top-4 right-4 flex items-center gap-3 z-10",
            onClick: (ev) => ev.stopPropagation(),
          },
          [
            e(
              "button",
              {
                onClick: () => setZoomLevel((z) => Math.min(z + 0.5, 3)),
                className:
                  "bg-white/20 hover:bg-white/30 text-white min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center transition shadow-lg",
                title: "Aumentar zoom",
                "aria-label": "Aumentar zoom",
              },
              e(Icono, { nombre: "zoom-in", className: "text-base" }),
            ),
            e(
              "button",
              {
                onClick: () => setZoomLevel((z) => Math.max(z - 0.5, 1)),
                className:
                  "bg-white/20 hover:bg-white/30 text-white min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center transition shadow-lg",
                title: "Reducir zoom",
                "aria-label": "Reducir zoom",
              },
              e(Icono, { nombre: "zoom-out", className: "text-base" }),
            ),
            e(
              "button",
              {
                onClick: () => {
                  setComprobanteModalOpen(false);
                  setZoomLevel(1);
                },
                className:
                  "bg-red-600 hover:bg-red-700 text-white min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center font-bold transition shadow-lg text-lg",
                title: "Cerrar visor",
                "aria-label": "Cerrar visor",
              },
              e(Icono, { nombre: "x" }),
            ),
          ],
        ),
        mediaUrl &&
          e(
            "div",
            {
              className: "overflow-auto max-h-[85vh] max-w-[90vw] flex items-center justify-center",
              onClick: (ev) => ev.stopPropagation(),
            },
            [
              e("img", {
                src: mediaUrl,
                alt: "Comprobante de pago",
                style: { transform: `scale(${zoomLevel})`, transition: "transform 0.2s ease-out" },
                className: "max-h-[80vh] max-w-[85vw] object-contain rounded-lg shadow-2xl",
              }),
            ],
          ),
      ],
    );
  };

  // Contenido interno de la ficha
  const drawerContent = e(
    "div",
    { className: "flex flex-col h-full bg-[#111b21] text-[#e9edef] overflow-y-auto" },
    [
      // Header Dark
      e(
        "div",
        {
          className:
            "p-3.5 bg-[#202c33] text-[#e9edef] flex justify-between items-center sticky top-0 z-10 border-b border-[#2a3942] shadow-md",
        },
        [
          e("div", { className: "flex items-center gap-2.5" }, [
            e(
              "div",
              {
                className:
                  "w-9 h-9 rounded-full bg-[#00a884] text-[#111b21] flex items-center justify-center font-black text-base shadow-sm shrink-0",
              },
              [e(Icono, { nombre: "id-card" })],
            ),
            e("div", { className: "min-w-0" }, [
              e("h3", { className: "font-black text-sm tracking-tight text-[#e9edef] truncate" }, "Ficha del Cliente"),
              e("p", { className: "text-xs font-semibold text-[#00a884] truncate" }, telefono || targetUsuarioId || "---"),
            ]),
          ]),
          e("div", { className: "flex items-center gap-1.5" }, [
            onRefreshContext &&
              e(
                "button",
                {
                  onClick: onRefreshContext,
                  className:
                    "text-[#8696a0] hover:text-[#00a884] min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-[#111b21] transition text-xs",
                  title: "Refrescar datos",
                  "aria-label": "Refrescar datos",
                },
                e(Icono, { nombre: "refresh-cw" }),
              ),
            e(
              "button",
              {
                onClick: onClose,
                className:
                  "text-[#8696a0] hover:text-[#e9edef] min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-[#111b21] transition text-sm font-black",
                title: "Cerrar ficha",
                "aria-label": "Cerrar ficha",
              },
              e(Icono, { nombre: "x" }),
            ),
          ]),
        ],
      ),

      // Body Dark
      e("div", { className: "p-3.5 space-y-3 flex-1 text-sm" }, [
        loading &&
          e(
            "div",
            {
              className:
                "flex items-center justify-center py-6 text-[#00a884] gap-2 text-xs font-bold bg-[#202c33] rounded-xl border border-[#2a3942]",
            },
            [
              e(Icono, { nombre: "loader-circle", girar: true, className: "text-sm" }),
              " Cargando información...",
            ],
          ),

        // 1. SECCIÓN CLIENTE
        e("div", { className: "bg-[#202c33] p-3.5 rounded-xl border border-[#2a3942] shadow-sm space-y-2" }, [
          e(
            "h4",
            {
              className:
                "text-xs font-black text-[#00a884] uppercase tracking-wider flex items-center gap-1.5",
            },
            [e(Icono, { nombre: "user-check" }), "Datos del Cliente"],
          ),
          e("div", { className: "space-y-2 text-xs pt-1" }, [
            e(
              "div",
              { className: "flex justify-between items-center py-1 border-b border-[#2a3942]/60" },
              [
                e("span", { className: "text-[#8696a0] font-semibold" }, "Nombre:"),
                e(
                  "span",
                  { className: "font-black text-[#e9edef] text-right text-[13px] truncate max-w-[60%]" },
                  customerName || "Sin registrar",
                ),
              ],
            ),
            e(
              "div",
              { className: "flex justify-between items-center py-1 border-b border-[#2a3942]/60" },
              [
                e("span", { className: "text-[#8696a0] font-semibold" }, "Cédula:"),
                e("span", { className: "font-bold text-[#e9edef] text-right" }, cedula || "No registrada"),
              ],
            ),
            e("div", { className: "flex justify-between items-start py-1" }, [
              e("span", { className: "text-[#8696a0] font-semibold shrink-0" }, "Dirección:"),
              e(
                "span",
                { className: "font-semibold text-[#e9edef] text-right break-words pl-3 leading-tight" },
                direccion || "No registrada",
              ),
            ]),
            direccion &&
              e(
                "button",
                {
                  onClick: openGoogleMaps,
                  className:
                    "w-full mt-2 min-h-[44px] bg-[#00a884] hover:bg-[#008069] active:scale-[0.98] text-[#111b21] font-black text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition shadow-md",
                },
                [e(Icono, { nombre: "map", className: "text-sm" }), "Abrir en Google Maps"],
              ),
          ]),
        ]),

        // 2. SECCIÓN VEHÍCULO DEL CLIENTE (F1-4)
        e(
          "div",
          {
            className: "bg-[#202c33] p-3.5 rounded-xl border border-[#2a3942] shadow-sm space-y-2.5",
            "data-testid": "seccion-vehiculo-cliente",
          },
          [
            e("div", { className: "flex justify-between items-center" }, [
              e(
                "h4",
                {
                  className:
                    "text-xs font-black text-[#00a884] uppercase tracking-wider flex items-center gap-1.5",
                },
                [e(Icono, { nombre: "truck", className: "text-[#00a884]" }), "Vehículo del Cliente"],
              ),
              vehiculo
                ? e("div", { className: "flex items-center gap-1" }, [
                    e(
                      "button",
                      {
                        type: "button",
                        onClick: () => abrirModalVehiculo(vehiculo),
                        className:
                          "min-h-[44px] min-w-[44px] flex items-center justify-center text-[#8696a0] hover:text-[#00a884] transition rounded-lg",
                        title: "Editar vehículo",
                        "aria-label": "Editar vehículo",
                      },
                      e(Icono, { nombre: "square-pen", className: "text-sm" }),
                    ),
                    e(
                      "button",
                      {
                        type: "button",
                        onClick: handleBorrarVehiculo,
                        disabled: guardandoVehiculo,
                        className:
                          "min-h-[44px] min-w-[44px] flex items-center justify-center text-[#8696a0] hover:text-red-400 transition rounded-lg disabled:opacity-40",
                        title: "Eliminar vehículo",
                        "aria-label": "Eliminar vehículo",
                      },
                      e(Icono, { nombre: "trash", className: "text-sm" }),
                    ),
                  ])
                : null,
            ]),

            vehiculo && (vehiculo.marca || vehiculo.modelo)
              ? e("div", { className: "space-y-1.5 text-xs pt-1" }, [
                  e(
                    "div",
                    { className: "flex justify-between items-center py-1 border-b border-[#2a3942]/60" },
                    [
                      e("span", { className: "text-[#8696a0] font-semibold" }, "Vehículo:"),
                      e(
                        "span",
                        { className: "font-black text-[#e9edef] text-right text-[13px]" },
                        `${vehiculo.marca || ""} ${vehiculo.modelo || ""}`.trim(),
                      ),
                    ],
                  ),
                  vehiculo.anio
                    ? e(
                        "div",
                        { className: "flex justify-between items-center py-1 border-b border-[#2a3942]/60" },
                        [
                          e("span", { className: "text-[#8696a0] font-semibold" }, "Año:"),
                          e("span", { className: "font-bold text-[#e9edef] text-right" }, String(vehiculo.anio)),
                        ],
                      )
                    : null,
                  vehiculo.motor
                    ? e(
                        "div",
                        { className: "flex justify-between items-center py-1 border-b border-[#2a3942]/60" },
                        [
                          e("span", { className: "text-[#8696a0] font-semibold" }, "Motor:"),
                          e("span", { className: "font-bold text-[#e9edef] text-right" }, vehiculo.motor),
                        ],
                      )
                    : null,
                  vehiculo.version
                    ? e("div", { className: "flex justify-between items-center py-1" }, [
                        e("span", { className: "text-[#8696a0] font-semibold" }, "Versión:"),
                        e("span", { className: "font-bold text-[#e9edef] text-right" }, vehiculo.version),
                      ])
                    : null,
                ])
              : e("div", { className: "pt-1" }, [
                  e(
                    "button",
                    {
                      type: "button",
                      onClick: () => abrirModalVehiculo(null),
                      className:
                        "w-full min-h-[44px] bg-[#111b21] hover:bg-[#2a3942] border border-[#2a3942] hover:border-[#00a884] text-[#00a884] font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition active:scale-[0.98]",
                      "aria-label": "Agregar Vehículo",
                      "data-testid": "btn-agregar-vehiculo",
                    },
                    [e(Icono, { nombre: "plus", className: "text-sm" }), "Agregar Vehículo"],
                  ),
                ]),
          ],
        ),

        // 3. SECCIÓN HISTORIAL DE COMPRAS
        e("div", { className: "bg-[#202c33] p-3.5 rounded-xl border border-[#2a3942] shadow-sm space-y-2.5" }, [
          e(
            "h4",
            {
              className:
                "text-xs font-black text-[#00a884] uppercase tracking-wider flex items-center gap-1.5",
            },
            [e(Icono, { nombre: "chart-pie" }), "Historial de Compras"],
          ),
          e("div", { className: "grid grid-cols-2 gap-2.5" }, [
            e(
              "div",
              {
                className: "bg-[#111b21] p-3 rounded-xl text-center border border-[#2a3942] shadow-inner",
              },
              [
                e(
                  "p",
                  { className: "text-[10px] text-[#8696a0] font-black uppercase tracking-wider" },
                  "Compras",
                ),
                e("p", { className: "text-xl font-black text-[#e9edef] mt-0.5 tracking-tight" }, totalCompras),
              ],
            ),
            e(
              "div",
              {
                className: "bg-[#111b21] p-3 rounded-xl text-center border border-[#2a3942] shadow-inner",
              },
              [
                e(
                  "p",
                  { className: "text-[10px] text-[#8696a0] font-black uppercase tracking-wider" },
                  "Total Gastado",
                ),
                e(
                  "p",
                  { className: "text-xl font-black text-[#00a884] mt-0.5 tracking-tight" },
                  `$${Number(ltvUSD).toFixed(2)}`,
                ),
              ],
            ),
          ]),
        ]),

        // 4. SECCIÓN CARRITO EN VIVO
        e("div", { className: "bg-[#202c33] p-3.5 rounded-xl border border-[#2a3942] shadow-sm space-y-2.5" }, [
          e("div", { className: "flex justify-between items-center" }, [
            e(
              "h4",
              {
                className:
                  "text-xs font-black text-[#00a884] uppercase tracking-wider flex items-center gap-1.5",
              },
              [e(Icono, { nombre: "shopping-basket", className: "text-amber-400" }), "Carrito en Vivo"],
            ),
            pasoActual &&
              e(
                "span",
                {
                  className:
                    "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-tight",
                },
                pasoActual.replace("_", " "),
              ),
          ]),
          items.length === 0
            ? e(
                "p",
                {
                  className:
                    "text-xs text-[#8696a0] font-semibold italic text-center py-3 bg-[#111b21] rounded-lg border border-[#2a3942]",
                },
                "Carrito vacío actualmente",
              )
            : e("div", { className: "space-y-1.5" }, [
                ...items.map((it, idx) =>
                  e(
                    "div",
                    {
                      key: `cart-item-${idx}`,
                      className:
                        "flex justify-between items-center text-xs py-1.5 border-b border-[#2a3942]/60 last:border-0",
                    },
                    [
                      e(
                        "span",
                        { className: "text-[#e9edef] font-bold truncate max-w-[70%]" },
                        `${it.producto || it.name || "Producto"} x${it.cantidad || 1}`,
                      ),
                      e(
                        "span",
                        { className: "font-black text-[#e9edef] text-right" },
                        `$${((Number(it.price) || 0) * (Number(it.cantidad) || 1)).toFixed(2)}`,
                      ),
                    ],
                  ),
                ),
                e(
                  "div",
                  { className: "pt-2.5 mt-1 border-t border-[#2a3942] flex justify-between items-end" },
                  [
                    e("div", null, [
                      e(
                        "p",
                        { className: "text-[11px] text-[#8696a0] font-bold" },
                        tasaBCV ? `Tasa BCV: Bs. ${Number(tasaBCV).toFixed(2)}` : "",
                      ),
                      totalBS && e("p", { className: "text-xs font-black text-[#e9edef]" }, `Bs. ${totalBS}`),
                    ]),
                    e(
                      "div",
                      {
                        className: "text-right bg-[#00a884]/15 px-2.5 py-1 rounded-lg border border-[#00a884]/40",
                      },
                      [
                        e("span", { className: "text-xs text-[#00a884] font-bold mr-1" }, "Total:"),
                        e(
                          "span",
                          { className: "text-base font-black text-[#00a884]" },
                          totalUSD != null ? `$${Number(totalUSD).toFixed(2)}` : "---",
                        ),
                      ],
                    ),
                  ],
                ),
              ]),
        ]),

        // 5. ACCIONES RÁPIDAS DEL PEDIDO ACTIVO
        pedidoActivo &&
          e("div", { className: "bg-[#202c33] p-3.5 rounded-xl border border-[#2a3942] shadow-sm space-y-3" }, [
            e("div", { className: "flex justify-between items-center" }, [
              e(
                "h4",
                {
                  className:
                    "text-xs font-black text-[#00a884] uppercase tracking-wider flex items-center gap-1.5",
                },
                [e(Icono, { nombre: "zap", className: "text-indigo-400" }), `Pedido ${pedidoActivo.idFormateado}`],
              ),
              e(
                "span",
                {
                  className:
                    "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 uppercase tracking-tight",
                },
                pedidoActivo.estado,
              ),
            ]),

            // Botón Ver Comprobante
            (pedidoActivo.comprobanteMediaId || pedidoActivo.comprobanteUrl) &&
              e(
                "button",
                {
                  onClick: () => {
                    setZoomLevel(1);
                    setComprobanteModalOpen(true);
                  },
                  className:
                    "w-full min-h-[44px] bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-black text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition shadow-md",
                },
                [e(Icono, { nombre: "receipt", className: "text-sm" }), "Ver Comprobante con Zoom"],
              ),

            // Selector y Asignación de Repartidor
            e("div", { className: "pt-2 border-t border-[#2a3942]/60" }, [
              e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Asignar Repartidor:"),
              e("div", { className: "flex gap-1.5" }, [
                e(
                  "select",
                  {
                    value: selectedDriver,
                    onChange: (ev) => setSelectedDriver(ev.target.value),
                    className:
                      "flex-1 bg-[#111b21] border border-[#2a3942] rounded-lg px-2.5 py-1.5 text-xs text-[#e9edef] font-bold outline-none focus:border-[#00a884]",
                  },
                  [
                    e("option", { value: "" }, "-- Sin asignar --"),
                    ...repartidores.map((rep) =>
                      e(
                        "option",
                        { key: rep._id, value: rep.username || rep.nombre },
                        `${rep.nombre} (@${rep.username})`,
                      ),
                    ),
                  ],
                ),
                e(
                  "button",
                  {
                    onClick: handleAssignClick,
                    disabled:
                      assigningDriver || !selectedDriver || selectedDriver === pedidoActivo.repartidor,
                    className:
                      "bg-[#00a884] hover:bg-[#008069] disabled:opacity-40 text-[#111b21] font-black text-xs px-3.5 py-1.5 rounded-lg transition shrink-0 shadow-sm min-h-[36px]",
                  },
                  assigningDriver ? e(Icono, { nombre: "loader-circle", girar: true }) : "Guardar",
                ),
              ]),
              pedidoActivo.repartidor &&
                e(
                  "p",
                  {
                    className:
                      "text-xs font-bold text-[#00a884] mt-1.5 flex items-center gap-1.5 bg-[#00a884]/15 px-2 py-1 rounded-md border border-[#00a884]/30",
                  },
                  [e(Icono, { nombre: "motorbike" }), `Asignado a: @${pedidoActivo.repartidor}`],
                ),
            ]),
          ]),
      ]),
    ],
  );

  return e(React.Fragment, null, [
    // 1. Vista Escritorio (Drawer Lateral Derecho)
    e(
      "div",
      {
        className:
          "hidden md:flex flex-col w-80 lg:w-96 border-l border-[#2a3942] bg-[#111b21] text-[#e9edef] h-full shadow-2xl z-20 shrink-0 transition-all duration-300 ease-in-out",
      },
      drawerContent,
    ),

    // 2. Vista Móvil (Bottom Sheet Overlay)
    e(
      "div",
      {
        className:
          "md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-xs transition-opacity duration-300",
        onClick: onClose,
      },
      [
        e(
          "div",
          {
            className:
              "bg-[#111b21] text-[#e9edef] rounded-t-2xl max-h-[88vh] shadow-2xl flex flex-col overflow-hidden animate-slide-up border-t border-[#2a3942]",
            onClick: (ev) => ev.stopPropagation(),
          },
          [
            // Handle barra táctil
            e("div", { className: "w-12 h-1.5 bg-[#2a3942] rounded-full mx-auto my-2 shrink-0" }),
            drawerContent,
          ],
        ),
      ],
    ),

    // 3. Modal de Zoom de Comprobante
    renderComprobanteModal(),

    // 4. Modal de Edición de Vehículo (F1-4)
    renderVehiculoModal(),
  ]);
};

export default InboxCustomerCardDrawer;
