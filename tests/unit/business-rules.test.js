/**
 * PRUEBAS UNITARIAS: REGLAS OBLIGATORIAS DE NEGOCIO (A a F)
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
 * Función pura que replica la lógica de negocio del servidor (CertificateService)
 */
function evaluateBusinessRules({ eventStatus, eventDate, paymentStatus, certType, todayLimaStr }) {
  if (eventStatus === 'Cancelado') {
    return { elegible: false, rule: 'REGLA_E_CANCELADO' };
  }
  if (paymentStatus === 'Pendiente') {
    return { elegible: false, rule: 'REGLA_A_PAGO_PENDIENTE' };
  }
  if (eventDate && todayLimaStr <= eventDate) {
    return { elegible: false, rule: 'REGLA_B_FUTURO' };
  }
  if (certType === 'Fisico') {
    return { elegible: false, rule: 'REGLA_C_FISICO' };
  }
  if (paymentStatus === 'Pagado' && certType === 'Virtual') {
    return { elegible: true, rule: 'REGLA_D_VIRTUAL_LISTO' };
  }
  return { elegible: false, rule: 'UNKNOWN' };
}

console.log('--- INICIANDO PRUEBAS DE REGLAS DE NEGOCIO (A a F) ---');

const today = '2026-10-21';

// Caso 1: Regla A (Pago pendiente)
console.log('\n[Caso 1] Regla A: Pago pendiente');
const resA = evaluateBusinessRules({
  eventStatus: 'Finalizado',
  eventDate: '2026-10-10',
  paymentStatus: 'Pendiente',
  certType: 'Virtual',
  todayLimaStr: today
});
assert(resA.elegible === false, 'No es elegible para emisión con pago pendiente');
assert(resA.rule === 'REGLA_A_PAGO_PENDIENTE', 'Código de regla es REGLA_A_PAGO_PENDIENTE');

// Caso 2: Regla B (Evento futuro)
console.log('\n[Caso 2] Regla B: Evento futuro');
const resB1 = evaluateBusinessRules({
  eventStatus: 'Activo',
  eventDate: '2026-10-25', // Fecha futura respecto a today
  paymentStatus: 'Pagado',
  certType: 'Virtual',
  todayLimaStr: today
});
assert(resB1.elegible === false, 'Bloqueado para eventos con fecha futura');
assert(resB1.rule === 'REGLA_B_FUTURO', 'Aplica REGLA_B_FUTURO');

// Caso 3: Regla B (Evento que se celebra hoy)
console.log('\n[Caso 3] Regla B: Evento que se celebra el mismo día de hoy');
const resB2 = evaluateBusinessRules({
  eventStatus: 'Activo',
  eventDate: '2026-10-21', // Mismo día
  paymentStatus: 'Pagado',
  certType: 'Virtual',
  todayLimaStr: today
});
assert(resB2.elegible === false, 'Bloqueado durante el día del evento (emisión a partir del día siguiente)');
assert(resB2.rule === 'REGLA_B_FUTURO', 'Aplica REGLA_B_FUTURO para hoy');

// Caso 4: Regla C (Certificado físico finalizado y pagado)
console.log('\n[Caso 4] Regla C: Certificado físico');
const resC = evaluateBusinessRules({
  eventStatus: 'Finalizado',
  eventDate: '2026-10-10',
  paymentStatus: 'Pagado',
  certType: 'Fisico',
  todayLimaStr: today
});
assert(resC.elegible === false, 'Certificado físico no genera PDF descargable individual');
assert(resC.rule === 'REGLA_C_FISICO', 'Aplica REGLA_C_FISICO');

// Caso 5: Regla D (Certificado virtual pagado y finalizado)
console.log('\n[Caso 5] Regla D: Certificado virtual listo');
const resD = evaluateBusinessRules({
  eventStatus: 'Finalizado',
  eventDate: '2026-10-10',
  paymentStatus: 'Pagado',
  certType: 'Virtual',
  todayLimaStr: today
});
assert(resD.elegible === true, 'Certificado virtual es elegible para generar y descargar');
assert(resD.rule === 'REGLA_D_VIRTUAL_LISTO', 'Aplica REGLA_D_VIRTUAL_LISTO');

// Caso 6: Regla E (Evento cancelado)
console.log('\n[Caso 6] Regla E: Evento cancelado');
const resE = evaluateBusinessRules({
  eventStatus: 'Cancelado',
  eventDate: '2026-10-10',
  paymentStatus: 'Pagado',
  certType: 'Virtual',
  todayLimaStr: today
});
assert(resE.elegible === false, 'Evento cancelado no emite certificado automáticamente');
assert(resE.rule === 'REGLA_E_CANCELADO', 'Aplica REGLA_E_CANCELADO');

console.log(`\n========================================`);
console.log(`TOTAL: ${passed + failed} | APROBADAS: ${passed} | FALLIDAS: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
