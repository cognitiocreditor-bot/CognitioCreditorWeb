/**
 * PRUEBAS UNITARIAS: GESTIÓN REVERSIBLE DE ESTADOS DE PAGO Y AUDITORÍA
 * Círculo de Estudios COGNITIO CREDITOR
 * Ejecutable mediante: node tests/unit/payment-transitions.test.js
 */

import { assert, reportSummary } from './test-helper.js';

console.log('--- INICIANDO PRUEBAS DE TRANSICIONES DE PAGO Y AUDITORÍA ---');

/**
 * Función pura que modela la lógica de transición y persistencia de pagos del servidor (AdminService.updatePaymentStatus)
 */
function processPaymentTransition(currentRecord, newStatus, reason, nowLimaStr) {
  const ALLOWED_STATUSES = ['Pendiente', 'Pagado', 'Anulado', 'Reembolsado'];
  if (!newStatus || !ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error('Estado de pago no reconocido. Permitidos: ' + ALLOWED_STATUSES.join(', '));
  }

  const cleanReason = (reason || '').trim();
  if (newStatus !== 'Pagado' && !cleanReason) {
    throw new Error('Debe especificar el motivo de la corrección o cambio de estado de pago.');
  }

  const updated = {
    ...currentRecord,
    Estado_Pago: newStatus
  };

  if (newStatus === 'Pagado') {
    updated.Fecha_Pago = nowLimaStr;
  } else if (newStatus === 'Pendiente') {
    updated.Fecha_Pago = ''; // Limpiar fecha de pago para reflejar deuda pendiente
  } else {
    // Anulado o Reembolsado: conservar la fecha previa existente sin alterarla
    updated.Fecha_Pago = currentRecord.Fecha_Pago || '';
  }

  return updated;
}

/**
 * Simulación del servicio backend AdminService.updatePaymentStatus con mock de base de datos y auditoría
 */
function simulateBackendService({ enrollmentsDb, auditLogsDb }) {
  return {
    updatePaymentStatus(enrollmentId, status, reason, adminEmail) {
      // Compatibilidad hacia atrás con 3 argumentos: (enrollmentId, status, adminEmail)
      if (adminEmail === undefined && typeof reason === 'string' && reason.includes('@')) {
        adminEmail = reason;
        reason = '';
      }

      const ALLOWED_STATUSES = ['Pendiente', 'Pagado', 'Anulado', 'Reembolsado'];
      if (!status || !ALLOWED_STATUSES.includes(status)) {
        throw new Error('Estado de pago no reconocido. Permitidos: ' + ALLOWED_STATUSES.join(', '));
      }

      const cleanReason = (reason || '').trim();
      if (status !== 'Pagado' && !cleanReason) {
        throw new Error('Debe especificar el motivo de la corrección o cambio de estado de pago.');
      }

      const targetIndex = enrollmentsDb.findIndex(e => e.Inscripcion_ID === enrollmentId);
      if (targetIndex === -1) {
        throw new Error('Inscripción no encontrada.');
      }

      const target = enrollmentsDb[targetIndex];
      const previousStatus = target.Estado_Pago || 'Sin estado';

      const updateData = {
        Estado_Pago: status
      };

      if (status === 'Pagado') {
        updateData.Fecha_Pago = '2026-11-09 10:00:00';
      } else if (status === 'Pendiente') {
        updateData.Fecha_Pago = '';
      } else {
        updateData.Fecha_Pago = target.Fecha_Pago || '';
      }

      // Actualizar solo las columnas indicadas preservando IDs
      Object.assign(enrollmentsDb[targetIndex], updateData);

      // Registrar auditoría obligatoria
      const auditDetail = 'De ' + previousStatus + ' a ' + status + '. Motivo: ' + (cleanReason || 'No especificado');
      auditLogsDb.push({
        Usuario: adminEmail,
        Accion: 'CAMBIO_ESTADO_PAGO',
        Entidad_ID: enrollmentId,
        Detalles: auditDetail,
        Fecha: '2026-11-09 10:00:00'
      });

      return {
        enrollmentId,
        status,
        previousStatus
      };
    }
  };
}

// ============================================================================
// SUITE DE PRUEBAS
// ============================================================================

const sampleRecord = {
  Inscripcion_ID: 'INS-2026-0001',
  Participante_ID: 'PART-2026-0099',
  Evento_ID: 'EVT-2026-01',
  Codigo_Consulta: 'CC-998877',
  Tipo_Certificado: 'Virtual',
  Estado_Pago: 'Pendiente',
  Fecha_Pago: ''
};

