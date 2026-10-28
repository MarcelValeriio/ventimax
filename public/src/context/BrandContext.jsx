/**
 * public/src/context/BrandContext.jsx
 * Orquestador de la Identidad Visual y Configuración Whitelabel.
 */
import React, { createContext, useContext, useEffect, useState } from 'https://cdn.skypack.dev/react';
import apiClient from '../services/apiClient.js';

const BrandContext = createContext();

export const BrandProvider = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  useEffect(() => {
    const initBrand = async () => {
      try {
        const { data } = await apiClient.get('/api/config');
        const { settings } = data;

        // 1. Inyección de Variables CSS dinámicas en :root
        if (settings?.theme) {
          const root = document.documentElement;
          root.style.setProperty('--primary-color', settings.theme.primaryColor);
          root.style.setProperty('--secondary-color', settings.theme.secondaryColor);
          root.style.setProperty('--primary-light', `${settings.theme.primaryColor}22`); // 15% opacidad
        }

        // 2. SEO / Identidad de Pestaña Whitelabel
        const brandName = settings?.brandName || data.brandName || 'Panel';
        document.title = `${brandName} | Dashboard`;

        // 3. Favicon dinámico
        if (settings?.theme?.logoUrl) {
          const favicon = document.querySelector("link[rel~='icon']");
          if (favicon) favicon.href = settings.theme.logoUrl;
        }

        setConfig(data);
        setStatus('ready');
      } catch (error) {
        console.error("💥 Error cargando configuración de marca:", error);
        setStatus('error');
      }
    };

    initBrand();
  }, []);

  // UX Emocional: Renderizado de Skeleton/Loading limpio
  if (status === 'loading') {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: '#f9fafb'
      }}>
        <div className="spinner" style={{ 
          width: '40px', 
          height: '40px', 
          border: '4px solid #e5e7eb', 
          borderTopColor: '#3b82f6', 
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ marginTop: '16px', color: '#6b7280', fontSize: '14px' }}>Cargando identidad de marca...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <BrandContext.Provider value={{ config, status }}>
      {children}
    </BrandContext.Provider>
  );
};

export const useBrand = () => {
  const context = useContext(BrandContext);
  if (!context) throw new Error("useBrand debe usamos dentro de un BrandProvider");
  return context;
};
