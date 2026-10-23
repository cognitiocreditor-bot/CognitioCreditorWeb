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
        Participante_ID: e.Participante_ID,
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
   * Actualiza el estado de pago de una inscripción con auditoría y protección de cerrojo.
   * Permite que múltiples directivos confirmen pagos concurrentemente sin interferencias.
   */
  updatePaymentStatus(enrollmentId, status, adminEmail) {
    return Database.withLock(() => {
      const enrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
      const target = enrollments.find(e => e.Inscripcion_ID === enrollmentId);

      if (!target) {
        throw new Error(`Inscripción '${enrollmentId}' no encontrada.`);
      }

      const todayStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
      Database.updateRow(CONFIG.SHEETS.INSCRIPCIONES, target._rowIndex, {
        Estado_Pago: status,
        Fecha_Pago: todayStr
      });

      AuthService.logAudit(adminEmail, "CONFIRMAR_PAGO", enrollmentId, `Estado cambiado a ${status}`);

      return { enrollmentId, status };
    }, 20000);
  },

  /**
   * Importa registros validados desde Excel a la base de datos en una sola operación por bloque.
   * Altamente eficiente: permite que varios directivos importen cientos de alumnos sin demoras ni timeouts.
   */
  batchImport(eventId, records, adminEmail) {
    if (!records || !Array.isArray(records) || records.length === 0) {
      throw new Error("No hay registros válidos para importar.");
    }

    return Database.withLock(() => {
      // 1. Validar evento activo
      const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
      const event = events.find(e => e.Evento_ID === eventId);
      if (!event) {
        throw new Error("El evento seleccionado no existe.");
      }

      // 2. Cargar participantes e inscripciones actuales en memoria una sola vez
      const participants = Database.getAll(CONFIG.SHEETS.PARTICIPANTES);
      const partMapByDni = {};
      participants.forEach(p => {
        partMapByDni[String(p.DNI).trim()] = p;
      });

      const enrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
      const existingEnrollmentKeys = new Set(
        enrollments.map(e => `${e.Participante_ID}_${e.Evento_ID}`)
      );

      const nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
      const currentYear = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy");

      const newParticipantsToInsert = [];
      const newEnrollmentsToInsert = [];

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        let cleanDNI = String(rec.DNI || "").trim();
        if (/^\d{1,8}$/.test(cleanDNI)) {
          cleanDNI = cleanDNI.padStart(8, "0");
        }
        if (!/^\d{8}$/.test(cleanDNI) || !rec.Nombre_Completo) {
          continue; // Omitir filas sin DNI o Nombre válido
        }

        let participantId = "";
        let existingPart = partMapByDni[cleanDNI];

        if (existingPart) {
          participantId = existingPart.Participante_ID;
        } else {
          participantId = "PAR-" + Utilities.getUuid().substring(0, 8).toUpperCase();
          const newPartObj = {
            Participante_ID: participantId,
            DNI: cleanDNI,
            Nombre_Completo: String(rec.Nombre_Completo).trim().toUpperCase(),
            Fecha_Registro: nowStr,
            Estado_Registro: "Activo"
          };
          newParticipantsToInsert.push(newPartObj);
          partMapByDni[cleanDNI] = newPartObj; // Registrar en mapa en memoria para no duplicar en el mismo Excel
        }

        const enrollmentKey = `${participantId}_${eventId}`;
        if (!existingEnrollmentKeys.has(enrollmentKey)) {
          const queryCode = "CC-" + Utilities.getUuid().substring(0, 6).toUpperCase();
          const enrollmentId = "INS-" + currentYear + "-" + Utilities.getUuid().substring(0, 6).toUpperCase();

          newEnrollmentsToInsert.push({
            Inscripcion_ID: enrollmentId,
            Participante_ID: participantId,
            Evento_ID: eventId,
            Tipo_Certificado: rec.Tipo_Certificado === "Fisico" ? "Fisico" : "Virtual",
            Estado_Pago: rec.Estado_Pago === "Pagado" ? "Pagado" : "Pendiente",
            Fecha_Pago: rec.Estado_Pago === "Pagado" ? nowStr : "",
            Referencia_Comprobante: rec.Referencia_Comprobante ? String(rec.Referencia_Comprobante).trim() : "IMPORTACION_EXCEL",
            Estado_Inscripcion: "Registrada",
            Codigo_Consulta: queryCode,
            Fecha_Emision: ""
          });
          existingEnrollmentKeys.add(enrollmentKey);
        }
      }

      // 3. Inserción masiva en bloque atómica (setValues)
      if (newParticipantsToInsert.length > 0) {
        Database.insertBatch(CONFIG.SHEETS.PARTICIPANTES, newParticipantsToInsert);
      }
      if (newEnrollmentsToInsert.length > 0) {
        Database.insertBatch(CONFIG.SHEETS.INSCRIPCIONES, newEnrollmentsToInsert);
      }

      AuthService.logAudit(adminEmail, "IMPORTAR_EXCEL", eventId, `${newEnrollmentsToInsert.length} inscripciones importadas en bloque.`);
      return { imported: newEnrollmentsToInsert.length, totalRowsProcessed: records.length };
    }, 30000);
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

    let templateId = String(certConfig.Link_Plantilla || "").trim();
    if (!templateId) {
      throw new Error("No se ha configurado la plantilla en Drive para este evento.");
    }
    const driveMatch = templateId.match(/\/d\/([a-zA-Z0-9_-]+)/) || templateId.match(/id=([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      templateId = driveMatch[1];
    }

    let file;
    try {
      file = DriveApp.getFileById(templateId);
    } catch (driveErr) {
      throw new Error("No se pudo acceder a la plantilla en Drive (ID: " + templateId + "). Revise permisos. Detalle: " + driveErr.message);
    }
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
  },

  /**
   * Obtiene la configuración de certificado para un evento.
   */
  getCertConfig(eventId) {
    const configs = Database.getAll(CONFIG.SHEETS.CONFIG_CERT);
    const certConfig = configs.find(c => c.Evento_ID === eventId);
    if (certConfig) return certConfig;

    return {
      Configuracion_Certificado_ID: "CFG-" + eventId,
      Evento_ID: eventId,
      Link_Plantilla: "",
      Pagina_Certificado: 1,
      Posicion_X: 0,
      Posicion_Y: 260,
      Ancho_Maximo_Nombre: 600,
      Tamano_Fuente_Inicial: 32,
      Tamano_Fuente_Minimo: 18,
      Fuente_URL: "",
      Alineacion: "Centrado",
      Color_Texto: "#1B365D",
      Escala_o_Unidad_Referencia: "pt",
      Estado_Configuracion: "Borrador"
    };
  },

  /**
   * Guarda o actualiza la configuración de diploma y plantilla de un evento.
   */
  /**
   * Guarda o actualiza la configuración de diploma y plantilla de un evento.
   */
  saveCertConfig(payload, adminEmail) {
    const { eventId, config } = payload;
    if (!eventId) throw new Error("ID de evento requerido.");

    return Database.withLock(() => {
      const configs = Database.getAll(CONFIG.SHEETS.CONFIG_CERT);
      const existing = configs.find(c => c.Evento_ID === eventId);

      let cleanTemplate = String(config.Link_Plantilla || "").trim();
      const driveMatch = cleanTemplate.match(/\/d\/([a-zA-Z0-9_-]+)/) || cleanTemplate.match(/id=([a-zA-Z0-9_-]+)/);
      if (driveMatch) {
        cleanTemplate = driveMatch[1];
      }

      const record = {
        Configuracion_Certificado_ID: config.Configuracion_Certificado_ID || ("CFG-" + eventId),
        Evento_ID: eventId,
        Link_Plantilla: cleanTemplate,
        Pagina_Certificado: Number(config.Pagina_Certificado) || 1,
        Posicion_X: Number(config.Posicion_X) || 0,
        Posicion_Y: Number(config.Posicion_Y) || 260,
        Ancho_Maximo_Nombre: Number(config.Ancho_Maximo_Nombre) || 600,
        Tamano_Fuente_Inicial: Number(config.Tamano_Fuente_Inicial) || 32,
        Tamano_Fuente_Minimo: Number(config.Tamano_Fuente_Minimo) || 18,
        Fuente_URL: String(config.Fuente_URL || "").trim(),
        Alineacion: String(config.Alineacion || "Centrado").trim(),
        Color_Texto: String(config.Color_Texto || "#1B365D").trim(),
        Escala_o_Unidad_Referencia: "pt",
        Estado_Configuracion: String(config.Estado_Configuracion || "Publicado").trim()
      };

      if (existing) {
        Database.updateRow(CONFIG.SHEETS.CONFIG_CERT, existing._rowIndex, record);
      } else {
        Database.insert(CONFIG.SHEETS.CONFIG_CERT, record);
      }

      // Sincronizar Link_Plantilla y Configuracion_Certificado_ID en la hoja de Eventos
      const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
      const evt = events.find(e => e.Evento_ID === eventId);
      if (evt) {
        Database.updateRow(CONFIG.SHEETS.EVENTOS, evt._rowIndex, {
          Configuracion_Certificado_ID: record.Configuracion_Certificado_ID,
          Link_Plantilla: record.Link_Plantilla || evt.Link_Plantilla || ""
        });
      }

      AuthService.logAudit(adminEmail, "CONFIGURAR_CERTIFICADO", eventId, `Plantilla y coordenadas actualizadas.`);
      return record;
    }, 20000);
  },

  /**
   * Actualiza los datos de un participante (corrección ortográfica o de DNI) con cerrojo atómico.
   */
  updateParticipant(payload, adminEmail) {
    const { participanteId, dni, nombreCompleto } = payload;
    if (!participanteId) throw new Error("ID de participante requerido.");

    return Database.withLock(() => {
      const participants = Database.getAll(CONFIG.SHEETS.PARTICIPANTES);
      const target = participants.find(p => p.Participante_ID === participanteId);
      if (!target) throw new Error("Participante no encontrado.");

      const cleanDni = String(dni || target.DNI).trim();
      const cleanName = String(nombreCompleto || target.Nombre_Completo).trim();

      Database.updateRow(CONFIG.SHEETS.PARTICIPANTES, target._rowIndex, {
        DNI: cleanDni,
        Nombre_Completo: cleanName
      });

      AuthService.logAudit(adminEmail, "EDITAR_PARTICIPANTE", participanteId, `DNI: ${cleanDni}, Nombre: ${cleanName}`);
      return { participanteId, dni: cleanDni, nombreCompleto: cleanName };
    }, 15000);
  },

  /**
   * Obtiene el registro de auditoría ordenado descendentemente.
   */
  getAuditLogs(limit = 100) {
    const logs = Database.getAll(CONFIG.SHEETS.AUDITORIA);
    // Invertir para mostrar los más recientes primero
    return logs.slice(-limit).reverse();
  }
};