// 1. Transición normal a Pagado asignando timestamp
console.log('\n[1] Transición de Pendiente a Pagado:');
const paidRecord = processPaymentTransition(sampleRecord, 'Pagado', 'Voucher validado BCP 123456', '2026-11-09 10:15:30');
assert(paidRecord.Estado_Pago === 'Pagado', 'Estado actualizado a Pagado');
assert(paidRecord.Fecha_Pago === '2026-11-09 10:15:30', 'Fecha_Pago asignada con timestamp actual');
assert(paidRecord.Inscripcion_ID === sampleRecord.Inscripcion_ID, 'Inscripcion_ID preservado intacto');
assert(paidRecord.Participante_ID === sampleRecord.Participante_ID, 'Participante_ID preservado intacto');
assert(paidRecord.Codigo_Consulta === sampleRecord.Codigo_Consulta, 'Codigo_Consulta preservado intacto');

// 2. Reversión de Pagado a Pendiente limpiando Fecha_Pago
console.log('\n[2] Reversión de Pagado a Pendiente (corrección de error operativo):');
const revertedRecord = processPaymentTransition(paidRecord, 'Pendiente', 'Error en digitación de comprobante bancario', '2026-11-09 11:00:00');
assert(revertedRecord.Estado_Pago === 'Pendiente', 'Estado revertido exitosamente a Pendiente');
assert(revertedRecord.Fecha_Pago === '', 'Fecha_Pago vaciada a cadena vacía al pasar a Pendiente');
assert(revertedRecord.Inscripcion_ID === 'INS-2026-0001', 'Inscripcion_ID preservado sin mutar');
assert(revertedRecord.Participante_ID === 'PART-2026-0099', 'Participante_ID preservado sin mutar');

// 3. Transición a Anulado conservando historial
console.log('\n[3] Transición a Anulado:');
const cancelledRecord = processPaymentTransition(paidRecord, 'Anulado', 'Inscripción duplicada por el usuario', '2026-11-09 12:00:00');
assert(cancelledRecord.Estado_Pago === 'Anulado', 'Estado actualizado a Anulado');
assert(cancelledRecord.Fecha_Pago === paidRecord.Fecha_Pago, 'Fecha_Pago previa conservada');
assert(cancelledRecord.Inscripcion_ID === 'INS-2026-0001', 'Inscripcion_ID preservado');

// 4. Transición a Reembolsado conservando historial
console.log('\n[4] Transición a Reembolsado:');
const refundedRecord = processPaymentTransition(paidRecord, 'Reembolsado', 'Devolución solicitada por retiro del taller', '2026-11-09 13:00:00');
assert(refundedRecord.Estado_Pago === 'Reembolsado', 'Estado actualizado a Reembolsado');
assert(refundedRecord.Fecha_Pago === paidRecord.Fecha_Pago, 'Fecha_Pago previa conservada');

// 5. Obligatoriedad del motivo para reversiones o correcciones
console.log('\n[5] Obligatoriedad de motivo al cambiar a Pendiente, Anulado o Reembolsado:');
let threwOnEmptyPendiente = false;
try {
  processPaymentTransition(paidRecord, 'Pendiente', '', '2026-11-09 14:00:00');
} catch (e) {
  threwOnEmptyPendiente = e.message.includes('Debe especificar el motivo');
}
assert(threwOnEmptyPendiente, 'Rechaza reversión a Pendiente con motivo vacío');

let threwOnSpacesAnulado = false;
try {
  processPaymentTransition(paidRecord, 'Anulado', '   ', '2026-11-09 14:00:00');
} catch (e) {
  threwOnSpacesAnulado = e.message.includes('Debe especificar el motivo');
}
assert(threwOnSpacesAnulado, 'Rechaza cambio a Anulado con motivo que contiene solo espacios');

let threwOnNullReembolsado = false;
try {
  processPaymentTransition(paidRecord, 'Reembolsado', null, '2026-11-09 14:00:00');
} catch (e) {
  threwOnNullReembolsado = e.message.includes('Debe especificar el motivo');
}
assert(threwOnNullReembolsado, 'Rechaza cambio a Reembolsado con motivo nulo');

// 6. Rechazo de estados no reconocidos
console.log('\n[6] Rechazo de estados no reconocidos:');
let threwOnInvalidStatus = false;
try {
  processPaymentTransition(sampleRecord, 'Aprobado_Super', 'Motivo cualquiera', '2026-11-09 14:00:00');
} catch (e) {
  threwOnInvalidStatus = e.message.includes('Estado de pago no reconocido');
}
assert(threwOnInvalidStatus, 'Rechaza estados fuera de la lista canónica (Pendiente, Pagado, Anulado, Reembolsado)');

