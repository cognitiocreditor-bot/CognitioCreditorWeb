/**
 * PRUEBAS UNITARIAS: OPTIMIZACIONES DE CORREGIR PAGO (FASE 3)
 * Círculo de Estudios COGNITIO CREDITOR
 * Ejecutable mediante: node tests/unit/corregir-pago-optimizations.test.js
 */

import fs from 'fs';
import { assert, reportSummary } from './test-helper.js';

// ============================================================================
// PARTE 1: VERIFICACIÓN DIRECTA DEL BACKEND (backend/AdminService.js)
// ============================================================================

console.log('--- INICIANDO PRUEBAS DE OPTIMIZACIÓN: CORREGIR PAGO (FASE 3) ---');
console.log('\n============================================================');
console.log('PARTE 1: PRUEBAS DE SERVICIO BACKEND (AdminService)');
console.log('============================================================');

const adminServiceCode = fs.readFileSync('backend/AdminService.js', 'utf8');

function createAdminServiceInstance(initialData = {}) {
  const participantsDb = initialData.participants || [
    { Participante_ID: 'PAR-001', DNI: '71234567', Nombre_Completo: 'JUAN PEREZ FLORES', _rowIndex: 2 },
    { Participante_ID: 'PAR-002', DNI: '82345678', Nombre_Completo: 'MARIA RODRIGUEZ VEGA', _rowIndex: 3 },
    { Participante_ID: 'PAR-003', DNI: '93456789', Nombre_Completo: 'CARLOS BENITEZ LUNA', _rowIndex: 4 }
  ];

  const enrollmentsDb = initialData.enrollments || [
    {
      Inscripcion_ID: 'INS-2026-001',
      Participante_ID: 'PAR-001',
      Evento_ID: 'EVT-01',
      Tipo_Certificado: 'Virtual',
      Estado_Pago: 'Pendiente',
      Fecha_Pago: '',
      Referencia_Comprobante: '',
      Estado_Inscripcion: 'Registrada',
      _rowIndex: 2
    },
    {
      Inscripcion_ID: 'INS-2026-002',
      Participante_ID: 'PAR-002',
      Evento_ID: 'EVT-01',
      Tipo_Certificado: 'Fisico',
      Estado_Pago: 'Pagado',
      Fecha_Pago: '2026-11-09 12:00:00',
      Referencia_Comprobante: 'BCP-112233',
      Estado_Inscripcion: 'Registrada',
      _rowIndex: 3
    }
  ];

  const auditLogsDb = [];

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

  const mockDb = {
    withLock(fn) {
      return fn();
    },
    getAll(sheetName) {
      if (sheetName === mockConfig.SHEETS.PARTICIPANTES) return participantsDb.map(p => ({ ...p }));
      if (sheetName === mockConfig.SHEETS.INSCRIPCIONES) return enrollmentsDb.map(e => ({ ...e }));
      if (sheetName === mockConfig.SHEETS.AUDITORIA) return auditLogsDb.map(a => ({ ...a }));
      return [];
    },
    updateRow(sheetName, rowIndex, updateData) {
      if (sheetName === mockConfig.SHEETS.PARTICIPANTES) {
        const target = participantsDb.find(p => p._rowIndex === rowIndex);
        if (target) {
          Object.assign(target, updateData);
        }
      } else if (sheetName === mockConfig.SHEETS.INSCRIPCIONES) {
        const target = enrollmentsDb.find(e => e._rowIndex === rowIndex);
        if (target) {
          Object.assign(target, updateData);
        }
      }
    },
    insert(sheetName, record) {
      if (sheetName === mockConfig.SHEETS.AUDITORIA) {
        auditLogsDb.push({ ...record, _rowIndex: auditLogsDb.length + 2 });
      }
    }
  };

  const mockAuthService = {
    logAudit(actorEmail, action, entityId, detail) {
      auditLogsDb.push({
        Email_Admin: actorEmail,
        Accion: action,
        Entidad_Afectada: entityId,
        Detalle: detail,
        Fecha: '2026-11-10 12:00:00'
      });
    }
  };

  const mockUtilities = {
    formatDate(date, tz, fmt) {
      return '2026-11-10 12:00:00';
    },
    getUuid() {
      return 'MOCK-UUID-1234';
    }
  };

  const factory = new Function(
    'CONFIG', 'Database', 'AuthService', 'Utilities', 'DriveApp',
    `${adminServiceCode}; return AdminService;`
  );

  const service = factory(mockConfig, mockDb, mockAuthService, mockUtilities, {});

  return {
    service,
    participantsDb,
    enrollmentsDb,
    auditLogsDb
  };
}

