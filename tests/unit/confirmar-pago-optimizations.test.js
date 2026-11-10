/**
 * PRUEBAS UNITARIAS: OPTIMIZACIONES DE CONFIRMAR PAGO (FASE 4)
 * Círculo de Estudios COGNITIO CREDITOR
 * Ejecutable mediante: node tests/unit/confirmar-pago-optimizations.test.js
 */

import fs from 'fs';
import { assert, reportSummary } from './test-helper.js';

// ============================================================================
// PARTE 1: VERIFICACIÓN DIRECTA DEL BACKEND (backend/AdminService.js)
// ============================================================================

console.log('--- INICIANDO PRUEBAS DE OPTIMIZACIÓN: CONFIRMAR PAGO (FASE 4) ---');
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
      Referencia_Comprobante: 'YAPE-123456',
      Codigo_Consulta: 'CC-001',
      Estado_Inscripcion: 'Registrada',
      _rowIndex: 2
    },
    {
      Inscripcion_ID: 'INS-2026-002',
      Participante_ID: 'PAR-002',
      Evento_ID: 'EVT-01',
      Tipo_Certificado: 'Fisico',
      Estado_Pago: 'Pagado',
      Fecha_Pago: '2026-10-15 09:30:00',
      Referencia_Comprobante: 'BCP-998877',
      Codigo_Consulta: 'CC-002',
      Estado_Inscripcion: 'Registrada',
      _rowIndex: 3
    },
    {
      Inscripcion_ID: 'INS-2026-003',
      Participante_ID: 'PAR-003',
      Evento_ID: 'EVT-01',
      Tipo_Certificado: 'Virtual',
      Estado_Pago: 'Anulado',
      Fecha_Pago: '',
      Referencia_Comprobante: '',
      Codigo_Consulta: 'CC-003',
      Estado_Inscripcion: 'Registrada',
      _rowIndex: 4
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
        Fecha: '2026-11-10 12:30:00'
      });
    }
  };

  const mockUtilities = {
    formatDate(date, tz, fmt) {
      return '2026-11-10 12:30:00';
    },
    getUuid() {
      return 'UUID-CONFIRM-TEST';
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
// Escenario 1: Confirmación de pago válido en el backend
// ----------------------------------------------------------------------------
console.log('\n[Escenario 1] Confirmación de un pago válido en AdminService.updatePaymentStatus:');
{
  const { service, enrollmentsDb, auditLogsDb } = createAdminServiceInstance();

  // INS-2026-001 está en Pendiente
  const res = service.updatePaymentStatus(
    'INS-2026-001',
    'Pagado',
    'Confirmación directa de pago verificado por directiva',
    'admin@cognitio.pe'
  );

  assert(res.status === 'Pagado', 'Backend retorna estado Pagado');
  assert(res.previousStatus === 'Pendiente', 'previousStatus reporta Pendiente');
  assert(res.fechaPago === '2026-11-10 12:30:00', 'Fecha_Pago asignada con timestamp de confirmación');

  // Verificar persistencia en Google Sheets (Inscripciones)
  const ins1 = enrollmentsDb.find(e => e.Inscripcion_ID === 'INS-2026-001');
  assert(ins1.Estado_Pago === 'Pagado', 'Google Sheets: Estado_Pago persistido a Pagado');
  assert(ins1.Fecha_Pago === '2026-11-10 12:30:00', 'Google Sheets: Fecha_Pago persistida');
  assert(ins1.Inscripcion_ID === 'INS-2026-001', 'Inscripcion_ID inmutable');
  assert(ins1.Participante_ID === 'PAR-001', 'Participante_ID inmutable');
  assert(ins1.Codigo_Consulta === 'CC-001', 'Codigo_Consulta inmutable');

  // Verificar que otros registros en Google Sheets permanecen inalterados
  const ins2 = enrollmentsDb.find(e => e.Inscripcion_ID === 'INS-2026-002');
  const ins3 = enrollmentsDb.find(e => e.Inscripcion_ID === 'INS-2026-003');
  assert(ins2.Estado_Pago === 'Pagado' && ins2.Fecha_Pago === '2026-10-15 09:30:00', 'INS-002 permanece inalterado');
  assert(ins3.Estado_Pago === 'Anulado', 'INS-003 permanece inalterado');

  // Verificar bitácora de auditoría inmutable
  const audit = auditLogsDb.find(a => a.Accion === 'CAMBIO_ESTADO_PAGO' && a.Entidad_Afectada === 'INS-2026-001');
  assert(audit !== undefined, 'Auditoría registrada');
  assert(audit.Detalle.includes('De Pendiente a Pagado'), 'Detalle indica transición de Pendiente a Pagado');
  assert(audit.Email_Admin === 'admin@cognitio.pe', 'Auditoría asocia el directivo');
}

// ----------------------------------------------------------------------------
// Escenario 2: Intento de confirmar un pago ya confirmado (Backend)
// ----------------------------------------------------------------------------
console.log('\n[Escenario 2] Intento de confirmar un pago ya confirmado (Backend):');
{
  const { service, enrollmentsDb } = createAdminServiceInstance();

  // INS-2026-002 ya está en Pagado (Fecha_Pago: 2026-10-15 09:30:00)
  let errorAlreadyPaid = '';
  try {
    service.updatePaymentStatus(
      'INS-2026-002',
      'Pagado',
      'Confirmación redundante',
      'admin@cognitio.pe'
    );
  } catch (err) {
    errorAlreadyPaid = err.message;
  }

  assert(errorAlreadyPaid.includes('ya se encuentra registrada como Pagada'), 'Rechazo de confirmación redundante para inscripción ya pagada');

  // Comprobar que la fecha de pago histórica no fue sobreescrita
  const ins2 = enrollmentsDb.find(e => e.Inscripcion_ID === 'INS-2026-002');
  assert(ins2.Fecha_Pago === '2026-10-15 09:30:00', 'Fecha histórica de pago preservada intacta (no sobreescrita)');
}

// ----------------------------------------------------------------------------
// Escenario 3: Verificación de condiciones y confirmación sobre inscripción anulada
// ----------------------------------------------------------------------------
console.log('\n[Escenario 3] Verificación de condiciones sobre inscripción anulada e inexistente:');
{
  const { service } = createAdminServiceInstance();

  // 3.1 Intento de confirmar inscripción anulada sin motivo de reactivación
  let errorAnulado = '';
  try {
    service.updatePaymentStatus('INS-2026-003', 'Pagado', '', 'admin@cognitio.pe');
  } catch (err) {
    errorAnulado = err.message;
  }
  assert(errorAnulado.includes('sin especificar el motivo de reactivación'), 'Rechaza confirmación de inscripción anulada sin motivo');

  // 3.2 Inscripción inexistente
  let errorNotFound = '';
  try {
    service.updatePaymentStatus('INS-INEXISTENTE', 'Pagado', 'Voucher', 'admin@cognitio.pe');
  } catch (err) {
    errorNotFound = err.message;
  }
  assert(errorNotFound.includes('Inscripción no encontrada'), 'Rechaza confirmación de inscripción inexistente');
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

  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
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

globalThis._lastAlert = null;
globalThis.alert = (msg) => { globalThis._lastAlert = msg; };
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Registrar elementos del modal de confirmación rápida
mockDoc.registerElement('modal-confirm-payment', new MockElement('div', 'modal-confirm-payment'));
mockDoc.registerElement('confirm-modal-enrollment-id', new MockElement('input', 'confirm-modal-enrollment-id'));
mockDoc.registerElement('confirm-modal-participant-name', new MockElement('span', 'confirm-modal-participant-name'));
mockDoc.registerElement('confirm-modal-dni', new MockElement('span', 'confirm-modal-dni'));
mockDoc.registerElement('confirm-modal-code', new MockElement('code', 'confirm-modal-code'));
mockDoc.registerElement('confirm-modal-cert-type', new MockElement('span', 'confirm-modal-cert-type'));
mockDoc.registerElement('confirm-modal-voucher', new MockElement('code', 'confirm-modal-voucher'));
mockDoc.registerElement('confirm-modal-current-status', new MockElement('span', 'confirm-modal-current-status'));
mockDoc.registerElement('btn-execute-confirm-payment', new MockElement('button', 'btn-execute-confirm-payment'));

mockDoc.registerElement('admin-enrollments-list', new MockElement('div', 'admin-enrollments-list'));
mockDoc.registerElement('admin-enrollments-count', new MockElement('div', 'admin-enrollments-count'));

// Importar módulos
const { Admin } = await import('../../js/admin.js');
const { Api } = await import('../../js/api.js');

// ----------------------------------------------------------------------------
// Escenario 4: Apertura del Modal de Confirmación Rápida con datos enriquecidos
// ----------------------------------------------------------------------------
console.log('\n[Escenario 4] Modal de Confirmación Rápida (openConfirmPaymentModal):');
{
  Admin.enrollmentsCache = [
    {
      Inscripcion_ID: 'INS-01',
      Participante_ID: 'PAR-01',
      DNI: '44556677',
      Nombre_Completo: 'ANDREA VALENCIA CASTILLO',
      Tipo_Certificado: 'Fisico',
      Estado_Pago: 'Pendiente',
      Fecha_Pago: '',
      Referencia_Comprobante: 'PLIN-776655',
      Codigo_Consulta: 'CC-ANDREA'
    },
    {
      Inscripcion_ID: 'INS-02',
      Participante_ID: 'PAR-02',
      DNI: '77889900',
      Nombre_Completo: 'MIGUEL GRAU SEMINARIO',
      Tipo_Certificado: 'Virtual',
      Estado_Pago: 'Pagado',
      Fecha_Pago: '2026-11-01 10:00:00',
      Referencia_Comprobante: 'BCP-112233',
      Codigo_Consulta: 'CC-MIGUEL'
    },
    {
      Inscripcion_ID: 'INS-03',
      Participante_ID: 'PAR-03',
      DNI: '11223344',
      Nombre_Completo: 'FRANCISCO BOLOGNESI',
      Tipo_Certificado: 'Virtual',
      Estado_Pago: 'Anulado',
      Fecha_Pago: '',
      Referencia_Comprobante: '',
      Codigo_Consulta: 'CC-FRAN'
    }
  ];

  // 4.1 Apertura para inscripción válida en Pendiente
  const t0 = performance.now();
  Admin.openConfirmPaymentModal('INS-01');
  const t1 = performance.now();

  assert((t1 - t0) < 10, `Apertura del modal de confirmación en ${(t1 - t0).toFixed(2)} ms (< 10ms)`);
  assert(mockDoc.getElementById('confirm-modal-enrollment-id').value === 'INS-01', 'ID de inscripción poblado en modal');
  assert(mockDoc.getElementById('confirm-modal-participant-name').textContent === 'ANDREA VALENCIA CASTILLO', 'Nombre del participante visualizado');
  assert(mockDoc.getElementById('confirm-modal-dni').textContent === '44556677', 'DNI visualizado claramente');
  assert(mockDoc.getElementById('confirm-modal-code').textContent === 'CC-ANDREA', 'Código de consulta visualizado');
  assert(mockDoc.getElementById('confirm-modal-cert-type').textContent === 'Fisico', 'Modalidad Físico visualizada');
  assert(mockDoc.getElementById('confirm-modal-voucher').textContent === 'PLIN-776655', 'Voucher de pago visualizado');
  assert(mockDoc.getElementById('confirm-modal-current-status').textContent === 'Pendiente', 'Estado actual visualizado como Pendiente');
  assert(mockDoc.getElementById('modal-confirm-payment').style.display === 'flex', 'Modal se muestra visible en pantalla');

  // 4.2 Verificación previa: intento de abrir confirmación sobre inscripción ya pagada
  globalThis._lastAlert = null;
  mockDoc.getElementById('modal-confirm-payment').style.display = 'none';
  Admin.openConfirmPaymentModal('INS-02');
  assert(globalThis._lastAlert && globalThis._lastAlert.includes('ya se encuentra registrada como Pagada'), 'Alerta al intentar abrir confirmación de registro ya pagado');
  assert(mockDoc.getElementById('modal-confirm-payment').style.display === 'none', 'Modal no se abre para registros ya pagados');

  // 4.3 Verificación previa: intento de abrir confirmación sobre inscripción anulada
  globalThis._lastAlert = null;
  Admin.openConfirmPaymentModal('INS-03');
  assert(globalThis._lastAlert && globalThis._lastAlert.includes('anulada'), 'Alerta al intentar confirmar inscripción anulada');
}

// ----------------------------------------------------------------------------
// Escenario 5: Protección frente a confirmaciones accidentales (Cancelar)
// ----------------------------------------------------------------------------
console.log('\n[Escenario 5] Protección contra clics accidentales (Cancelar modal):');
{
  let apiCalled = false;
  Api.post = async () => { apiCalled = true; return { success: true }; };

  // Abrir modal para INS-01
  Admin.openConfirmPaymentModal('INS-01');
  assert(mockDoc.getElementById('modal-confirm-payment').style.display === 'flex', 'Modal abierto');

  // El usuario decide cancelar
  Admin.closeModal('modal-confirm-payment');

  assert(mockDoc.getElementById('modal-confirm-payment').style.display === 'none', 'Modal cerrado en 0ms tras cancelación');
  assert(apiCalled === false, 'Ninguna llamada al backend fue efectuada');
  assert(Admin.enrollmentsCache[0].Estado_Pago === 'Pendiente', 'Estado del participante permanece en Pendiente');
}

// ----------------------------------------------------------------------------
// Escenario 6: Ejecución exitosa de Confirmar Pago con actualización optimista (0ms)
// ----------------------------------------------------------------------------
console.log('\n[Escenario 6] Ejecución exitosa de Confirmar Pago con actualización optimista (0ms):');
{
  let capturedAction = '';
  let capturedPayload = null;

  Api.post = async (action, payload) => {
    capturedAction = action;
    capturedPayload = payload;
    return {
      success: true,
      data: {
        enrollmentId: payload.enrollmentId,
        status: 'Pagado',
        fechaPago: '2026-11-10 12:45:00'
      }
    };
  };

  // Preparar tabla en DOM
  const table = mockDoc.createElement('table', 'enrollment-table');
  const row = mockDoc.createElement('tr', 'row-ins-01');
  row.setAttribute('data-enrollment-id', 'INS-01');
  const statusTd = mockDoc.createElement('td');
  statusTd.className = 'col-payment-status';
  const actionsTd = mockDoc.createElement('td');
  actionsTd.className = 'col-payment-actions';
  row.appendChild(statusTd);
  row.appendChild(actionsTd);
  table.appendChild(row);
  mockDoc.body.appendChild(table);

  Admin.openConfirmPaymentModal('INS-01');
  assert(mockDoc.getElementById('modal-confirm-payment').style.display === 'flex', 'Modal listo para confirmar');

  // Ejecutar confirmación
  const t0 = performance.now();
  await Admin.executeConfirmedPayment();
  const t1 = performance.now();

  assert(mockDoc.getElementById('modal-confirm-payment').style.display === 'none', 'Modal cerrado de inmediato');
  assert(capturedAction === 'adminUpdatePaymentStatus', 'Acción enviada a la API es adminUpdatePaymentStatus');
  assert(capturedPayload.enrollmentId === 'INS-01', 'Payload contiene enrollmentId');
  assert(capturedPayload.status === 'Pagado', 'Payload solicita status Pagado');
  assert(Admin.enrollmentsCache[0].Estado_Pago === 'Pagado', 'Caché en memoria actualizado a Pagado');
  assert(Admin.enrollmentsCache[0].Fecha_Pago === '2026-11-10 12:45:00', 'Fecha_Pago del servidor guardada en caché');
  assert(Admin.isUpdatingPayment === false, 'Cerrojo isUpdatingPayment liberado');
}

// ----------------------------------------------------------------------------
// Escenario 7: Prevención de confirmaciones duplicadas y control anti-doble clic
// ----------------------------------------------------------------------------
console.log('\n[Escenario 7] Prevención de confirmaciones duplicadas (In-Flight Lock):');
{
  Admin.enrollmentsCache = [
    {
      Inscripcion_ID: 'INS-LOCK-01',
      Participante_ID: 'PAR-LOCK-01',
      DNI: '12341234',
      Nombre_Completo: 'USUARIO DOBLE CLIC',
      Tipo_Certificado: 'Virtual',
      Estado_Pago: 'Pendiente',
      Fecha_Pago: '',
      Referencia_Comprobante: 'VOUCHER-LOCK',
      Codigo_Consulta: 'CC-LOCK'
    }
  ];

  let postCallCount = 0;
  Api.post = async () => {
    postCallCount++;
    await new Promise(r => setTimeout(r, 30));
    return { success: true, data: { fechaPago: '2026-11-10 12:50:00' } };
  };

  Admin.isUpdatingPayment = false;
  Admin.updatingPaymentIds.clear();

  // Simular dos clics simultáneos (doble clic)
  const click1 = Admin.confirmPayment('INS-LOCK-01');
  const click2 = Admin.confirmPayment('INS-LOCK-01');

  await Promise.all([click1, click2]);

  assert(postCallCount === 1, `Solo 1 llamada al servidor efectuada ante doble clic (llamadas: ${postCallCount})`);
  assert(Admin.isUpdatingPayment === false, 'Cerrojo liberado tras completar la única llamada');
  assert(Admin.enrollmentsCache[0].Estado_Pago === 'Pagado', 'Estado final es Pagado');
}

// ----------------------------------------------------------------------------
// Escenario 8: Manejo de errores y Rollback atómico en el Frontend
// ----------------------------------------------------------------------------
console.log('\n[Escenario 8] Manejo de error y Rollback ante falla de servidor o de red:');
{
  Admin.enrollmentsCache = [
    {
      Inscripcion_ID: 'INS-ERR-01',
      Participante_ID: 'PAR-ERR-01',
      DNI: '99887766',
      Nombre_Completo: 'USUARIO ERROR ROLLBACK',
      Tipo_Certificado: 'Virtual',
      Estado_Pago: 'Pendiente',
      Fecha_Pago: '',
      Referencia_Comprobante: 'VOUCHER-FAIL',
      Codigo_Consulta: 'CC-FAIL'
    }
  ];

  // 8.1 Rechazo explícito del backend
  Api.post = async () => {
    return { success: false, message: 'La inscripción ya fue modificada por otro usuario.' };
  };

  globalThis._lastAlert = null;
  await Admin.confirmPayment('INS-ERR-01');

  assert(Admin.enrollmentsCache[0].Estado_Pago === 'Pendiente', 'Rollback: Caché restaurado a Pendiente tras rechazo del servidor');
  assert(Admin.enrollmentsCache[0].Fecha_Pago === '', 'Rollback: Fecha_Pago restaurada a vacía');
  assert(Admin.isUpdatingPayment === false, 'Lock isUpdatingPayment liberado');
  assert(globalThis._lastAlert && globalThis._lastAlert.includes('Error:'), 'Alerta de error mostrada al directivo');

  // 8.2 Excepción de red (HTTP 500 / Network Down)
  Api.post = async () => {
    throw new Error('Fallo crítico de conexión');
  };

  globalThis._lastAlert = null;
  await Admin.confirmPayment('INS-ERR-01');

  assert(Admin.enrollmentsCache[0].Estado_Pago === 'Pendiente', 'Rollback: Caché restaurado a Pendiente tras excepción de red');
  assert(Admin.isUpdatingPayment === false, 'Lock liberado tras excepción de red');
  assert(globalThis._lastAlert && globalThis._lastAlert.includes('Error de conexión'), 'Alerta de error de conexión emitida');
}

// ============================================================================
// RESUMEN GENERAL
// ============================================================================
reportSummary('Suite de Pruebas: Optimizaciones de Confirmar Pago (Fase 4)');
