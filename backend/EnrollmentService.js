/**
 * SERVICIO DE INSCRIPCIONES — GOOGLE APPS SCRIPT
 * Procesa registros, previene duplicados y genera códigos de consulta individuales.
 */

const EnrollmentService = {
  /**
   * Registra una nueva inscripción desde el formulario del portal o panel directivo.
   * Totalmente protegido contra concurrencia múltiple mediante cerrojo atómico (withLock).
   */
  register(payload) {
    const { Evento_ID, DNI, Nombre_Completo, Tipo_Certificado, Referencia_Comprobante } = payload;

    if (!Evento_ID || !DNI || !Nombre_Completo) {
      throw new Error("Faltan campos obligatorios para la inscripción.");
    }

    let cleanDNI = String(DNI).trim();
    if (/^\d{1,8}$/.test(cleanDNI)) {
      cleanDNI = cleanDNI.padStart(8, "0");
    }
    if (!/^\d{8}$/.test(cleanDNI)) {
      throw new Error("El formato del DNI debe ser de 8 dígitos numéricos.");
    }

    // Ejecutar la persistencia bajo exclusión mutua para evitar condiciones de carrera
    return Database.withLock(() => {
      // 1. Verificar si el evento existe y está activo
      const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
      const event = events.find(e => e.Evento_ID === Evento_ID);
      if (!event || event.Estado !== "Activo") {
        throw new Error("El evento seleccionado no admite inscripciones actualmente.");
      }

      // 2. Gestionar Participante (buscar si ya existe o crearlo)
      const participants = Database.getAll(CONFIG.SHEETS.PARTICIPANTES);
      let participant = participants.find(p => String(p.DNI).trim() === cleanDNI);

      let participantId = "";
      if (participant) {
        participantId = participant.Participante_ID;
      } else {
        // ID único resiliente a concurrencia basado en UUID
        participantId = "PAR-" + Utilities.getUuid().substring(0, 8).toUpperCase();
        Database.insert(CONFIG.SHEETS.PARTICIPANTES, {
          Participante_ID: participantId,
          DNI: cleanDNI,
          Nombre_Completo: String(Nombre_Completo).trim().toUpperCase(),
          Fecha_Registro: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
          Estado_Registro: "Activo"
        });
      }

      // 3. Prevenir inscripciones duplicadas accidentales para el mismo evento
      const enrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
      const existingEnrollment = enrollments.find(e => 
        e.Participante_ID === participantId && e.Evento_ID === Evento_ID && e.Estado_Inscripcion !== "Cancelada"
      );

      if (existingEnrollment) {
        // Devolver la inscripción existente con su código original sin duplicar
        return {
          Inscripcion_ID: existingEnrollment.Inscripcion_ID,
          Codigo_Consulta: existingEnrollment.Codigo_Consulta,
          Estado_Pago: existingEnrollment.Estado_Pago,
          mensaje: "Ya te encontrabas inscrito en este evento. Aquí tienes tu código de consulta."
        };
      }

      // 4. Generar nuevo Código de Consulta (ej. CC-7B4D2F) e ID de Inscripción único
      const queryCode = "CC-" + Utilities.getUuid().substring(0, 6).toUpperCase();
      const currentYear = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy");
      const enrollmentId = "INS-" + currentYear + "-" + Utilities.getUuid().substring(0, 6).toUpperCase();

      // REGLA FUNDAMENTAL: Nunca marcar automáticamente como pagado
      const newEnrollment = {
        Inscripcion_ID: enrollmentId,
        Participante_ID: participantId,
        Evento_ID: Evento_ID,
        Tipo_Certificado: Tipo_Certificado === "Fisico" ? "Fisico" : "Virtual",
        Estado_Pago: "Pendiente",
        Fecha_Pago: "",
        Referencia_Comprobante: Referencia_Comprobante ? String(Referencia_Comprobante).trim() : "",
        Estado_Inscripcion: "Registrada",
        Codigo_Consulta: queryCode,
        Fecha_Emision: ""
      };

      Database.insert(CONFIG.SHEETS.INSCRIPCIONES, newEnrollment);

      return {
        Inscripcion_ID: enrollmentId,
        Codigo_Consulta: queryCode,
        Estado_Pago: "Pendiente"
      };
    }, 25000);
  }
};
