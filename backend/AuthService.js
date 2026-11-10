/**
 * SERVICIO DE AUTENTICACIÓN Y AUTORIZACIÓN DINÁMICA RBAC — GOOGLE APPS SCRIPT
 * Valida el ID Token devuelto por Google Identity Services
 * contra el endpoint de verificación oficial de Google y la base de datos de directivos (Usuarios_Admin).
 */

const AuthService = {
  /**
   * Jerarquía numérica de privilegios para Control de Acceso Basado en Roles (RBAC).
   */
  ROLE_HIERARCHY: {
    "SuperAdmin": 3,
    "Admin": 2,
    "Operador": 1
  },

  /**
   * Determina si el rol del usuario satisface el nivel de privilegio requerido.
   * @param {string} userRole - Rol asignado al usuario
   * @param {string|null} requiredRole - Rol mínimo requerido (null o vacío = acceso general de usuario activo)
   * @returns {boolean}
   */
  hasPermission(userRole, requiredRole) {
    if (!userRole) return false;
    if (!requiredRole) return true;
    const uLevel = this.ROLE_HIERARCHY[userRole] || 0;
    const rLevel = this.ROLE_HIERARCHY[requiredRole] || 99;
    return uLevel >= rLevel;
  },

  /**
   * Valida un ID Token recibido desde el cliente, comprueba membresía activa y privilegios de rol.
   * @param {string} idToken - Google OAuth2 JWT ID Token
   * @param {string|null} requiredRole - Rol mínimo exigido para la operación (opcional)
   * @returns {Object} Usuario autenticado { email, name, role, authorized: true }
   */
  verifyToken(idToken, requiredRole = null) {
    if (!idToken || typeof idToken !== "string") {
      throw new Error("Token de autenticación no proporcionado o inválido.");
    }

    // Acelerador de Caché en Google Apps Script (elimina la latencia de UrlFetchApp en peticiones consecutivas)
    let cacheKey = "";
    let cache = null;
    try {
      if (typeof CacheService !== "undefined" && typeof Utilities !== "undefined") {
        cache = CacheService.getScriptCache();
        const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, idToken);
        cacheKey = "auth_usr_" + Utilities.base64Encode(digest);
        const cached = cache.get(cacheKey);
        if (cached) {
          const cachedUser = JSON.parse(cached);
          if (requiredRole && !this.hasPermission(cachedUser.role, requiredRole)) {
            throw new Error(`No cuenta con privilegios de ${requiredRole}. Su rol actual es '${cachedUser.role}'.`);
          }
          return cachedUser;
        }
      }
    } catch (cErr) {
      // Continuar con verificación normal si CacheService no está disponible
    }

    let tokenInfo;
    try {
      const url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken);
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const status = response.getResponseCode();

      if (status !== 200) {
        throw new Error("El token de Google no es válido o ha expirado.");
      }

      tokenInfo = JSON.parse(response.getContentText());
    } catch (err) {
      throw new Error("Fallo en la verificación de seguridad con Google: " + err.message);
    }

    const email = (tokenInfo.email || "").toLowerCase().trim();
    if (!email) {
      throw new Error("El token verificado no contiene una dirección de correo válida.");
    }

    // 1. Consultar usuarios en la hoja Usuarios_Admin
    const adminUsers = Database.getAll(CONFIG.SHEETS.USUARIOS_ADMIN);
    let usuario = adminUsers.find(u => String(u.Email || "").toLowerCase().trim() === email);

    // 2. Verificar condición de SuperAdmin de rescate / Bootstrap inicial
    const bootstrapList = (CONFIG.BOOTSTRAP_SUPERADMINS || CONFIG.ADMIN_EMAILS || []).map(e => e.toLowerCase().trim());
    const isBootstrap = bootstrapList.includes(email);

    if (!usuario) {
      if (isBootstrap) {
        const nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
        const newBootstrapUser = {
          Usuario_ID: "ADM-" + Utilities.getUuid().substring(0, 6).toUpperCase(),
          Email: email,
          Nombre_Completo: tokenInfo.name || "SuperAdmin Inicial",
          Rol: CONFIG.ROLES.SUPERADMIN,
          Estado: "Activo",
          Fecha_Alta: nowStr,
          Creado_Por: "SISTEMA_BOOTSTRAP",
          Ultimo_Acceso: nowStr
        };

        try {
          Database.insert(CONFIG.SHEETS.USUARIOS_ADMIN, newBootstrapUser);
        } catch (dbErr) {
          console.warn("[AuthService] No se pudo persistir el usuario bootstrap de inmediato:", dbErr);
        }

        usuario = newBootstrapUser;
      } else {
        throw new Error(`El correo '${email}' no cuenta con permisos administrativos en COGNITIO CREDITOR.`);
      }
    }

    // 3. Validar estado de la cuenta
    if (usuario.Estado !== "Activo") {
      throw new Error(`El usuario '${email}' se encuentra inactivo o revocado en el sistema.`);
    }

    // 4. Validar privilegios RBAC según jerarquía
    if (requiredRole && !this.hasPermission(usuario.Rol, requiredRole)) {
      throw new Error(`No cuenta con privilegios de ${requiredRole}. Su rol actual es '${usuario.Rol}'.`);
    }

    const authResult = {
      email: email,
      name: tokenInfo.name || usuario.Nombre_Completo || "",
      role: usuario.Rol,
      authorized: true
    };

    // Guardar en caché por 10 minutos (600s) para máxima aceleración
    if (cache && cacheKey) {
      try {
        cache.put(cacheKey, JSON.stringify(authResult), 600);
      } catch (e) {}
    }

    return authResult;
  },

  /**
   * Registra la marca temporal de último acceso al iniciar sesión en el panel.
   * @param {string} email
   */
  recordLastAccess(email) {
    try {
      const adminUsers = Database.getAll(CONFIG.SHEETS.USUARIOS_ADMIN);
      const usuario = adminUsers.find(u => String(u.Email || "").toLowerCase().trim() === String(email || "").toLowerCase().trim());
      if (usuario && usuario._rowIndex) {
        const accessTimestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
        Database.updateCell(CONFIG.SHEETS.USUARIOS_ADMIN, usuario._rowIndex, "Ultimo_Acceso", accessTimestamp);
      }
    } catch (e) {
      console.warn("[AuthService] Error actualizando Ultimo_Acceso:", e);
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
