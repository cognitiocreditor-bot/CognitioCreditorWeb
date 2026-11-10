/**
 * PRUEBAS UNITARIAS: REGLAS OBLIGATORIAS DE NEGOCIO (A a F)
 * Task 5: Cronograma de Entrega Física y Descarga Digital Unificada
 * Ejecutable mediante: node tests/unit/business-rules.test.js
 */

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FALLÓ: ${message}`);
    failed++;
  }
}

/**
 * Función pura que replica fielmente la lógica de negocio del servidor (CertificateService.query)
 */
function evaluateBusinessRules({
  eventStatus = "Activo",
  eventDate = "",
  paymentStatus = "Pagado",
  certType = "Virtual",
  todayLimaStr = "",
  fechaEntregaFisica = "",
  lugarEntregaFisica = "",
  horarioEntregaFisica = ""
}) {
  let entregaFisica = null;

  if (certType === "Fisico") {
    entregaFisica = {
      fechas: fechaEntregaFisica || "Por coordinar con la directiva",
      lugar: lugarEntregaFisica || "FACEN - UNAP",
      horario: horarioEntregaFisica || "Horario académico"
    };
  }

  // REGLA E: Evento cancelado
  if (eventStatus === "Cancelado") {
    return {
      elegible: false,
      rule: "REGLA_E_CANCELADO",
      message: "El evento fue cancelado. Comunícate con la directiva.",
      entregaFisica
    };
  }

  // REGLA A: Pago pendiente
  if (paymentStatus === "Pendiente") {
    return {
      elegible: false,
      rule: "REGLA_A_PAGO_PENDIENTE",
      message: "Tu inscripción está registrada, pero el pago está pendiente de confirmación. Si ya realizaste el pago, comunícate con la directiva por WhatsApp.",
      entregaFisica
    };
  }

  // Si el pago está completado (Pagado)
  if (paymentStatus === "Pagado") {
    // REGLA B: Evento futuro o en curso (todayLimaStr <= eventDate)
    if (eventDate && todayLimaStr <= eventDate) {
      return {
        elegible: false,
        rule: "REGLA_B_FUTURO",
        message: "Tu certificado estará disponible para descarga a partir del día siguiente al término del evento.",
        entregaFisica
      };
    }

    // Evento ya culminó (todayLimaStr > eventDate) -> Elegible tanto para Virtual como Físico
    if (certType === "Fisico") {
      return {
        elegible: true,
        rule: "REGLA_C_FISICO_Y_DIGITAL",
        message: "Certificado digital listo para descargar. Además, revisa el cronograma de entrega física de tu certificado impreso.",
        entregaFisica
      };
    }

    if (certType === "Virtual") {
      return {
        elegible: true,
        rule: "REGLA_D_VIRTUAL_LISTO",
        message: "Certificado listo para generar y descargar.",
        entregaFisica: null
      };
    }
  }

  return {
    elegible: false,
    rule: "UNKNOWN",
    message: "Estado de pago o inscripción no reconocido.",
    entregaFisica: null
  };
}

console.log("--- INICIANDO PRUEBAS DE REGLAS DE NEGOCIO (TASK 5) ---");

const today = "2026-10-21";

// Caso 1: Participante físico pagado y evento concluido -> elegible: true + metadata de entrega física
console.log("\n[Caso 1] Participante físico pagado y evento concluido (REGLA_C_FISICO_Y_DIGITAL)");
const res1 = evaluateBusinessRules({
  eventStatus: "Finalizado",
  eventDate: "2026-10-10",
  paymentStatus: "Pagado",
  certType: "Fisico",
  todayLimaStr: today,
  fechaEntregaFisica: "Del 25 al 28 de Noviembre de 2026",
  lugarEntregaFisica: "Oficina del Círculo - FACEN UNAP, 2do Piso",
  horarioEntregaFisica: "09:00 a 13:00 y 15:00 a 18:00 hrs"
});
assert(res1.elegible === true, "Participante con certificado físico pagado es elegible para descarga digital tras culminar el evento");
assert(res1.rule === "REGLA_C_FISICO_Y_DIGITAL", "Aplica regla REGLA_C_FISICO_Y_DIGITAL");
assert(res1.entregaFisica !== null, "Objeto entregaFisica presente en la respuesta");
assert(res1.entregaFisica.fechas === "Del 25 al 28 de Noviembre de 2026", "Fecha de entrega física coincide con la configurada");
assert(res1.entregaFisica.lugar === "Oficina del Círculo - FACEN UNAP, 2do Piso", "Lugar de entrega física coincide");
assert(res1.entregaFisica.horario === "09:00 a 13:00 y 15:00 a 18:00 hrs", "Horario de entrega física coincide");

// Caso 2: Participante físico pagado y evento futuro -> elegible: false + REGLA_B_FUTURO + entrega física
console.log("\n[Caso 2] Participante físico pagado y evento futuro (REGLA_B_FUTURO con entrega física anticipada)");
const res2 = evaluateBusinessRules({
  eventStatus: "Activo",
  eventDate: "2026-10-25", // Fecha futura
  paymentStatus: "Pagado",
  certType: "Fisico",
  todayLimaStr: today,
  fechaEntregaFisica: "Del 01 al 05 de Diciembre de 2026",
  lugarEntregaFisica: "FACEN - UNAP",
  horarioEntregaFisica: "10:00 a 14:00 hrs"
});
assert(res2.elegible === false, "No es elegible para descarga digital previa a la culminación del evento");
assert(res2.rule === "REGLA_B_FUTURO", "Aplica regla REGLA_B_FUTURO");
assert(res2.entregaFisica !== null, "Objeto entregaFisica presente de forma anticipada");
assert(res2.entregaFisica.fechas === "Del 01 al 05 de Diciembre de 2026", "Cronograma de entrega informado anticipadamente");

// Caso 3: Participante físico pagado y evento que se celebra hoy -> elegible: false + REGLA_B_FUTURO
console.log("\n[Caso 3] Participante físico pagado y evento celebrado hoy (mismo día)");
const res3 = evaluateBusinessRules({
  eventStatus: "Activo",
  eventDate: "2026-10-21", // Mismo día de today
  paymentStatus: "Pagado",
  certType: "Fisico",
  todayLimaStr: today
});
assert(res3.elegible === false, "Bloqueado durante el día del evento (disponible al día siguiente)");
assert(res3.rule === "REGLA_B_FUTURO", "Aplica regla REGLA_B_FUTURO");
assert(res3.entregaFisica !== null, "Datos de entrega física informados");
assert(res3.entregaFisica.lugar === "FACEN - UNAP", "Lugar por defecto si no se especificó");

// Caso 4: Participante virtual pagado y evento concluido -> elegible: true + REGLA_D_VIRTUAL_LISTO
console.log("\n[Caso 4] Participante virtual pagado y evento concluido (REGLA_D_VIRTUAL_LISTO)");
const res4 = evaluateBusinessRules({
  eventStatus: "Finalizado",
  eventDate: "2026-10-10",
  paymentStatus: "Pagado",
  certType: "Virtual",
  todayLimaStr: today
});
assert(res4.elegible === true, "Certificado virtual pagado y culminado es elegible para generar y descargar");
assert(res4.rule === "REGLA_D_VIRTUAL_LISTO", "Aplica regla REGLA_D_VIRTUAL_LISTO");
assert(res4.entregaFisica === null, "Sin entrega física para modalidad virtual");

// Caso 5: Participante con pago pendiente -> elegible: false + REGLA_A_PAGO_PENDIENTE
console.log("\n[Caso 5] Participante con pago pendiente (REGLA_A_PAGO_PENDIENTE)");
const res5 = evaluateBusinessRules({
  eventStatus: "Finalizado",
  eventDate: "2026-10-10",
  paymentStatus: "Pendiente",
  certType: "Virtual",
  todayLimaStr: today
});
assert(res5.elegible === false, "No es elegible mientras el pago esté pendiente");
assert(res5.rule === "REGLA_A_PAGO_PENDIENTE", "Aplica regla REGLA_A_PAGO_PENDIENTE");

// Caso 6: Evento cancelado -> elegible: false + REGLA_E_CANCELADO
console.log("\n[Caso 6] Evento cancelado (REGLA_E_CANCELADO)");
const res6 = evaluateBusinessRules({
  eventStatus: "Cancelado",
  eventDate: "2026-10-10",
  paymentStatus: "Pagado",
  certType: "Virtual",
  todayLimaStr: today
});
assert(res6.elegible === false, "No es elegible para descarga en eventos cancelados");
assert(res6.rule === "REGLA_E_CANCELADO", "Aplica regla REGLA_E_CANCELADO");

// Caso 7: Fallback de valores por defecto en entrega física no parametrizada
console.log("\n[Caso 7] Fallback de valores predeterminados para entrega física");
const res7 = evaluateBusinessRules({
  eventStatus: "Finalizado",
  eventDate: "2026-10-10",
  paymentStatus: "Pagado",
  certType: "Fisico",
  todayLimaStr: today
  // Sin fechaEntregaFisica, lugarEntregaFisica ni horarioEntregaFisica
});
assert(res7.elegible === true, "Elegible para descarga digital");
assert(res7.entregaFisica.fechas === "Por coordinar con la directiva", "Fallback de fechas correcto");
assert(res7.entregaFisica.lugar === "FACEN - UNAP", "Fallback de lugar correcto");
assert(res7.entregaFisica.horario === "Horario académico", "Fallback de horario correcto");

console.log(`\n========================================`);
console.log(`TOTAL: ${passed + failed} | APROBADAS: ${passed} | FALLIDAS: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
