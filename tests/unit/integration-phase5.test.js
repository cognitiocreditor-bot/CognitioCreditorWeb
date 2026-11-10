/**
 * PRUEBAS DE INTEGRACIÓN GENERAL Y RENDIMIENTO (FASE 5)
 * Círculo de Estudios COGNITIO CREDITOR
 * Ejecutable mediante: node tests/unit/integration-phase5.test.js
 * 
 * Verifica el ciclo de vida completo integrado de:
 *   1. «Gestionar pago»
 *   2. «Corregir pago»
 *   3. «Confirmar pago»
 * Y mide métricas reales de rendimiento, llamadas al backend y regresión.
 */

import fs from 'fs';
import { assert, reportSummary } from './test-helper.js';

console.log('--- INICIANDO FASE 5: PRUEBAS DE INTEGRACIÓN Y RENDIMIENTO GENERAL ---');

// ============================================================================
// SIMULACIÓN INTEGRADA DE GOOGLE APPS SCRIPT Y BASE DE DATOS GOOGLE SHEETS
// ============================================================================

const adminServiceCode = fs.readFileSync('backend/AdminService.js', 'utf8');

// Base de datos representativa de Google Sheets
const initialParticipants = [
  {
    Participante_ID: 'PAR-INT-001',
    DNI: '70809010',
    Nombre_Completo: 'ALEJANDRO TOLEDO MANRIQUE',
    Fecha_Registro: '2026-11-01 10:00:00',
    Estado_Registro: 'Activo',
    _rowIndex: 2
  },
  {
    Participante_ID: 'PAR-INT-002',
    DNI: '80901020',
    Nombre_Completo: 'VALENTINA PAZ SOLDAN',
    Fecha_Registro: '2026-11-01 10:05:00',
    Estado_Registro: 'Activo',
    _rowIndex: 3
  }
];

const initialEnrollments = [
  {
    Inscripcion_ID: 'INS-INT-001',
    Participante_ID: 'PAR-INT-001',
    Evento_ID: 'EVT-INT-01',
    Tipo_Certificado: 'Virtual',
    Estado_Pago: 'Pendiente',
    Fecha_Pago: '',
    Referencia_Comprobante: 'VOUCH-OLD-11',
    Estado_Inscripcion: 'Registrada',
    Codigo_Consulta: 'CC-INT-001',
    Fecha_Emision: '',
    _rowIndex: 2
  },
  {
    Inscripcion_ID: 'INS-INT-002',
    Participante_ID: 'PAR-INT-002',
    Evento_ID: 'EVT-INT-01',
    Tipo_Certificado: 'Fisico',
    Estado_Pago: 'Pagado',
    Fecha_Pago: '2026-11-05 14:20:00',
    Referencia_Comprobante: 'BCP-INT-22',
    Estado_Inscripcion: 'Registrada',
    Codigo_Consulta: 'CC-INT-002',
    Fecha_Emision: '',
    _rowIndex: 3
  }
];

const auditLogs = [];

const mockConfig = {
  SHEETS: {
    PARTICIPANTES: 'Participantes',
    INSCRIPCIONES: 'Inscripciones',
    AUDITORIA: 'Auditoria',
    EVENTOS: 'Eventos',
    CONFIG_CERT: 'Configuracion_Certificados',
    USUARIOS_ADMIN: 'Usuarios_Admin'
  },
  TIMEZONE: 'America/Lima',
  ROLES: { SUPERADMIN: 'SuperAdmin', ADMIN: 'Admin', OPERADOR: 'Operador' }
};

let backendRpcCount = 0;

