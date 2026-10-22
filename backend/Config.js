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
    AUDITORIA: "Logs_Auditoria"
  },

  // Lista blanca de correos de Google autorizados para operar el panel administrativo
  ADMIN_EMAILS: [
    "directiva.cognitiocreditor@gmail.com",
    "coordinacion.cognitio@gmail.com"
    // Añada aquí los correos de la directiva autorizados
  ],

  // Google OAuth2 Client ID (debe coincidir con js/config.js)
  GOOGLE_CLIENT_ID: "TU_GOOGLE_CLIENT_ID.apps.googleusercontent.com",

  // Configuración regional
  TIMEZONE: "America/Lima"
};
