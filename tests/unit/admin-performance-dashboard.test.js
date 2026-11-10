/**
 * SUITE DE PRUEBAS DE INTEGRACIÓN Y RENDIMIENTO: PANEL ADMINISTRATIVO Y DASHBOARD
 * Círculo de Estudios COGNITIO CREDITOR
 * Archivo: tests/unit/admin-performance-dashboard.test.js
 * 
 * Verifica exhaustivamente la matriz de 14 escenarios obligatorios:
 *  1. Apertura y control de visibilidad RBAC del Panel Administrativo (SuperAdmin vs Admin vs Operador)
 *  2. Navegación fluida y activación de pestañas (Tab Switching)
 *  3. Apertura segura del modal «Gestionar pago» con apóstrofes y comillas ("D'Angelo", "O'Connor", etc.)
 *  4. Interfaz reactiva del modal de pago (Motivo obligatorio vs opcional según nuevo estado)
 *  5. Consulta, modificación reversible de estados de pago, trazabilidad y preservación de IDs
 *  6. Adaptador del Dashboard: Procesamiento matemático exacto del contrato canónico del backend
 *  7. Adaptador del Dashboard: Tolerancia y normalización ante contratos planos y esquemas mixtos
 *  8. Adaptador del Dashboard: Desglose por evento, modalidades (virtual vs físico) y barras semánticas
 *  9. Feed de auditoría en vivo en el Dashboard: Orden cronológico y asignación semántica de badges
 * 10. Sincronización reactiva del Dashboard: Marcado como sucio (dashboardDirty = true) ante mutaciones
 * 11. Recarga perezosa (lazy reload) del Dashboard sucio al retornar a la pestaña tab-dashboard
 * 12. Casos de borde numéricos y matemáticos: Evento sin inscripciones (evita división por cero / NaN)
 * 13. Manejo controlado de errores de red o backend sin congelamiento de la interfaz y con rollback
 * 14. Prevención estricta de operaciones duplicadas mediante bloqueos en vuelo (in-flight locks)
 */

import { assert, reportSummary } from './test-helper.js';

