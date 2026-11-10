/**
 * PRUEBAS UNITARIAS: OPTIMIZACIONES DE GESTIONAR PAGO (FASE 2)
 * Círculo de Estudios COGNITIO CREDITOR
 * Ejecutable mediante: node tests/unit/gestionar-pago-optimizations.test.js
 */

import { assert, reportSummary } from './test-helper.js';

// ============================================================================
// SIMULADOR DETERMINÍSTICO DEL ENTORNO DOM PARA PRUEBAS DE FASE 2
// ============================================================================

class MockElement {
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
    this.attributes = new Map();
    this.children = [];

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

  querySelector(selector) {
    if (selector === '.col-payment-status') {
      let el = this.children.find(c => c.className.includes('col-payment-status'));
      if (!el) {
        el = new MockElement('td');
        el.className = 'col-payment-status';
        this.children.push(el);
      }
      return el;
    }
    if (selector === '.col-payment-actions') {
      let el = this.children.find(c => c.className.includes('col-payment-actions'));
      if (!el) {
        el = new MockElement('td');
        el.className = 'col-payment-actions';
        this.children.push(el);
      }
      return el;
    }
    return null;
  }
}

class MockDocument {
  constructor() {
    this.elements = new Map();
    this.body = new MockElement('body', 'body');
    this.body.appendChild = () => {};
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  registerElement(id, element) {
    this.elements.set(id, element);
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  querySelector(selector) {
    if (selector.startsWith('tr[data-enrollment-id=')) {
      const match = selector.match(/tr\[data-enrollment-id="([^"]+)"\]/);
      if (match) {
        const id = match[1];
        let row = this.elements.get(`row-${id}`);
        if (!row) {
          row = new MockElement('tr', `row-${id}`);
          row.attributes.set('data-enrollment-id', id);
          this.elements.set(`row-${id}`, row);
        }
        return row;
      }
    }
    return null;
  }

  querySelectorAll() {
    return [];
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
} catch (e) {
  // En caso de que navigator no admita sobreescritura
}
globalThis._lastAlert = null;
globalThis.alert = (msg) => { globalThis._lastAlert = msg; };
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Registrar elementos del DOM requeridos
mockDoc.registerElement('modal-payment-status', new MockElement('div', 'modal-payment-status'));
mockDoc.registerElement('payment-modal-enrollment-id', new MockElement('input', 'payment-modal-enrollment-id'));
mockDoc.registerElement('payment-modal-participant-name', new MockElement('strong', 'payment-modal-participant-name'));
mockDoc.registerElement('payment-modal-enrollment-code', new MockElement('code', 'payment-modal-enrollment-code'));
mockDoc.registerElement('payment-modal-dni', new MockElement('strong', 'payment-modal-dni'));
mockDoc.registerElement('payment-modal-cert-type', new MockElement('span', 'payment-modal-cert-type'));
mockDoc.registerElement('payment-modal-voucher', new MockElement('code', 'payment-modal-voucher'));
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
mockDoc.registerElement('filter-enrollments-search', new MockElement('input', 'filter-enrollments-search'));
mockDoc.registerElement('filter-enrollments-status', new MockElement('select', 'filter-enrollments-status'));

// Importar módulo administrativo bajo prueba
const { Admin } = await import('../../js/admin.js');
const { Api } = await import('../../js/api.js');

console.log('--- INICIANDO PRUEBAS DE OPTIMIZACIÓN: GESTIONAR PAGO (FASE 2) ---');

// ============================================================================
// ESCENARIO 01: Apertura Ultrarrápida del Modal con Datos Enriquecidos
// ============================================================================
console.log('\n[Escenario 01] Apertura del modal con datos enriquecidos (DNI, Modalidad, Voucher, Fecha):');
{
  Admin.enrollmentsCache = [
    {
      Inscripcion_ID: 'INS-2026-F01',
      Participante_ID: 'PAR-101',
      DNI: '48765432',
      Nombre_Completo: 'SOFIA MONTENEGRO RIVERA',
      Tipo_Certificado: 'Fisico',
      Estado_Pago: 'Pagado',
      Fecha_Pago: '2026-11-08 16:30:00',
      Referencia_Comprobante: 'YAPE-987654',
      Codigo_Consulta: 'CC-9876'
    },
    {
      Inscripcion_ID: 'INS-2026-F02',
      Participante_ID: 'PAR-102',
      DNI: '09876543',
      Nombre_Completo: 'JUAN DIEGO DEL SOLAR',
      Tipo_Certificado: 'Virtual',
      Estado_Pago: 'Pendiente',
      Fecha_Pago: '',
      Referencia_Comprobante: '',
      Codigo_Consulta: 'CC-0987'
    }
  ];

  // Abrir registro con comprobante y pago completado
  const t0 = performance.now();
  Admin.openPaymentModal('INS-2026-F01');
  const t1 = performance.now();

  assert((t1 - t0) < 50, `Apertura ultrafluida ejecutada en ${(t1 - t0).toFixed(2)} ms (< 50ms)`);
  assert(mockDoc.getElementById('payment-modal-participant-name').textContent === 'SOFIA MONTENEGRO RIVERA', 'Nombre de participante cargado en modal');
  assert(mockDoc.getElementById('payment-modal-dni').textContent === '48765432', 'DNI del participante visualizado en modal');
  assert(mockDoc.getElementById('payment-modal-cert-type').textContent === 'Fisico', 'Tipo de certificado Físico visualizado');
  assert(mockDoc.getElementById('payment-modal-voucher').textContent === 'YAPE-987654', 'Número de comprobante bancario visible');
  assert(mockDoc.getElementById('btn-copy-payment-voucher').style.display !== 'none', 'Botón de copiado de voucher visible para comprobante no vacío');
  assert(mockDoc.getElementById('payment-modal-payment-date').textContent === '2026-11-08 16:30:00', 'Fecha histórica de pago renderizada');
  assert(mockDoc.getElementById('modal-payment-status').style.display === 'flex', 'Modal desplegado en pantalla');

  // Abrir registro pendiente sin comprobante
  Admin.openPaymentModal('INS-2026-F02');
  assert(mockDoc.getElementById('payment-modal-voucher').textContent === 'Sin comprobante', 'Muestra texto explicativo para registro sin voucher');
  assert(mockDoc.getElementById('btn-copy-payment-voucher').style.display === 'none', 'Botón de copiado oculto si no hay voucher');
  assert(mockDoc.getElementById('payment-modal-payment-date').textContent.includes('Pendiente'), 'Fecha muestra indicativo de confirmación pendiente');
}

// ============================================================================
// ESCENARIO 02: Copiado Ergonómico de Comprobante al Portapapeles
// ============================================================================
console.log('\n[Escenario 02] Copiado de voucher bancario (copyVoucherCode):');
{
  globalThis._lastCopiedText = null;
  const mockBtn = new MockElement('button');
  mockBtn.innerHTML = '📋 Copiar';

  await Admin.copyVoucherCode('OP-55443322', mockBtn);
  assert(globalThis._lastCopiedText === 'OP-55443322', 'Texto copiado con éxito al portapapeles');
  assert(mockBtn.textContent === '✓ Copiado', 'Botón de copiado ofrece feedback visual inmediato');

  // Copiado ante texto vacío o no disponible
  globalThis._lastCopiedText = null;
  await Admin.copyVoucherCode('-', mockBtn);
  assert(globalThis._lastCopiedText === null, 'Previene copia innecesaria de valor vacío o guion');
}

// ============================================================================
// ESCENARIO 03: Filtrado Reactivo y Búsqueda Instantánea en Memoria (0ms)
// ============================================================================
console.log('\n[Escenario 03] Búsqueda y filtrado instantáneo en memoria (filterEnrollmentsTable):');
{
  Admin.enrollmentsCache = [
    { Inscripcion_ID: 'INS-01', DNI: '71112233', Nombre_Completo: 'ALBERTO FUJIMORI', Estado_Pago: 'Pagado', Referencia_Comprobante: 'VOUCHER-AAA' },
    { Inscripcion_ID: 'INS-02', DNI: '72223344', Nombre_Completo: 'BEATRIZ MERINO', Estado_Pago: 'Pendiente', Referencia_Comprobante: 'PLIN-123' },
    { Inscripcion_ID: 'INS-03', DNI: '73334455', Nombre_Completo: 'CESAR VALLEJO', Estado_Pago: 'Anulado', Referencia_Comprobante: '' },
    { Inscripcion_ID: 'INS-04', DNI: '74445566', Nombre_Completo: 'DANIEL ALCIDES', Estado_Pago: 'Pendiente', Referencia_Comprobante: 'YAPE-999' }
  ];

  const searchInput = mockDoc.getElementById('filter-enrollments-search');
  const statusSelect = mockDoc.getElementById('filter-enrollments-status');
  const listContainer = mockDoc.getElementById('admin-enrollments-list');

  // 1. Filtrar solo Pendientes
  searchInput.value = '';
  statusSelect.value = 'Pendiente';
  Admin.filterEnrollmentsTable();

  assert(listContainer.innerHTML.includes('BEATRIZ MERINO'), 'Pendiente 1 incluido en resultado');
  assert(listContainer.innerHTML.includes('DANIEL ALCIDES'), 'Pendiente 2 incluido en resultado');
  assert(!listContainer.innerHTML.includes('ALBERTO FUJIMORI'), 'Pagado excluido de filtro Pendiente');
  assert(!listContainer.innerHTML.includes('CESAR VALLEJO'), 'Anulado excluido de filtro Pendiente');

  // 2. Búsqueda por DNI
  searchInput.value = '7333';
  statusSelect.value = 'all';
  Admin.filterEnrollmentsTable();

  assert(listContainer.innerHTML.includes('CESAR VALLEJO'), 'César Vallejo localizado por coincidencia parcial de DNI');
  assert(!listContainer.innerHTML.includes('BEATRIZ MERINO'), 'Otros participantes no coincidentes descartados');

  // 3. Búsqueda por Comprobante
  searchInput.value = 'PLIN-123';
  statusSelect.value = 'all';
  Admin.filterEnrollmentsTable();

  assert(listContainer.innerHTML.includes('BEATRIZ MERINO'), 'Beatriz Merino localizada por número de voucher');
  assert(!listContainer.innerHTML.includes('CESAR VALLEJO'), 'Otros registros no coincidentes con voucher descartados');

  // 4. Búsqueda sin coincidencias
  searchInput.value = 'NO_EXISTE_XYZ';
  Admin.filterEnrollmentsTable();
  assert(listContainer.innerHTML.includes('No se encontraron inscripciones'), 'Muestra mensaje amable de sin resultados');
}

// ============================================================================
// ESCENARIO 04: Contador Reactivo y Desglose de Conciliación
// ============================================================================
console.log('\n[Escenario 04] Contador reactivo de conciliación (updateEnrollmentsCount):');
{
  Admin.enrollmentsCache = [
    { Inscripcion_ID: 'I1', Estado_Pago: 'Pagado' },
    { Inscripcion_ID: 'I2', Estado_Pago: 'Pagado' },
    { Inscripcion_ID: 'I3', Estado_Pago: 'Pendiente' },
    { Inscripcion_ID: 'I4', Estado_Pago: 'Anulado' }
  ];

  Admin.updateEnrollmentsCount(4);
  const countHtml = mockDoc.getElementById('admin-enrollments-count').innerHTML;

  assert(countHtml.includes('Mostrando <strong>4</strong> de <strong>4</strong>'), 'Total de inscripciones mostrado correctamente');
  assert(countHtml.includes('2 Pagados'), 'Conteo de pagados exacto');
  assert(countHtml.includes('1 Pendientes'), 'Conteo de pendientes exacto');
}

// ============================================================================
// ESCENARIO 05: Concurrencia Granular no Bloqueante (Set de IDs en Vuelo)
// ============================================================================
console.log('\n[Escenario 05] Concurrencia granular (Set de IDs) en vez de Mutex Global:');
{
  let activeResolvers = {};
  Api.post = (action, payload) => {
    if (action === 'adminUpdatePaymentStatus') {
      return new Promise((resolve) => {
        activeResolvers[payload.enrollmentId] = resolve;
      });
    }
    return Promise.resolve({ success: true });
  };

  Admin.enrollmentsCache = [
    { Inscripcion_ID: 'INS-A', Estado_Pago: 'Pendiente', Fecha_Pago: '' },
    { Inscripcion_ID: 'INS-B', Estado_Pago: 'Pendiente', Fecha_Pago: '' }
  ];

  Admin.updatingPaymentIds.clear();
  Admin.isUpdatingPayment = false;

  // Iniciar guardado de INS-A (asíncrono en vuelo)
  mockDoc.getElementById('payment-modal-enrollment-id').value = 'INS-A';
  mockDoc.getElementById('payment-modal-new-status').value = 'Pagado';
  mockDoc.getElementById('payment-modal-reason').value = '';
  const promiseA = Admin.savePaymentStatusChange();

  assert(Admin.updatingPaymentIds.has('INS-A'), 'INS-A agregado al set de pagos en vuelo');
  assert(Admin.isUpdatingPayment === true, 'isUpdatingPayment activo mientras hay solicitudes');

  // Intento de doble clic sobre INS-A debe ser ignorado
  let doubleClickIgnored = false;
  mockDoc.getElementById('payment-modal-enrollment-id').value = 'INS-A';
  const promiseADup = Admin.savePaymentStatusChange(); // Debe descartarse
  assert(Admin.updatingPaymentIds.size === 1, 'Doble clic sobre el mismo ID descartado');

  // Iniciar confirmación sobre INS-B concurrentemente
  const promiseB = Admin.confirmPayment('INS-B');
  assert(Admin.updatingPaymentIds.has('INS-B'), 'INS-B NO se bloqueó por INS-A y se procesa en paralelo');
  assert(Admin.updatingPaymentIds.size === 2, 'Ambas inscripciones procesándose en vuelo simultáneamente');

  // Resolver INS-A
  activeResolvers['INS-A']({ success: true, data: { fechaPago: '2026-11-10 12:00:00' } });
  await promiseA;

  assert(!Admin.updatingPaymentIds.has('INS-A'), 'INS-A liberado tras resolución exitosa');
  assert(Admin.updatingPaymentIds.has('INS-B'), 'INS-B continúa en vuelo');
  assert(Admin.isUpdatingPayment === true, 'isUpdatingPayment aún activo porque INS-B sigue en vuelo');

  // Resolver INS-B
  activeResolvers['INS-B']({ success: true, data: { fechaPago: '2026-11-10 12:00:01' } });
  await promiseB;

  assert(!Admin.updatingPaymentIds.has('INS-B'), 'INS-B liberado');
  assert(Admin.updatingPaymentIds.size === 0, 'Todos los pagos en vuelo culminaron');
  assert(Admin.isUpdatingPayment === false, 'isUpdatingPayment liberado a false');
}

// ============================================================================
// ESCENARIO 06: Manejo Seguro de Errores con Rollback sin Bloqueos Nativos
// ============================================================================
console.log('\n[Escenario 06] Manejo de error del servidor con Toast y Rollback:');
{
  Admin.enrollmentsCache = [
    { Inscripcion_ID: 'INS-ERR-01', Estado_Pago: 'Pendiente', Fecha_Pago: '' }
  ];

  Api.post = async () => ({ success: false, message: 'La inscripción está bloqueada administrativamente' });

  mockDoc.getElementById('payment-modal-enrollment-id').value = 'INS-ERR-01';
  mockDoc.getElementById('payment-modal-new-status').value = 'Pagado';
  mockDoc.getElementById('payment-modal-reason').value = '';

  await Admin.savePaymentStatusChange();

  const item = Admin.enrollmentsCache.find(e => e.Inscripcion_ID === 'INS-ERR-01');
  assert(item.Estado_Pago === 'Pendiente', 'Rollback ejecutado: estado restaurado a Pendiente');
  assert(item.Fecha_Pago === '', 'Rollback ejecutado: fecha de pago restaurada');
  assert(!Admin.updatingPaymentIds.has('INS-ERR-01'), 'Lock en vuelo liberado en bloque finally');
  assert(Admin.isUpdatingPayment === false, 'isUpdatingPayment liberado');
}

reportSummary('FASE 2: OPTIMIZACIÓN DE GESTIONAR PAGO');
