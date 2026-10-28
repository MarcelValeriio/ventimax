/**
 * public/src/services/apiClient.js
 * Cliente Axios Centralizado con Seguridad JWT y Gestión de Sesión.
 */
import axios from 'https://cdn.skypack.dev/axios';

const apiClient = axios.create({
  baseURL: '/', // Apunta a la raíz donde reside la API
  withCredentials: true, // REGLA DE ORO: Envío de cookies HttpOnly
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  },
});

/**
 * Interceptor de Respuesta Global:
 * Detecta fallos de autenticación y fuerza el re-login.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Si el backend devuelve 401 (No autorizado) -> El token no existe o expiró
    if (error.response && error.response.status === 401) {
      console.warn("🔒 Sesión expirada. Redirigiendo a login...");
      window.location.href = '/login';
    }
    
    // Si es 403 (Prohibido) -> El usuario tiene sesión pero no tiene permiso
    // NO redirigimos aquí para evitar bucles infinitos
    if (error.response && error.response.status === 403) {
      console.error("🚫 No tienes permisos para esta acción.");
      window.showToast?.("No tienes permisos para realizar esta acción", "error");
    }

    return Promise.reject(error);
  }
);

/**
 * Métricas y CRM v2.0
 */
export const getTopProducts = async (params = {}) => {
  const { filtroFecha, fechaInicio, fechaFin } = params;
  const res = await apiClient.get("/api/admin/metrics/top-products", {
    params: { filtroFecha, fechaInicio, fechaFin }
  });
  return res.data;
};

export const getCustomerCRM = async (telefono) => {
  if (!telefono) return null;
  const cleanPhone = encodeURIComponent(telefono.toString().trim());
  const res = await apiClient.get(`/api/admin/crm/customer/${cleanPhone}`);
  return res.data;
};

apiClient.getTopProducts = getTopProducts;
apiClient.getCustomerCRM = getCustomerCRM;

export default apiClient;