// ============================================================================
// SIMULADOR DETERMINÍSTICO DEL ENTORNO DOM (En memoria para Node.js)
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
        self.className = Array.from(self.classList._classes).join(' ');
      },
      remove(...classes) {
        classes.forEach(c => {
          if (c) self.classList._classes.delete(c);
        });
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

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : (name === 'id' ? this.id : null);
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
    if (name === 'id') this.id = String(val);
    if (name === 'class') {
      this.classList._classes.clear();
      String(val).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  appendChild(child) {
    if (child instanceof MockElement) {
      this.children.push(child);
    }
    return child;
  }

  remove() {
    // No-op para pruebas
  }

  focus() {
    this._focused = true;
  }

  scrollIntoView() {
    this._scrolledIntoView = true;
  }

  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  click() {
    const handlers = this.eventListeners.get('click') || [];
    handlers.forEach(h => h({ target: this, preventDefault() {} }));
  }

  matches(selector) {
    if (!selector) return false;
    selector = selector.trim();
    if (selector.startsWith('#') && !selector.includes('[')) return this.id === selector.slice(1);
    if (selector.startsWith('.') && !selector.includes('[')) return this.classList.contains(selector.slice(1));
    if (/^[a-zA-Z0-9]+$/.test(selector)) return this.tagName.toLowerCase() === selector.toLowerCase();

    // Selector de atributo exacto: [data-target="tab-events"] o [data-target='tab-events']
    const attrMatch = selector.match(/^\[([a-zA-Z0-9_\-]+)=["']?([^"'\]]+)["']?\]$/);
    if (attrMatch) return this.getAttribute(attrMatch[1]) === attrMatch[2];

    // Selector clase + atributo: .admin-tab-btn[data-target="tab-dashboard"]
    const classAttrMatch = selector.match(/^\.([a-zA-Z0-9_\-]+)\[([a-zA-Z0-9_\-]+)=["']?([^"'\]]+)["']?\]$/);
    if (classAttrMatch) {
      return this.classList.contains(classAttrMatch[1]) && this.getAttribute(classAttrMatch[2]) === classAttrMatch[3];
    }

    // Selector tag + atributo: tr[data-enrollment-id="INS-001"]
    const tagAttrMatch = selector.match(/^([a-zA-Z0-9]+)\[([a-zA-Z0-9_\-]+)=["']?([^"'\]]+)["']?\]$/);
    if (tagAttrMatch) {
      return this.tagName.toLowerCase() === tagAttrMatch[1].toLowerCase() && this.getAttribute(tagAttrMatch[2]) === tagAttrMatch[3];
    }

    // Selector atributo comodín: button[onclick*="openNewEventModal"]
    const wildcardMatch = selector.match(/^button\[([a-zA-Z0-9_\-]+)\*=["']?([^"'\]]+)["']?\]$/i) || selector.match(/^\[([a-zA-Z0-9_\-]+)\*=["']?([^"'\]]+)["']?\]$/);
    if (wildcardMatch) {
      const val = this.getAttribute(wildcardMatch[1]) || '';
      return val.includes(wildcardMatch[2]);
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
    this.elementsById = new Map();
    this.allElements = [];
    this.body = this.createElement('body');
  }

  createElement(tagName) {
    const el = new MockElement(tagName);
    this.allElements.push(el);
    return el;
  }

  getElementById(id) {
    if (!this.elementsById.has(id)) {
      const el = new MockElement('div', id);
      this.elementsById.set(id, el);
      this.allElements.push(el);
    }
    return this.elementsById.get(id);
  }

  registerElement(id, el) {
    el.id = id;
    this.elementsById.set(id, el);
    this.allElements.push(el);
    return el;
  }

  querySelector(selector) {
    for (const el of this.allElements) {
      if (el.matches(selector)) return el;
    }
    return null;
  }

  querySelectorAll(selector) {
    return this.allElements.filter(el => el.matches(selector));
  }

  addEventListener() {}
}

class MockSessionStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// Configurar variables globales antes de importar módulos
const mockDoc = new MockDocument();
const mockStorage = new MockSessionStorage();

globalThis.window = globalThis;
globalThis.document = mockDoc;
globalThis.sessionStorage = mockStorage;
globalThis.alert = (msg) => { globalThis._lastAlert = msg; };
globalThis.confirm = () => true;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// Importar dinámicamente el Admin y Api del proyecto
const { Admin } = await import('../../js/admin.js');
const { Api } = await import('../../js/api.js');

// Mock por defecto de Api.post para aislar completamente las pruebas de la red externa
Api.post = async (action, payload) => {
  if (action === 'adminGetEvents') {
    return { success: true, data: [{ Evento_ID: "EVT-2026-001", Titulo_Evento: "Auditoría Financiera", Estado: "Activo" }] };
  }
  if (action === 'adminGetDashboardStats') {
    return { success: true, data: { scope: 'global', enrollments: { total: 0 } } };
  }
  return { success: true, data: [] };
};

// ============================================================================
// CONFIGURACIÓN INICIAL DEL ENTORNO DE PRUEBA
// ============================================================================

function setupInitialAdminDOM() {
  // Secciones principales de autenticación y workspace
  mockDoc.registerElement('auth-gate-section', new MockElement('div', 'auth-gate-section'));
  mockDoc.registerElement('admin-workspace-section', new MockElement('div', 'admin-workspace-section'));
  mockDoc.registerElement('admin-user-display', new MockElement('div', 'admin-user-display'));
  mockDoc.registerElement('auth-warning-box', new MockElement('div', 'auth-warning-box'));
  mockDoc.registerElement('google-signin-btn-container', new MockElement('div', 'google-signin-btn-container'));

  // Botón de pestaña Directiva (exclusivo SuperAdmin)
  const tabBtnUsers = new MockElement('button', 'tab-btn-users');
  tabBtnUsers.setAttribute('data-target', 'tab-users');
  tabBtnUsers.classList.add('admin-tab-btn');
  mockDoc.registerElement('tab-btn-users', tabBtnUsers);

  // Botón de nuevo evento
  const btnNewEvent = new MockElement('button');
  btnNewEvent.setAttribute('onclick', 'window.CognitioAdmin.openNewEventModal()');
  mockDoc.allElements.push(btnNewEvent);

  // Pestañas y contenidos
  const tabIds = ['tab-dashboard', 'tab-events', 'tab-enrollments', 'tab-audit', 'tab-users'];
  tabIds.forEach(id => {
    const btn = new MockElement('button');
    btn.classList.add('admin-tab-btn');
    btn.setAttribute('data-target', id);
    mockDoc.allElements.push(btn);

    const content = new MockElement('div', id);
    content.classList.add('admin-tab-content');
    content.style.display = (id === 'tab-dashboard') ? 'block' : 'none';
    mockDoc.registerElement(id, content);
  });

  // Área de Dashboard
  mockDoc.registerElement('dashboard-content-area', new MockElement('div', 'dashboard-content-area'));
  mockDoc.registerElement('dashboard-event-filter', new MockElement('select', 'dashboard-event-filter'));
  mockDoc.registerElement('dashboard-last-updated', new MockElement('strong', 'dashboard-last-updated'));

  // Contenedor de lista de eventos
  mockDoc.registerElement('admin-events-list', new MockElement('div', 'admin-events-list'));

  // Controles de Inscripciones y Pagos
  mockDoc.registerElement('filter-event-select', new MockElement('select', 'filter-event-select'));
  mockDoc.registerElement('admin-enrollments-list', new MockElement('div', 'admin-enrollments-list'));

  // Pre-popular eventsCache para evitar peticiones no controladas
  Admin.eventsCache = [
    { Evento_ID: "EVT-2026-001", Titulo_Evento: "Auditoría Financiera", Estado: "Activo" }
  ];

  // Elementos del Modal «Gestionar pago»
  mockDoc.registerElement('modal-payment-status', new MockElement('div', 'modal-payment-status'));
  mockDoc.registerElement('payment-modal-enrollment-id', new MockElement('input', 'payment-modal-enrollment-id'));
  mockDoc.registerElement('payment-modal-participant-name', new MockElement('strong', 'payment-modal-participant-name'));
  mockDoc.registerElement('payment-modal-enrollment-code', new MockElement('code', 'payment-modal-enrollment-code'));
  mockDoc.registerElement('payment-modal-current-status', new MockElement('span', 'payment-modal-current-status'));
  mockDoc.registerElement('payment-modal-new-status', new MockElement('select', 'payment-modal-new-status'));
  mockDoc.registerElement('payment-modal-reason', new MockElement('textarea', 'payment-modal-reason'));
  mockDoc.registerElement('payment-modal-reason-req', new MockElement('span', 'payment-modal-reason-req'));
  mockDoc.registerElement('payment-modal-reason-help', new MockElement('small', 'payment-modal-reason-help'));
  mockDoc.registerElement('btn-save-payment-status', new MockElement('button', 'btn-save-payment-status'));

  // Inicializar listeners de tabs en el simulador
  Admin.setupTabs();
}

// Inicializar el DOM simulado
setupInitialAdminDOM();

console.log("================================================================================");
console.log("--- INICIANDO SUITE DE PRUEBAS: PANEL ADMINISTRATIVO Y DASHBOARD (14 CASOS) ---");
console.log("================================================================================");

// ============================================================================
// ESCENARIO 01: Apertura y Control de Acceso RBAC en el Panel Administrativo
// ============================================================================
console.log("\n[Escenario 01] Apertura y Visibilidad RBAC (SuperAdmin vs Operador):");
{
  // 1. Inicio de sesión como SuperAdmin
  Admin.currentAuthToken = 'mock-token-superadmin';
  Admin.onLoginSuccess({ email: 'rector@unap.edu.pe', role: 'SuperAdmin' });

  const workspace = mockDoc.getElementById('admin-workspace-section');
  const gate = mockDoc.getElementById('auth-gate-section');
  const userBar = mockDoc.getElementById('admin-user-display');
  const tabUsersBtn = mockDoc.getElementById('tab-btn-users');

  assert(workspace.style.display === 'block', "Workspace administrativo desplegado en pantalla");
  assert(gate.style.display === 'none', "Gate de inicio de sesión ocultado correctamente");
  assert(userBar.innerHTML.includes('rector@unap.edu.pe'), "Barra de usuario renderiza correo institucional");
  assert(userBar.innerHTML.includes('badge-superadmin'), "Badge visual SuperAdmin asignado correctamente");
  assert(tabUsersBtn.style.display === 'inline-flex', "Pestaña de Directiva y Permisos VISIBLE para SuperAdmin");
  assert(mockStorage.getItem('cognitio_admin_role') === 'SuperAdmin', "Rol persistido en sessionStorage");

  // 2. Transición de permisos a Operador
  Admin.currentAdminRole = 'Operador';
  Admin.applyRoleRestrictions();

  assert(tabUsersBtn.style.display === 'none', "Pestaña de Directiva OCULTA estrictamente para rol Operador");

  const btnNewEvent = mockDoc.querySelector('button[onclick*="openNewEventModal"]');
  assert(btnNewEvent && btnNewEvent.style.display === 'none', "Botón de creación de nuevo evento bloqueado/oculto para Operador");
}

// ============================================================================
// ESCENARIO 02: Navegación Fluida entre Pestañas (Tab Switching)
// ============================================================================
console.log("\n[Escenario 02] Navegación de Pestañas (Tab Switching):");
{
  const btnEvents = mockDoc.querySelector('.admin-tab-btn[data-target="tab-events"]');
  const btnEnrollments = mockDoc.querySelector('.admin-tab-btn[data-target="tab-enrollments"]');
  const contentEvents = mockDoc.getElementById('tab-events');
  const contentDashboard = mockDoc.getElementById('tab-dashboard');
  const contentEnrollments = mockDoc.getElementById('tab-enrollments');

  // Clic en pestaña Eventos
  btnEvents.click();
  assert(btnEvents.classList.contains('active'), "Pestaña Eventos marcada con clase active");
  assert(contentEvents.style.display === 'block', "Contenido tab-events visible");
  assert(contentDashboard.style.display === 'none', "Contenido tab-dashboard ocultado");

  // Clic en pestaña Inscripciones
  btnEnrollments.click();
  assert(btnEnrollments.classList.contains('active'), "Pestaña Inscripciones marcada con clase active");
  assert(!btnEvents.classList.contains('active'), "Pestaña Eventos desmarcada de active");
  assert(contentEnrollments.style.display === 'block', "Contenido tab-enrollments visible");
  assert(contentEvents.style.display === 'none', "Contenido tab-events ocultado");
}

// ============================================================================
// ESCENARIO 03: Apertura Segura del Modal «Gestionar Pago» con Apóstrofes y Comillas
// ============================================================================
console.log("\n[Escenario 03] Modal «Gestionar Pago» con Nombres Complejos (Apóstrofes, Comillas, XSS):");
{
  const trickyNames = [
    { id: "INS-001", name: "D'Angelo Valdivia Morales", status: "Pendiente" },
    { id: "INS-002", name: "O'Connor O'Higgins Sean", status: "Pagado" },
    { id: "INS-003", name: "María José de la O' Quiroga", status: "Pendiente" },
    { id: "INS-004", name: 'Carlos "El Grande" Müller-Lübeck', status: "Pendiente" },
    { id: "INS-005", name: "<script>alert('xss')</script>", status: "Pendiente" }
  ];

  Admin.enrollmentsCache = trickyNames.map(item => ({
    Inscripcion_ID: item.id,
    Participante_ID: `PAR-${item.id}`,
    DNI: "71234567",
    Nombre_Completo: item.name,
    Tipo_Certificado: "Virtual",
    Estado_Pago: item.status,
    Codigo_Consulta: `CC-${item.id}`
  }));

  const nameSpan = mockDoc.getElementById('payment-modal-participant-name');
  const idInput = mockDoc.getElementById('payment-modal-enrollment-id');
  const modal = mockDoc.getElementById('modal-payment-status');

  trickyNames.forEach(item => {
    let syntaxErrorOccurred = false;
    try {
      Admin.openPaymentModal(item.id);
    } catch (e) {
      syntaxErrorOccurred = true;
    }

    assert(!syntaxErrorOccurred, `Apertura sin errores de sintaxis para nombre: ${item.name}`);
    assert(nameSpan.textContent === item.name, `Nombre literal preservado en textContent sin escape erróneo`);
    assert(idInput.value === item.id, `ID de inscripción ${item.id} cargado correctamente en campo oculto`);
    assert(modal.style.display === 'flex', `Modal desplegado con display flex`);
  });

  // Verificar que el renderizado de la tabla de inscripciones NO incruste el nombre en el inline onclick
  Admin.renderEnrollmentsTable();
  const listContainer = mockDoc.getElementById('admin-enrollments-list');
  const tableHtml = listContainer.innerHTML;

  assert(!tableHtml.includes("openPaymentModal('D'Angelo"), "El atributo onclick NO contiene comillas simples anidadas sin escapar");
  assert(tableHtml.includes("openPaymentModal('INS-001')"), "El onclick pasa estrictamente el Inscripcion_ID");
}

// ============================================================================
// ESCENARIO 04: Interfaz Reactiva del Modal de Pago según Estado
// ============================================================================
console.log("\n[Escenario 04] Dinámica de Motivo en Modal (Opcional vs Obligatorio):");
{
  const reqSpan = mockDoc.getElementById('payment-modal-reason-req');
  const reasonTextarea = mockDoc.getElementById('payment-modal-reason');

  // 1. Al seleccionar 'Pagado'
  Admin.onPaymentStatusSelectChange('Pagado');
  assert(reqSpan.textContent === '(Opcional)', "Indicador muestra '(Opcional)' al seleccionar Pagado");
  assert(reasonTextarea.required === false, "Textarea de motivo no requerido para Pagado");

  // 2. Al seleccionar 'Pendiente' (Reversión)
  Admin.onPaymentStatusSelectChange('Pendiente');
  assert(reqSpan.textContent === '* (Obligatorio)', "Indicador muestra '* (Obligatorio)' al seleccionar Pendiente");
  assert(reasonTextarea.required === true, "Textarea marcado como required para Pendiente");

  // 3. Al seleccionar 'Anulado'
  Admin.onPaymentStatusSelectChange('Anulado');
  assert(reqSpan.textContent === '* (Obligatorio)', "Indicador muestra '* (Obligatorio)' al seleccionar Anulado");
  assert(reasonTextarea.required === true, "Textarea marcado como required para Anulado");

  // 4. Intento de guardar 'Anulado' con motivo en blanco
  mockDoc.getElementById('payment-modal-enrollment-id').value = 'INS-001';
  mockDoc.getElementById('payment-modal-new-status').value = 'Anulado';
  mockDoc.getElementById('payment-modal-reason').value = '   '; // Vacío

  let apiInvoked = false;
  Api.post = async () => { apiInvoked = true; return { success: true }; };

  globalThis._lastAlert = null;
  Admin.savePaymentStatusChange();

  assert(!apiInvoked, "Mutación backend BLOQUEADA ante motivo ausente en reversión/anulación");
  assert(globalThis._lastAlert && globalThis._lastAlert.includes("Debe especificar el motivo"), "Alerta explicativa informada al usuario");
}

// ============================================================================
// ESCENARIO 05: Modificación Reversible de Estados de Pago y Preservación de IDs
// ============================================================================
console.log("\n[Escenario 05] Transición y Reversibilidad de Pago con Trazabilidad:");
{
  const enrollmentRecord = {
    Inscripcion_ID: "INS-TEST-099",
    Participante_ID: "PAR-TEST-888",
    DNI: "70112233",
    Nombre_Completo: "D'ANGELO VALDIVIA",
    Estado_Pago: "Pendiente",
    Fecha_Pago: "",
    Codigo_Consulta: "CC-TEST-099"
  };

  Admin.enrollmentsCache = [enrollmentRecord];

  // Simular llamada exitosa al backend
  let capturedPayload = null;
  Api.post = async (action, payload) => {
    if (action === 'adminUpdatePaymentStatus') {
      capturedPayload = payload;
      return { success: true, message: "Estado de pago actualizado correctamente." };
    }
    return { success: true };
  };

  // 1. Confirmar pago (Pendiente -> Pagado)
  Admin.isUpdatingPayment = false;
  await Admin.confirmPayment("INS-TEST-099");

  assert(enrollmentRecord.Estado_Pago === 'Pagado', "Estado optimista actualizado a Pagado");
  assert(enrollmentRecord.Fecha_Pago.length > 0, "Fecha de pago asignada automáticamente");
  assert(capturedPayload.status === 'Pagado', "Backend recibió status Pagado");

  // 2. Revertir pago (Pagado -> Pendiente)
  mockDoc.getElementById('payment-modal-enrollment-id').value = 'INS-TEST-099';
  mockDoc.getElementById('payment-modal-new-status').value = 'Pendiente';
  mockDoc.getElementById('payment-modal-reason').value = 'Comprobante bancario rebotado';

  Admin.isUpdatingPayment = false;
  await Admin.savePaymentStatusChange();

  assert(enrollmentRecord.Estado_Pago === 'Pendiente', "Estado revertido exitosamente a Pendiente");
  assert(enrollmentRecord.Fecha_Pago === '', "Fecha de pago limpiada en reversión");
  assert(capturedPayload.status === 'Pendiente', "Backend recibió status Pendiente");
  assert(capturedPayload.reason === 'Comprobante bancario rebotado', "Motivo de auditoría registrado");

  // 3. Verificar inmutabilidad de llaves
  assert(enrollmentRecord.Inscripcion_ID === "INS-TEST-099", "Inscripcion_ID inmutable");
  assert(enrollmentRecord.Participante_ID === "PAR-TEST-888", "Participante_ID inmutable");
  assert(enrollmentRecord.Codigo_Consulta === "CC-TEST-099", "Codigo_Consulta inmutable");
}

// ============================================================================
// ESCENARIO 06: Adaptador del Dashboard - Contrato Canónico Anidado Backend
// ============================================================================
console.log("\n[Escenario 06] Adaptador Dashboard (Contrato Canónico Anidado):");
{
  const canonicalBackendStats = {
    scope: "global",
    selectedEventId: null,
    events: { total: 4, active: 2, finished: 1, draft: 1 },
    participants: { totalUnique: 150 },
    enrollments: {
      total: 200,
      byPaymentStatus: {
        pagado: 140,
        pendiente: 40,
        anulado: 20,
        reembolsado: 0
      },
      paymentRate: 77.8, // 140 / (200 - 20) = 77.8%
      byCertType: {
        virtual: 120,
        fisico: 80,
        virtualRate: 60.0,
        fisicoRate: 40.0
      }
    },
    eventBreakdown: [
      {
        eventId: "EVT-2026-001",
        title: "Auditoría Financiera",
        date: "2026-11-20",
        modalidad: "Virtual",
        totalEnrollments: 120,
        paidCount: 90,
        pendingCount: 30,
        physicalCount: 40,
        paymentRate: 75.0
      }
    ],
    recentActivity: [
      {
        action: "CONFIRMAR_PAGO",
        adminUser: "admin@cognitio.pe",
        timestamp: "2026-11-10T10:00:00.000Z",
        detail: "Pago confirmado para INS-001"
      }
    ]
  };

  Admin.renderDashboardView(canonicalBackendStats, 'all');

  const content = mockDoc.getElementById('dashboard-content-area').innerHTML;

  assert(content.includes('<span class="kpi-value">200</span>'), "KPI Total de Inscripciones muestra 200 (no 0)");
  assert(content.includes('<span class="kpi-value">140</span>'), "KPI Conciliación muestra 140 Pagados (no 0)");
  assert(content.includes('77.8% Conciliado'), "Tasa de conciliación canónica 77.8% renderizada con precisión");
  assert(content.includes('70.0% Pagado'), "Distribución porcentual pagada calculada exactamente: 70.0%");
  assert(content.includes('40</b> Pend.') || content.includes('40</strong> Pend.'), "Conteo de pendientes renderizado correctamente");
  assert(content.includes('<span class="kpi-value">150</span>'), "KPI Participantes Únicos muestra 150");
  assert(!content.includes('NaN'), "Ninguna métrica produjo NaN");
  assert(!content.includes('undefined'), "Ninguna propiedad resultó undefined");
}

// ============================================================================
// ESCENARIO 07: Adaptador del Dashboard - Tolerancia a Contratos Planos
// ============================================================================
console.log("\n[Escenario 07] Adaptador Dashboard (Contrato Plano / Retrocompatible):");
{
  const legacyFlatStats = {
    totalInscritos: 80,
    pagados: 60,
    pendientes: 15,
    anulados: 5,
    participantesUnicos: 70,
    eventosActivos: 3,
    totalEventos: 5,
    tasaConciliacion: 75,
    certificadosVirtuales: 50,
    certificadosFisicos: 30
  };

  Admin.renderDashboardView(legacyFlatStats, 'all');

  const content = mockDoc.getElementById('dashboard-content-area').innerHTML;

  assert(content.includes('<span class="kpi-value">80</span>'), "Tolerancia: totalInscritos plano = 80");
  assert(content.includes('<span class="kpi-value">60</span>'), "Tolerancia: pagados plano = 60");
  assert(content.includes('<span class="kpi-value">70</span>'), "Tolerancia: participantesUnicos plano = 70");
  assert(content.includes('75% Conciliado'), "Tolerancia: tasaConciliacion plano = 75%");
  assert(!content.includes('NaN'), "Cero valores NaN en contrato plano");
}

// ============================================================================
// ESCENARIO 08: Adaptador del Dashboard - Desglose por Evento y Modalidades
// ============================================================================
console.log("\n[Escenario 08] Desglose por Evento y Modalidades (Virtual vs Físico):");
{
  const statsWithEvents = {
    enrollments: { total: 100, byPaymentStatus: { pagado: 70, pendiente: 30 } },
    eventBreakdown: [
      {
        eventId: "EVT-HIGH",
        title: "Tributación Avanzada",
        date: "2026-11-25",
        modalidad: "Virtual",
        totalEnrollments: 60,
        paidCount: 50,
        pendingCount: 10,
        physicalCount: 10,
        paymentRate: 83.3
      },
      {
        eventId: "EVT-LOW",
        title: "Taller Derecho Civil",
        date: "2026-12-01",
        modalidad: "Presencial",
        totalEnrollments: 40,
        paidCount: 20,
        pendingCount: 20,
        physicalCount: 30,
        paymentRate: 50.0
      }
    ]
  };

  Admin.renderDashboardView(statsWithEvents, 'all');

  const content = mockDoc.getElementById('dashboard-content-area').innerHTML;

  assert(content.includes('EVT-HIGH'), "Evento EVT-HIGH incluido en tabla resumen");
  assert(content.includes('EVT-LOW'), "Evento EVT-LOW incluido en tabla resumen");
  assert(content.includes('background-color: #059669'), "Tasa >= 75% renderizada con barra verde (#059669)");
  assert(content.includes('background-color: #D97706'), "Tasa < 75% renderizada con barra ámbar (#D97706)");
  assert(/badge-info[\s\S]*?Virtual/.test(content), "Modalidad Virtual con badge-info");
  assert(/badge-purple[\s\S]*?Presencial/.test(content), "Modalidad Presencial con badge-purple");
  assert(content.includes("viewEventEnrollments('EVT-HIGH')"), "Botón de acción con ID de evento enlazado");
}

// ============================================================================
// ESCENARIO 09: Feed de Auditoría en Vivo en el Dashboard
// ============================================================================
console.log("\n[Escenario 09] Feed de Auditoría en Vivo (recentActivity):");
{
  const statsWithActivity = {
    enrollments: { total: 10, byPaymentStatus: { pagado: 10 } },
    recentActivity: [
      { action: "CONFIRMAR_PAGO", adminUser: "directivo1@cognitio.pe", timestamp: "2026-11-10T09:00:00Z", detail: "Pago validado INS-101" },
      { action: "CREAR_EVENTO", adminUser: "admin@cognitio.pe", timestamp: "2026-11-10T08:30:00Z", detail: "Nuevo evento creado" },
      { action: "EMISION_LOTE", adminUser: "operador@cognitio.pe", timestamp: "2026-11-10T08:00:00Z", detail: "50 certificados generados" },
      { action: "IMPORTACION_EXCEL", adminUser: "admin@cognitio.pe", timestamp: "2026-11-10T07:30:00Z", detail: "Lote de 30 inscritos" },
      { action: "REVOCAR_DIRECTIVO", adminUser: "rector@unap.edu.pe", timestamp: "2026-11-10T07:00:00Z", detail: "Acceso revocado a usuario inactivo" }
    ]
  };

  Admin.renderDashboardView(statsWithActivity, 'all');

  const content = mockDoc.getElementById('dashboard-content-area').innerHTML;

  assert(content.includes('badge-success">CONFIRMAR_PAGO</span>'), "Acción PAGO mapeada a badge-success");
  assert(content.includes('badge-info">CREAR_EVENTO</span>'), "Acción EVENTO mapeada a badge-info");
  assert(content.includes('badge-purple">EMISION_LOTE</span>'), "Acción EMISION mapeada a badge-purple");
  assert(content.includes('badge-warning">IMPORTACION_EXCEL</span>'), "Acción EXCEL mapeada a badge-warning");
  assert(content.includes('badge-danger">REVOCAR_DIRECTIVO</span>'), "Acción REVOCAR mapeada a badge-danger");
  assert(content.includes('directivo1@cognitio.pe'), "Email de directivo presente en el feed");
}

// ============================================================================
// ESCENARIO 10: Sincronización Reactiva del Dashboard (dashboardDirty = true)
// ============================================================================
console.log("\n[Escenario 10] Sincronización Reactiva (dashboardDirty):");
{
  // Asegurar que el dashboard esté en pestaña inactiva inicialmente
  mockDoc.getElementById('tab-dashboard').style.display = 'none';

  Admin.dashboardDirty = false;
  Admin.notifyDataChanged('payment', { enrollmentId: 'INS-001' });
  assert(Admin.dashboardDirty === true, "notifyDataChanged('payment') marca dashboardDirty = true");

  Admin.dashboardDirty = false;
  Admin.notifyDataChanged('individualRegistration', { eventId: 'EVT-001' });
  assert(Admin.dashboardDirty === true, "notifyDataChanged('individualRegistration') marca dashboardDirty = true");

  Admin.dashboardDirty = false;
  Admin.notifyDataChanged('excelImport', { eventId: 'EVT-001' });
  assert(Admin.dashboardDirty === true, "notifyDataChanged('excelImport') marca dashboardDirty = true");

  Admin.dashboardDirty = false;
  Admin.notifyDataChanged('saveEvent', { eventId: 'EVT-002' });
  assert(Admin.dashboardDirty === true, "notifyDataChanged('saveEvent') marca dashboardDirty = true");

  Admin.dashboardDirty = false;
  Admin.notifyDataChanged('deleteEvent', { eventId: 'EVT-002' });
  assert(Admin.dashboardDirty === true, "notifyDataChanged('deleteEvent') marca dashboardDirty = true");
}

// ============================================================================
// ESCENARIO 11: Recarga Perezosa (Lazy Reload) al Regresar a Pestaña Dashboard
// ============================================================================
console.log("\n[Escenario 11] Recarga Perezosa al Retornar al Dashboard:");
{
  let dashboardRefreshed = false;
  Api.post = async (action) => {
    if (action === 'adminGetEvents') return { success: true, data: [] };
    if (action === 'adminGetDashboardStats') {
      dashboardRefreshed = true;
      return { success: true, data: { enrollments: { total: 10 } } };
    }
    return { success: true, data: [] };
  };

  // Simular mutación mientras se está en tab-events
  mockDoc.getElementById('tab-dashboard').style.display = 'none';
  mockDoc.getElementById('tab-events').style.display = 'block';
  Admin.dashboardDirty = true;
  Admin.isRefreshingDashboard = false;

  // Clic en tab-dashboard para retornar
  const btnDashboard = mockDoc.querySelector('.admin-tab-btn[data-target="tab-dashboard"]');
  btnDashboard.click();
  await new Promise(r => setTimeout(r, 60));

  assert(dashboardRefreshed === true, "Dashboard recargado automáticamente al retornar con dashboardDirty=true");
  assert(Admin.dashboardDirty === false, "Flag dashboardDirty reseteado a false tras la recarga");
}

// ============================================================================
// ESCENARIO 12: Casos de Borde Numéricos y Matemáticos (División por Cero)
// ============================================================================
console.log("\n[Escenario 12] Casos de Borde: Evento Vacío (Cero División / NaN):");
{
  const emptyStats = {
    events: { total: 1, active: 1, finished: 0, draft: 0 },
    participants: { totalUnique: 0 },
    enrollments: {
      total: 0,
      byPaymentStatus: { pagado: 0, pendiente: 0, anulado: 0, reembolsado: 0 },
      paymentRate: 0,
      byCertType: { virtual: 0, fisico: 0, virtualRate: 0, fisicoRate: 0 }
    },
    eventBreakdown: [
      {
        eventId: "EVT-VACIO",
        title: "Evento Sin Inscritos",
        totalEnrollments: 0,
        paidCount: 0,
        pendingCount: 0,
        physicalCount: 0,
        paymentRate: 0
      }
    ],
    recentActivity: []
  };

  let renderErrorOccurred = false;
  try {
    Admin.renderDashboardView(emptyStats, 'EVT-VACIO');
  } catch (err) {
    renderErrorOccurred = true;
  }

  const content = mockDoc.getElementById('dashboard-content-area').innerHTML;

  assert(!renderErrorOccurred, "Renderizado de evento sin inscripciones no arrojó excepción");
  assert(content.includes('<span class="kpi-value">0</span>'), "Total inscritos es 0");
  assert(content.includes('0% Conciliado'), "Tasa de conciliación muestra 0% sin arrojar NaN");
  assert(!content.includes('NaN'), "No existe ninguna cadena 'NaN' en la vista");
  assert(!content.includes('Infinity'), "No existe 'Infinity%' por división entre cero");
  assert(content.includes('0.0% Pagado'), "Porcentaje pagado muestra 0.0%");
}

// ============================================================================
// ESCENARIO 13: Manejo Controlado de Errores de Red y Rollback Optimista
// ============================================================================
console.log("\n[Escenario 13] Manejo Controlado de Errores y Rollback:");
{
  // 1. Error de red en Dashboard
  Api.post = async (action) => {
    if (action === 'adminGetDashboardStats') {
      throw new Error("Timeout de comunicación con Apps Script");
    }
    return { success: true };
  };

  Admin.isRefreshingDashboard = false;
  // Limpiar contenido previo para que muestre el mensaje de error completo
  mockDoc.getElementById('dashboard-content-area').innerHTML = '';
  await Admin.loadDashboard('all', { silent: false });

  const content = mockDoc.getElementById('dashboard-content-area').innerHTML;
  assert(content.includes('alert-danger'), "Alerta de peligro renderizada ante falla de red");
  assert(content.includes('Timeout de comunicación'), "Mensaje descriptivo del error expuesto");
  assert(content.includes('Reintentar'), "Botón de reintento ergonómico ofrecido al usuario");
  assert(Admin.isRefreshingDashboard === false, "Bloqueo isRefreshingDashboard liberado en finally");

  // 2. Rollback optimista ante falla de confirmación de pago
  const rowTarget = mockDoc.createElement('tr');
  rowTarget.setAttribute('data-enrollment-id', 'INS-ROLLBACK-01');
  const statusTd = mockDoc.createElement('td');
  statusTd.classList.add('col-payment-status');
  rowTarget.appendChild(statusTd);
  const actionsTd = mockDoc.createElement('td');
  actionsTd.classList.add('col-payment-actions');
  rowTarget.appendChild(actionsTd);
  mockDoc.allElements.push(rowTarget);

  const testEnrollment = {
    Inscripcion_ID: "INS-ROLLBACK-01",
    Estado_Pago: "Pendiente",
    Fecha_Pago: ""
  };
  Admin.enrollmentsCache = [testEnrollment];

  // Simular rechazo del servidor
  Api.post = async (action) => {
    if (action === 'adminUpdatePaymentStatus') {
      return { success: false, message: "La transacción fue bloqueada por auditoría" };
    }
    return { success: true };
  };

  Admin.isUpdatingPayment = false;
  globalThis._lastAlert = null;
  await Admin.confirmPayment("INS-ROLLBACK-01");

  assert(testEnrollment.Estado_Pago === 'Pendiente', "Rollback: Estado restaurado a Pendiente tras rechazo del servidor");
  assert(testEnrollment.Fecha_Pago === '', "Rollback: Fecha de pago restaurada a vacía");
  assert(Admin.isUpdatingPayment === false, "Bloqueo isUpdatingPayment liberado tras error");
}

// ============================================================================
// ESCENARIO 14: Prevención de Operaciones Duplicadas (In-Flight Locks)
// ============================================================================
console.log("\n[Escenario 14] Prevención de Doble Petición (In-Flight Locks):");
{
  let apiCallCount = 0;
  Api.post = async (action) => {
    if (action === 'adminGetEvents') return { success: true, data: [] };
    if (action === 'adminGetDashboardStats') {
      apiCallCount++;
      await new Promise(r => setTimeout(r, 40));
      return { success: true, data: { enrollments: { total: 15 } } };
    }
    return { success: true, data: [] };
  };

  Admin.isRefreshingDashboard = false;

  // Lanzar dos cargas concurrentes
  const p1 = Admin.loadDashboard('all', { silent: true });
  const p2 = Admin.loadDashboard('all', { silent: true });

  await Promise.all([p1, p2]);

  assert(apiCallCount === 1, `In-Flight Lock Dashboard: Solo 1 llamada efectuada (${apiCallCount}), la segunda fue descartada`);
  assert(Admin.isRefreshingDashboard === false, "isRefreshingDashboard liberado tras culminar llamada");

  // Concurrencia en confirmPayment
  let paymentCallCount = 0;
  Api.post = async (action) => {
    if (action === 'adminGetEvents') return { success: true, data: [] };
    if (action === 'adminUpdatePaymentStatus') {
      paymentCallCount++;
      await new Promise(r => setTimeout(r, 40));
      return { success: true };
    }
    return { success: true, data: [] };
  };

  Admin.enrollmentsCache = [{ Inscripcion_ID: "INS-LOCK-01", Estado_Pago: "Pendiente" }];
  Admin.isUpdatingPayment = false;

  const pay1 = Admin.confirmPayment("INS-LOCK-01");
  const pay2 = Admin.confirmPayment("INS-LOCK-01");

  await Promise.all([pay1, pay2]);

  assert(paymentCallCount === 1, `In-Flight Lock Pago: Solo 1 mutación efectuada (${paymentCallCount}) ante doble clic simultáneo`);
  assert(Admin.isUpdatingPayment === false, "isUpdatingPayment liberado tras culminar");
}

// ============================================================================
// REPORTE FINAL DE LA SUITE
// ============================================================================
reportSummary("Panel Administrativo y Dashboard (14 Escenarios)");