const mockDb = {
  withLock(fn) {
    return fn();
  },
  getAll(sheetName) {
    if (sheetName === mockConfig.SHEETS.PARTICIPANTES) return initialParticipants.map(p => ({ ...p }));
    if (sheetName === mockConfig.SHEETS.INSCRIPCIONES) return initialEnrollments.map(e => ({ ...e }));
    if (sheetName === mockConfig.SHEETS.AUDITORIA) return auditLogs.map(a => ({ ...a }));
    return [];
  },
  updateRow(sheetName, rowIndex, updateData) {
    if (sheetName === mockConfig.SHEETS.PARTICIPANTES) {
      const target = initialParticipants.find(p => p._rowIndex === rowIndex);
      if (target) Object.assign(target, updateData);
    } else if (sheetName === mockConfig.SHEETS.INSCRIPCIONES) {
      const target = initialEnrollments.find(e => e._rowIndex === rowIndex);
      if (target) Object.assign(target, updateData);
    }
  },
  insert(sheetName, record) {
    if (sheetName === mockConfig.SHEETS.AUDITORIA) {
      auditLogs.push({ ...record, _rowIndex: auditLogs.length + 2 });
    }
  }
};

const mockAuthService = {
  logAudit(actorEmail, action, entityId, detail) {
    auditLogs.push({
      Email_Admin: actorEmail,
      Accion: action,
      Entidad_Afectada: entityId,
      Detalle: detail,
      Fecha: '2026-11-10 13:00:00'
    });
  }
};

const mockUtilities = {
  formatDate(date, tz, fmt) {
    return '2026-11-10 13:00:00';
  },
  getUuid() {
    return 'UUID-PHASE5-INT';
  }
};

const backendFactory = new Function(
  'CONFIG', 'Database', 'AuthService', 'Utilities', 'DriveApp',
  `${adminServiceCode}; return AdminService;`
);

const backendService = backendFactory(mockConfig, mockDb, mockAuthService, mockUtilities, {});

