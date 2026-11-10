/**
 * PRUEBAS UNITARIAS: REGISTRO INDIVIDUAL ADMINISTRATIVO DE PARTICIPANTES (TASK 4)
 * Círculo de Estudios COGNITIO CREDITOR
 * Ejecutable mediante: node tests/unit/individual-registration.test.js
 */

import { assert, reportSummary } from './test-helper.js';

console.log('--- INICIANDO PRUEBAS DE REGISTRO INDIVIDUAL ADMINISTRATIVO (TASK 4) ---');

/**
 * Simulación en memoria de la base de datos y servicios backend (AdminService.registerIndividualParticipant)
 */
function createMockBackend() {
  const eventsDb = [
    { Evento_ID: "EVT-2026-01", Titulo: "Seminario Derecho Civil", Estado: "Activo" },
    { Evento_ID: "EVT-2026-02", Titulo: "Taller Procesal Constitucional", Estado: "Activo" }
  ];

  const participantsDb = [
    {
      Participante_ID: "PAR-E1000001",
      DNI: "45678901",
      Nombre_Completo: "CARLOS RAMIREZ SOTO",
      Fecha_Registro: "2026-10-01 10:00:00",
      Estado_Registro: "Activo"
    }
  ];

  const enrollmentsDb = [
    {
      Inscripcion_ID: "INS-2026-A10001",
      Participante_ID: "PAR-E1000001",
      Evento_ID: "EVT-2026-01",
      Tipo_Certificado: "Virtual",
      Estado_Pago: "Pagado",
      Fecha_Pago: "2026-10-01 10:30:00",
      Referencia_Comprobante: "VOUCHER-001",
      Estado_Inscripcion: "Registrada",
      Codigo_Consulta: "CC-A10001",
      Fecha_Emision: ""
    }
  ];

  const auditLogsDb = [];

  let uuidCounter = 100;
  function mockUuid() {
    uuidCounter++;
    return `${uuidCounter}_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  }

  const service = {
    eventsDb,
    participantsDb,
    enrollmentsDb,
    auditLogsDb,

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

      // 3. Normalizar nombre
      const cleanName = nameRaw.replace(/\s+/g, " ").trim().toUpperCase();
      if (cleanName.length < 3) {
        throw new Error("El nombre completo debe tener al menos 3 caracteres.");
      }

      // 4. Tipo de Certificado y Estado inicial
      const tipoCertificado = certTypeRaw === "Fisico" ? "Fisico" : "Virtual";
      const status = (paymentStatusRaw === "Pagado") ? "Pagado" : "Pendiente";

      // 5. Validar existencia del evento
      const event = eventsDb.find(e => e.Evento_ID === eventId);
      if (!event) {
        throw new Error("El evento seleccionado no existe.");
      }

      const nowStr = "2026-11-09 16:00:00";
      const currentYear = "2026";

      // 6. Gestión del participante: buscar o crear
      let participant = participantsDb.find(p => String(p.DNI).trim() === cleanDNI);
      let participantId = "";

      if (participant) {
        participantId = participant.Participante_ID;
      } else {
        participantId = "PAR-" + mockUuid().substring(0, 8).toUpperCase();
        const newPart = {
          Participante_ID: participantId,
          DNI: cleanDNI,
          Nombre_Completo: cleanName,
          Fecha_Registro: nowStr,
          Estado_Registro: "Activo"
        };
        participantsDb.push(newPart);
      }

      // 7. Prevención de duplicados para el mismo evento
      const existingEnrollment = enrollmentsDb.find(e =>
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

      // 8. Crear nueva inscripción
      const queryCode = "CC-" + mockUuid().substring(0, 6).toUpperCase();
      const enrollmentId = "INS-" + currentYear + "-" + mockUuid().substring(0, 6).toUpperCase();
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

      enrollmentsDb.push(newEnrollment);

      // 9. Registrar auditoría
      auditLogsDb.push({
        Usuario: adminEmail,
        Accion: "REGISTRO_INDIVIDUAL_ADMIN",
        Entidad_ID: enrollmentId,
        Detalles: 'DNI: ' + cleanDNI + ', Pago: ' + status,
        Fecha: nowStr
      });

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
    }
  };

  return service;
}

// ============================================================================
// EJECUCIÓN DE PRUEBAS UNITARIAS
// ============================================================================

const backend = createMockBackend();

// ----------------------------------------------------------------------------
// REQUERIMIENTO 1: Normalización y padding de DNI con ceros a la izquierda
// ----------------------------------------------------------------------------
console.log('\n[1] Normalización y padding de DNI:');

// Caso 1.1: DNI de 7 dígitos recibe padding de cero inicial
const resPadding = backend.registerIndividualParticipant({
  eventId: "EVT-2026-01",
  dni: "7123456", // 7 dígitos
  nombreCompleto: "Ana María Delgado",
  initialPaymentStatus: "Pendiente"
}, "admin@cognitio.org");

assert(resPadding.isExisting === false, "Nuevo registro creado para DNI de 7 dígitos");
const partDelgado = backend.participantsDb.find(p => p.Participante_ID === resPadding.participantId);
assert(partDelgado.DNI === "07123456", "DNI de 7 dígitos normalizado a 8 dígitos con padding 07123456");
assert(partDelgado.Nombre_Completo === "ANA MARÍA DELGADO", "Nombre normalizado en mayúsculas");

// Caso 1.2: DNI con espacios y guiones es sanitizado
const resSanitized = backend.registerIndividualParticipant({
  eventId: "EVT-2026-01",
  dni: " 80-234-567 ",
  nombreCompleto: "Luis Fernando Torres",
  initialPaymentStatus: "Pendiente"
}, "admin@cognitio.org");
const partTorres = backend.participantsDb.find(p => p.Participante_ID === resSanitized.participantId);
assert(partTorres.DNI === "80234567", "DNI con guiones y espacios sanitizado a 80234567");

// Caso 1.3: DNI inválido (letras o longitud > 8) es rechazado
let errorDniInvalido = false;
try {
  backend.registerIndividualParticipant({
    eventId: "EVT-2026-01",
    dni: "123456789", // 9 dígitos
    nombreCompleto: "Pedro Castillo"
  }, "admin@cognitio.org");
} catch (e) {
  errorDniInvalido = e.message.includes("8 dígitos");
}
assert(errorDniInvalido, "Rechaza DNI de 9 dígitos con error explicativo");

// ----------------------------------------------------------------------------
// REQUERIMIENTO 2: Creación de nuevo participante e inscripción
// ----------------------------------------------------------------------------
console.log('\n[2] Creación de nuevo participante e inscripción:');

const countPartsBefore = backend.participantsDb.length;
const countEnrollsBefore = backend.enrollmentsDb.length;
const countAuditsBefore = backend.auditLogsDb.length;

const resNuevo = backend.registerIndividualParticipant({
  eventId: "EVT-2026-02",
  dni: "76543210",
  nombreCompleto: "Gabriela Mistral Rios",
  tipoCertificado: "Fisico",
  initialPaymentStatus: "Pagado",
  referenciaComprobante: "VOUCHER-BCP-987"
}, "directivo@cognitio.org");

assert(resNuevo.isExisting === false, "Indica isExisting: false");
assert(resNuevo.enrollmentId.startsWith("INS-2026-"), "Genera enrollmentId con formato INS-2026-XXXXXX");
assert(resNuevo.participantId.startsWith("PAR-"), "Genera participantId con formato PAR-XXXXXXXX");
assert(resNuevo.queryCode.startsWith("CC-"), "Genera queryCode con formato CC-XXXXXX");
assert(backend.participantsDb.length === countPartsBefore + 1, "Agrega exactamente 1 fila en Participantes");
assert(backend.enrollmentsDb.length === countEnrollsBefore + 1, "Agrega exactamente 1 fila en Inscripciones");
assert(backend.auditLogsDb.length === countAuditsBefore + 1, "Registra 1 evento en Auditoría");

const auditEntry = backend.auditLogsDb[backend.auditLogsDb.length - 1];
assert(auditEntry.Accion === "REGISTRO_INDIVIDUAL_ADMIN", "Acción de auditoría es REGISTRO_INDIVIDUAL_ADMIN");
assert(auditEntry.Usuario === "directivo@cognitio.org", "Auditoría asocia el directivo emisor");
assert(auditEntry.Detalles.includes("DNI: 76543210"), "Detalles de auditoría registran el DNI");

// ----------------------------------------------------------------------------
// REQUERIMIENTO 3: Reutilización de participante existente sin duplicar Participante_ID
// ----------------------------------------------------------------------------
console.log('\n[3] Reutilización de participante existente (mismo DNI en otro evento):');

// El participante "CARLOS RAMIREZ SOTO" (DNI 45678901) ya existe en participantsDb con ID PAR-E1000001
const countPartsPreReuso = backend.participantsDb.length;

const resReuso = backend.registerIndividualParticipant({
  eventId: "EVT-2026-02", // Inscribir en un SEGUNDO evento
  dni: "45678901",
  nombreCompleto: "Carlos Ramírez Soto", // Posible variación tipográfica
  initialPaymentStatus: "Pendiente"
}, "admin@cognitio.org");

assert(resReuso.isExisting === false, "Es una nueva inscripción en EVT-2026-02");
assert(resReuso.participantId === "PAR-E1000001", "Reutiliza exactamente el mismo Participante_ID preexistente (PAR-E1000001)");
assert(backend.participantsDb.length === countPartsPreReuso, "No inserta filas duplicadas en Participantes (conteo idéntico)");

// ----------------------------------------------------------------------------
// REQUERIMIENTO 4: Detección de duplicado exacto para el mismo evento
// ----------------------------------------------------------------------------
console.log('\n[4] Detección de duplicado exacto en el mismo evento:');

const countEnrollsPreDup = backend.enrollmentsDb.length;
const countPartsPreDup = backend.participantsDb.length;

// Intentar registrar a Carlos Ramírez (45678901) nuevamente en EVT-2026-01 donde ya está inscrito
const resDuplicado = backend.registerIndividualParticipant({
  eventId: "EVT-2026-01",
  dni: "45678901",
  nombreCompleto: "CARLOS RAMIREZ SOTO",
  initialPaymentStatus: "Pagado"
}, "admin@cognitio.org");

assert(resDuplicado.isExisting === true, "isExisting marcado como true");
assert(resDuplicado.enrollmentId === "INS-2026-A10001", "Retorna la inscripción original existente");
assert(resDuplicado.queryCode === "CC-A10001", "Retorna el Codigo_Consulta original");
assert(resDuplicado.message.includes("ya se encontraba inscrito"), "Mensaje informa que ya estaba inscrito");
assert(backend.enrollmentsDb.length === countEnrollsPreDup, "CERO filas añadidas a Inscripciones");
assert(backend.participantsDb.length === countPartsPreDup, "CERO filas añadidas a Participantes");

// ----------------------------------------------------------------------------
// REQUERIMIENTO 5: Registro con pago inicial Pagado asignando Fecha_Pago
// ----------------------------------------------------------------------------
console.log('\n[5] Registro con pago inicial Pagado:');

const resPagado = backend.registerIndividualParticipant({
  eventId: "EVT-2026-01",
  dni: "33445566",
  nombreCompleto: "Valeria Santisteban",
  initialPaymentStatus: "Pagado",
  referenciaComprobante: "EFECTIVO-DIRECTO"
}, "cajero@cognitio.org");

assert(resPagado.paymentStatus === "Pagado", "Retorna paymentStatus: Pagado");
const enrollmentPagado = backend.enrollmentsDb.find(e => e.Inscripcion_ID === resPagado.enrollmentId);
assert(enrollmentPagado.Estado_Pago === "Pagado", "Estado_Pago en base de datos es Pagado");
assert(enrollmentPagado.Fecha_Pago === "2026-11-09 16:00:00", "Fecha_Pago asignada con timestamp actual");
assert(enrollmentPagado.Referencia_Comprobante === "EFECTIVO-DIRECTO", "Referencia de comprobante registrada");

// ----------------------------------------------------------------------------
// REQUERIMIENTO 6: Registro con pago inicial Pendiente dejando Fecha_Pago vacía
// ----------------------------------------------------------------------------
console.log('\n[6] Registro con pago inicial Pendiente:');

const resPendiente = backend.registerIndividualParticipant({
  eventId: "EVT-2026-01",
  dni: "99887766",
  nombreCompleto: "Jorge Basadre Grohmann",
  initialPaymentStatus: "Pendiente"
}, "operador@cognitio.org");

assert(resPendiente.paymentStatus === "Pendiente", "Retorna paymentStatus: Pendiente");
const enrollmentPendiente = backend.enrollmentsDb.find(e => e.Inscripcion_ID === resPendiente.enrollmentId);
assert(enrollmentPendiente.Estado_Pago === "Pendiente", "Estado_Pago en base de datos es Pendiente");
assert(enrollmentPendiente.Fecha_Pago === "", "Fecha_Pago permanece estrictamente como cadena vacía");

// ----------------------------------------------------------------------------
// REQUERIMIENTO ADICIONAL: Validación de campos obligatorios y evento inexistente
// ----------------------------------------------------------------------------
console.log('\n[7] Validaciones de robustez y errores:');

let threwNoEvent = false;
try {
  backend.registerIndividualParticipant({
    eventId: "EVT-INEXISTENTE",
    dni: "12345678",
    nombreCompleto: "Estudiante Prueba"
  }, "admin@cognitio.org");
} catch (e) {
  threwNoEvent = e.message.includes("no existe");
}
assert(threwNoEvent, "Rechaza registro en evento inexistente");

let threwNoName = false;
try {
  backend.registerIndividualParticipant({
    eventId: "EVT-2026-01",
    dni: "12345678",
    nombreCompleto: "Ab" // Menor a 3 caracteres
  }, "admin@cognitio.org");
} catch (e) {
  threwNoName = e.message.includes("al menos 3 caracteres");
}
assert(threwNoName, "Rechaza nombre menor a 3 caracteres");

// Resumen final de la suite
reportSummary('Registro Individual Administrativo (Task 4)');