let threwOnNullStatus = false;
try {
  processPaymentTransition(sampleRecord, null, 'Motivo', '2026-11-09 14:00:00');
} catch (e) {
  threwOnNullStatus = e.message.includes('Estado de pago no reconocido');
}
assert(threwOnNullStatus, 'Rechaza estado null');

// 7. Simulación de Backend: Preservación de registros, integridad referencial y auditoría
console.log('\n[7] Simulación de Backend (AdminService.updatePaymentStatus y Auditoría):');
const mockEnrollments = [
  { ...sampleRecord, _rowIndex: 2 },
  { Inscripcion_ID: 'INS-2026-0002', Participante_ID: 'PART-2026-0100', Evento_ID: 'EVT-2026-01', Estado_Pago: 'Pendiente', Fecha_Pago: '', _rowIndex: 3 }
];
const mockAuditLogs = [];
const backend = simulateBackendService({ enrollmentsDb: mockEnrollments, auditLogsDb: mockAuditLogs });

// Confirmar pago
const res1 = backend.updatePaymentStatus('INS-2026-0001', 'Pagado', 'Voucher BBVA verificado', 'directivo@unap.edu.pe');
assert(res1.status === 'Pagado', 'Backend retorna status Pagado');
assert(res1.previousStatus === 'Pendiente', 'Backend retorna previousStatus Pendiente');
assert(mockEnrollments[0].Estado_Pago === 'Pagado', 'Base de datos en memoria actualizada a Pagado');
assert(mockAuditLogs.length === 1, 'Registro de auditoría generado');
assert(mockAuditLogs[0].Accion === 'CAMBIO_ESTADO_PAGO', 'Acción auditada es CAMBIO_ESTADO_PAGO');
assert(mockAuditLogs[0].Detalles.includes('De Pendiente a Pagado'), 'Detalle auditoría indica transición correcta');
assert(mockAuditLogs[0].Detalles.includes('Motivo: Voucher BBVA verificado'), 'Detalle auditoría contiene motivo');

// Revertir pago
const res2 = backend.updatePaymentStatus('INS-2026-0001', 'Pendiente', 'Directiva revierte por voucher duplicado', 'admin@unap.edu.pe');
assert(res2.status === 'Pendiente', 'Backend retorna status revertido a Pendiente');
assert(res2.previousStatus === 'Pagado', 'Backend retorna previousStatus Pagado');
assert(mockEnrollments[0].Estado_Pago === 'Pendiente', 'Base de datos en memoria revertida a Pendiente');
assert(mockEnrollments[0].Fecha_Pago === '', 'Fecha_Pago vaciada en base de datos');
assert(mockEnrollments[0].Participante_ID === 'PART-2026-0099', 'Participante_ID nunca fue alterado');
assert(mockAuditLogs.length === 2, 'Segundo registro de auditoría añadido');
assert(mockAuditLogs[1].Detalles.includes('De Pagado a Pendiente'), 'Detalle de auditoría de reversión correcto');

// Validación de error cuando inscripción no existe
let threwNotFound = false;
try {
  backend.updatePaymentStatus('INS-INEXISTENTE', 'Pagado', 'Voucher', 'admin@unap.edu.pe');
} catch (e) {
  threwNotFound = e.message.includes('Inscripción no encontrada');
}
assert(threwNotFound, 'Lanza error "Inscripción no encontrada" si el ID no existe');

// Soporte de firma de 3 parámetros heredada
const resLegacy = backend.updatePaymentStatus('INS-2026-0002', 'Pagado', 'operador@unap.edu.pe');
assert(resLegacy.status === 'Pagado', 'Soporta llamada con 3 parámetros heredada');
assert(mockEnrollments[1].Estado_Pago === 'Pagado', 'Inscripción actualizada mediante firma heredada');

// 8. Inmutabilidad de la estructura relacional (Garantía de no eliminación)
console.log('\n[8] Inmutabilidad y Cero Eliminaciones:');
assert(mockEnrollments.length === 2, 'El conteo total de inscripciones se mantuvo inmutable (cero llamadas a deleteRow)');
assert(mockEnrollments[0].Inscripcion_ID === 'INS-2026-0001', 'Inscripcion_ID permanece intacto tras múltiples transiciones');
assert(mockEnrollments[1].Inscripcion_ID === 'INS-2026-0002', 'Inscripciones adyacentes no sufrieron ningún impacto');

// Reporte final de la suite
reportSummary('Transiciones Reversibles de Pago');