// ----------------------------------------------------------------------------
// Escenario 1: Validación estricta y formato de DNI en updateParticipant
// ----------------------------------------------------------------------------
console.log('\n[Escenario 1] Validaciones de DNI y Nombre en AdminService.updateParticipant:');
{
  const { service } = createAdminServiceInstance();

  // 1.1 Rechazo de DNI con letras
  let errorMsg = '';
  try {
    service.updateParticipant({ participanteId: 'PAR-001', dni: 'ABC12345', nombreCompleto: 'JUAN PEREZ' }, 'admin@cognitio.pe');
  } catch (err) {
    errorMsg = err.message;
  }
  assert(errorMsg.includes('exactamente de 8 dígitos numéricos'), 'DNI con letras rechazado con mensaje específico');

  // 1.2 Rechazo de DNI con más de 8 dígitos
  errorMsg = '';
  try {
    service.updateParticipant({ participanteId: 'PAR-001', dni: '1234567890', nombreCompleto: 'JUAN PEREZ' }, 'admin@cognitio.pe');
  } catch (err) {
    errorMsg = err.message;
  }
  assert(errorMsg.includes('exactamente de 8 dígitos numéricos'), 'DNI mayor a 8 dígitos rechazado');

  // 1.3 Normalización y padding con ceros a la izquierda
  const resPad = service.updateParticipant({ participanteId: 'PAR-001', dni: '1234567', nombreCompleto: 'JUAN PEREZ' }, 'admin@cognitio.pe');
  assert(resPad.dni === '01234567', 'DNI de 7 dígitos rellenado automáticamente con cero a la izquierda');

  // 1.4 Rechazo de nombre menor a 3 caracteres
  errorMsg = '';
  try {
    service.updateParticipant({ participanteId: 'PAR-001', dni: '71234567', nombreCompleto: 'AL' }, 'admin@cognitio.pe');
  } catch (err) {
    errorMsg = err.message;
  }
  assert(errorMsg.includes('al menos 3 caracteres'), 'Nombre con menos de 3 caracteres rechazado');

  // 1.5 Rechazo de participante inexistente
  errorMsg = '';
  try {
    service.updateParticipant({ participanteId: 'PAR-INEXISTENTE', dni: '71234567', nombreCompleto: 'JUAN PEREZ' }, 'admin@cognitio.pe');
  } catch (err) {
    errorMsg = err.message;
  }
  assert(errorMsg.includes('Participante no encontrado'), 'Intento de modificar participante inexistente rechazado');
}

