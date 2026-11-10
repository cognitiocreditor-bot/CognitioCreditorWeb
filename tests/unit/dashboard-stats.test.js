/**
 * SUITE DE PRUEBAS UNITARIAS: DASHBOARD ADMINISTRATIVO Y ESTADÍSTICAS (FASE E)
 * Verifica el cálculo de KPIs, agregaciones por evento, estados de pago, modalidades y casos borde (división por cero).
 */

import { assert, reportSummary } from './test-helper.js';

// Mock de base de datos en memoria para pruebas de estadísticas
function createMockDashboardEnvironment() {
  const events = [
    { Evento_ID: "EVT-2026-001", Titulo_Evento: "Auditoría Financiera", Fecha_Evento: "2026-11-01", Estado: "Finalizado", Modalidad: "Virtual" },
    { Evento_ID: "EVT-2026-002", Titulo_Evento: "Tributación Corporativa", Fecha_Evento: "2026-11-20", Estado: "Activo", Modalidad: "Hibrido" },
    { Evento_ID: "EVT-2026-003", Titulo_Evento: "Taller Borrador", Fecha_Evento: "2026-12-05", Estado: "Borrador", Modalidad: "Presencial" },
    { Evento_ID: "EVT-2026-004", Titulo_Evento: "Evento Cancelado", Fecha_Evento: "2026-10-15", Estado: "Cancelado", Modalidad: "Virtual" }
  ];

  const participants = [
    { Participante_ID: "PAR-001", DNI: "71234567", Nombre_Completo: "JUAN PEREZ", Estado_Registro: "Activo" },
    { Participante_ID: "PAR-002", DNI: "72345678", Nombre_Completo: "MARIA GOMEZ", Estado_Registro: "Activo" },
    { Participante_ID: "PAR-003", DNI: "73456789", Nombre_Completo: "CARLOS LOPEZ", Estado_Registro: "Activo" },
    { Participante_ID: "PAR-004", DNI: "74567890", Nombre_Completo: "ANA VILCA", Estado_Registro: "Activo" }
  ];

  const enrollments = [
    // EVT-2026-001: 3 inscripciones (2 Pagado, 1 Pendiente; 2 Virtual, 1 Fisico)
    { Inscripcion_ID: "INS-001", Participante_ID: "PAR-001", Evento_ID: "EVT-2026-001", Tipo_Certificado: "Virtual", Estado_Pago: "Pagado" },
    { Inscripcion_ID: "INS-002", Participante_ID: "PAR-002", Evento_ID: "EVT-2026-001", Tipo_Certificado: "Virtual", Estado_Pago: "Pagado" },
    { Inscripcion_ID: "INS-003", Participante_ID: "PAR-003", Evento_ID: "EVT-2026-001", Tipo_Certificado: "Fisico", Estado_Pago: "Pendiente" },

    // EVT-2026-002: 4 inscripciones (1 Pagado, 1 Pendiente, 1 Anulado, 1 Reembolsado; 2 Virtual, 2 Fisico)
    { Inscripcion_ID: "INS-004", Participante_ID: "PAR-001", Evento_ID: "EVT-2026-002", Tipo_Certificado: "Fisico", Estado_Pago: "Pagado" },
    { Inscripcion_ID: "INS-005", Participante_ID: "PAR-002", Evento_ID: "EVT-2026-002", Tipo_Certificado: "Virtual", Estado_Pago: "Pendiente" },
    { Inscripcion_ID: "INS-006", Participante_ID: "PAR-003", Evento_ID: "EVT-2026-002", Tipo_Certificado: "Virtual", Estado_Pago: "Anulado" },
    { Inscripcion_ID: "INS-007", Participante_ID: "PAR-004", Evento_ID: "EVT-2026-002", Tipo_Certificado: "Fisico", Estado_Pago: "Reembolsado" }

    // EVT-2026-003: 0 inscripciones (caso borde evento vacío)
  ];

  const auditLogs = [
    { Log_ID: "LOG-001", Timestamp: "2026-11-01 10:00:00", Usuario_Admin: "admin1@cognitio.pe", Accion: "CREAR_EVENTO", Entidad_Afectada: "EVT-2026-001", Detalle: "Nuevo evento" },
    { Log_ID: "LOG-002", Timestamp: "2026-11-02 11:30:00", Usuario_Admin: "admin2@cognitio.pe", Accion: "CONFIRMAR_PAGO", Entidad_Afectada: "INS-001", Detalle: "Pago confirmado" },
    { Log_ID: "LOG-003", Timestamp: "2026-11-03 14:15:00", Usuario_Admin: "admin1@cognitio.pe", Accion: "CAMBIO_ESTADO_PAGO", Entidad_Afectada: "INS-006", Detalle: "De Pagado a Anulado" },
    { Log_ID: "LOG-004", Timestamp: "2026-11-04 16:45:00", Usuario_Admin: "admin3@cognitio.pe", Accion: "REGISTRO_INDIVIDUAL_ADMIN", Entidad_Afectada: "INS-007", Detalle: "Registro manual" }
  ];

  function computeDashboardStats(eventId, adminEmail) {
    const isGlobal = !eventId || eventId === "all" || eventId === "TODOS";
    const cleanEventId = isGlobal ? "" : String(eventId).trim();

    let selectedEvent = null;
    let targetEnrollments = enrollments;

    if (!isGlobal) {
      selectedEvent = events.find(e => e.Evento_ID === cleanEventId);
      if (!selectedEvent) {
        throw new Error(`El evento con ID '${cleanEventId}' no fue encontrado.`);
      }
      targetEnrollments = enrollments.filter(e => e.Evento_ID === cleanEventId);
    }

    const eventStats = {
      total: events.length,
      active: events.filter(e => e.Estado === "Activo").length,
      finished: events.filter(e => e.Estado === "Finalizado").length,
      draft: events.filter(e => e.Estado !== "Activo" && e.Estado !== "Finalizado").length
    };

    let uniqueParticipantsCount = 0;
    if (isGlobal) {
      uniqueParticipantsCount = participants.length;
    } else {
      const partIds = new Set(targetEnrollments.map(e => e.Participante_ID).filter(Boolean));
      uniqueParticipantsCount = partIds.size;
    }

    const totalEnrollments = targetEnrollments.length;
    const pagadoCount = targetEnrollments.filter(e => e.Estado_Pago === "Pagado").length;
    const pendienteCount = targetEnrollments.filter(e => e.Estado_Pago === "Pendiente").length;
    const anuladoCount = targetEnrollments.filter(e => e.Estado_Pago === "Anulado").length;
    const reembolsadoCount = targetEnrollments.filter(e => e.Estado_Pago === "Reembolsado").length;

    const activeEnrollments = totalEnrollments - anuladoCount;
    const paymentRate = activeEnrollments > 0
      ? Number(((pagadoCount / activeEnrollments) * 100).toFixed(1))
      : 0;

    const virtualCount = targetEnrollments.filter(e => e.Tipo_Certificado === "Virtual").length;
    const fisicoCount = targetEnrollments.filter(e => e.Tipo_Certificado === "Fisico").length;
    const virtualRate = totalEnrollments > 0
      ? Number(((virtualCount / totalEnrollments) * 100).toFixed(1))
      : 0;
    const fisicoRate = totalEnrollments > 0
      ? Number(((fisicoCount / totalEnrollments) * 100).toFixed(1))
      : 0;

    const eventsToBreakdown = isGlobal ? events : [selectedEvent];
    const eventBreakdown = eventsToBreakdown.map(ev => {
      const evEnrollments = enrollments.filter(e => e.Evento_ID === ev.Evento_ID);
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
      recentActivity: recentActivity
    };
  }

  return { computeDashboardStats };
}

// ==========================================
// EJECUCIÓN DE PRUEBAS UNITARIAS
// ==========================================

console.log("--- INICIANDO PRUEBAS UNITARIAS: DASHBOARD ADMINISTRATIVO (FASE E) ---");

// Suite 1: Estadísticas Globales (scope: 'global')
console.log("\n[1] Estadísticas Globales (todos los eventos):");
{
  const { computeDashboardStats } = createMockDashboardEnvironment();
  const stats = computeDashboardStats("all", "admin@cognitio.pe");

  assert(stats.scope === "global", "Scope es global");
  assert(stats.selectedEventId === null, "No hay evento específico seleccionado");
  
  // Eventos: 4 totales, 1 Activo, 1 Finalizado, 2 Borrador/Cancelado
  assert(stats.events.total === 4, "Total de eventos es 4");
  assert(stats.events.active === 1, "1 evento activo");
  assert(stats.events.finished === 1, "1 evento finalizado");
  assert(stats.events.draft === 2, "2 eventos en otros estados");

  // Participantes únicos globales: 4
  assert(stats.participants.totalUnique === 4, "Total de participantes únicos es 4");

  // Inscripciones globales: 7 totales
  assert(stats.enrollments.total === 7, "Total de inscripciones acumuladas es 7");

  // Estados de pago globales: 3 Pagado, 2 Pendiente, 1 Anulado, 1 Reembolsado
  assert(stats.enrollments.byPaymentStatus.pagado === 3, "3 inscripciones pagadas");
  assert(stats.enrollments.byPaymentStatus.pendiente === 2, "2 inscripciones pendientes");
  assert(stats.enrollments.byPaymentStatus.anulado === 1, "1 inscripción anulada");
  assert(stats.enrollments.byPaymentStatus.reembolsado === 1, "1 inscripción reembolsada");

  // Tasa de conciliación: 3 pagados sobre (7 - 1 anulado = 6 activos) = 50.0%
  assert(stats.enrollments.paymentRate === 50.0, "Tasa de pago es 50.0%");

  // Modalidad: 4 Virtuales, 3 Físicos
  assert(stats.enrollments.byCertType.virtual === 4, "4 certificados virtuales");
  assert(stats.enrollments.byCertType.fisico === 3, "3 certificados físicos");
  assert(stats.enrollments.byCertType.virtualRate === 57.1, "57.1% modalidad virtual");
  assert(stats.enrollments.byCertType.fisicoRate === 42.9, "42.9% modalidad física");
}

// Suite 2: Desglose por Evento y Actividad Reciente
console.log("\n[2] Desglose por Evento y Auditoría Reciente:");
{
  const { computeDashboardStats } = createMockDashboardEnvironment();
  const stats = computeDashboardStats("", "admin@cognitio.pe");

  assert(stats.eventBreakdown.length === 4, "Desglose contiene los 4 eventos");
  
  const evt1 = stats.eventBreakdown.find(e => e.eventId === "EVT-2026-001");
  assert(evt1 !== undefined, "EVT-2026-001 presente en desglose");
  assert(evt1.totalEnrollments === 3, "EVT-001 tiene 3 inscripciones");
  assert(evt1.paidCount === 2, "EVT-001 tiene 2 pagados");
  assert(evt1.pendingCount === 1, "EVT-001 tiene 1 pendiente");
  assert(evt1.paymentRate === 66.7, "EVT-001 tasa es 66.7%");

  // Actividad reciente ordenada descendente
  assert(stats.recentActivity.length === 4, "4 logs de auditoría");
  assert(stats.recentActivity[0].logId === "LOG-004", "El más reciente primero");
  assert(stats.recentActivity[3].logId === "LOG-001", "El más antiguo al final");
}

// Suite 3: Filtro por Evento Específico (scope: 'event')
console.log("\n[3] Filtrado por Evento Específico (EVT-2026-001):");
{
  const { computeDashboardStats } = createMockDashboardEnvironment();
  const stats = computeDashboardStats("EVT-2026-001", "admin@cognitio.pe");

  assert(stats.scope === "event", "Scope es event");
  assert(stats.selectedEventId === "EVT-2026-001", "ID de evento coincide");
  assert(stats.selectedEventTitle === "Auditoría Financiera", "Título del evento coincide");

  // Participantes en este evento: 3 participantes únicos
  assert(stats.participants.totalUnique === 3, "3 participantes únicos en este evento");

  // Inscripciones en EVT-2026-001: 3
  assert(stats.enrollments.total === 3, "Total 3 inscripciones");
  assert(stats.enrollments.byPaymentStatus.pagado === 2, "2 pagados");
  assert(stats.enrollments.byPaymentStatus.pendiente === 1, "1 pendiente");
  assert(stats.enrollments.byPaymentStatus.anulado === 0, "0 anulados");
  assert(stats.enrollments.paymentRate === 66.7, "Tasa de pago 66.7%");

  // Desglose contiene solo el evento seleccionado
  assert(stats.eventBreakdown.length === 1, "Solo 1 evento en desglose filtrado");
}

// Suite 4: Casos Borde y División por Cero
console.log("\n[4] Casos Borde: Evento sin inscripciones:");
{
  const { computeDashboardStats } = createMockDashboardEnvironment();
  const stats = computeDashboardStats("EVT-2026-003", "admin@cognitio.pe");

  assert(stats.enrollments.total === 0, "Total 0 inscripciones");
  assert(stats.enrollments.paymentRate === 0, "Tasa de pago es 0 (no NaN ni Infinity)");
  assert(stats.enrollments.byCertType.virtualRate === 0, "Tasa virtual es 0");
  assert(stats.enrollments.byCertType.fisicoRate === 0, "Tasa física es 0");
  assert(stats.participants.totalUnique === 0, "0 participantes únicos");
}

console.log("\n[5] Validación de Errores: Evento Inexistente:");
{
  const { computeDashboardStats } = createMockDashboardEnvironment();
  let errorCaught = false;

  try {
    computeDashboardStats("EVT-INEXISTENTE-999", "admin@cognitio.pe");
  } catch (err) {
    errorCaught = true;
    assert(err.message.includes("no fue encontrado"), "Mensaje de error descriptivo: " + err.message);
  }

  assert(errorCaught, "Lanza error ante ID de evento no encontrado");
}

reportSummary("Dashboard y Estadísticas (Fase E)");
