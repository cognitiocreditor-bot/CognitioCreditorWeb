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
    // Limpiar posibles decimales generados por Excel (ej. 71234567.0)
    s = s.replace(/\.0+$/, "");
    // Limpiar puntos, espacios y guiones
    s = s.replace(/[\s\.\-]/g, "");
    // Si viene como número sin ceros a la izquierda pero de 1 a 7 dígitos, rellenar a 8
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
    // Permite caracteres del alfabeto español y signos ortográficos habituales en nombres (incluyendo coma)
    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-\.,]+$/;
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
  },

  /**
   * Normaliza la URL o ruta del banner para máxima velocidad y compatibilidad.
   * - Si es un archivo en assets/images/ (ej. "banner.jpg" o "assets/images/banner.jpg"), estandariza la ruta.
   * - Si es un enlace de Google Drive, lo convierte a la URL directa de contenido lh3.googleusercontent.com.
   * - Si está vacío, usa el logotipo por defecto.
   * @param {string} url
   * @returns {string}
   */
  formatImageUrl(url) {
    if (!url || typeof url !== "string" || !url.trim()) {
      return "assets/images/logo.jpg";
    }
    const clean = url.trim();

    // 1. Google Drive: transformar enlace /view o /open a lh3.googleusercontent.com/d/ID
    const driveMatch = clean.match(/\/d\/([a-zA-Z0-9_-]+)/) || clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
    }

    // 2. Si ya es una URL web completa (https:// o http://) o data URI
    if (/^(https?:\/\/|data:)/i.test(clean)) {
      return clean;
    }

    // 3. Si ya tiene la ruta assets/
    if (clean.startsWith("assets/")) {
      return clean;
    }

    // 4. Si solo escribieron el nombre de la imagen (ej: "afiche1.jpg" o "banner.png")
    return `assets/images/${clean.replace(/^\/+/, "")}`;
  }
};

