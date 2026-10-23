/**
 * SERVICIO DE EVENTOS — GOOGLE APPS SCRIPT
 * Maneja la recuperación de eventos públicos y operaciones administrativas sobre ellos.
 */

const EventService = {
  /**
   * Obtiene exclusivamente los eventos activos y publicados para el portal público.
   * Utiliza CacheService en memoria RAM para responder en submilisegundos sin golpear Sheets.
   */
  getPublicEvents() {
    try {
      const cache = CacheService.getScriptCache();
      const cached = cache.get("PUBLIC_EVENTS");
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      // Continuar a Google Sheets si hay alguna anomalía con la caché
    }

    const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
    
    // Filtrar solo eventos con Estado = 'Activo'
    const publicEvents = events.filter(evt => evt.Estado === "Activo").map(evt => ({
      Evento_ID: evt.Evento_ID,
      Titulo_Evento: evt.Titulo_Evento,
      Descripcion: evt.Descripcion,
      Fecha_Evento: evt.Fecha_Evento,
      Hora_Evento: evt.Hora_Evento,
      Expositor: evt.Expositor,
      Imagen_URL: evt.Imagen_URL,
      Link_Formulario: evt.Link_Formulario,
      Modalidad: evt.Modalidad,
      Estado: evt.Estado
    }));

    try {
      const cache = CacheService.getScriptCache();
      // Guardar en caché RAM de Google por 10 minutos (600 segundos)
      cache.put("PUBLIC_EVENTS", JSON.stringify(publicEvents), 600);
    } catch (e) {}

    return publicEvents;
  },

  /**
   * Invalida la caché de eventos públicos en RAM tras cambios administrativos.
   */
  invalidatePublicCache() {
    try {
      const cache = CacheService.getScriptCache();
      cache.remove("PUBLIC_EVENTS");
    } catch (e) {}
  },

  /**
   * Obtiene todos los eventos (uso administrativo).
   */
  getAllEventsAdmin() {
    return Database.getAll(CONFIG.SHEETS.EVENTOS);
  },

  /**
   * Cambia el estado de publicación de un evento.
   */
  /**
   * Cambia el estado de publicación de un evento de forma atómica.
   */
  toggleEventStatus(eventId, newStatus, adminEmail) {
    return Database.withLock(() => {
      const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
      const target = events.find(e => e.Evento_ID === eventId);

      if (!target) {
        throw new Error(`El evento '${eventId}' no existe.`);
      }

      Database.updateRow(CONFIG.SHEETS.EVENTOS, target._rowIndex, { Estado: newStatus });
      this.invalidatePublicCache();
      AuthService.logAudit(adminEmail, "TOGGLE_EVENTO", eventId, `Estado cambiado a ${newStatus}`);

      return { eventId, status: newStatus };
    }, 15000);
  },

  /**
   * Crea o actualiza un evento con auditoría, validación estricta y cerrojo de concurrencia.
   * Permite que múltiples directivos registren eventos a la vez sin colisiones de correlativos.
   * @param {Object} eventData
   * @param {string} adminEmail
   */
  saveEvent(eventData, adminEmail) {
    if (!eventData.Titulo_Evento || !eventData.Titulo_Evento.trim()) {
      throw new Error("El título del evento es obligatorio.");
    }
    if (!eventData.Fecha_Evento || !eventData.Fecha_Evento.trim()) {
      throw new Error("La fecha del evento es obligatoria.");
    }

    return Database.withLock(() => {
      const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
      const isEdit = Boolean(eventData.Evento_ID && eventData.Evento_ID.trim());
      let target = isEdit ? events.find(e => e.Evento_ID === eventData.Evento_ID.trim()) : null;

      const todayLimaStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
      let eventId = isEdit && target ? target.Evento_ID : this.generateNextEventId(events);

      const record = {
        Evento_ID: eventId,
        Titulo_Evento: String(eventData.Titulo_Evento).trim(),
        Descripcion: String(eventData.Descripcion || "").trim(),
        Fecha_Evento: String(eventData.Fecha_Evento).trim(),
        Hora_Evento: String(eventData.Hora_Evento || "").trim(),
        Expositor: String(eventData.Expositor || "").trim(),
        Imagen_URL: String(eventData.Imagen_URL || "").trim(),
        Link_Formulario: String(eventData.Link_Formulario || "").trim(),
        Link_Plantilla: String(eventData.Link_Plantilla || (target ? target.Link_Plantilla : "") || "").trim(),
        Estado: String(eventData.Estado || "Activo").trim(),
        Modalidad: String(eventData.Modalidad || "Virtual").trim(),
        Fecha_Publicacion: target && target.Fecha_Publicacion ? target.Fecha_Publicacion : todayLimaStr,
        Configuracion_Certificado_ID: target && target.Configuracion_Certificado_ID ? target.Configuracion_Certificado_ID : "CFG-" + eventId
      };

      if (isEdit && target) {
        Database.updateRow(CONFIG.SHEETS.EVENTOS, target._rowIndex, record);
        AuthService.logAudit(adminEmail, "EDITAR_EVENTO", eventId, `Evento actualizado: ${record.Titulo_Evento}`);
      } else {
        Database.insert(CONFIG.SHEETS.EVENTOS, record);
        AuthService.logAudit(adminEmail, "CREAR_EVENTO", eventId, `Evento creado: ${record.Titulo_Evento}`);
      }

      this.invalidatePublicCache();

      return record;
    }, 20000);
  },

  /**
   * Genera el siguiente identificador correlativo con formato EVT-YYYY-NNN
   */
  generateNextEventId(events) {
    const currentYear = new Date().getFullYear();
    const prefix = `EVT-${currentYear}-`;
    let maxNum = 0;

    events.forEach(e => {
      if (e.Evento_ID && e.Evento_ID.startsWith(prefix)) {
        const numPart = parseInt(e.Evento_ID.replace(prefix, ""), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    });

    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(3, "0")}`;
  },

  /**
   * Eliminación segura e inteligente de un evento.
   * Si tiene alumnos inscritos, bloquea la eliminación para proteger la integridad.
   * Si no tiene alumnos, elimina la fila física en Eventos y Configuracion_Certificados.
   * @param {string} eventId
   * @param {string} adminEmail
   */
  deleteEvent(eventId, adminEmail) {
    if (!eventId) throw new Error("ID de evento requerido para eliminar.");

    return Database.withLock(() => {
      const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
      const target = events.find(e => e.Evento_ID === eventId);
      if (!target) {
        throw new Error(`El evento '${eventId}' no existe.`);
      }

      // Verificar si tiene inscripciones vinculadas
      const enrollments = Database.getAll(CONFIG.SHEETS.INSCRIPCIONES);
      const linkedEnrollments = enrollments.filter(ins => ins.Evento_ID === eventId);

      if (linkedEnrollments.length > 0) {
        throw new Error(
          `BLOQUEO DE SEGURIDAD: No se puede eliminar el evento '${eventId}' porque cuenta con ${linkedEnrollments.length} participante(s) registrado(s). Para ocultarlo de la web sin destruir el historial académico de los alumnos, cambie su estado a 'Cancelado' o 'Inactivo'.`
        );
      }

      // Borrado seguro por Clave Primaria (sin descuadres de índices)
      const deletedEvent = Database.deleteRowByPk(CONFIG.SHEETS.EVENTOS, "Evento_ID", eventId);
      if (!deletedEvent) {
        throw new Error(`No fue posible ubicar físicamente la fila del evento '${eventId}'.`);
      }

      // Eliminar configuración de certificado asociada si existiera
      Database.deleteRowByPk(CONFIG.SHEETS.CONFIG_CERT, "Evento_ID", eventId);

      this.invalidatePublicCache();

      AuthService.logAudit(adminEmail, "ELIMINAR_EVENTO", eventId, `Evento eliminado físicamente (0 inscritos). Título: ${target.Titulo_Evento}`);

      return { eventId, deleted: true, message: `Evento ${eventId} eliminado correctamente.` };
    }, 20000);
  }
};
