/**
 * SERVICIO DE AUTENTICACIÓN Y AUTORIZACIÓN — GOOGLE APPS SCRIPT
 * Valida el ID Token devuelto por Google Identity Services
 * contra el endpoint de verificación oficial de Google y la lista blanca.
 */

const AuthService = {
  /**
   * Valida un ID Token recibido desde el cliente.
   * @param {string} idToken
   * @returns {Object} Usuario autenticado { email, name, authorized: true }
   */
  verifyToken(idToken) {
    if (!idToken || typeof idToken !== "string") {
      throw new Error("Token de autenticación no proporcionado o inválido.");
    }

    try {
      const url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken);
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const status = response.getResponseCode();

      if (status !== 200) {
        throw new Error("El token de Google no es válido o ha expirado.");
      }

      const tokenInfo = JSON.parse(response.getContentText());
      const email = (tokenInfo.email || "").toLowerCase().trim();

      // Verificar que el email figure en la lista blanca de la directiva
      const isAuthorized = CONFIG.ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase().trim() === email);

      if (!isAuthorized) {
        throw new Error(`El correo '${email}' no cuenta con permisos administrativos en COGNITIO CREDITOR.`);
      }

      return {
        email: email,
        name: tokenInfo.name || "",
        authorized: true
      };
    } catch (err) {
      throw new Error("Fallo en la verificación de seguridad: " + err.message);
    }
  },

  /**
   * Registra una acción administrativa en la hoja de auditoría.
   */
  logAudit(userEmail, action, entityId, detail) {
    try {
      Database.insert(CONFIG.SHEETS.AUDITORIA, {
        Log_ID: "LOG-" + Utilities.getUuid().substring(0, 8),
        Timestamp: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
        Usuario_Admin: userEmail,
        Accion: action,
        Entidad_Afectada: entityId || "",
        Detalle: detail || ""
      });
    } catch (err) {
      console.error("[AuthService] Error registrando auditoría:", err);
    }
  }
};
