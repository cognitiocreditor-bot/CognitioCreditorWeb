/**
 * SERVICIO DE CERTIFICADOS Y REGLAS DE NEGOCIO — GOOGLE APPS SCRIPT
 * Evalúa las reglas obligatorias A a F y sirve plantillas autorizadas.
 */

const CertificateService = {
  /**
   * Consulta los certificados de un participante aplicando las Reglas A a F.
   */
  query(dni, queryCode) {
    const cleanDNI = String(dni).trim();
    if (!/^\d{8}$/.test(cleanDNI)) {
      throw new Error("Formato de DNI inválido.");
    }

    // 1. Localizar al participante
    const participants = Database.getAll(CONFIG.SHEETS.PARTICIPANTES);
    const participant = participants.find(p => String(p.DNI).trim() === cleanDNI);

    // Regla F: Si no existe el registro, mensaje prudente
    if (!participant) {
      return {
        found: false,
        records: [],
        message: "No se registran certificados disponibles con los datos proporcionados."
      };
    }

    // 2. Obtener sus inscripciones
    const allEnrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
    let userEnrollments = allEnrollments.filter(e => 
      e.Participante_ID === participant.Participante_ID && e.Estado_Inscripcion !== "Cancelada"
    );

    // Si se suministró código de consulta, filtrar por él para reforzar seguridad
    if (queryCode && queryCode.trim() !== "") {
      const cleanCode = queryCode.trim().toUpperCase();
      userEnrollments = userEnrollments.filter(e => String(e.Codigo_Consulta).toUpperCase() === cleanCode);
    }

    if (userEnrollments.length === 0) {
      return {
        found: false,
        records: [],
        message: "No se encontraron inscripciones activas coincidentes."
      };
    }

    // 3. Evaluar cada inscripción con las reglas de negocio
    const allEvents = Database.getAll(CONFIG.SHEETS.EVENTOS);
    const todayLimaStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");

    const results = userEnrollments.map(ins => {
      const evt = allEvents.find(e => e.Evento_ID === ins.Evento_ID);
      const eventTitle = evt ? evt.Titulo_Evento : "Evento Académico";
      const eventDate = evt ? evt.Fecha_Evento : "";
      const eventStatus = evt ? evt.Estado : "Finalizado";

      let elegibleEmision = false;
      let codigoRegla = "";
      let mensajeRegla = "";

      // REGLA E: Evento cancelado
      if (eventStatus === "Cancelado") {
        codigoRegla = "REGLA_E_CANCELADO";
        mensajeRegla = "El evento fue cancelado. Comunícate con la directiva.";
      }
      // REGLA A: Pago pendiente
      else if (ins.Estado_Pago === "Pendiente") {
        codigoRegla = "REGLA_A_PAGO_PENDIENTE";
        mensajeRegla = "Tu inscripción está registrada, pero el pago está pendiente de confirmación. Si ya realizaste el pago, comunícate con la directiva por WhatsApp.";
      }
      // REGLA B: Evento futuro o en curso (Fecha de Perú <= Fecha_Evento)
      else if (eventDate && todayLimaStr <= eventDate) {
        codigoRegla = "REGLA_B_FUTURO";
        mensajeRegla = "Tu certificado estará disponible a partir del día siguiente al evento.";
      }
      // REGLA C: Certificado físico
      else if (ins.Tipo_Certificado === "Fisico") {
        codigoRegla = "REGLA_C_FISICO";
        mensajeRegla = "Tu certificado es físico. Coordina su entrega o recojo con la directiva del círculo.";
      }
      // REGLA D: Certificado virtual elegible
      else if (ins.Estado_Pago === "Pagado" && ins.Tipo_Certificado === "Virtual") {
        elegibleEmision = true;
        codigoRegla = "REGLA_D_VIRTUAL_LISTO";
        mensajeRegla = "Certificado listo para generar y descargar.";
      }

      return {
        Inscripcion_ID: ins.Inscripcion_ID,
        Evento_ID: ins.Evento_ID,
        Titulo_Evento: eventTitle,
        Nombre_Completo: participant.Nombre_Completo,
        Tipo_Certificado: ins.Tipo_Certificado,
        Estado_Pago: ins.Estado_Pago,
        Elegible_Emision: elegibleEmision,
        Codigo_Regla: codigoRegla,
        Mensaje_Regla: mensajeRegla
      };
    });

    return {
      found: true,
      records: results
    };
  },

  /**
   * Sirve el PDF de la plantilla en Base64 para una inscripción elegible.
   */
  getTemplateForEnrollment(enrollmentId) {
    const allEnrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
    const ins = allEnrollments.find(e => e.Inscripcion_ID === enrollmentId);
    if (!ins) {
      throw new Error("Inscripción no encontrada.");
    }

    if (ins.Estado_Pago !== "Pagado") {
      throw new Error("No cuenta con confirmación de pago para emitir el certificado.");
    }

    const participants = Database.getAll(CONFIG.SHEETS.PARTICIPANTES);
    const participant = participants.find(p => p.Participante_ID === ins.Participante_ID);

    // Obtener configuración del certificado por evento
    const configs = Database.getAll(CONFIG.SHEETS.CONFIG_CERT);
    const certConfig = configs.find(c => c.Evento_ID === ins.Evento_ID) || {
      Pagina_Certificado: 1,
      Posicion_X: 0,
      Posicion_Y: 260,
      Ancho_Maximo_Nombre: 600,
      Tamano_Fuente_Inicial: 32,
      Tamano_Fuente_Minimo: 18,
      Alineacion: "Centrado",
      Color_Texto: "#1B365D"
    };

    // Obtener archivo PDF desde Google Drive
    const templateFileId = certConfig.Link_Plantilla;
    if (!templateFileId) {
      throw new Error("No se ha configurado la plantilla PDF de este evento.");
    }

    const file = DriveApp.getFileById(templateFileId);
    const blob = file.getBlob();
    const base64Pdf = Utilities.base64Encode(blob.getBytes());

    return {
      templateBase64: base64Pdf,
      participantName: participant ? participant.Nombre_Completo : "PARTICIPANTE",
      config: certConfig,
      fileName: `Certificado_${ins.Evento_ID}_${ins.Inscripcion_ID}.pdf`
    };
  }
};
