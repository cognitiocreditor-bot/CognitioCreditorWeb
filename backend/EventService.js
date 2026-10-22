/**
 * SERVICIO DE EVENTOS — GOOGLE APPS SCRIPT
 * Maneja la recuperación de eventos públicos y operaciones administrativas sobre ellos.
 */

const EventService = {
  /**
   * Obtiene exclusivamente los eventos activos y publicados para el portal público.
   */
  getPublicEvents() {
    const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
    
    // Filtrar solo eventos con Estado = 'Activo'
    const publicEvents = events.filter(evt => evt.Estado === "Activo");

    // Proyectar solo los campos públicos (sin links internos de plantillas)
    return publicEvents.map(evt => ({
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
  toggleEventStatus(eventId, newStatus, adminEmail) {
    const events = Database.getAll(CONFIG.SHEETS.EVENTOS);
    const target = events.find(e => e.Evento_ID === eventId);

    if (!target) {
      throw new Error(`El evento '${eventId}' no existe.`);
    }

    Database.updateCell(CONFIG.SHEETS.EVENTOS, target._rowIndex, "Estado", newStatus);
    AuthService.logAudit(adminEmail, "TOGGLE_EVENTO", eventId, `Estado cambiado a ${newStatus}`);

    return { eventId, status: newStatus };
  }
};
