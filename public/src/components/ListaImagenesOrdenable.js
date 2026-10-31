/**
 * public/src/components/ListaImagenesOrdenable.js
 * Cuadrícula de fotos que se reordena arrastrando (HTML5 drag & drop) o con las flechas de cada miniatura
 * (celular, teclado). Reutilizada por el formulario de producto (ProductTab, ProductTable) y el banner lateral.
 *
 * No guarda nada: al soltar o pulsar una flecha llama a `onReordenar(orden)`, donde `orden[i]` es el índice
 * ACTUAL de la imagen que pasa a la posición i (la posición 0 es la principal). Si la promesa falla, muestra el
 * mensaje del servidor tal cual y la lista no cambia (no hay cambio optimista). Lo que el padre haga con la
 * respuesta (actualizar estado) es su responsabilidad.
 */
import React, { useState } from "https://cdn.skypack.dev/react";
import { Icono } from "./Icono.js";

const e = React.createElement;

/** Nuevo orden al mover la imagen de `desde` a `hasta` (orden[i] = índice actual que pasa a i). */
export const calcularOrden = (total, desde, hasta) => {
  const orden = Array.from({ length: total }, (_, i) => i);
  const [movido] = orden.splice(desde, 1);
  orden.splice(hasta, 0, movido);
  return orden;
};

export function ListaImagenesOrdenable({
  imagenes,
  onReordenar,
  alt = (idx) => `Imagen ${idx + 1}`,
  className = "grid grid-cols-5 gap-2",
  aspecto = "1 / 1",
  mostrarFlechas = false,
  renderSuperpuesto,
  renderDebajo,
}) {
  const [arrastrando, setArrastrando] = useState(null);
  const [destino, setDestino] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const total = imagenes.length;

  const limpiar = () => {
    setArrastrando(null);
    setDestino(null);
  };

  const mover = async (desde, hasta) => {
    if (ocupado || desde === hasta || hasta < 0 || hasta >= total) return;
    setOcupado(true);
    try {
      await onReordenar(calcularOrden(total, desde, hasta));
    } catch (err) {
      const msg =
        err?.response?.data?.error || err?.response?.data?.message || err?.message || "No se pudo cambiar el orden";
      window.showToast?.(msg, "error");
    } finally {
      setOcupado(false);
    }
  };

  const onDragStart = (idx) => (ev) => {
    if (ocupado) {
      ev.preventDefault();
      return;
    }
    setArrastrando(idx);
    ev.dataTransfer.effectAllowed = "move";
    // Firefox no inicia el arrastre sin datos
    ev.dataTransfer.setData("text/plain", String(idx));
  };

  const onDragOver = (idx) => (ev) => {
    // Solo aceptamos las miniaturas de esta lista (no archivos arrastrados desde el escritorio)
    if (arrastrando === null) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    if (destino !== idx) setDestino(idx);
  };

  const onDrop = (idx) => (ev) => {
    ev.preventDefault();
    const desde = arrastrando;
    limpiar();
    if (desde !== null) mover(desde, idx);
  };

  const flecha = (idx, sentido) => {
    const hasta = idx + sentido;
    const izquierda = sentido < 0;
    return e(
      "button",
      {
        type: "button",
        "aria-label": izquierda ? "Mover a la izquierda" : "Mover a la derecha",
        title: izquierda ? "Mover a la izquierda" : "Mover a la derecha",
        disabled: ocupado || hasta < 0 || hasta >= total,
        onClick: () => mover(idx, hasta),
        onDragStart: (ev) => ev.preventDefault(),
        className:
          "p-1 rounded-md bg-white/95 text-gray-800 shadow hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition",
      },
      e(Icono, { nombre: izquierda ? "arrow-left" : "arrow-right", className: "text-sm" })
    );
  };

  const tile = (img, idx) =>
    e(
      "div",
      { key: `${idx}-${img.url || ""}`, className: "space-y-2 rounded-xl" + (destino === idx && arrastrando !== idx ? " ring-2 ring-emerald-500 ring-offset-2" : ""), onDragOver: onDragOver(idx), onDrop: onDrop(idx) },
      e(
        "div",
        {
          draggable: !ocupado,
          onDragStart: onDragStart(idx),
          onDragEnd: limpiar,
          title: "Arrastra para cambiar el orden",
          className:
            "group relative w-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 cursor-grab active:cursor-grabbing transition-opacity" +
            (arrastrando === idx ? " opacity-40" : ""),
          style: { aspectRatio: aspecto },
        },
        e("img", {
          src: img.url,
          alt: alt(idx),
          draggable: false,
          loading: "lazy",
          className: "w-full h-full object-cover pointer-events-none",
        }),
        idx === 0 &&
          e(
            "span",
            { className: "absolute top-1 left-1 z-10 bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow" },
            "Principal"
          ),
        renderSuperpuesto ? renderSuperpuesto(img, idx) : null,
        mostrarFlechas
          ? e(
              "div",
              { className: "absolute bottom-1 inset-x-1 z-20 flex justify-between gap-1" },
              flecha(idx, -1),
              flecha(idx, 1)
            )
          : null
      ),
      renderDebajo ? renderDebajo(img, idx) : null
    );

  return e(
    React.Fragment,
    null,
    total > 1 &&
      e("p", { className: "text-[11px] text-gray-400 mt-2 flex items-center gap-1" }, "Arrastra para cambiar el orden"),
    e("div", { className, "aria-busy": ocupado ? "true" : "false" }, imagenes.map(tile))
  );
}

export default ListaImagenesOrdenable;
