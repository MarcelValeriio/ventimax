# 🗺️ ROADMAP - Yuri Bot v2.0

Este documento recopila las ideas, arquitecturas y propuestas para la **Etapa 2** del proyecto. Cualquier nueva funcionalidad mayor, refactorización estructural o mejora profunda debe registrarse aquí para su evaluación y posterior desarrollo.

---

## 🎯 Objetivos de la Versión 2.0 (Borrador)

### 1. Inteligencia Artificial Avanzada
- **Autonomía total del Copiloto:** Transición de DeepSeek como asistente de prellenado a un agente de ventas completamente conversacional.
- **Visión por Computadora (OCR):** Interpretación automática de comprobantes de pago (transferencias/pago móvil) para validar montos, referencias y fechas sin intervención humana.
- **Clasificador de Intenciones (Intent Router):** Redirección temprana de mensajes basada en IA antes de entrar a la máquina de estados estricta.

### 2. Expansión Multicanal & Fidelización
- **Broadcasting Inteligente:** Envío masivo de promociones (WhatsApp Templates) basado en historiales de compra.
- **Programa de Lealtad:** Acumulación de "Puntos Pachi" o cupones de descuento automáticos por frecuencia de compra.
- **Integración con Fal.ai:** Generación dinámica de imágenes promocionales.

### 3. Escalabilidad Arquitectónica
- **Migración a TypeScript:** Mayor robustez y autocompletado en el backend y el frontend.
- **Base de Datos Multi-Tenant:** Capacidad real de soportar a distintas empresas bajo la misma instancia sin compartir datos (separación estricta a nivel de Base de Datos / Colecciones).
- **Cola de Mensajería Avanzada:** Migración de Agenda/SetTimeout a un Broker robusto (Redis/RabbitMQ) para manejar picos masivos de mensajes.

---

*Nota: Todas estas tareas quedan sujetas a revisión y priorización. Antes de ejecutar, el TPM (Antigravity) deberá crear un plan detallado.*

