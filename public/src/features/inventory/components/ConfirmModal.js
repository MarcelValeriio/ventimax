/**
 * public/src/features/inventory/components/ConfirmModal.js
 * Componente de confirmación estilado para acciones destructivas
 */
import React from "https://cdn.skypack.dev/react";

const e = React.createElement;

const ConfirmModal = ({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = "Confirmar", 
  cancelText = "Cancelar", 
  isDanger = true 
}) => {
  if (!isOpen) return null;

  return e("div", { 
    className: "fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4 backdrop-blur-sm animate-in fade-in duration-200" 
  },
    e("div", { 
      className: "bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700" 
    },
      e("div", { className: "p-6 text-center" },
        e("div", { 
          className: `w-16 h-16 rounded-full mx-auto ${isDanger ? 'bg-red-50 dark:bg-red-900/20 text-red-500' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500'} flex items-center justify-center mb-5 text-2xl shadow-inner` 
        },
          e("i", { className: `fas ${isDanger ? 'fa-trash-alt' : 'fa-check-circle'}` })
        ),
        e("h3", { className: "text-xl font-bold text-gray-800 dark:text-gray-100 mb-2" }, title),
        e("p", { className: "text-sm text-gray-500 dark:text-gray-400 leading-relaxed" }, message)
      ),
      e("div", { className: "p-4 bg-gray-50/50 dark:bg-gray-900/20 flex gap-3 border-t dark:border-gray-700/50" },
        e("button", { 
          onClick: onCancel,
          className: "flex-1 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition active:scale-95"
        }, cancelText),
        e("button", { 
          onClick: () => {
            onConfirm();
            onCancel();
          },
          className: `flex-1 py-3 rounded-xl text-sm font-bold text-white shadow-lg transition active:scale-95 ${isDanger ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'}`
        }, confirmText)
      )
    )
  );
};

export default ConfirmModal;