// ----------------------------------------------------------------------------
// Escenario 2: Prevención de colisión de DNI y aislamiento entre participantes
// ----------------------------------------------------------------------------
console.log('\n[Escenario 2] Prevención de colisión de DNI y preservación de otros registros:');
{
  const { service, participantsDb, auditLogsDb } = createAdminServiceInstance();

  // PAR-001 (71234567), PAR-002 (82345678), PAR-003 (93456789)
  // Intentar actualizar PAR-001 con el DNI de PAR-002 (82345678)
  let collisionError = '';
  try {
    service.updateParticipant({
      participanteId: 'PAR-001',
      dni: '82345678',
      nombreCompleto: 'JUAN PEREZ FLORES'
    }, 'admin@cognitio.pe');
  } catch (err) {
    collisionError = err.message;
  }
  assert(collisionError.includes('ya se encuentra registrado para otro participante'), 'Colisión de DNI detectada y bloqueada en el servidor');
  assert(collisionError.includes('MARIA RODRIGUEZ VEGA'), 'El mensaje de colisión identifica el titular actual del DNI');

  // Verificar que PAR-001 y PAR-002 conservan intactos sus datos
  const par1 = participantsDb.find(p => p.Participante_ID === 'PAR-001');
  const par2 = participantsDb.find(p => p.Participante_ID === 'PAR-002');
  assert(par1.DNI === '71234567', 'PAR-001 no fue alterado tras el error de colisión');
  assert(par2.DNI === '82345678' && par2.Nombre_Completo === 'MARIA RODRIGUEZ VEGA', 'PAR-002 intacto');

  // Permitir actualización legítima manteniendo el mismo DNI (sin auto-colisión falsa)
  const okSelf = service.updateParticipant({
    participanteId: 'PAR-001',
    dni: '71234567',
    nombreCompleto: 'JUAN PEREZ FLORES EDITADO'
  }, 'admin@cognitio.pe');
  assert(okSelf.nombreCompleto === 'JUAN PEREZ FLORES EDITADO', 'Actualización de nombre manteniendo el mismo DNI no genera auto-colisión');

  // Verificar registro de auditoría generado
  const audit = auditLogsDb.find(a => a.Accion === 'EDITAR_PARTICIPANTE');
  assert(audit !== undefined, 'Auditoría obligatoria EDITAR_PARTICIPANTE registrada');
  assert(audit.Entidad_Afectada === 'PAR-001', 'Auditoría asocia el ID de participante');
  assert(audit.Email_Admin === 'admin@cognitio.pe', 'Auditoría registra el correo del administrador actuante');
}

// ----------------------------------------------------------------------------
// Escenario 3: Corrección de Comprobante y Modalidad en AdminService.updatePaymentStatus
// ----------------------------------------------------------------------------
console.log('\n[Escenario 3] Corrección de Comprobante y Modalidad en AdminService.updatePaymentStatus:');
{
  const { service, enrollmentsDb, auditLogsDb } = createAdminServiceInstance();

  // INS-2026-001: Pendiente, Virtual, Voucher vacio
  const res = service.updatePaymentStatus(
    'INS-2026-001',
    'Pendiente',
    'Corrección de comprobante bancario por voucher borroso',
    'admin@cognitio.pe',
    {
      referenciaComprobante: 'PLIN-998877',
      tipoCertificado: 'Fisico'
    }
  );

  assert(res.referenciaComprobante === 'PLIN-998877', 'Comprobante bancario corregido retornado por el servicio');
  assert(res.tipoCertificado === 'Fisico', 'Modalidad de certificado corregida a Fisico');

  // Verificar persistencia en base de datos
  const updatedIns = enrollmentsDb.find(e => e.Inscripcion_ID === 'INS-2026-001');
  assert(updatedIns.Referencia_Comprobante === 'PLIN-998877', 'Referencia_Comprobante persistida en hoja Inscripciones');
  assert(updatedIns.Tipo_Certificado === 'Fisico', 'Tipo_Certificado persistido en hoja Inscripciones');
  assert(updatedIns.Inscripcion_ID === 'INS-2026-001', 'ID de inscripción inmutable');
  assert(updatedIns.Participante_ID === 'PAR-001', 'ID de participante inmutable');

  // Verificar que la otra inscripción no fue modificada
  const ins2 = enrollmentsDb.find(e => e.Inscripcion_ID === 'INS-2026-002');
  assert(ins2.Referencia_Comprobante === 'BCP-112233' && ins2.Tipo_Certificado === 'Fisico', 'Otras inscripciones permanecen inalteradas');

  // Verificar auditoría detallada
  const audit = auditLogsDb.find(a => a.Accion === 'CAMBIO_ESTADO_PAGO' && a.Entidad_Afectada === 'INS-2026-001');
  assert(audit !== undefined, 'Auditoría de cambio de estado de pago registrada');
  assert(audit.Detalle.includes('Voucher: PLIN-998877'), 'Auditoría contiene el detalle del voucher corregido');
  assert(audit.Detalle.includes('Modalidad: Fisico'), 'Auditoría contiene el detalle de la modalidad corregida');
}

