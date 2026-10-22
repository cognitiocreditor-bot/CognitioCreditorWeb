/**
 * ENTRADA PRINCIPAL Y DESPACHADOR — GOOGLE APPS SCRIPT
 * Círculo de Estudios COGNITIO CREDITOR
 */

function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === "getPublicEvents") {
      const data = EventService.getPublicEvents();
      return jsonResponse({ success: true, data: data });
    }

    if (action === "queryCertificate") {
      const dni = e.parameter.dni;
      const code = e.parameter.code;
      const res = CertificateService.query(dni, code);
      return jsonResponse({ success: res.found, data: res.records, message: res.message });
    }

    if (action === "getTemplatePdf") {
      const enrollmentId = e.parameter.enrollmentId;
      const res = CertificateService.getTemplateForEnrollment(enrollmentId);
      return jsonResponse({ success: true, data: res });
    }

    return jsonResponse({
      success: false,
      error: "INVALID_ACTION",
      message: "Operación GET no reconocida."
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: "INTERNAL_ERROR",
      message: err.message
    });
  }
}

function doPost(e) {
  try {
    const rawContent = e.postData.contents;
    const requestData = JSON.parse(rawContent);
    const { action, payload, token } = requestData;

    // Operación Pública: Registro de Inscripción
    if (action === "registerEnrollment") {
      const res = EnrollmentService.register(payload);
      return jsonResponse({ success: true, data: res });
    }

    // OPERACIONES ADMINISTRATIVAS (Requieren Token de Google)
    const adminUser = AuthService.verifyToken(token);

    if (action === "adminAuthenticate") {
      return jsonResponse({ success: true, data: adminUser });
    }

    if (action === "adminGetEvents") {
      const events = EventService.getAllEventsAdmin();
      return jsonResponse({ success: true, data: events });
    }

    if (action === "adminSaveEvent") {
      const res = EventService.saveEvent(payload, adminUser.email);
      return jsonResponse({ success: true, data: res });
    }

    if (action === "adminDeleteEvent") {
      const res = EventService.deleteEvent(payload.eventId, adminUser.email);
      return jsonResponse({ success: true, data: res });
    }

    if (action === "adminToggleEventStatus") {
      const res = EventService.toggleEventStatus(payload.eventId, payload.nextStatus, adminUser.email);
      return jsonResponse({ success: true, data: res });
    }

    if (action === "adminGetCertConfig") {
      const res = AdminService.getCertConfig(payload.eventId);
      return jsonResponse({ success: true, data: res });
    }

    if (action === "adminSaveCertConfig") {
      const res = AdminService.saveCertConfig(payload, adminUser.email);
      return jsonResponse({ success: true, data: res });
    }

    if (action === "adminGetEnrollments") {
      const res = AdminService.getEnrollments(payload.eventId);
      return jsonResponse({ success: true, data: res });
    }

    if (action === "adminUpdatePaymentStatus") {
      const res = AdminService.updatePaymentStatus(payload.enrollmentId, payload.status, adminUser.email);
      return jsonResponse({ success: true, data: res });
    }

    if (action === "adminUpdateParticipant") {
      const res = AdminService.updateParticipant(payload, adminUser.email);
      return jsonResponse({ success: true, data: res });
    }

    if (action === "adminBatchImport") {
      const res = AdminService.batchImport(payload.eventId, payload.records, adminUser.email);
      return jsonResponse({ success: true, data: res });
    }

    if (action === "adminGetBatchCertificateData") {
      const res = AdminService.getBatchPhysicalData(payload.eventId, adminUser.email);
      return jsonResponse({ success: true, data: res });
    }

    if (action === "adminGetAuditLogs") {
      const res = AdminService.getAuditLogs(payload ? payload.limit : 100);
      return jsonResponse({ success: true, data: res });
    }

    return jsonResponse({
      success: false,
      error: "INVALID_ADMIN_ACTION",
      message: "Acción administrativa no soportada."
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: "AUTH_OR_EXEC_ERROR",
      message: err.message
    });
  }
}

function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Función auxiliar para conceder permisos iniciales en el editor de Apps Script.
 * Ejecute esta función una sola vez desde el botón 'Ejecutar' de Google Apps Script
 * para aprobar los permisos de llamadas externas (UrlFetchApp), Sheets y Drive.
 */
function autorizarPermisos() {
  // 1. Invocar DriveApp para forzar solicitud de scope de Drive
  const rootName = DriveApp.getRootFolder().getName();
  Logger.log("Permiso DriveApp concedido. Carpeta raíz: " + rootName);

  // 2. Invocar SpreadsheetApp para forzar solicitud de scope de Sheets
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== "TU_SPREADSHEET_ID_AQUI") {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    Logger.log("Permiso SpreadsheetApp concedido. Libro: " + ss.getName());
  }

  // 3. Invocar UrlFetchApp para llamadas externas sin arrojar error 400
  UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo", { muteHttpExceptions: true });
  Logger.log("Permisos de UrlFetchApp autorizados correctamente.");

  Logger.log(">>> TODOS LOS PERMISOS (Drive, Sheets, UrlFetch) HAN SIDO AUTORIZADOS CON ÉXITO.");
}

