/**
 * CAPA DE CLIENTE DE API — COGNITIO CREDITOR
 * Gestiona la comunicación con Google Apps Script mediante fetch JSON/CORS
 * y maneja estados offline/mock cuando la URL aún no está configurada.
 */

import { CONFIG } from './config.js';

export const Api = {
  /**
   * Helper privado para ejecutar peticiones HTTP con reintentos exponenciales y jitter.
   * Absorbe la saturación de concurrencia y colas de Google Apps Script (hasta 30 usuarios concurrentes).
   */
  async _fetchWithRetry(fetchFn, maxRetries = 3, baseDelayMs = 800) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fetchFn();
        return result;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          // Retroceso exponencial con variación aleatoria (jitter)
          const jitter = Math.random() * 400;
          const delay = Math.min(5000, baseDelayMs * Math.pow(1.8, attempt) + jitter);
          console.warn(`[Api] Petición temporalmente demorada o en cola (intento ${attempt + 1}/${maxRetries + 1}). Reintentando en ${Math.round(delay)}ms...`);
          await new Promise(res => setTimeout(res, delay));
        }
      }
    }
    throw lastError;
  },

  /**
   * Realiza una petición GET al backend de Google Apps Script con soporte para caché inteligente (TTL) y reintentos.
   * @param {string} action - Nombre de la operación
   * @param {Object} params - Parámetros de consulta
   * @param {Object} options - { bypassCache: boolean, ttlMs: number, retries: number }
   */
  async get(action, params = {}, options = {}) {
    if (!CONFIG.isBackendConfigured()) {
      return this._handleUnconfiguredBackend(action, params);
    }

    const { bypassCache = false, ttlMs = 5 * 60 * 1000, retries = 3 } = options;
    const cacheKey = `cognitio_cache_${action}_${JSON.stringify(params)}`;

    // Solo cacheamos operaciones públicas de lectura estables (ej. getPublicEvents)
    const isCacheable = (action === 'getPublicEvents') && !bypassCache;

    if (isCacheable) {
      try {
        const cachedRaw = sessionStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (Date.now() - cached.timestamp < ttlMs && cached.data) {
            return cached.data;
          }
        }
      } catch (e) {}
    }

    const url = new URL(CONFIG.BACKEND_API_URL);
    url.searchParams.append("action", action);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }

    try {
      const result = await this._fetchWithRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);

        try {
          const response = await fetch(url.toString(), {
            method: "GET",
            headers: { "Accept": "application/json" },
            signal: controller.signal
          });

          if (!response.ok) {
            throw new Error(`HTTP_${response.status}`);
          }

          return await response.json();
        } finally {
          clearTimeout(timeoutId);
        }
      }, retries, 800);

      if (isCacheable && result && result.success) {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: result
          }));
        } catch (e) {}
      }

      return result;
    } catch (err) {
      console.error(`[API GET ${action}] Error persistente tras reintentos:`, err);
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: "El servidor está experimentando alta demanda. Por favor, reintente en unos instantes."
      };
    }
  },

  /**
   * Invalida las entradas de caché del cliente (útil tras crear o editar eventos).
   */
  clearCache(actionPattern = '') {
    try {
      const keys = Object.keys(sessionStorage);
      keys.forEach(key => {
        if (key.startsWith('cognitio_cache_')) {
          if (!actionPattern || key.includes(actionPattern)) {
            sessionStorage.removeItem(key);
          }
        }
      });
    } catch (e) {}
  },

  /**
   * Realiza una petición POST al backend de Google Apps Script con tolerancia a saturación concurrente.
   * @param {string} action - Nombre de la operación
   * @param {Object} payload - Cuerpo de datos
   * @param {string|null} authToken - Token de Google Identity Services si es operación admin
   * @param {number} retries - Intentos de reintento en caso de error transitorio de red (por defecto 2)
   */
  async post(action, payload = {}, authToken = null, retries = 2) {
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
      const result = await this._fetchWithRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 40000);

        try {
          const response = await fetch(CONFIG.BACKEND_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain;charset=utf-8" // Apps Script maneja text/plain para evitar preflight CORS innecesario
            },
            body: JSON.stringify(body),
            signal: controller.signal
          });

          if (!response.ok) {
            throw new Error(`HTTP_${response.status}`);
          }

          return await response.json();
        } finally {
          clearTimeout(timeoutId);
        }
      }, retries, 1000);

      return result;
    } catch (err) {
      console.error(`[API POST ${action}] Error persistente tras reintentos:`, err);
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: "No fue posible procesar la solicitud debido a alta demanda simultánea. Por favor, reintente."
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
