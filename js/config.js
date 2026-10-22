/**
 * CONFIGURACIÓN CENTRALIZADA — CÍRCULO DE ESTUDIOS COGNITIO CREDITOR
 * 
 * Modifique los valores de este archivo para conectar el portal con los
 * servicios desplegados reales. NO introduzca contraseñas ni secretos privados aquí.
 */

export const CONFIG = {
  // Identidad Institucional
  ORGANIZATION_NAME: "Círculo de Estudios Cognitio Creditor",
  ORGANIZATION_SHORT_NAME: "Cognitio Creditor",
  SLOGAN: "Excelencia académica, contabilidad e investigación científica",
  
  // URLs de Integración con el Backend
  // URL oficial de la Web App desplegada en Google Apps Script
  BACKEND_API_URL: "https://script.google.com/macros/s/AKfycbzFLI5PoSA2-jZkaKhNfVon5kkSU9P1QnHQv5LGztBYYrSmudZ2BtDdssy3LbG6ZRyQ/exec",
  
  // Autenticación Administrativa (Google Identity Services)
  // Obtenga su Client ID desde Google Cloud Console (APIs & Services > Credentials)
  GOOGLE_CLIENT_ID: "949987890452-fagccp5h0cs42epbol74dv7gnm08gvi9.apps.googleusercontent.com",
  
  // Recursos Visuales
  LOGO_URL: "assets/images/logo.jpg",
  FAVICON_URL: "assets/images/logo.jpg",
  
  // Canales Oficiales y Redes Sociales
  WHATSAPP_URL: "https://whatsapp.com/channel/0029Vb65sZxFMqrfk0LW7F21",
  WHATSAPP_NUMBER: "", // Opcional si se habilita chat directo, ej: 51987654321
  WHATSAPP_DEFAULT_MESSAGE: "Hola, me comunico desde el portal web de Cognitio Creditor para consultar sobre ",
  FACEBOOK_URL: "https://www.facebook.com/share/1FJDDaDiMk/",
  TIKTOK_URL: "https://www.tiktok.com/@c.e.cognitio.creditor?_r=1&_t=ZS-9AlyerpciSy",
  INSTAGRAM_URL: "https://www.instagram.com/c.e.cognitiocreditor?utm_source=qr&exln=MWh3YW1od3h1cW5mNA==",
  CONTACT_EMAIL: "cognitiocreditorcc@gmail.com",
  
  // Configuración Regional y Fechas
  TIMEZONE: "America/Lima",
  LOCALE: "es-PE",
  
  // Parámetros de Emisión de Certificados
  CERTIFICATE_CONFIG: {
    DEFAULT_FONT_NAME: "Roboto-Bold",
    DEFAULT_FONT_PATH: "assets/fonts/Roboto-Bold.ttf",
    DEFAULT_FONT_SIZE: 32,
    MIN_FONT_SIZE: 16,
    DEFAULT_COLOR: "#1B365D", // Azul marino institucional
    PREVIEW_SAMPLE_NAME: "JUAN CARLOS DE LA TORRE RAMÍREZ"
  },
  
  // Verificación de configuración
  isBackendConfigured() {
    return this.BACKEND_API_URL && !this.BACKEND_API_URL.includes("TU_URL_GOOGLE_APPS_SCRIPT");
  },
  
  isAuthConfigured() {
    return this.GOOGLE_CLIENT_ID && !this.GOOGLE_CLIENT_ID.includes("TU_GOOGLE_CLIENT_ID");
  },
  
  isWhatsAppConfigured() {
    return Boolean((this.WHATSAPP_URL && !this.WHATSAPP_URL.includes("TU_URL")) ||
                   (this.WHATSAPP_NUMBER && !this.WHATSAPP_NUMBER.includes("TU_NUMERO_WHATSAPP")));
  }
};
