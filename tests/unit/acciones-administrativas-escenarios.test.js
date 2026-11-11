/**
 * PRUEBAS DE REGRESIÓN Y DIAGNÓSTICO: ACCIONES ADMINISTRATIVAS EN LISTA GENERAL VS BÚSQUEDA INDIVIDUAL
 * Misión Prioritaria: Círculo de Estudios COGNITIO CREDITOR
 * Ejecutable: node tests/unit/acciones-administrativas-escenarios.test.js
 */

import { assert, reportSummary } from './test-helper.js';
import { Admin } from '../../js/admin.js';
import { Validation } from '../../js/validation.js';

// ============================================================================
// SIMULADOR ROBUSTO DE DOM PARA VALIDACIÓN DETERMINÍSTICA DE ESCENARIOS A Y B
// ============================================================================

class MockDOMElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = '';
    this.innerHTML = '';
    this._textContent = '';
    this.value = '';
    this.style = {};
    this.disabled = false;
    this.required = false;
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.onclick = null;
    this.listeners = new Map();

    const self = this;
    this.classList = {
      _classes: new Set(),
      add(...classes) {
        classes.forEach(c => { if (c) self.classList._classes.add(c); });
        self.className = Array.from(self.classList._classes).join(' ');
      },
      remove(...classes) {
        classes.forEach(c => { if (c) self.classList._classes.delete(c); });
        self.className = Array.from(self.classList._classes).join(' ');
      },
      contains(c) {
        return self.classList._classes.has(c);
      }
    };
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    this._textContent = String(val);
  }

  appendChild(child) {
    this.children.push(child);
  }

  remove() {}

  focus() {
    this._focused = true;
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(fn);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    handlers.forEach(h => h(event));
    if (event.type === 'click' && typeof this.onclick === 'function') {
      this.onclick(event);
    }
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      if (this.id === targetId) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) results.push(this);
    }
    for (const child of this.children) {
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
}

class MockDOMDocument {
  constructor() {
    this.elements = new Map();
    this.body = new MockDOMElement('body', 'body');
    this.listeners = new Map();
  }

