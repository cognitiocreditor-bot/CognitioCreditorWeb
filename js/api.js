/**
 * CAPA DE CLIENTE DE API — COGNITIO CREDITOR
 * Gestiona la comunicación con Google Apps Script mediante fetch JSON/CORS
 * y maneja estados offline/mock cuando la URL aún no está configurada.
 */

import { CONFIG } from './config.js';

export const Api = {
  /**
   * Realiza una petición GET al backend de Google Apps Script.
   * @param {string} action - Nombre de la operación
   * @param {Object} params - Parámetros de consulta
   */
  async get(action, params = {}) {
    if (!CONFIG.isBackendConfigured()) {
      return this._handleUnconfiguredBackend(action, params);
    }

    const url = new URL(CONFIG.BACKEND_API_URL);
    url.searchParams.append("action", action);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Error de red HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.error(`[API GET ${action}] Error:`, err);
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: "No fue posible conectar con el servidor. Verifique su conexión a internet."
      };
    }
  },

  /**
   * Realiza una petición POST al backend de Google Apps Script.
   * @param {string} action - Nombre de la operación
   * @param {Object} payload - Cuerpo de datos
   * @param {string|null} authToken - Token de Google Identity Services si es operación admin
   */
  async post(action, payload = {}, authToken = null) {
    if (!CONFIG.isBackendConfigured()) {
      return this._handleUnconfiguredBackend(action, payload);
    }

    const body = {
      action,
      payload,
      token: authToken,
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(CONFIG.BACKEND_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8" // Apps Script maneja text/plain para evitar preflight CORS innecesario
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.error(`[API POST ${action}] Error:`, err);
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: "Error de comunicación con el servidor al procesar la solicitud."
      };
    }
  },

  /**
   * Responde con datos informativos cuando la URL del backend aún no se ha configurado.
   * Permite probar la interfaz sin romper la ejecución.
   */
  _handleUnconfiguredBackend(action, params) {
    console.warn(`[API] El backend aún no está configurado en js/config.js. Simulación activa para '${action}'.`);
    
    if (action === "getPublicEvents") {
      return {
        success: true,
        data: [
          {
            Evento_ID: "EVT-DEMO-001",
            Titulo_Evento: "Conferencia: Estados Financieros, Auditoría y Gestión Tributaria",
            Descripcion: "Jornada académica sobre análisis contable, normas internacionales y rigor metodológico en la investigación empresarial.",
            Fecha_Evento: "2026-11-15",
            Hora_Evento: "19:00",
            Expositor: "Dr. Roberto Mendoza Vidal",
            Imagen_URL: "assets/images/logo.jpg",
            Link_Formulario: "",
            Modalidad: "Virtual",
            Estado: "Activo"
          },
          {
            Evento_ID: "EVT-DEMO-002",
            Titulo_Evento: "Taller Práctico: Metodología de la Investigación Científica y Redacción Académica",
            Descripcion: "Sesión intensiva sobre formulación de hipótesis, recolección de datos y competencias científicas.",
            Fecha_Evento: "2026-11-28",
            Hora_Evento: "18:30",
            Expositor: "Dra. Carmen Salazar Peña",
            Imagen_URL: "assets/images/logo.jpg",
            Link_Formulario: "",
            Modalidad: "Virtual",
            Estado: "Activo"
          }
        ],
        message: "Datos demostrativos locales (Backend pendiente de configuración en config.js)"
      };
    }

    if (action === "queryCertificate") {
      return {
        success: false,
        error: "BACKEND_NOT_CONFIGURED",
        message: "El portal está en modo demostración. Configure la URL de Google Apps Script en js/config.js para realizar consultas reales."
      };
    }

    return {
      success: false,
      error: "BACKEND_NOT_CONFIGURED",
      message: "Operación no disponible: configure la URL de Google Apps Script en js/config.js."
    };
  }
};