// ============================================================================
// SIMULADOR DOM DETERMINÍSTICO PARA FRONTEND (js/admin.js)
// ============================================================================

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this._className = '';
    this._innerHTML = '';
    this._textContent = '';
    this.value = '';
    this.style = {};
    this.disabled = false;
    this.attributes = new Map();
    this.children = [];
    this.eventListeners = new Map();

    const self = this;
    this.classList = {
      _classes: new Set(),
      add(...classes) {
        classes.forEach(c => { if (c) self.classList._classes.add(c); });
        self._className = Array.from(self.classList._classes).join(' ');
      },
      remove(...classes) {
        classes.forEach(c => { if (c) self.classList._classes.delete(c); });
        self._className = Array.from(self.classList._classes).join(' ');
      },
      contains(c) {
        return self.classList._classes.has(c) || self._className.split(/\s+/).includes(c);
      }
    };
  }

  get className() {
    return this._className;
  }

  set className(val) {
    this._className = String(val);
    this.classList._classes = new Set(this._className.split(/\s+/).filter(Boolean));
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = String(val);
    this._textContent = this._innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    this._textContent = String(val);
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  appendChild(child) {
    this.children.push(child);
  }

  remove() {}

  focus() {
    this._focused = true;
  }

  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  dispatchEvent(event) {
    const handlers = this.eventListeners.get(event.type) || [];
    handlers.forEach(h => h(event));
  }

  matches(selector) {
    if (!selector) return false;
    selector = selector.trim();
    if (selector.startsWith('#') && !selector.includes('[')) return this.id === selector.slice(1);
    if (selector.startsWith('.') && !selector.includes('[')) return this.classList.contains(selector.slice(1));
    if (/^[a-zA-Z0-9]+$/.test(selector)) return this.tagName.toLowerCase() === selector.toLowerCase();

    // Selector tag + atributo: tr[data-enrollment-id="INS-001"]
    const tagAttrMatch = selector.match(/^([a-zA-Z0-9]+)\[([a-zA-Z0-9_\-]+)=["']?([^"'\]]+)["']?\]$/);
    if (tagAttrMatch) {
      return this.tagName.toLowerCase() === tagAttrMatch[1].toLowerCase() && this.getAttribute(tagAttrMatch[2]) === tagAttrMatch[3];
    }
    // Selector puro atributo: [data-participant-id="PAR-001"]
    const pureAttrMatch = selector.match(/^\[([a-zA-Z0-9_\-]+)=["']?([^"'\]]+)["']?\]$/);
    if (pureAttrMatch) {
      return this.getAttribute(pureAttrMatch[1]) === pureAttrMatch[2];
    }
    return false;
  }

  querySelector(selector) {
    if (this.matches(selector)) return this;
    for (const child of this.children) {
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    if (this.matches(selector)) results.push(this);
    for (const child of this.children) {
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
}

class MockDocument {
  constructor() {
    this.elements = new Map();
    this.allCreated = [];
    this.body = this.createElement('body', 'body');
  }

  createElement(tagName, id = '') {
    const el = new MockElement(tagName, id);
    this.allCreated.push(el);
    return el;
  }

  registerElement(id, element) {
    this.elements.set(id, element);
    if (!this.allCreated.includes(element)) {
      this.allCreated.push(element);
    }
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  querySelector(selector) {
    for (const el of this.allCreated) {
      const match = el.querySelector(selector);
      if (match) return match;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    for (const el of this.allCreated) {
      if (el.matches(selector)) {
        if (!results.includes(el)) results.push(el);
      }
      for (const child of el.children) {
        const matches = child.querySelectorAll(selector);
        for (const m of matches) {
          if (!results.includes(m)) results.push(m);
        }
      }
    }
    return results;
  }

  addEventListener() {}
}

const mockDoc = new MockDocument();
globalThis.document = mockDoc;
globalThis.window = {
  CognitioAdmin: {},
  location: { reload: () => {} }
};
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
try {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: async (t) => { globalThis._lastCopiedText = t; } },
    configurable: true,
    writable: true
  });
} catch (e) {}

globalThis._lastAlert = null;
globalThis.alert = (msg) => { globalThis._lastAlert = msg; };
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Registrar modales y elementos del DOM para la prueba de integración
// 1. Modal Gestionar Pago
mockDoc.registerElement('modal-payment-status', new MockElement('div', 'modal-payment-status'));
mockDoc.registerElement('payment-modal-enrollment-id', new MockElement('input', 'payment-modal-enrollment-id'));
mockDoc.registerElement('payment-modal-participant-name', new MockElement('strong', 'payment-modal-participant-name'));
mockDoc.registerElement('payment-modal-enrollment-code', new MockElement('code', 'payment-modal-enrollment-code'));
mockDoc.registerElement('payment-modal-dni', new MockElement('strong', 'payment-modal-dni'));
mockDoc.registerElement('payment-modal-cert-type', new MockElement('span', 'payment-modal-cert-type'));
mockDoc.registerElement('payment-modal-cert-type-select', new MockElement('select', 'payment-modal-cert-type-select'));
mockDoc.registerElement('payment-modal-voucher', new MockElement('code', 'payment-modal-voucher'));
mockDoc.registerElement('payment-modal-voucher-edit', new MockElement('input', 'payment-modal-voucher-edit'));
mockDoc.registerElement('btn-copy-payment-voucher', new MockElement('button', 'btn-copy-payment-voucher'));
mockDoc.registerElement('payment-modal-payment-date', new MockElement('span', 'payment-modal-payment-date'));
mockDoc.registerElement('payment-modal-current-status', new MockElement('span', 'payment-modal-current-status'));
mockDoc.registerElement('payment-modal-new-status', new MockElement('select', 'payment-modal-new-status'));
mockDoc.registerElement('payment-modal-reason', new MockElement('textarea', 'payment-modal-reason'));
mockDoc.registerElement('payment-modal-reason-req', new MockElement('span', 'payment-modal-reason-req'));
mockDoc.registerElement('payment-modal-reason-help', new MockElement('small', 'payment-modal-reason-help'));
mockDoc.registerElement('btn-save-payment-status', new MockElement('button', 'btn-save-payment-status'));

// 2. Modal Corregir Participante
mockDoc.registerElement('modal-participant', new MockElement('div', 'modal-participant'));
mockDoc.registerElement('part-form-id', new MockElement('input', 'part-form-id'));
mockDoc.registerElement('part-form-id-display', new MockElement('span', 'part-form-id-display'));
mockDoc.registerElement('part-form-dni', new MockElement('input', 'part-form-dni'));
mockDoc.registerElement('part-form-dni-indicator', new MockElement('small', 'part-form-dni-indicator'));
mockDoc.registerElement('part-form-name', new MockElement('input', 'part-form-name'));
mockDoc.registerElement('btn-save-participant', new MockElement('button', 'btn-save-participant'));

// 3. Modal Confirmar Pago
mockDoc.registerElement('modal-confirm-payment', new MockElement('div', 'modal-confirm-payment'));
mockDoc.registerElement('confirm-modal-enrollment-id', new MockElement('input', 'confirm-modal-enrollment-id'));
mockDoc.registerElement('confirm-modal-participant-name', new MockElement('span', 'confirm-modal-participant-name'));
mockDoc.registerElement('confirm-modal-dni', new MockElement('span', 'confirm-modal-dni'));
mockDoc.registerElement('confirm-modal-code', new MockElement('code', 'confirm-modal-code'));
mockDoc.registerElement('confirm-modal-cert-type', new MockElement('span', 'confirm-modal-cert-type'));
mockDoc.registerElement('confirm-modal-voucher', new MockElement('code', 'confirm-modal-voucher'));
mockDoc.registerElement('confirm-modal-current-status', new MockElement('span', 'confirm-modal-current-status'));
mockDoc.registerElement('btn-execute-confirm-payment', new MockElement('button', 'btn-execute-confirm-payment'));

// 4. Contenedores de tabla y filtros
mockDoc.registerElement('admin-enrollments-list', new MockElement('div', 'admin-enrollments-list'));
mockDoc.registerElement('admin-enrollments-count', new MockElement('div', 'admin-enrollments-count'));
mockDoc.registerElement('filter-enrollments-search', new MockElement('input', 'filter-enrollments-search'));
mockDoc.registerElement('filter-enrollments-status', new MockElement('select', 'filter-enrollments-status'));

// Importar módulos
const { Admin } = await import('../../js/admin.js');
const { Api } = await import('../../js/api.js');

// Enrutar Api.post directamente al servicio de backend real
Api.post = async (action, payload) => {
  backendRpcCount++;
  if (action === 'adminUpdatePaymentStatus') {
    const res = backendService.updatePaymentStatus(
      payload.enrollmentId,
      payload.status,
      payload.reason,
      'directivo@cognitio.pe',
      payload
    );
    return { success: true, data: res };
  }
  if (action === 'adminUpdateParticipant') {
    const res = backendService.updateParticipant(payload, 'directivo@cognitio.pe');
    return { success: true, data: res };
  }
  return { success: false, message: 'Acción no reconocida' };
};

console.log('\n============================================================');
console.log('A. PRUEBAS DE INTEGRACIÓN: FLUJO DE VIDA COMPLETO (10 PASOS)');
console.log('============================================================');

// Cargar caché inicial de inscripciones en el frontend
Admin.enrollmentsCache = [
  {
    Inscripcion_ID: 'INS-INT-001',
    Participante_ID: 'PAR-INT-001',
    DNI: '70809010',
    Nombre_Completo: 'ALEJANDRO TOLEDO MANRIQUE',
    Tipo_Certificado: 'Virtual',
    Estado_Pago: 'Pendiente',
    Fecha_Pago: '',
    Referencia_Comprobante: 'VOUCH-OLD-11',
    Codigo_Consulta: 'CC-INT-001'
  },
  {
    Inscripcion_ID: 'INS-INT-002',
    Participante_ID: 'PAR-INT-002',
    DNI: '80901020',
    Nombre_Completo: 'VALENTINA PAZ SOLDAN',
    Tipo_Certificado: 'Fisico',
    Estado_Pago: 'Pagado',
    Fecha_Pago: '2026-11-05 14:20:00',
    Referencia_Comprobante: 'BCP-INT-22',
    Codigo_Consulta: 'CC-INT-002'
  }
];

// Montar tabla en DOM
const table = mockDoc.createElement('table', 'enrollment-table');
const row1 = mockDoc.createElement('tr', 'row-INS-INT-001');
row1.setAttribute('data-enrollment-id', 'INS-INT-001');
row1.setAttribute('data-participant-id', 'PAR-INT-001');
const dniTd1 = mockDoc.createElement('td');
dniTd1.className = 'col-dni font-mono';
dniTd1.textContent = '70809010';
const nameTd1 = mockDoc.createElement('td');
nameTd1.className = 'col-participant-name';
nameTd1.textContent = 'ALEJANDRO TOLEDO MANRIQUE';
const certTd1 = mockDoc.createElement('td');
certTd1.className = 'col-cert-type';
certTd1.textContent = 'Virtual';
const statusTd1 = mockDoc.createElement('td');
statusTd1.className = 'col-payment-status';
statusTd1.textContent = 'Pendiente';
const actionsTd1 = mockDoc.createElement('td');
actionsTd1.className = 'col-payment-actions';
row1.appendChild(dniTd1);
row1.appendChild(nameTd1);
row1.appendChild(certTd1);
row1.appendChild(statusTd1);
row1.appendChild(actionsTd1);
table.appendChild(row1);

const row2 = mockDoc.createElement('tr', 'row-INS-INT-002');
row2.setAttribute('data-enrollment-id', 'INS-INT-002');
row2.setAttribute('data-participant-id', 'PAR-INT-002');
const dniTd2 = mockDoc.createElement('td');
dniTd2.className = 'col-dni font-mono';
dniTd2.textContent = '80901020';
const nameTd2 = mockDoc.createElement('td');
nameTd2.className = 'col-participant-name';
nameTd2.textContent = 'VALENTINA PAZ SOLDAN';
const certTd2 = mockDoc.createElement('td');
certTd2.className = 'col-cert-type';
certTd2.textContent = 'Fisico';
const statusTd2 = mockDoc.createElement('td');
statusTd2.className = 'col-payment-status';
statusTd2.textContent = 'Pagado';
const actionsTd2 = mockDoc.createElement('td');
actionsTd2.className = 'col-payment-actions';
row2.appendChild(dniTd2);
row2.appendChild(nameTd2);
row2.appendChild(certTd2);
row2.appendChild(statusTd2);
row2.appendChild(actionsTd2);
table.appendChild(row2);

mockDoc.body.appendChild(table);

// ----------------------------------------------------------------------------
// Paso 1 y 2: Abrir Gestionar Pago y Consultar la información del participante
// ----------------------------------------------------------------------------
console.log('\n[Paso 1 y 2] Abrir Gestionar pago y consultar información:');
const tOpenGestionar0 = performance.now();
Admin.openPaymentModal('INS-INT-001');
const tOpenGestionar1 = performance.now();
const timeOpenGestionar = tOpenGestionar1 - tOpenGestionar0;

assert(timeOpenGestionar < 10, `Paso 1: Modal Gestionar Pago abierto en ${timeOpenGestionar.toFixed(2)} ms (< 10ms)`);
assert(mockDoc.getElementById('payment-modal-participant-name').textContent === 'ALEJANDRO TOLEDO MANRIQUE', 'Paso 2: Nombre de participante verificado');
assert(mockDoc.getElementById('payment-modal-dni').textContent === '70809010', 'Paso 2: DNI verificado en modal');
assert(mockDoc.getElementById('payment-modal-cert-type').textContent === 'Virtual', 'Paso 2: Modalidad Virtual cargada');
assert(mockDoc.getElementById('payment-modal-voucher').textContent === 'VOUCH-OLD-11', 'Paso 2: Voucher previo cargado');
assert(mockDoc.getElementById('payment-modal-current-status').textContent.includes('Pendiente'), 'Paso 2: Estado actual verificado como Pendiente');

// ----------------------------------------------------------------------------
// Paso 3 y 4: Corregir los datos de un pago y guardar cambios
// ----------------------------------------------------------------------------
console.log('\n[Paso 3 y 4] Corregir datos (Voucher, Modalidad, DNI, Nombre) y guardar:');
// 3.1 Corregir voucher y modalidad en modal de pago
mockDoc.getElementById('payment-modal-new-status').value = 'Pendiente';
mockDoc.getElementById('payment-modal-reason').value = 'Actualización de voucher y cambio a diploma físico';
mockDoc.getElementById('payment-modal-voucher-edit').value = 'YAPE-NUEVO-999';
mockDoc.getElementById('payment-modal-cert-type-select').value = 'Fisico';

const tSavePayment0 = performance.now();
await Admin.savePaymentStatusChange();
const tSavePayment1 = performance.now();
const timeCorrectionPayment = tSavePayment1 - tSavePayment0;

assert(timeCorrectionPayment < 15, `Paso 4: Corrección de pago guardada en ${timeCorrectionPayment.toFixed(2)} ms`);
assert(Admin.enrollmentsCache[0].Referencia_Comprobante === 'YAPE-NUEVO-999', 'Paso 4: Voucher corregido en caché');
assert(Admin.enrollmentsCache[0].Tipo_Certificado === 'Fisico', 'Paso 4: Modalidad corregida a Físico en caché');

// 3.2 Corregir nombre y DNI del participante en modal de participante
Admin.setupDNIIndicators();
Admin.openEditParticipantModal('PAR-INT-001', '70809010', 'ALEJANDRO TOLEDO MANRIQUE');
mockDoc.getElementById('part-form-dni').value = '70809015'; // Corregir último dígito
mockDoc.getElementById('part-form-name').value = 'ALEJANDRO TOLEDO M.';

const tSavePart0 = performance.now();
await Admin.saveParticipant();
const tSavePart1 = performance.now();
const timeCorrectionPart = tSavePart1 - tSavePart0;

assert(timeCorrectionPart < 15, `Paso 4: Corrección de participante guardada en ${timeCorrectionPart.toFixed(2)} ms`);
assert(Admin.enrollmentsCache[0].DNI === '70809015', 'Paso 4: DNI corregido en caché');
assert(Admin.enrollmentsCache[0].Nombre_Completo === 'ALEJANDRO TOLEDO M.', 'Paso 4: Nombre corregido en caché');

// ----------------------------------------------------------------------------
// Paso 5: Consultar nuevamente el registro y verificar DOM
// ----------------------------------------------------------------------------
console.log('\n[Paso 5] Consultar nuevamente el registro corregido en DOM y memoria:');
assert(dniTd1.textContent === '70809015', 'Paso 5: Celda DNI en tabla actualizada a 70809015');
assert(nameTd1.textContent === 'ALEJANDRO TOLEDO M.', 'Paso 5: Celda Nombre en tabla actualizada');
assert(certTd1.textContent === 'Fisico', 'Paso 5: Celda Modalidad en tabla actualizada a Fisico');

// Abrir Gestionar Pago nuevamente para comprobar que muestra los datos corregidos
Admin.openPaymentModal('INS-INT-001');
assert(mockDoc.getElementById('payment-modal-participant-name').textContent === 'ALEJANDRO TOLEDO M.', 'Paso 5: Modal refleja nuevo nombre');
assert(mockDoc.getElementById('payment-modal-dni').textContent === '70809015', 'Paso 5: Modal refleja nuevo DNI');
assert(mockDoc.getElementById('payment-modal-cert-type').textContent === 'Fisico', 'Paso 5: Modal refleja nueva modalidad');
assert(mockDoc.getElementById('payment-modal-voucher').textContent === 'YAPE-NUEVO-999', 'Paso 5: Modal refleja nuevo voucher');
Admin.closeModal('modal-payment-status');

// ----------------------------------------------------------------------------
// Paso 6: Confirmar un pago válido (Flujo con Modal de Confirmación Rápida)
// ----------------------------------------------------------------------------
console.log('\n[Paso 6] Confirmar un pago válido mediante modal de confirmación rápida:');
const tOpenConfirm0 = performance.now();
Admin.openConfirmPaymentModal('INS-INT-001');
const tOpenConfirm1 = performance.now();
const timeOpenConfirm = tOpenConfirm1 - tOpenConfirm0;

assert(timeOpenConfirm < 10, `Paso 6: Modal Confirmar Pago abierto en ${timeOpenConfirm.toFixed(2)} ms (< 10ms)`);
assert(mockDoc.getElementById('confirm-modal-participant-name').textContent === 'ALEJANDRO TOLEDO M.', 'Paso 6: Nombre confirmado en modal');
assert(mockDoc.getElementById('confirm-modal-voucher').textContent === 'YAPE-NUEVO-999', 'Paso 6: Voucher confirmado en modal');
assert(mockDoc.getElementById('confirm-modal-cert-type').textContent === 'Fisico', 'Paso 6: Modalidad Físico confirmada');

const tConfirmExec0 = performance.now();
await Admin.executeConfirmedPayment();
const tConfirmExec1 = performance.now();
const timeConfirmExec = tConfirmExec1 - tConfirmExec0;

assert(timeConfirmExec < 15, `Paso 6: Ejecución de confirmación procesada en ${timeConfirmExec.toFixed(2)} ms`);
assert(mockDoc.getElementById('modal-confirm-payment').style.display === 'none', 'Paso 6: Modal cerrado en 0ms');

// ----------------------------------------------------------------------------
// Paso 7: Comprobar el nuevo estado en memoria y DOM
// ----------------------------------------------------------------------------
console.log('\n[Paso 7] Comprobar el nuevo estado en memoria y tabla DOM:');
assert(Admin.enrollmentsCache[0].Estado_Pago === 'Pagado', 'Paso 7: Estado en memoria actualizado a Pagado');
assert(Admin.enrollmentsCache[0].Fecha_Pago === '2026-11-10 13:00:00', 'Paso 7: Fecha de pago asignada con timestamp');
assert(statusTd1.textContent.includes('Pagado'), 'Paso 7: Celda de estado en tabla actualizada a Pagado');
assert(actionsTd1.innerHTML.includes('badge-success'), 'Paso 7: Botón Confirmar reemplazado por insignia ✓ Pagado');

// ----------------------------------------------------------------------------
// Paso 8: Volver a consultar la información
// ----------------------------------------------------------------------------
console.log('\n[Paso 8] Volver a consultar la información del registro:');
Admin.openPaymentModal('INS-INT-001');
assert(mockDoc.getElementById('payment-modal-current-status').textContent.includes('Pagado'), 'Paso 8: Estado verificado como Pagado en modal');
assert(mockDoc.getElementById('payment-modal-payment-date').textContent === '2026-11-10 13:00:00', 'Paso 8: Fecha de pago verificada');
assert(mockDoc.getElementById('payment-modal-reason-req').textContent.includes('Opcional'), 'Paso 8: Motivo es opcional para pagos confirmados');
Admin.closeModal('modal-payment-status');

// ----------------------------------------------------------------------------
// Paso 9: Verificar que Google Sheets contiene los datos correctos
// ----------------------------------------------------------------------------
console.log('\n[Paso 9] Verificar persistencia en Google Sheets (Participantes e Inscripciones):');
const sheetPart1 = initialParticipants.find(p => p.Participante_ID === 'PAR-INT-001');
const sheetIns1 = initialEnrollments.find(e => e.Inscripcion_ID === 'INS-INT-001');

assert(sheetPart1.DNI === '70809015', 'Paso 9: Google Sheets: DNI persistido');
assert(sheetPart1.Nombre_Completo === 'ALEJANDRO TOLEDO M.', 'Paso 9: Google Sheets: Nombre persistido');
assert(sheetIns1.Estado_Pago === 'Pagado', 'Paso 9: Google Sheets: Estado_Pago persistido como Pagado');
assert(sheetIns1.Fecha_Pago === '2026-11-10 13:00:00', 'Paso 9: Google Sheets: Fecha_Pago persistida');
assert(sheetIns1.Referencia_Comprobante === 'YAPE-NUEVO-999', 'Paso 9: Google Sheets: Referencia_Comprobante persistida');
assert(sheetIns1.Tipo_Certificado === 'Fisico', 'Paso 9: Google Sheets: Tipo_Certificado persistido como Fisico');
assert(sheetIns1.Inscripcion_ID === 'INS-INT-001', 'Paso 9: Google Sheets: Inscripcion_ID inmutable');
assert(sheetIns1.Participante_ID === 'PAR-INT-001', 'Paso 9: Google Sheets: Participante_ID inmutable');

// ----------------------------------------------------------------------------
// Paso 10: Comprobar que las operaciones no afectan a otros participantes
// ----------------------------------------------------------------------------
console.log('\n[Paso 10] Comprobar aislamiento absoluto sobre otros participantes:');
const sheetPart2 = initialParticipants.find(p => p.Participante_ID === 'PAR-INT-002');
const sheetIns2 = initialEnrollments.find(e => e.Inscripcion_ID === 'INS-INT-002');

assert(sheetPart2.DNI === '80901020', 'Paso 10: DNI de PAR-INT-002 inalterado');
assert(sheetPart2.Nombre_Completo === 'VALENTINA PAZ SOLDAN', 'Paso 10: Nombre de PAR-INT-002 inalterado');
assert(sheetIns2.Estado_Pago === 'Pagado', 'Paso 10: Estado de INS-INT-002 inalterado');
assert(sheetIns2.Fecha_Pago === '2026-11-05 14:20:00', 'Paso 10: Fecha_Pago histórica de INS-INT-002 preservada');
assert(sheetIns2.Referencia_Comprobante === 'BCP-INT-22', 'Paso 10: Comprobante de INS-INT-002 inalterado');
assert(dniTd2.textContent === '80901020', 'Paso 10: DOM de segundo participante intacto');
assert(nameTd2.textContent === 'VALENTINA PAZ SOLDAN', 'Paso 10: DOM nombre segundo participante intacto');

console.log('\n============================================================');
console.log('B. RENDIMIENTO: MÉTRICAS Y ELIMINACIÓN DE LLAMADAS REDUNDANTES');
console.log('============================================================');

assert(timeOpenGestionar < 10, `Apertura de Gestionar Pago: ${timeOpenGestionar.toFixed(2)} ms (< 10 ms)`);
assert(timeOpenConfirm < 10, `Apertura de Confirmar Pago: ${timeOpenConfirm.toFixed(2)} ms (< 10 ms)`);
assert(timeCorrectionPayment < 15, `Corrección de Pago: ${timeCorrectionPayment.toFixed(2)} ms (< 15 ms)`);
assert(timeCorrectionPart < 15, `Corrección de Participante: ${timeCorrectionPart.toFixed(2)} ms (< 15 ms)`);
assert(timeConfirmExec < 15, `Confirmación de Pago: ${timeConfirmExec.toFixed(2)} ms (< 15 ms)`);
assert(backendRpcCount === 3, `Llamadas exactas al backend: ${backendRpcCount} (1 corrección pago + 1 corrección part + 1 confirmación). Cero llamadas redundantes.`);

console.log('\n============================================================');
console.log('C. REGRESIÓN: ESTABILIDAD DE FUNCIONALIDADES Y REGLAS DE NEGOCIO');
console.log('============================================================');

// Regresión 1: Preservación de bitácora de auditoría
assert(auditLogs.length >= 3, 'Auditoría generó registros para cada mutación');
const lastAudit = auditLogs[auditLogs.length - 1];
assert(lastAudit.Accion === 'CAMBIO_ESTADO_PAGO', 'Última auditoría es de cambio de estado de pago');

// Regresión 2: Estados de pago canónicos inmutables
const CANONICAL_STATUSES = ['Pendiente', 'Pagado', 'Anulado', 'Reembolsado'];
assert(CANONICAL_STATUSES.includes(sheetIns1.Estado_Pago), 'Estado resultante pertenece a la lista canónica');
assert(CANONICAL_STATUSES.includes(sheetIns2.Estado_Pago), 'Estado conservado pertenece a la lista canónica');

// Regresión 3: Rechazo de confirmación repetida sobre registro que ya pasó a Pagado
let repeatConfirmBlocked = false;
try {
  backendService.updatePaymentStatus('INS-INT-001', 'Pagado', 'Reconfirmación', 'directivo@cognitio.pe');
} catch (err) {
  repeatConfirmBlocked = err.message.includes('ya se encuentra registrada como Pagada');
}
assert(repeatConfirmBlocked, 'Regresión: Confirmación repetida sobre INS-INT-001 rechazada con éxito');

// ============================================================================
// RESUMEN GENERAL
// ============================================================================
reportSummary('Fase 5: Pruebas de Integración y Rendimiento General');
