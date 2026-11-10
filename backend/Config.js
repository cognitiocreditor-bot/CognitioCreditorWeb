/**
 * CONFIGURACIÓN DEL BACKEND — GOOGLE APPS SCRIPT
 * Círculo de Estudios COGNITIO CREDITOR
 */

const CONFIG = {
  // ID de la hoja de cálculo de Google Sheets (extraído de la URL oficial)
  SPREADSHEET_ID: "14Ex_S9LaFo0oWYtfPGUHxvXDeeBniG8L66633LsYN-g",

  // Nombres de las hojas en Google Sheets
  SHEETS: {
    EVENTOS: "Eventos",
    PARTICIPANTES: "Participantes",
    INSCRIPCIONES: "Inscripciones",
    CONFIG_CERT: "Configuracion_Certificados",
    AUDITORIA: "Logs_Auditoria",
    USUARIOS_ADMIN: "Usuarios_Admin"
  },

  // SuperAdmins con privilegios bootstrap de rescate e inicialización
  BOOTSTRAP_SUPERADMINS: [
    "valentinbabiloniarodriguez@gmail.com",
    "danielgarciaisern6c@gmail.com",
    "cognitiocreditor@gmail.com"
  ],

  // Definición de Roles del sistema de Control de Acceso Basado en Roles (RBAC)
  ROLES: {
    SUPERADMIN: "SuperAdmin",
    ADMIN: "Admin",
    OPERADOR: "Operador"
  },

  // Lista blanca de correos de respaldo para compatibilidad histórica
  ADMIN_EMAILS: [
    "valentinbabiloniarodriguez@gmail.com",
    "danielgarciaisern6c@gmail.com",
    "cognitiocreditor@gmail.com"
  ],

  // Google OAuth2 Client ID (debe coincidir con js/config.js)
  GOOGLE_CLIENT_ID: "949987890452-fagccp5h0cs42epbol74dv7gnm08gvi9.apps.googleusercontent.com",

  // Configuración regional
  TIMEZONE: "America/Lima"
};