// ============================================================================
// PARTE 2: VERIFICACIÓN DEL FRONTEND (emisor.html + js/admin.js)
// ============================================================================

console.log('\n============================================================');
console.log('PARTE 2: PRUEBAS DE INTERFAZ FRONTEND (js/admin.js)');
console.log('============================================================');

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this._className = '';
    this.innerHTML = '';
    this._textContent = '';
    this.value = '';
    this.style = {};
    this.disabled = false;
    this.required = false;
    this.placeholder = '';
    this.attributes = new Map();
    this.children = [];
    this.eventListeners = new Map();

    const self = this;
    this.classList = {
      _classes: new Set(),
      add(...classes) {
        classes.forEach(c => {
          if (c) self.classList._classes.add(c);
        });
        self._className = Array.from(self.classList._classes).join(' ');
      },
      remove(...classes) {
        classes.forEach(c => {
          if (c) self.classList._classes.delete(c);
        });
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

    // Selector tag + atributo: tr[data-participant-id="PAR-001"]
    const tagAttrMatch = selector.match(/^([a-zA-Z0-9]+)\[([a-zA-Z0-9_\-]+)=["']?([^"'\]]+)["']?\]$/);
    if (tagAttrMatch) {
      return this.tagName.toLowerCase() === tagAttrMatch[1].toLowerCase() && this.getAttribute(tagAttrMatch[2]) === tagAttrMatch[3];
    }

    // Selector atributo puro: [data-participant-id="PAR-001"]
    const attrMatch = selector.match(/^\[([a-zA-Z0-9_\-]+)=["']?([^"'\]]+)["']?\]$/);
    if (attrMatch) {
      return this.getAttribute(attrMatch[1]) === attrMatch[2];
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

// Registrar elementos del DOM requeridos para edición de participante y pago
mockDoc.registerElement('modal-participant', new MockElement('div', 'modal-participant'));
mockDoc.registerElement('part-form-id', new MockElement('input', 'part-form-id'));
mockDoc.registerElement('part-form-id-display', new MockElement('span', 'part-form-id-display'));
mockDoc.registerElement('part-form-dni', new MockElement('input', 'part-form-dni'));
mockDoc.registerElement('part-form-dni-indicator', new MockElement('small', 'part-form-dni-indicator'));
mockDoc.registerElement('part-form-name', new MockElement('input', 'part-form-name'));
mockDoc.registerElement('btn-save-participant', new MockElement('button', 'btn-save-participant'));

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
mockDoc.registerElement('admin-enrollments-list', new MockElement('div', 'admin-enrollments-list'));
mockDoc.registerElement('admin-enrollments-count', new MockElement('div', 'admin-enrollments-count'));

// Importar módulos
const { Admin } = await import('../../js/admin.js');
const { Api } = await import('../../js/api.js');

// ----------------------------------------------------------------------------
// Escenario 4: Interfaz de edición del participante y formateo reactivo de DNI
// ----------------------------------------------------------------------------
console.log('\n[Escenario 4] Reactividad en modal de edición de participante:');
{
  Admin.setupDNIIndicators();

  const dniInput = mockDoc.getElementById('part-form-dni');
  const indicator = mockDoc.getElementById('part-form-dni-indicator');

  // Simular tipeo con caracteres inválidos
  dniInput.value = '71A23B4';
  dniInput.dispatchEvent({ type: 'input' });

  assert(dniInput.value === '71234', 'Caracteres no numéricos eliminados en tiempo real');
  assert(indicator.textContent.includes('5/8'), 'Indicador de longitud muestra 5/8 dígitos');

  // Completar a 8 dígitos numéricos
  dniInput.value = '71234567';
  dniInput.dispatchEvent({ type: 'input' });
  assert(indicator.textContent.includes('8/8 dígitos numéricos'), 'Indicador muestra mensaje de éxito para 8 dígitos');

  // Carga de datos en el modal
  Admin.openEditParticipantModal('PAR-001', '71234567', 'JUAN CARLOS PEREZ');
  assert(mockDoc.getElementById('part-form-id').value === 'PAR-001', 'ID oculto poblado');
  assert(mockDoc.getElementById('part-form-id-display').textContent === 'PAR-001', 'ID mostrado visualmente de forma clara');
  assert(mockDoc.getElementById('part-form-dni').value === '71234567', 'DNI cargado en el formulario');
  assert(mockDoc.getElementById('part-form-name').value === 'JUAN CARLOS PEREZ', 'Nombre cargado en el formulario');
  assert(mockDoc.getElementById('modal-participant').style.display === 'flex', 'Modal se abre de inmediato (0ms)');
}

// ----------------------------------------------------------------------------
// Escenario 5: Actualización quirúrgica en el DOM en 0ms (updateParticipantRowsInPlace)
// ----------------------------------------------------------------------------
console.log('\n[Escenario 5] Actualización quirúrgica en el DOM (0ms):');
{
  // Crear filas en el DOM que representen inscripciones del participante PAR-001 y de PAR-002
  const table = mockDoc.createElement('table', 'test-table');

  const row1 = mockDoc.createElement('tr', 'row-ins-01');
  row1.setAttribute('data-participant-id', 'PAR-001');
  row1.setAttribute('data-enrollment-id', 'INS-01');
  const dniTd1 = mockDoc.createElement('td');
  dniTd1.className = 'col-dni font-mono';
  dniTd1.textContent = '71234567';
  const nameTd1 = mockDoc.createElement('td');
  nameTd1.className = 'col-participant-name';
  nameTd1.textContent = 'JUAN PEREZ';
  row1.appendChild(dniTd1);
  row1.appendChild(nameTd1);
  table.appendChild(row1);

  const row2 = mockDoc.createElement('tr', 'row-ins-02');
  row2.setAttribute('data-participant-id', 'PAR-002');
  row2.setAttribute('data-enrollment-id', 'INS-02');
  const dniTd2 = mockDoc.createElement('td');
  dniTd2.className = 'col-dni font-mono';
  dniTd2.textContent = '82345678';
  const nameTd2 = mockDoc.createElement('td');
  nameTd2.className = 'col-participant-name';
  nameTd2.textContent = 'MARIA RODRIGUEZ';
  row2.appendChild(dniTd2);
  row2.appendChild(nameTd2);
  table.appendChild(row2);

  mockDoc.body.appendChild(table);

  const t0 = performance.now();
  Admin.updateParticipantRowsInPlace('PAR-001', '71234599', 'JUAN PEREZ CORREGIDO');
  const t1 = performance.now();

  assert((t1 - t0) < 10, `Actualización en DOM ejecutada en ${(t1 - t0).toFixed(2)} ms (< 10ms)`);
  assert(dniTd1.textContent === '71234599', 'DNI actualizado en el DOM para PAR-001');
  assert(nameTd1.textContent === 'JUAN PEREZ CORREGIDO', 'Nombre actualizado en el DOM para PAR-001');
  assert(dniTd2.textContent === '82345678', 'DNI de PAR-002 no fue modificado en el DOM');
  assert(nameTd2.textContent === 'MARIA RODRIGUEZ', 'Nombre de PAR-002 no fue modificado en el DOM');
}

// ----------------------------------------------------------------------------
// Escenario 6: Validación previa en saveParticipant y control de concurrencia
// ----------------------------------------------------------------------------
console.log('\n[Escenario 6] Validaciones frontend y bloqueo anti-doble clic en saveParticipant:');
{
  Admin.isUpdatingParticipant = false;
  globalThis._lastAlert = null;

  // 6.1 DNI inválido
  mockDoc.getElementById('part-form-id').value = 'PAR-001';
  mockDoc.getElementById('part-form-dni').value = '123'; // menos de 8 dígitos
  mockDoc.getElementById('part-form-name').value = 'JUAN PEREZ';

  Admin.saveParticipant();
  assert(globalThis._lastAlert && globalThis._lastAlert.includes('8 dígitos'), 'Rechazo inmediato de DNI inválido en frontend sin invocar backend');

  // 6.2 Nombre menor a 3 caracteres o inválido
  globalThis._lastAlert = null;
  mockDoc.getElementById('part-form-dni').value = '71234567';
  mockDoc.getElementById('part-form-name').value = 'AB';

  Admin.saveParticipant();
  assert(globalThis._lastAlert && globalThis._lastAlert.includes('válidos'), 'Rechazo inmediato de nombre corto en frontend sin invocar backend');

  // 6.3 Bloqueo anti-doble clic (isUpdatingParticipant)
  Admin.isUpdatingParticipant = true;
  globalThis._lastAlert = null;
  mockDoc.getElementById('part-form-dni').value = '71234567';
  mockDoc.getElementById('part-form-name').value = 'JUAN PEREZ VALIDO';

  Admin.saveParticipant();
  assert(globalThis._lastAlert === null, 'Segundo clic bloqueado silenciosamente mientras se procesa la solicitud');
  Admin.isUpdatingParticipant = false;
}

// ----------------------------------------------------------------------------
// Escenario 7: Flujo exitoso de saveParticipant y actualización optimista
// ----------------------------------------------------------------------------
console.log('\n[Escenario 7] Flujo exitoso de saveParticipant con cierre optimista:');
{
  Admin.enrollmentsCache = [
    {
      Inscripcion_ID: 'INS-01',
      Participante_ID: 'PAR-001',
      DNI: '71234567',
      Nombre_Completo: 'JUAN PEREZ ANTERIOR'
    },
    {
      Inscripcion_ID: 'INS-02',
      Participante_ID: 'PAR-002',
      DNI: '82345678',
      Nombre_Completo: 'MARIA RODRIGUEZ'
    }
  ];

  let apiCalled = false;
  let apiPayload = null;
  Api.post = async (action, payload) => {
    apiCalled = true;
    apiPayload = payload;
    return { success: true, data: { participanteId: payload.participanteId } };
  };

  mockDoc.getElementById('part-form-id').value = 'PAR-001';
  mockDoc.getElementById('part-form-dni').value = '71234567';
  mockDoc.getElementById('part-form-name').value = 'juan perez nuevo';
  mockDoc.getElementById('modal-participant').style.display = 'flex';

  await Admin.saveParticipant();

  assert(mockDoc.getElementById('modal-participant').style.display === 'none', 'Modal cerrado de inmediato al iniciar la operación');
  assert(apiCalled === true, 'Llamada al endpoint adminUpdateParticipant realizada');
  assert(apiPayload.participanteId === 'PAR-001', 'Payload contiene participanteId');
  assert(apiPayload.dni === '71234567', 'Payload contiene dni');
  assert(apiPayload.nombreCompleto === 'JUAN PEREZ NUEVO', 'Nombre normalizado a mayúsculas en payload');
  assert(Admin.enrollmentsCache[0].Nombre_Completo === 'JUAN PEREZ NUEVO', 'Caché en memoria actualizado de forma optimista');
  assert(Admin.isUpdatingParticipant === false, 'Cerrojo de concurrencia liberado tras finalizar');
}

// ----------------------------------------------------------------------------
// Escenario 8: Rollback automático en frontend ante error del servidor o de red
// ----------------------------------------------------------------------------
console.log('\n[Escenario 8] Rollback automático ante rechazo del servidor o falla de red:');
{
  Admin.enrollmentsCache = [
    {
      Inscripcion_ID: 'INS-01',
      Participante_ID: 'PAR-001',
      DNI: '71234567',
      Nombre_Completo: 'JUAN PEREZ ORIGINAL'
    }
  ];

  // Simular que el backend rechaza la actualización (ej. colisión de DNI)
  Api.post = async () => {
    return { success: false, message: 'El DNI ya se encuentra registrado para otro participante.' };
  };

  mockDoc.getElementById('part-form-id').value = 'PAR-001';
  mockDoc.getElementById('part-form-dni').value = '82345678';
  mockDoc.getElementById('part-form-name').value = 'JUAN PEREZ COLISION';

  await Admin.saveParticipant();

  assert(Admin.enrollmentsCache[0].DNI === '71234567', 'Caché restaurado (rollback) a DNI original tras error del backend');
  assert(Admin.enrollmentsCache[0].Nombre_Completo === 'JUAN PEREZ ORIGINAL', 'Caché restaurado a nombre original');
  assert(Admin.isUpdatingParticipant === false, 'Cerrojo liberado para permitir nuevo intento');

  // Simular falla de red (excepción lanzada)
  Api.post = async () => {
    throw new Error('Fallo de conexión HTTP 500');
  };

  await Admin.saveParticipant();
  assert(Admin.enrollmentsCache[0].DNI === '71234567', 'Caché restaurado a DNI original tras excepción de red');
  assert(Admin.isUpdatingParticipant === false, 'Cerrojo liberado tras excepción de red');
}

// ----------------------------------------------------------------------------
// Escenario 9: Corrección de Voucher y Modalidad desde savePaymentStatusChange
// ----------------------------------------------------------------------------
console.log('\n[Escenario 9] Corrección de comprobante y modalidad en savePaymentStatusChange:');
{
  Admin.enrollmentsCache = [
    {
      Inscripcion_ID: 'INS-2026-F01',
      Participante_ID: 'PAR-101',
      DNI: '48765432',
      Nombre_Completo: 'SOFIA MONTENEGRO',
      Tipo_Certificado: 'Virtual',
      Estado_Pago: 'Pendiente',
      Fecha_Pago: '',
      Referencia_Comprobante: '',
      Codigo_Consulta: 'CC-9876'
    }
  ];

  let paymentPayload = null;
  Api.post = async (action, payload) => {
    paymentPayload = payload;
    return {
      success: true,
      data: {
        enrollmentId: payload.enrollmentId,
        status: payload.status,
        referenciaComprobante: payload.referenciaComprobante || '',
        tipoCertificado: payload.tipoCertificado || 'Virtual'
      }
    };
  };

  // Abrir modal y configurar corrección
  Admin.openPaymentModal('INS-2026-F01');

  mockDoc.getElementById('payment-modal-new-status').value = 'Pendiente';
  mockDoc.getElementById('payment-modal-reason').value = 'Corrección de voucher y modalidad a físico';
  mockDoc.getElementById('payment-modal-voucher-edit').value = 'YAPE-887766';
  mockDoc.getElementById('payment-modal-cert-type-select').value = 'Fisico';

  await Admin.savePaymentStatusChange();

  assert(paymentPayload !== null, 'Llamada de actualización de pago ejecutada');
  assert(paymentPayload.referenciaComprobante === 'YAPE-887766', 'Comprobante editado enviado en payload');
  assert(paymentPayload.tipoCertificado === 'Fisico', 'Modalidad de certificado editada enviada en payload');
  assert(Admin.enrollmentsCache[0].Referencia_Comprobante === 'YAPE-887766', 'Caché local sincronizado con voucher corregido');
  assert(Admin.enrollmentsCache[0].Tipo_Certificado === 'Fisico', 'Caché local sincronizado con modalidad corregida');
}

// ============================================================================
// RESUMEN GENERAL
// ============================================================================
reportSummary('Suite de Pruebas: Optimizaciones de Corregir Pago (Fase 3)');