  createElement(tagName) {
    return new MockDOMElement(tagName);
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  registerElement(id, element) {
    this.elements.set(id, element);
    return element;
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(fn);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    handlers.forEach(h => h(event));
  }

  querySelectorAll(selector) {
    const results = [];
    this.elements.forEach(el => {
      if (selector === '.modal-backdrop' && el.className.includes('modal-backdrop')) {
        results.push(el);
      }
    });
    return results;
  }
}

// Configuración Global del Entorno
const mockDoc = new MockDOMDocument();
globalThis.document = mockDoc;
globalThis.window = {
  CognitioAdmin: Admin,
  Admin: Admin,
  document: mockDoc,
  location: { reload: () => {} },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};

// Modales requeridos
const modalPart = mockDoc.registerElement('modal-participant', new MockDOMElement('div', 'modal-participant'));
modalPart.className = 'modal-backdrop';
const modalPay = mockDoc.registerElement('modal-payment-status', new MockDOMElement('div', 'modal-payment-status'));
modalPay.className = 'modal-backdrop';
const modalConfirm = mockDoc.registerElement('modal-confirm-payment', new MockDOMElement('div', 'modal-confirm-payment'));
modalConfirm.className = 'modal-backdrop';
const modalReg = mockDoc.registerElement('modal-admin-register-participant', new MockDOMElement('div', 'modal-admin-register-participant'));
modalReg.className = 'modal-backdrop';

// Elementos de Formulario de Participante
mockDoc.registerElement('part-form-id', new MockDOMElement('input', 'part-form-id'));
mockDoc.registerElement('part-form-id-display', new MockDOMElement('code', 'part-form-id-display'));
mockDoc.registerElement('part-form-dni', new MockDOMElement('input', 'part-form-dni'));
mockDoc.registerElement('part-form-name', new MockDOMElement('input', 'part-form-name'));
mockDoc.registerElement('part-form-dni-indicator', new MockDOMElement('small', 'part-form-dni-indicator'));

// Elementos de Gestionar Pago
mockDoc.registerElement('payment-modal-enrollment-id', new MockDOMElement('input', 'payment-modal-enrollment-id'));
mockDoc.registerElement('payment-modal-participant-name', new MockDOMElement('span', 'payment-modal-participant-name'));
mockDoc.registerElement('payment-modal-enrollment-code', new MockDOMElement('span', 'payment-modal-enrollment-code'));
mockDoc.registerElement('payment-modal-dni', new MockDOMElement('span', 'payment-modal-dni'));
mockDoc.registerElement('payment-modal-cert-type', new MockDOMElement('span', 'payment-modal-cert-type'));
mockDoc.registerElement('payment-modal-voucher', new MockDOMElement('span', 'payment-modal-voucher'));
mockDoc.registerElement('payment-modal-payment-date', new MockDOMElement('span', 'payment-modal-payment-date'));
mockDoc.registerElement('payment-modal-current-status', new MockDOMElement('span', 'payment-modal-current-status'));
mockDoc.registerElement('payment-modal-new-status', new MockDOMElement('select', 'payment-modal-new-status'));
mockDoc.registerElement('payment-modal-reason', new MockDOMElement('textarea', 'payment-modal-reason'));
mockDoc.registerElement('payment-modal-voucher-edit', new MockDOMElement('input', 'payment-modal-voucher-edit'));
mockDoc.registerElement('payment-modal-cert-type-select', new MockDOMElement('select', 'payment-modal-cert-type-select'));
mockDoc.registerElement('btn-copy-payment-voucher', new MockDOMElement('button', 'btn-copy-payment-voucher'));
mockDoc.registerElement('payment-modal-reason-req', new MockDOMElement('span', 'payment-modal-reason-req'));
mockDoc.registerElement('payment-modal-reason-help', new MockDOMElement('small', 'payment-modal-reason-help'));

// Elementos de Confirmar Pago
mockDoc.registerElement('confirm-modal-enrollment-id', new MockDOMElement('input', 'confirm-modal-enrollment-id'));
mockDoc.registerElement('confirm-modal-participant-name', new MockDOMElement('span', 'confirm-modal-participant-name'));
mockDoc.registerElement('confirm-modal-dni', new MockDOMElement('span', 'confirm-modal-dni'));
mockDoc.registerElement('confirm-modal-code', new MockDOMElement('span', 'confirm-modal-code'));
mockDoc.registerElement('confirm-modal-cert-type', new MockDOMElement('span', 'confirm-modal-cert-type'));
mockDoc.registerElement('confirm-modal-voucher', new MockDOMElement('span', 'confirm-modal-voucher'));
mockDoc.registerElement('confirm-modal-current-status', new MockDOMElement('span', 'confirm-modal-current-status'));
mockDoc.registerElement('btn-execute-confirm-payment', new MockDOMElement('button', 'btn-execute-confirm-payment'));

// Elementos de Registro Individual
mockDoc.registerElement('admin-reg-event-select', new MockDOMElement('select', 'admin-reg-event-select'));
mockDoc.registerElement('admin-reg-dni', new MockDOMElement('input', 'admin-reg-dni'));
mockDoc.registerElement('admin-reg-name', new MockDOMElement('input', 'admin-reg-name'));
mockDoc.registerElement('admin-reg-cert-type', new MockDOMElement('select', 'admin-reg-cert-type'));
mockDoc.registerElement('admin-reg-payment-status', new MockDOMElement('select', 'admin-reg-payment-status'));
mockDoc.registerElement('admin-reg-voucher', new MockDOMElement('input', 'admin-reg-voucher'));
mockDoc.registerElement('admin-reg-dni-indicator', new MockDOMElement('span', 'admin-reg-dni-indicator'));

// Contenedor principal de inscripciones y filtros
const containerEnrollments = mockDoc.registerElement('admin-enrollments-list', new MockDOMElement('div', 'admin-enrollments-list'));
mockDoc.registerElement('admin-enrollments-count', new MockDOMElement('div', 'admin-enrollments-count'));
const searchInput = mockDoc.registerElement('filter-enrollments-search', new MockDOMElement('input', 'filter-enrollments-search'));
const statusSelect = mockDoc.registerElement('filter-enrollments-status', new MockDOMElement('select', 'filter-enrollments-status'));
statusSelect.value = 'all';

console.log('--- INICIANDO SUITE DE PRUEBAS DETERMINÍSTICAS: ESCENARIOS ACCIONES ADMINISTRATIVAS ---');

// ============================================================================
// PRUEBA 1: LISTA CON 1 PARTICIPANTE (ESCENARIO B)
// ============================================================================
console.log('\n[Prueba 1] Lista con 1 participante (Búsqueda Individual / Escenario B):');
Admin.enrollmentsCache = [
  {
    Inscripcion_ID: 'INS-001',
    Participante_ID: 'PAR-001',
    DNI: '71234567',
    Nombre_Completo: 'CARLOS MENDOZA RIOS',
    Tipo_Certificado: 'Virtual',
    Estado_Pago: 'Pendiente',
    Codigo_Consulta: 'CC-2026-001',
    Referencia_Comprobante: 'OP-9988'
  }
];

Admin.renderEnrollmentsTable();
assert(containerEnrollments.innerHTML.includes('INS-001'), 'Tabla renderiza la fila del participante 1');
assert(containerEnrollments.innerHTML.includes('CARLOS MENDOZA RIOS'), 'Nombre renderizado correctamente');

// Abrir Gestionar Pago
Admin.openPaymentModal('INS-001');
assert(modalPay.style.display === 'flex', 'Modal Gestionar Pago abre correctamente para 1 participante');
assert(mockDoc.getElementById('payment-modal-participant-name').textContent === 'CARLOS MENDOZA RIOS', 'Nombre en modal coincide');
Admin.closeModal('modal-payment-status');

// Abrir Corregir
Admin.openEditParticipantModal('PAR-001', '71234567');
assert(modalPart.style.display === 'flex', 'Modal Corregir Participante abre correctamente para 1 participante');
assert(mockDoc.getElementById('part-form-name').value === 'CARLOS MENDOZA RIOS', 'Nombre en formulario coincide');
Admin.closeModal('modal-participant');

// Abrir Registrar Individual
Admin.openRegisterParticipantModal();
assert(modalReg.style.display === 'flex', 'Modal Registrar Participante Individual abre correctamente');
Admin.closeModal('modal-admin-register-participant');

// ============================================================================
// PRUEBA 2: LISTA CON 10 PARTICIPANTES
// ============================================================================
console.log('\n[Prueba 2] Lista con 10 participantes (Carga Mediana):');
const list10 = [];
for (let i = 1; i <= 10; i++) {
  list10.push({
    Inscripcion_ID: `INS-01${i}`,
    Participante_ID: `PAR-01${i}`,
    DNI: `7100000${i}`,
    Nombre_Completo: `PARTICIPANTE REGULAR ${i}`,
    Tipo_Certificado: i % 2 === 0 ? 'Fisico' : 'Virtual',
    Estado_Pago: i % 3 === 0 ? 'Pagado' : 'Pendiente',
    Codigo_Consulta: `CC-REG-${i}`,
    Referencia_Comprobante: `VOUCHER-${i}`
  });
}
Admin.enrollmentsCache = list10;
Admin.renderEnrollmentsTable();

assert(containerEnrollments.innerHTML.includes('INS-011'), 'Primera inscripción presente en HTML');
assert(containerEnrollments.innerHTML.includes('INS-0110'), 'Última inscripción presente en HTML');

// Probar apertura de acciones en el participante 10
Admin.openPaymentModal('INS-0110');
assert(modalPay.style.display === 'flex', 'Modal Gestionar Pago abre en participante 10');
assert(mockDoc.getElementById('payment-modal-enrollment-id').value === 'INS-0110', 'ID de inscripción 10 cargado');
Admin.closeModal('modal-payment-status');

Admin.openEditParticipantModal('PAR-0110', '710000010');
assert(modalPart.style.display === 'flex', 'Modal Corregir abre en participante 10');
Admin.closeModal('modal-participant');

Admin.openRegisterParticipantModal();
assert(modalReg.style.display === 'flex', 'Modal Registrar Individual abre con 10 participantes');
Admin.closeModal('modal-admin-register-participant');

// ============================================================================
// PRUEBA 3: LISTA CON 50 PARTICIPANTES (ESCENARIO A: LISTA GENERAL COMPLETA)
// ============================================================================
console.log('\n[Prueba 3] Lista con 50 participantes (Lista General Completa / Escenario A):');
const list50 = [];
for (let i = 1; i <= 50; i++) {
  list50.push({
    Inscripcion_ID: `INS-050-${String(i).padStart(3, '0')}`,
    Participante_ID: `PAR-050-${String(i).padStart(3, '0')}`,
    DNI: `4000${String(i).padStart(4, '0')}`,
    Nombre_Completo: `ALUMNO GENERAL NÚMERO ${i}`,
    Tipo_Certificado: i % 2 === 0 ? 'Fisico' : 'Virtual',
    Estado_Pago: i % 4 === 0 ? 'Pagado' : 'Pendiente',
    Codigo_Consulta: `CC-GEN-${i}`,
    Referencia_Comprobante: i % 5 === 0 ? `VOUCH-${i}` : ''
  });
}
Admin.enrollmentsCache = list50;
Admin.renderEnrollmentsTable();

assert(containerEnrollments.innerHTML.includes('INS-050-001'), 'Participante inicial presente');
assert(containerEnrollments.innerHTML.includes('INS-050-025'), 'Participante intermedio presente');
assert(containerEnrollments.innerHTML.includes('INS-050-050'), 'Participante final 50 presente');

// Validación de acciones en lista general de 50
Admin.openPaymentModal('INS-050-025');
assert(modalPay.style.display === 'flex', 'Acción Gestionar Pago abre instantáneamente en lista general');
assert(mockDoc.getElementById('payment-modal-participant-name').textContent === 'ALUMNO GENERAL NÚMERO 25', 'Datos exactos del participante 25 cargados');
Admin.closeModal('modal-payment-status');

Admin.openEditParticipantModal('PAR-050-050', '40000050');
assert(modalPart.style.display === 'flex', 'Acción Corregir abre en participante 50');
assert(mockDoc.getElementById('part-form-dni').value === '40000050', 'DNI del participante 50 coincide');
Admin.closeModal('modal-participant');

Admin.openRegisterParticipantModal();
assert(modalReg.style.display === 'flex', 'Acción Registrar Participante Individual responde con lista general de 50');
Admin.closeModal('modal-admin-register-participant');

// ============================================================================
// PRUEBA 4: CARACTERES ESPECIALES, APÓSTROFES E IDENTIFICADORES LARGOS
// ============================================================================
console.log('\n[Prueba 4] Manejo de apóstrofes, caracteres especiales y DNI numérico:');
Admin.enrollmentsCache = [
  {
    Inscripcion_ID: "INS-SP-001",
    Participante_ID: "PAR-O'CONNOR",
    DNI: 70809012, // Numérico intencional para verificar coerción
    Nombre_Completo: "D'ANGELO O'CONNOR & ASOCIADOS <TEST>",
    Tipo_Certificado: "Fisico",
    Estado_Pago: "Pendiente",
    Codigo_Consulta: "CC-QUOTE-'123'",
    Referencia_Comprobante: "OP-#99/2026-X"
  }
];

Admin.renderEnrollmentsTable();
assert(containerEnrollments.innerHTML.includes("INS-SP-001"), 'Inscripción con caracteres especiales renderizada');
assert(containerEnrollments.innerHTML.includes("70809012"), 'DNI numérico coercido exitosamente a texto');
assert(!containerEnrollments.innerHTML.includes("<TEST>"), 'Etiquetas HTML neutralizadas con escapeHTML');

// Apertura con apóstrofe en Participante_ID
Admin.openEditParticipantModal("PAR-O'CONNOR", "70809012");
assert(modalPart.style.display === 'flex', 'Modal Corregir abre para participante con apóstrofe en ID');
assert(mockDoc.getElementById('part-form-id').value === "PAR-O'CONNOR", 'ID con apóstrofe preservado íntegro');
Admin.closeModal('modal-participant');

// ============================================================================
// PRUEBA 5: CLICS CONSECUTIVOS RÁPIDOS SOBRE DIFERENTES BOTONES
// ============================================================================
console.log('\n[Prueba 5] Clics consecutivos rápidos entre botones:');
Admin.enrollmentsCache = list50;

// Clic 1: Gestionar pago INS-050-001
Admin.openPaymentModal('INS-050-001');
assert(modalPay.style.display === 'flex', 'Clic 1: Gestionar Pago abierto');
Admin.closeModal('modal-payment-status');
assert(modalPay.style.display === 'none', 'Clic 1: Modal cerrado');

// Clic 2 inmediato: Corregir participante PAR-050-002
Admin.openEditParticipantModal('PAR-050-002', '40000002');
assert(modalPart.style.display === 'flex', 'Clic 2: Corregir abierto');
Admin.closeModal('modal-participant');
assert(modalPart.style.display === 'none', 'Clic 2: Modal cerrado');

// Clic 3 inmediato: Registrar participante individual
Admin.openRegisterParticipantModal();
assert(modalReg.style.display === 'flex', 'Clic 3: Registrar Individual abierto');
Admin.closeModal('modal-admin-register-participant');
assert(modalReg.style.display === 'none', 'Clic 3: Modal cerrado');

// ============================================================================
// PRUEBA 6: CLIC EN REGISTRAR INDIVIDUAL CON LISTA GENERAL VISIBLE
// ============================================================================
console.log('\n[Prueba 6] Registrar Individual con lista general completa visible:');
Admin.enrollmentsCache = list50;
Admin.renderEnrollmentsTable();

// Simular clic en el botón de la barra de herramientas
Admin.openRegisterParticipantModal();
assert(modalReg.style.display === 'flex', 'Botón Registrar Individual abre el modal sin importar el tamaño de la tabla');
assert(mockDoc.getElementById('admin-reg-dni').value === '', 'Campo DNI limpio');
assert(mockDoc.getElementById('admin-reg-name').value === '', 'Campo Nombre limpio');
Admin.closeModal('modal-admin-register-participant');

// ============================================================================
// PRUEBA 7: CORREGIR Y GESTIONAR PAGO DESDE LA LISTA GENERAL
// ============================================================================
console.log('\n[Prueba 7] Corregir y Gestionar pago desde la lista general:');
Admin.enrollmentsCache = list50;
Admin.renderEnrollmentsTable();

// Abrir Gestionar Pago sobre inscripción 40
Admin.openPaymentModal('INS-050-040');
assert(modalPay.style.display === 'flex', 'Gestionar pago abierto desde lista general');
assert(mockDoc.getElementById('payment-modal-enrollment-id').value === 'INS-050-040', 'ID de inscripción 40 validado');
Admin.closeModal('modal-payment-status');

// Abrir Corregir sobre participante 40
Admin.openEditParticipantModal('PAR-050-040', '40000040');
assert(modalPart.style.display === 'flex', 'Corregir participante abierto desde lista general');
assert(mockDoc.getElementById('part-form-name').value === 'ALUMNO GENERAL NÚMERO 40', 'Nombre de participante 40 validado');
Admin.closeModal('modal-participant');

// ============================================================================
// PRUEBA 8: DESPLAZAMIENTO VERTICAL (SCROLL) Y POSTERIOR PULSACIÓN
// ============================================================================
console.log('\n[Prueba 8] Estabilidad tras desplazamiento vertical (Scroll y sin transformaciones):');
// En el CSS corregido, .admin-card tiene transform: none !important y will-change: auto !important
// Validamos que los métodos operan con scroll simulado en window/document
globalThis.window.scrollY = 2450; // Usuario desplazado a la fila 45
Admin.openPaymentModal('INS-050-045');
assert(modalPay.style.display === 'flex', 'Modal abre perfectamente tras desplazamiento vertical profundo (scrollY = 2450)');
assert(modalPay.style.zIndex === '1050', 'Modal mantiene z-index 1050 por encima del contenido desplazado');
assert(mockDoc.body.style.overflow === 'hidden', 'Scroll del body bloqueado correctamente mientras el modal está activo');
Admin.closeModal('modal-payment-status');
assert(mockDoc.body.style.overflow === 'auto', 'Scroll del body restaurado a auto tras cerrar el modal');

// ============================================================================
// PRUEBA 9: BÚSQUEDA REACTIVA EN MEMORIA (FILTRO DINÁMICO)
// ============================================================================
console.log('\n[Prueba 9] Filtro dinámico con buscador (#filter-enrollments-search):');
Admin.enrollmentsCache = list50;
searchInput.value = 'ALUMNO GENERAL NÚMERO 12';
Admin.filterEnrollmentsTable();
assert(containerEnrollments.innerHTML.includes('ALUMNO GENERAL NÚMERO 12'), 'Filtro encuentra al alumno buscado');
assert(!containerEnrollments.innerHTML.includes('ALUMNO GENERAL NÚMERO 45'), 'Filtro excluye al resto');

// Probar acciones en el elemento filtrado
Admin.openPaymentModal('INS-050-012');
assert(modalPay.style.display === 'flex', 'Gestionar pago responde en elemento filtrado');
Admin.closeModal('modal-payment-status');

// Limpiar filtro y volver a lista general
searchInput.value = '';
Admin.filterEnrollmentsTable();
assert(containerEnrollments.innerHTML.includes('ALUMNO GENERAL NÚMERO 45'), 'Lista general restaurada tras borrar filtro');

reportSummary('Acciones Administrativas en Lista General vs Búsqueda Individual');
