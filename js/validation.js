/**
 * MÓDULO DE VALIDACIÓN Y SANITIZACIÓN — COGNITIO CREDITOR
 * Diseñado bajo el principio de defensa en profundidad (Security by Design).
 */

export const Validation = {
  /**
   * Valida formato de DNI peruano (exactamente 8 dígitos numéricos).
   * @param {string} dni
   * @returns {boolean}
   */
  isValidDNI(dni) {
    if (!dni || typeof dni !== "string") return false;
    const cleanDNI = dni.trim();
    return /^\d{8}$/.test(cleanDNI);
  },

  /**
   * Sanitiza y estandariza un DNI para preservar ceros iniciales.
   * @param {string|number} dni
   * @returns {string}
   */
  normalizeDNI(dni) {
    if (dni === null || dni === undefined) return "";
    let s = String(dni).trim();
    // Si viene como número sin ceros a la izquierda pero de 7 dígitos, rellenar a 8
    if (/^\d{1,7}$/.test(s)) {
      s = s.padStart(8, "0");
    }
    return s;
  },

  /**
   * Valida un código de consulta (alfanumérico, 4 a 12 caracteres).
   * @param {string} code
   * @returns {boolean}
   */
  isValidQueryCode(code) {
    if (!code || typeof code !== "string") return false;
    const cleanCode = code.trim();
    return /^[A-Za-z0-9\-_]{4,16}$/.test(cleanCode);
  },

  /**
   * Valida nombre completo formal (letras, espacios, tildes, ñ, mínimo 3 caracteres).
   * @param {string} name
   * @returns {boolean}
   */
  isValidFullName(name) {
    if (!name || typeof name !== "string") return false;
    const cleanName = name.trim();
    if (cleanName.length < 3 || cleanName.length > 150) return false;
    // Permite caracteres del alfabeto español y signos ortográficos habituales en nombres
    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-\.]+$/;
    return nameRegex.test(cleanName);
  },

  /**
   * Sanitiza strings para prevenir inyección HTML / XSS al renderizar en el DOM.
   * @param {string} str
   * @returns {string}
   */
  escapeHTML(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  /**
   * Normaliza un nombre en mayúsculas sin espacios redundantes.
   * @param {string} name
   * @returns {string}
   */
  normalizeName(name) {
    if (!name || typeof name !== "string") return "";
    return name.trim().replace(/\s+/g, " ").toUpperCase();
  },

  /**
   * Valida si un email tiene estructura aceptable.
   * @param {string} email
   * @returns {boolean}
   */
  isValidEmail(email) {
    if (!email || typeof email !== "string") return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  },

  /**
   * Valida formato de fecha ISO (YYYY-MM-DD).
   * @param {string} dateStr
   * @returns {boolean}
   */
  isValidISODate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return false;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = new Date(dateStr + "T00:00:00");
    return !isNaN(date.getTime());
  }
};
