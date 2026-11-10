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
        Fecha_Pago: e.Fecha_Pago || "",
        Referencia_Comprobante: e.Referencia_Comprobante,
        Codigo_Consulta: e.Codigo_Consulta,
        Estado_Inscripcion: e.Estado_Inscripcion
      };
    });
  },

  /**
   * Actualiza el estado de pago de una inscripción con soporte de reversibilidad, motivo y auditoría estricta.
   * Permite alternar entre 'Pendiente', 'Pagado', 'Anulado' y 'Reembolsado' para corregir errores operativos
   * garantizando que jamás se eliminen inscripciones ni participantes y preservando la integridad referencial.
   * @param {string} enrollmentId - ID de la inscripción
   * @param {string} status - Estado de pago destino ('Pendiente' | 'Pagado' | 'Anulado' | 'Reembolsado')
   * @param {string} [reason] - Motivo obligatorio si status !== 'Pagado'
   * @param {string} adminEmail - Correo del directivo autenticado que realiza la acción
   * @returns {{ enrollmentId: string, status: string, previousStatus: string }}
   */
  updatePaymentStatus(enrollmentId, status, reason, adminEmail, extraFields = {}) {
    // Compatibilidad hacia atrás si se invoca con 3 argumentos: (enrollmentId, status, adminEmail)
    if (adminEmail === undefined && typeof reason === "string" && reason.includes("@")) {
      adminEmail = reason;
      reason = "";
    }

    const ALLOWED_STATUSES = ["Pendiente", "Pagado", "Anulado", "Reembolsado"];
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      throw new Error("Estado de pago no reconocido. Permitidos: " + ALLOWED_STATUSES.join(", "));
    }

    const cleanReason = (reason || "").trim();
    if (status !== "Pagado" && !cleanReason) {
      throw new Error("Debe especificar el motivo de la corrección o cambio de estado de pago.");
    }

    return Database.withLock(() => {
      const enrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
      const target = enrollments.find(e => e.Inscripcion_ID === enrollmentId);

      if (!target) {
        throw new Error("Inscripción no encontrada.");
      }

      // Validación de regla de negocio: no confirmar pago si ya está Pagado (a menos que se corrijan campos extra de voucher o modalidad)
      const isModifyingExtra = extraFields && (extraFields.referenciaComprobante !== undefined || extraFields.tipoCertificado !== undefined);
      if (status === "Pagado" && target.Estado_Pago === "Pagado" && !isModifyingExtra) {
        throw new Error("La inscripción ya se encuentra registrada como Pagada.");
      }

      // Si la inscripción está anulada, exigir motivo explícito para reactivarla a Pagado
      if (status === "Pagado" && target.Estado_Pago === "Anulado" && !cleanReason) {
        throw new Error("No se puede confirmar directamente un pago anulado sin especificar el motivo de reactivación.");
      }

      const updateData = {
        Estado_Pago: status
      };

      if (status === "Pagado") {
        // Preservar la Fecha_Pago histórica existente si ya existía; de lo contrario, estampar la fecha actual
        updateData.Fecha_Pago = target.Fecha_Pago || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
      } else if (status === "Pendiente") {
        updateData.Fecha_Pago = "";
      } else {
        // En Anulado o Reembolsado, conservar la fecha previa si existía
        updateData.Fecha_Pago = target.Fecha_Pago || "";
      }

      // Corrección de comprobante / voucher si se suministra
      if (extraFields && extraFields.referenciaComprobante !== undefined) {
        updateData.Referencia_Comprobante = String(extraFields.referenciaComprobante).trim();
      }

      // Corrección de modalidad de certificado si se suministra
      if (extraFields && extraFields.tipoCertificado !== undefined) {
        const certType = String(extraFields.tipoCertificado).trim();
        if (certType === "Fisico" || certType === "Virtual") {
          updateData.Tipo_Certificado = certType;
        }
      }

      // Actualizar únicamente campos de pago de la fila existente; IDs permanecen inmutables
      Database.updateRow(CONFIG.SHEETS.INSCRIPCIONES, target._rowIndex, updateData);

      const previousStatus = target.Estado_Pago || "Sin estado";
      const voucherDetail = updateData.Referencia_Comprobante !== undefined ? ` [Voucher: ${updateData.Referencia_Comprobante}]` : "";
      const certDetail = updateData.Tipo_Certificado !== undefined ? ` [Modalidad: ${updateData.Tipo_Certificado}]` : "";
      const auditDetail = 'De ' + previousStatus + ' a ' + status + voucherDetail + certDetail + '. Motivo: ' + (cleanReason || 'No especificado');
      AuthService.logAudit(adminEmail, "CAMBIO_ESTADO_PAGO", enrollmentId, auditDetail);

      return {
        enrollmentId: enrollmentId,
        status: status,
        previousStatus: target.Estado_Pago,
        fechaPago: updateData.Fecha_Pago || "",
        referenciaComprobante: updateData.Referencia_Comprobante !== undefined ? updateData.Referencia_Comprobante : (target.Referencia_Comprobante || ""),
        tipoCertificado: updateData.Tipo_Certificado || target.Tipo_Certificado || "Virtual"
      };
    }, 20000);
  },

  /**
   * Registra individualmente a un participante desde el panel administrativo.
   * Reutiliza Participante_ID si el DNI ya existe, previene inscripciones duplicadas en el mismo evento,
   * permite configurar estado inicial 'Pagado' o 'Pendiente', y genera código de consulta único.
   * Protegido contra concurrencia mediante cerrojo atómico (withLock).
   * @param {Object} payload - { eventId, dni, nombreCompleto, tipoCertificado, initialPaymentStatus, referenciaComprobante }
   * @param {string} adminEmail - Correo del directivo autenticado que ejecuta el registro
   * @returns {{ enrollmentId: string, participantId: string, queryCode: string, paymentStatus: string, isExisting: boolean, message: string }}
   */
  registerIndividualParticipant(payload, adminEmail) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Datos de registro inválidos.");
    }

    const eventId = String(payload.eventId || payload.Evento_ID || "").trim();
    const dniRaw = String(payload.dni || payload.DNI || "").trim();
    const nameRaw = String(payload.nombreCompleto || payload.Nombre_Completo || payload.name || "").trim();
    const certTypeRaw = String(payload.tipoCertificado || payload.Tipo_Certificado || "Virtual").trim();
    const paymentStatusRaw = String(payload.initialPaymentStatus || payload.paymentStatus || payload.Estado_Pago || "Pendiente").trim();
    const voucherRaw = String(payload.referenciaComprobante || payload.voucher || payload.Referencia_Comprobante || "").trim();

    // 1. Validar campos requeridos
    if (!eventId || !dniRaw || !nameRaw) {
      throw new Error("Faltan campos obligatorios para el registro (Evento, DNI y Nombre Completo).");
    }

    // 2. Normalizar y validar DNI
    let cleanDNI = dniRaw.replace(/\D/g, "");
    if (cleanDNI.length > 0 && cleanDNI.length <= 8) {
      cleanDNI = cleanDNI.padStart(8, "0");
    }
    if (!/^\d{8}$/.test(cleanDNI)) {
      throw new Error("El formato del DNI debe ser exactamente de 8 dígitos numéricos.");
    }

    // 3. Normalizar nombre en mayúsculas sin espacios redundantes
    const cleanName = nameRaw.replace(/\s+/g, " ").trim().toUpperCase();
    if (cleanName.length < 3) {
      throw new Error("El nombre completo debe tener al menos 3 caracteres.");
    }

    // 4. Tipo de Certificado y Estado inicial de pago
    const tipoCertificado = certTypeRaw === "Fisico" ? "Fisico" : "Virtual";
    const status = (paymentStatusRaw === "Pagado") ? "Pagado" : "Pendiente";

    // 5. Persistencia bajo cerrojo atómico
    return Database.withLock(() => {
      // 5.1 Validar que el evento exista en Eventos
      const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
      const event = events.find(e => e.Evento_ID === eventId);
      if (!event) {
        throw new Error("El evento seleccionado no existe.");
      }

      const nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
      const currentYear = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy");

      // 5.2 Gestión del Participante
      const participants = Database.getAll(CONFIG.SHEETS.PARTICIPANTES);
      let participant = participants.find(p => String(p.DNI).trim() === cleanDNI);

      let participantId = "";
      if (participant) {
        participantId = participant.Participante_ID;
      } else {
        participantId = "PAR-" + Utilities.getUuid().substring(0, 8).toUpperCase();
        Database.insert(CONFIG.SHEETS.PARTICIPANTES, {
          Participante_ID: participantId,
          DNI: cleanDNI,
          Nombre_Completo: cleanName,
          Fecha_Registro: nowStr,
          Estado_Registro: "Activo"
        });
      }

      // 5.3 Prevención de duplicados para el mismo evento
      const enrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
      const existingEnrollment = enrollments.find(e => 
        e.Participante_ID === participantId && e.Evento_ID === eventId && e.Estado_Inscripcion !== "Cancelada"
      );

      if (existingEnrollment) {
        return {
          enrollmentId: existingEnrollment.Inscripcion_ID,
          Inscripcion_ID: existingEnrollment.Inscripcion_ID,
          participantId: participantId,
          Participante_ID: participantId,
          queryCode: existingEnrollment.Codigo_Consulta,
          Codigo_Consulta: existingEnrollment.Codigo_Consulta,
          paymentStatus: existingEnrollment.Estado_Pago,
          Estado_Pago: existingEnrollment.Estado_Pago,
          isExisting: true,
          message: "El participante ya se encontraba inscrito en este evento."
        };
      }

      // 5.4 Si es nueva inscripción:
      const queryCode = "CC-" + Utilities.getUuid().substring(0, 6).toUpperCase();
      const enrollmentId = "INS-" + currentYear + "-" + Utilities.getUuid().substring(0, 6).toUpperCase();
      const fechaPago = (status === "Pagado") ? nowStr : "";
      const cleanVoucher = voucherRaw || (status === "Pagado" ? "REGISTRO_ADMIN_PAGADO" : "");

      const newEnrollment = {
        Inscripcion_ID: enrollmentId,
        Participante_ID: participantId,
        Evento_ID: eventId,
        Tipo_Certificado: tipoCertificado,
        Estado_Pago: status,
        Fecha_Pago: fechaPago,
        Referencia_Comprobante: cleanVoucher,
        Estado_Inscripcion: "Registrada",
        Codigo_Consulta: queryCode,
        Fecha_Emision: ""
      };

      Database.insert(CONFIG.SHEETS.INSCRIPCIONES, newEnrollment);

      // 5.5 Registrar auditoría obligatoria
      AuthService.logAudit(
        adminEmail,
        "REGISTRO_INDIVIDUAL_ADMIN",
        enrollmentId,
        'DNI: ' + cleanDNI + ', Pago: ' + status
      );

      return {
        enrollmentId: enrollmentId,
        Inscripcion_ID: enrollmentId,
        participantId: participantId,
        Participante_ID: participantId,
        queryCode: queryCode,
        Codigo_Consulta: queryCode,
        paymentStatus: status,
        Estado_Pago: status,
        isExisting: false,
        message: "Participante registrado exitosamente."
      };
    }, 25000);
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
   * Actualiza los datos de un participante (corrección ortográfica o de DNI) con cerrojo atómico,
   * validación estricta de 8 dígitos y prevención de colisión de DNI con otros participantes.
   */
  updateParticipant(payload, adminEmail) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Datos de participante requeridos.");
    }
    const { participanteId, dni, nombreCompleto } = payload;
    if (!participanteId) throw new Error("ID de participante requerido.");

    return Database.withLock(() => {
      const participants = Database.getAll(CONFIG.SHEETS.PARTICIPANTES);
      const target = participants.find(p => p.Participante_ID === participanteId);
      if (!target) throw new Error("Participante no encontrado.");

      const rawDni = String(dni !== undefined ? dni : target.DNI).trim();
      if (!/^\d{1,8}$/.test(rawDni)) {
        throw new Error("El formato del DNI debe ser exactamente de 8 dígitos numéricos.");
      }
      const cleanDni = rawDni.padStart(8, "0");

      // Prevención de colisión: no permitir que el DNI pertenezca a otro participante registrado
      const collision = participants.find(p => p.Participante_ID !== participanteId && String(p.DNI).trim() === cleanDni);
      if (collision) {
        throw new Error(`El DNI ${cleanDni} ya se encuentra registrado para otro participante (${collision.Nombre_Completo}).`);
      }

      const cleanName = String(nombreCompleto !== undefined ? nombreCompleto : target.Nombre_Completo).trim().replace(/\s+/g, " ").toUpperCase();
      if (cleanName.length < 3) {
        throw new Error("El nombre completo debe tener al menos 3 caracteres.");
      }

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
  },

  /**
   * Obtiene todos los usuarios directivos registrados en el sistema.
   */
  getAdminUsers() {
    return Database.getAll(CONFIG.SHEETS.USUARIOS_ADMIN);
  },

  /**
   * Crea o actualiza un usuario directivo con control RBAC bajo cerrojo atómico.
   * @param {Object} payload { usuarioId?, email, nombreCompleto, rol, estado? }
   * @param {string} actorEmail - Correo del directivo que ejecuta la operación
   */
  saveAdminUser(payload, actorEmail) {
    if (!payload || !payload.email || !String(payload.email).trim()) {
      throw new Error("El correo electrónico del directivo es obligatorio.");
    }
    if (!payload.rol || !String(payload.rol).trim()) {
      throw new Error("El rol del directivo es obligatorio.");
    }

    const cleanEmail = String(payload.email).toLowerCase().trim();
    const cleanRol = String(payload.rol).trim();
    const validRoles = [CONFIG.ROLES.SUPERADMIN, CONFIG.ROLES.ADMIN, CONFIG.ROLES.OPERADOR];
    if (!validRoles.includes(cleanRol)) {
      throw new Error(`Rol inválido '${cleanRol}'. Roles permitidos: ${validRoles.join(", ")}`);
    }

    const cleanName = String(payload.nombreCompleto || payload.nombre || payload.Nombre_Completo || "").trim();
    const cleanEstado = String(payload.estado || payload.Estado || "Activo").trim();

    return Database.withLock(() => {
      const allUsers = Database.getAll(CONFIG.SHEETS.USUARIOS_ADMIN);
      const target = allUsers.find(u => String(u.Email || "").toLowerCase().trim() === cleanEmail);
      const nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

      if (target) {
        // Regla de integridad: No degradar o desactivar al único SuperAdmin activo
        if (target.Rol === CONFIG.ROLES.SUPERADMIN && target.Estado === "Activo" && (cleanRol !== CONFIG.ROLES.SUPERADMIN || cleanEstado === "Inactivo")) {
          const activeSuperAdmins = allUsers.filter(u => u.Rol === CONFIG.ROLES.SUPERADMIN && u.Estado === "Activo");
          if (activeSuperAdmins.length <= 1) {
            throw new Error("No se puede revocar al único SuperAdmin activo.");
          }
        }

        const updateData = {
          Rol: cleanRol,
          Nombre_Completo: cleanName || target.Nombre_Completo,
          Estado: cleanEstado
        };
        Database.updateRow(CONFIG.SHEETS.USUARIOS_ADMIN, target._rowIndex, updateData);

        AuthService.logAudit(actorEmail, "GUARDAR_USUARIO_ADMIN", cleanEmail, "Rol: " + cleanRol);

        return {
          Usuario_ID: target.Usuario_ID,
          Email: cleanEmail,
          Nombre_Completo: cleanName || target.Nombre_Completo,
          Rol: cleanRol,
          Estado: cleanEstado,
          Fecha_Alta: target.Fecha_Alta,
          Creado_Por: target.Creado_Por,
          Ultimo_Acceso: target.Ultimo_Acceso
        };
      } else {
        const userId = "ADM-" + Utilities.getUuid().substring(0, 6).toUpperCase();
        const newRecord = {
          Usuario_ID: userId,
          Email: cleanEmail,
          Nombre_Completo: cleanName,
          Rol: cleanRol,
          Estado: "Activo",
          Fecha_Alta: nowStr,
          Creado_Por: actorEmail,
          Ultimo_Acceso: ""
        };

        Database.insert(CONFIG.SHEETS.USUARIOS_ADMIN, newRecord);
        AuthService.logAudit(actorEmail, "GUARDAR_USUARIO_ADMIN", cleanEmail, "Rol: " + cleanRol);

        return newRecord;
      }
    }, 20000);
  },

  /**
   * Revoca (desactiva) el acceso de un directivo en el panel administrativo.
   * Regla de Integridad: Si el directivo es el único SuperAdmin activo, se rechaza la revocación.
   * @param {string} userId - Usuario_ID o Email
   * @param {string} actorEmail - Correo del directivo que ejecuta la revocación
   */
  revokeAdminUser(userId, actorEmail) {
    if (!userId) {
      throw new Error("Identificador de directivo requerido para revocación.");
    }

    return Database.withLock(() => {
      const allUsers = Database.getAll(CONFIG.SHEETS.USUARIOS_ADMIN);
      const cleanId = String(userId).trim();
      const target = allUsers.find(u => 
        String(u.Usuario_ID || "").trim() === cleanId || 
        String(u.Email || "").toLowerCase().trim() === cleanId.toLowerCase()
      );

      if (!target) {
        throw new Error(`Usuario directivo '${userId}' no encontrado.`);
      }

      // Regla de Integridad: No revocar al único SuperAdmin activo
      if (target.Rol === CONFIG.ROLES.SUPERADMIN && target.Estado === "Activo") {
        const activeSuperAdmins = allUsers.filter(u => u.Rol === CONFIG.ROLES.SUPERADMIN && u.Estado === "Activo");
        if (activeSuperAdmins.length <= 1) {
          throw new Error("No se puede revocar al único SuperAdmin activo.");
        }
      }

      Database.updateRow(CONFIG.SHEETS.USUARIOS_ADMIN, target._rowIndex, {
        Estado: "Inactivo"
      });

      AuthService.logAudit(actorEmail, "REVOCAR_USUARIO_ADMIN", target.Usuario_ID || cleanId, "Directivo desactivado");

      return {
        Usuario_ID: target.Usuario_ID,
        Email: target.Email,
        Estado: "Inactivo",
        revoked: true
      };
    }, 20000);
  },

  /**
   * Obtiene métricas e indicadores consolidados para el Dashboard Administrativo.
   * Soporta vista global o filtrada por Evento_ID.
   * @param {string} eventId - "all", vacío o ID específico (ej. "EVT-2026-001")
   * @param {string} adminEmail - Correo del directivo autenticado
   * @returns {Object} Estadísticas consolidadas del sistema
   */
  getDashboardStats(eventId, adminEmail) {
    const isGlobal = !eventId || eventId === "all" || eventId === "TODOS";
    const cleanEventId = isGlobal ? "" : String(eventId).trim();

    const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
    const allEnrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
    const allParticipants = Database.getAll(CONFIG.SHEETS.PARTICIPANTES);
    const auditLogs = Database.getAll(CONFIG.SHEETS.AUDITORIA);

    let selectedEvent = null;
    let enrollments = allEnrollments;

    if (!isGlobal) {
      selectedEvent = events.find(e => e.Evento_ID === cleanEventId);
      if (!selectedEvent) {
        throw new Error(`El evento con ID '${cleanEventId}' no fue encontrado.`);
      }
      enrollments = allEnrollments.filter(e => e.Evento_ID === cleanEventId);
    }

    // Métricas de Eventos
    const eventStats = {
      total: events.length,
      active: events.filter(e => e.Estado === "Activo").length,
      finished: events.filter(e => e.Estado === "Finalizado").length,
      draft: events.filter(e => e.Estado !== "Activo" && e.Estado !== "Finalizado").length
    };

    // Métricas de Participantes únicos
    let uniqueParticipantsCount = 0;
    if (isGlobal) {
      uniqueParticipantsCount = allParticipants.length;
    } else {
      const partIds = new Set(enrollments.map(e => e.Participante_ID).filter(Boolean));
      uniqueParticipantsCount = partIds.size;
    }

    // Métricas de Inscripciones y Estados de Pago
    const totalEnrollments = enrollments.length;
    const pagadoCount = enrollments.filter(e => e.Estado_Pago === "Pagado").length;
    const pendienteCount = enrollments.filter(e => e.Estado_Pago === "Pendiente").length;
    const anuladoCount = enrollments.filter(e => e.Estado_Pago === "Anulado").length;
    const reembolsadoCount = enrollments.filter(e => e.Estado_Pago === "Reembolsado").length;

    // Tasa de conciliación (% pagados sobre total no anulados)
    const activeEnrollments = totalEnrollments - anuladoCount;
    const paymentRate = activeEnrollments > 0
      ? Number(((pagadoCount / activeEnrollments) * 100).toFixed(1))
      : 0;

    // Modalidad de Certificados
    const virtualCount = enrollments.filter(e => e.Tipo_Certificado === "Virtual").length;
    const fisicoCount = enrollments.filter(e => e.Tipo_Certificado === "Fisico").length;
    const virtualRate = totalEnrollments > 0
      ? Number(((virtualCount / totalEnrollments) * 100).toFixed(1))
      : 0;
    const fisicoRate = totalEnrollments > 0
      ? Number(((fisicoCount / totalEnrollments) * 100).toFixed(1))
      : 0;

    // Desglose por evento (solo en vista global o con evento seleccionado como único item)
    const eventsToBreakdown = isGlobal ? events : [selectedEvent];
    const eventBreakdown = eventsToBreakdown.map(ev => {
      const evEnrollments = allEnrollments.filter(e => e.Evento_ID === ev.Evento_ID);
      const evPaid = evEnrollments.filter(e => e.Estado_Pago === "Pagado").length;
      const evPending = evEnrollments.filter(e => e.Estado_Pago === "Pendiente").length;
      const evActive = evEnrollments.length - evEnrollments.filter(e => e.Estado_Pago === "Anulado").length;
      const evRate = evActive > 0 ? Number(((evPaid / evActive) * 100).toFixed(1)) : 0;

      return {
        eventId: ev.Evento_ID,
        title: ev.Titulo_Evento || "Sin título",
        date: ev.Fecha_Evento || "",
        status: ev.Estado || "Borrador",
        modalidad: ev.Modalidad || "Virtual",
        totalEnrollments: evEnrollments.length,
        paidCount: evPaid,
        pendingCount: evPending,
        physicalCount: evEnrollments.filter(e => e.Tipo_Certificado === "Fisico").length,
        virtualCount: evEnrollments.filter(e => e.Tipo_Certificado === "Virtual").length,
        paymentRate: evRate
      };
    });

    // Actividad reciente (últimos 6 logs de auditoría)
    const recentActivity = auditLogs.slice(-6).reverse().map(l => ({
      logId: l.Log_ID || "",
      timestamp: l.Timestamp || "",
      adminUser: l.Usuario_Admin || "",
      action: l.Accion || "",
      entityId: l.Entidad_Afectada || "",
      detail: l.Detalle || ""
    }));

    return {
      scope: isGlobal ? "global" : "event",
      selectedEventId: cleanEventId || null,
      selectedEventTitle: selectedEvent ? selectedEvent.Titulo_Evento : null,
      events: eventStats,
      participants: {
        totalUnique: uniqueParticipantsCount
      },
      enrollments: {
        total: totalEnrollments,
        byPaymentStatus: {
          pagado: pagadoCount,
          pendiente: pendienteCount,
          anulado: anuladoCount,
          reembolsado: reembolsadoCount
        },
        paymentRate: paymentRate,
        byCertType: {
          virtual: virtualCount,
          fisico: fisicoCount,
          virtualRate: virtualRate,
          fisicoRate: fisicoRate
        }
      },
      eventBreakdown: eventBreakdown,
      recentActivity: recentActivity,
      generatedAt: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss")
    };
  }
};
