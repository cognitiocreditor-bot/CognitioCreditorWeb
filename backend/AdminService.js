/**
 * SERVICIO ADMINISTRATIVO — GOOGLE APPS SCRIPT
 * Conciliación de pagos, importación por lotes de Excel y datos de emisión física masiva.
 */

const AdminService = {
  /**
   * Obtiene inscripciones con filtros para el panel administrativo.
   */
  getEnrollments(eventId) {
    const enrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
    const participants = Database.getAll(CONFIG.SHEETS.PARTICIPANTES);

    const partMap = {};
    participants.forEach(p => {
      partMap[p.Participante_ID] = p;
    });

    let filtered = enrollments;
    if (eventId) {
      filtered = filtered.filter(e => e.Evento_ID === eventId);
    }

    return filtered.map(e => {
      const p = partMap[e.Participante_ID] || {};
      return {
        Inscripcion_ID: e.Inscripcion_ID,
        DNI: p.DNI || "",
        Nombre_Completo: p.Nombre_Completo || "",
        Evento_ID: e.Evento_ID,
        Tipo_Certificado: e.Tipo_Certificado,
        Estado_Pago: e.Estado_Pago,
        Referencia_Comprobante: e.Referencia_Comprobante,
        Codigo_Consulta: e.Codigo_Consulta,
        Estado_Inscripcion: e.Estado_Inscripcion
      };
    });
  },

  /**
   * Actualiza el estado de pago de una inscripción con auditoría.
   */
  updatePaymentStatus(enrollmentId, status, adminEmail) {
    const enrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
    const target = enrollments.find(e => e.Inscripcion_ID === enrollmentId);

    if (!target) {
      throw new Error(`Inscripción '${enrollmentId}' no encontrada.`);
    }

    const todayStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    Database.updateCell(CONFIG.SHEETS.INSCRIPCIONES, target._rowIndex, "Estado_Pago", status);
    Database.updateCell(CONFIG.SHEETS.INSCRIPCIONES, target._rowIndex, "Fecha_Pago", todayStr);

    AuthService.logAudit(adminEmail, "CONFIRMAR_PAGO", enrollmentId, `Estado cambiado a ${status}`);

    return { enrollmentId, status };
  },

  /**
   * Importa registros validados desde Excel a la base de datos.
   */
  batchImport(eventId, records, adminEmail) {
    if (!records || !Array.isArray(records) || records.length === 0) {
      throw new Error("No hay registros válidos para importar.");
    }

    let count = 0;
    records.forEach(rec => {
      EnrollmentService.register({
        Evento_ID: eventId,
        DNI: rec.DNI,
        Nombre_Completo: rec.Nombre_Completo,
        Tipo_Certificado: rec.Tipo_Certificado || "Virtual",
        Referencia_Comprobante: rec.Referencia_Comprobante || "IMPORTACION_EXCEL"
      });
      count++;
    });

    AuthService.logAudit(adminEmail, "IMPORTAR_EXCEL", eventId, `${count} participantes importados.`);
    return { imported: count };
  },

  /**
   * Obtiene la lista y plantilla para emisión física masiva.
   */
  getBatchPhysicalData(eventId, adminEmail) {
    const allEnrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
    const participants = Database.getAll(CONFIG.SHEETS.PARTICIPANTES);

    const partMap = {};
    participants.forEach(p => {
      partMap[p.Participante_ID] = p;
    });

    // Filtro estricto: Evento_ID coincidente, Fisico y Pagado
    const eligible = allEnrollments.filter(e => 
      e.Evento_ID === eventId && e.Tipo_Certificado === "Fisico" && e.Estado_Pago === "Pagado"
    );

    if (eligible.length === 0) {
      return { participants: [], templateBase64: null, config: null };
    }

    // Configuración y plantilla de Drive
    const configs = Database.getAll(CONFIG.SHEETS.CONFIG_CERT);
    const certConfig = configs.find(c => c.Evento_ID === eventId) || {
      Pagina_Certificado: 1,
      Posicion_X: 0,
      Posicion_Y: 260,
      Ancho_Maximo_Nombre: 600,
      Tamano_Fuente_Inicial: 32,
      Tamano_Fuente_Minimo: 18,
      Alineacion: "Centrado",
      Color_Texto: "#1B365D"
    };

    if (!certConfig.Link_Plantilla) {
      throw new Error("No se ha configurado la plantilla en Drive para este evento.");
    }

    const file = DriveApp.getFileById(certConfig.Link_Plantilla);
    const blob = file.getBlob();
    const base64Pdf = Utilities.base64Encode(blob.getBytes());

    const mappedParticipants = eligible.map(e => ({
      Inscripcion_ID: e.Inscripcion_ID,
      Nombre_Completo: partMap[e.Participante_ID] ? partMap[e.Participante_ID].Nombre_Completo : "PARTICIPANTE"
    }));

    AuthService.logAudit(adminEmail, "GENERAR_LOTE_FISICO", eventId, `Extracción de ${eligible.length} certificados físicos.`);

    return {
      participants: mappedParticipants,
      templateBase64: base64Pdf,
      config: certConfig
    };
  }
};
