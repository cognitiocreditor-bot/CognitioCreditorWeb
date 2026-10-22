/**
 * PRUEBAS UNITARIAS: MÓDULO DE VALIDACIÓN Y SANITIZACIÓN
 * Ejecutable mediante: node tests/unit/validation.test.js
 */

import { Validation } from '../../js/validation.js';

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

console.log('--- INICIANDO PRUEBAS DE VALIDACIÓN ---');

// 1. Pruebas de DNI
console.log('\n[1] Validación de DNI:');
assert(Validation.isValidDNI('71234567') === true, 'DNI de 8 dígitos numéricos es válido');
assert(Validation.isValidDNI('01234567') === true, 'DNI con cero inicial es válido');
assert(Validation.isValidDNI('7123456') === false, 'DNI de 7 dígitos es inválido');
assert(Validation.isValidDNI('712345678') === false, 'DNI de 9 dígitos es inválido');
assert(Validation.isValidDNI('7123A567') === false, 'DNI con letras es inválido');
assert(Validation.isValidDNI('') === false, 'DNI vacío es inválido');
assert(Validation.isValidDNI(null) === false, 'DNI nulo es inválido');

// 2. Normalización de DNI (ceros a la izquierda)
console.log('\n[2] Normalización de DNI:');
assert(Validation.normalizeDNI(' 71234567 ') === '71234567', 'Elimina espacios en blanco');
assert(Validation.normalizeDNI(1234567) === '01234567', 'Rellena ceros iniciales si viene como número de 7 dígitos');

// 3. Validación de Nombres
console.log('\n[3] Validación de Nombres Completos:');
assert(Validation.isValidFullName('Juan Pérez') === true, 'Nombre con tilde válido');
assert(Validation.isValidFullName('María de los Ángeles Peña') === true, 'Nombre con ñ y conectores válido');
assert(Validation.isValidFullName('Al') === false, 'Nombre menor a 3 caracteres es inválido');
assert(Validation.isValidFullName('Juan <script>alert(1)</script>') === false, 'Inyección de script rechazada');

// 4. Sanitización XSS
console.log('\n[4] Sanitización contra XSS:');
const dangerousString = '<img src=x onerror="alert(\'xss\')">';
const escaped = Validation.escapeHTML(dangerousString);
assert(!escaped.includes('<') && !escaped.includes('>'), 'Caracteres < y > correctamente escapados');
assert(escaped.includes('&lt;') && escaped.includes('&gt;'), 'Entidades HTML generadas');

// 5. Normalización de Nombre
console.log('\n[5] Normalización de Nombres:');
assert(Validation.normalizeName('  carlos   alberto   gonzales  ') === 'CARLOS ALBERTO GONZALES', 'Espacios redundantes eliminados y mayúsculas aplicadas');

console.log(`\n========================================`);
console.log(`TOTAL: ${passed + failed} | APROBADAS: ${passed} | FALLIDAS: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
