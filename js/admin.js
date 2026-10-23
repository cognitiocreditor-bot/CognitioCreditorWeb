/**
 * MÓDULO DE PANEL ADMINISTRATIVO — COGNITIO CREDITOR (`emisor.html`)
 * Gestión de eventos, confirmación de pagos, importación de Excel con SheetJS,
 * configuración de plantillas con vista previa y emisión masiva por lotes.
 */

import { Api } from './api.js';
import { Validation } from './validation.js';
import { PdfEngine } from './pdf-engine.js';
import { CONFIG } from './config.js';

export const Admin = {
  currentAuthToken: null,
  currentAdminEmail: null,
  eventsCache: [],
  enrollmentsCache: [],
  eventFilter: 'active',

  /**
   * Inicializa el entorno administrativo.
   */
  init() {
    this.setupAuth();
    this.setupTabs();
  },

  /**
   * Configura Google Identity Services (GIS).
   */
  setupAuth() {
    if (typeof google === 'undefined' || !google.accounts) {
      console.warn('[Admin] Google Identity Services no cargó o no está conectado a internet.');
      return;
    }

    if (!CONFIG.isAuthConfigured()) {
      const loginAlert = document.getElementById('auth-warning-box');
      if (loginAlert) {
        loginAlert.style.display = 'block';
        loginAlert.innerHTML = `
          <strong>Aviso de Configuración:</strong> Ingrese su <code>GOOGLE_CLIENT_ID</code> oficial en <code>js/config.js</code> para habilitar el inicio de sesión real de la directiva.
        `;
      }
    }

    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: (response) => this.handleGoogleCredentialResponse(response)
    });

    google.accounts.id.renderButton(
      document.getElementById('google-signin-btn-container'),
      { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular' }
    );
  },

  /**
   * Maneja la credencial JWT devuelta por Google.
   */
  async handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
      alert('No se recibió la credencial de autenticación de Google.');
      return;
    }

    this.currentAuthToken = response.credential;

    // Decodificar payload básico en cliente para visualización (la validación real ocurre en backend)
    try {
      const payloadBase64 = response.credential.split('.')[1];
      const decodedJson = JSON.parse(atob(payloadBase64));
      this.currentAdminEmail = decodedJson.email;

      // Autenticar formalmente contra Google Apps Script
      const authCheck = await Api.post('adminAuthenticate', {}, this.currentAuthToken);

      if (!authCheck.success) {
        alert(authCheck.message || 'Acceso denegado: este correo no figura en la lista de directivos autorizados.');
        this.logout();
        return;
      }

      this.onLoginSuccess(decodedJson);
    } catch (err) {
      console.error('[Admin] Error decodificando token:', err);
      alert('Error al validar la sesión con Google.');
    }
  },

  onLoginSuccess(userData) {
    document.getElementById('auth-gate-section').style.display = 'none';
    document.getElementById('admin-workspace-section').style.display = 'block';
    document.getElementById('admin-user-display').textContent = userData.email || 'Directiva';
    
    // Cargar datos iniciales
    this.loadEvents();
  },

  logout() {
    this.currentAuthToken = null;
    this.currentAdminEmail = null;
    document.getElementById('auth-gate-section').style.display = 'block';
    document.getElementById('admin-workspace-section').style.display = 'none';
  },

  /**
   * Gestión de pestañas del panel administrativo.
   */
  /**
   * Gestión de pestañas del panel administrativo.
   */
  setupTabs() {
    const tabButtons = document.querySelectorAll('.admin-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');
        
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.style.display = 'block';

        if (targetId === 'tab-audit') {
          this.loadAuditLogs();
        }
      });
    });
  },

  /**
   * Control de ventanas modales.
   */
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  },

  // --------------------------------------------------------------------------
  // GESTIÓN DE EVENTOS
  // --------------------------------------------------------------------------
  async loadEvents() {
    const listContainer = document.getElementById('admin-events-list');
    listContainer.innerHTML = `<div class="loading-container"><div class="spinner"></div><p>Cargando eventos...</p></div>`;

    const res = await Api.post('adminGetEvents', {}, this.currentAuthToken);
    if (!res.success) {
      listContainer.innerHTML = `<div class="alert alert-danger">${Validation.escapeHTML(res.message)}</div>`;
      return;
    }

    this.eventsCache = res.data || [];
    this.renderEventsTable();
    this.populateEventSelectors();
  },

  setEventFilter(filterValue) {
    this.eventFilter = filterValue;
    this.renderEventsTable();
  },

  renderEventsTable() {
    const listContainer = document.getElementById('admin-events-list');
    if (this.eventsCache.length === 0) {
      listContainer.innerHTML = `<p style="color: var(--color-text-muted);">No hay eventos creados todavía.</p>`;
      return;
    }

    // Aplicar filtro visual seleccionado
    let filteredEvents = this.eventsCache;
    if (this.eventFilter === 'active') {
      filteredEvents = this.eventsCache.filter(e => e.Estado === 'Activo');
    } else if (this.eventFilter === 'archived') {
      filteredEvents = this.eventsCache.filter(e => e.Estado !== 'Activo');
    }

    if (filteredEvents.length === 0) {
      listContainer.innerHTML = `
        <p style="color: var(--color-text-muted);">
          No hay eventos para la vista seleccionada ('${this.eventFilter === 'active' ? 'Solo Activos' : 'Archivados'}').
        </p>
      `;
      return;
    }

    const rows = filteredEvents.map(evt => {
      const isPublished = evt.Estado === 'Activo';
      return `
        <tr>
          <td><strong>${Validation.escapeHTML(evt.Evento_ID)}</strong></td>
          <td>${Validation.escapeHTML(evt.Titulo_Evento)}</td>
          <td>${Validation.escapeHTML(evt.Fecha_Evento)}</td>
          <td>
            <span class="badge" style="background: ${isPublished ? '#D1FAE5' : '#F1F5F9'}; color: ${isPublished ? '#065F46' : '#475569'}; padding: 3px 8px; border-radius: 4px;">
              ${Validation.escapeHTML(evt.Estado)}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              <button class="btn btn-outline btn-sm" onclick="window.CognitioAdmin.editEvent('${evt.Evento_ID}')" title="Editar datos del evento">
                ✎ Editar
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.CognitioAdmin.togglePublish('${evt.Evento_ID}', '${evt.Estado}')">
                ${isPublished ? 'Desactivar' : 'Activar'}
              </button>
              <button class="btn btn-secondary btn-sm" style="color: var(--color-primary); border-color: var(--color-border);" onclick="window.CognitioAdmin.openCertConfigModal('${evt.Evento_ID}')">
                Diploma & Plantilla
              </button>
              <button class="btn btn-outline btn-sm" style="color: #DC2626; border-color: #FCA5A5;" onclick="window.CognitioAdmin.deleteEvent('${evt.Evento_ID}')" title="Eliminar evento si no tiene alumnos inscritos">
                🗑️ Eliminar
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    listContainer.innerHTML = `
      <div class="table-scroll-hint">
        <span>↔ Desliza horizontalmente para ver todas las columnas y acciones</span>
      </div>
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th style="min-width: 140px;">ID Evento</th>
              <th style="min-width: 220px;">Título</th>
              <th style="min-width: 110px;">Fecha</th>
              <th style="min-width: 100px;">Estado</th>
              <th style="min-width: 280px;">Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  async deleteEvent(eventId) {
    if (!eventId) return;

    const confirmMsg = `¿Confirma que desea ELIMINAR definitivamente el evento '${eventId}'?\n\n• Si el evento NO tiene alumnos inscritos, la fila se eliminará físicamente de Google Sheets sin dejar registros basura.\n• Si ya tiene alumnos inscritos, el sistema cancelará la operación para proteger sus datos.\n\n¿Desea continuar?`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await Api.post('adminDeleteEvent', { eventId }, this.currentAuthToken);

      if (res.success) {
        Api.clearCache('getPublicEvents');
        alert(res.message || `Evento ${eventId} eliminado correctamente.`);
        this.loadEvents();
      } else {
        alert(res.message || 'No fue posible eliminar el evento.');
      }
    } catch (err) {
      console.error('[Admin deleteEvent] Error:', err);
      alert('Error de conexión al procesar la eliminación.');
    }
  },

  openNewEventModal() {
    document.getElementById('modal-event-title').textContent = 'Crear Nuevo Evento';
    document.getElementById('event-form-id').value = '';
    document.getElementById('event-form-title').value = '';
    document.getElementById('event-form-date').value = '';
    document.getElementById('event-form-time').value = '19:00';
    document.getElementById('event-form-speaker').value = '';
    document.getElementById('event-form-modality').value = 'Virtual';
    document.getElementById('event-form-status').value = 'Activo';
    document.getElementById('event-form-formlink').value = '';
    document.getElementById('event-form-image').value = '';
    document.getElementById('event-form-desc').value = '';
    
    this.openModal('modal-event');
  },

  editEvent(eventId) {
    const evt = this.eventsCache.find(e => e.Evento_ID === eventId);
    if (!evt) return;

    document.getElementById('modal-event-title').textContent = `Editar Evento: ${evt.Evento_ID}`;
    document.getElementById('event-form-id').value = evt.Evento_ID;
    document.getElementById('event-form-title').value = evt.Titulo_Evento || '';
    document.getElementById('event-form-date').value = evt.Fecha_Evento || '';
    document.getElementById('event-form-time').value = evt.Hora_Evento || '19:00';
    document.getElementById('event-form-speaker').value = evt.Expositor || '';
    document.getElementById('event-form-modality').value = evt.Modalidad || 'Virtual';
    document.getElementById('event-form-status').value = evt.Estado || 'Activo';
    document.getElementById('event-form-formlink').value = evt.Link_Formulario || '';
    document.getElementById('event-form-image').value = evt.Imagen_URL || '';
    document.getElementById('event-form-desc').value = evt.Descripcion || '';

    this.openModal('modal-event');
  },

  async saveEvent() {
    const eventId = document.getElementById('event-form-id').value.trim();
    const title = document.getElementById('event-form-title').value.trim();
    const date = document.getElementById('event-form-date').value.trim();
    const time = document.getElementById('event-form-time').value.trim();
    const speaker = document.getElementById('event-form-speaker').value.trim();
    const modality = document.getElementById('event-form-modality').value;
    const status = document.getElementById('event-form-status').value;
    const formlink = document.getElementById('event-form-formlink').value.trim();
    const image = document.getElementById('event-form-image').value.trim();
    const desc = document.getElementById('event-form-desc').value.trim();

    if (!title || !date || !speaker || !desc) {
      alert('Por favor complete los campos obligatorios del evento.');
      return;
    }

    const formattedImage = image ? Validation.formatImageUrl(image) : '';

    const payload = {
      Evento_ID: eventId,
      Titulo_Evento: title,
      Fecha_Evento: date,
      Hora_Evento: time,
      Expositor: speaker,
      Modalidad: modality,
      Estado: status,
      Link_Formulario: formlink,
      Imagen_URL: formattedImage,
      Descripcion: desc
    };

    const saveBtn = document.getElementById('btn-save-event');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    try {
      const res = await Api.post('adminSaveEvent', payload, this.currentAuthToken);
      if (res.success) {
        Api.clearCache('getPublicEvents');
        alert(eventId ? 'Evento actualizado exitosamente.' : `¡Evento creado exitosamente con código ${res.data?.Evento_ID || ''}!`);
        this.closeModal('modal-event');
        this.loadEvents();
      } else {
        alert('Error al guardar evento: ' + res.message);
      }
    } catch (err) {
      console.error('[Admin saveEvent] Error:', err);
      alert('Error de conexión al guardar el evento.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar Evento';
    }
  },

  populateEventSelectors() {
    const selectors = ['import-event-select', 'config-event-select', 'batch-event-select', 'filter-event-select'];
    selectors.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const opts = this.eventsCache.map(e => `<option value="${e.Evento_ID}">${e.Evento_ID} — ${e.Titulo_Evento}</option>`).join('');
      el.innerHTML = opts;
    });
  },

  async togglePublish(eventId, currentStatus) {
    const nextStatus = currentStatus === 'Activo' ? 'Inactivo' : 'Activo';
    if (!confirm(`¿Desea cambiar el estado del evento ${eventId} a '${nextStatus}'?`)) return;

    const res = await Api.post('adminToggleEventStatus', { eventId, nextStatus }, this.currentAuthToken);
    if (res.success) {
      Api.clearCache('getPublicEvents');
      alert('Estado actualizado correctamente.');
      this.loadEvents();
    } else {
      alert('Error: ' + res.message);
    }
  },

  // --------------------------------------------------------------------------
  // GESTIÓN DE INSCRIPCIONES Y PAGOS
  // --------------------------------------------------------------------------
  async loadEnrollments() {
    const container = document.getElementById('admin-enrollments-list');
    container.innerHTML = `<div class="loading-container"><div class="spinner"></div><p>Cargando inscripciones...</p></div>`;

    const eventId = document.getElementById('filter-event-select')?.value;
    const res = await Api.post('adminGetEnrollments', { eventId }, this.currentAuthToken);

    if (!res.success) {
      container.innerHTML = `<div class="alert alert-danger">${Validation.escapeHTML(res.message)}</div>`;
      return;
    }

    this.enrollmentsCache = res.data || [];
    this.renderEnrollmentsTable();
  },

  renderEnrollmentsTable() {
    const container = document.getElementById('admin-enrollments-list');
    if (this.enrollmentsCache.length === 0) {
      container.innerHTML = `<p style="color: var(--color-text-muted);">No hay inscripciones registradas para este evento.</p>`;
      return;
    }

    const rows = this.enrollmentsCache.map(ins => {
      const isPaid = ins.Estado_Pago === 'Pagado';
      return `
        <tr>
          <td style="padding: 8px;"><code>${Validation.escapeHTML(ins.Inscripcion_ID)}</code></td>
          <td style="padding: 8px;">${Validation.escapeHTML(ins.DNI)}</td>
          <td style="padding: 8px;">${Validation.escapeHTML(ins.Nombre_Completo)}</td>
          <td style="padding: 8px;">${Validation.escapeHTML(ins.Tipo_Certificado)}</td>
          <td style="padding: 8px;">
            <span class="badge" style="background: ${isPaid ? '#D1FAE5' : '#FEF3C7'}; color: ${isPaid ? '#065F46' : '#92400E'}; padding: 2px 6px; border-radius: 4px;">
              ${Validation.escapeHTML(ins.Estado_Pago)}
            </span>
          </td>
          <td style="padding: 8px;"><code>${Validation.escapeHTML(ins.Codigo_Consulta)}</code></td>
          <td style="padding: 8px;">
            <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
              ${!isPaid ? `
                <button class="btn btn-success btn-sm" onclick="window.CognitioAdmin.confirmPayment('${ins.Inscripcion_ID}')">
                  ✓ Confirmar Pago
                </button>
              ` : `
                <span style="color: var(--color-success); font-weight: 600; font-size: 0.8rem;">✓ Pagado</span>
              `}
              <button class="btn btn-outline btn-sm" onclick="window.CognitioAdmin.openEditParticipantModal('${ins.Participante_ID}', '${ins.DNI}', '${Validation.escapeHTML(ins.Nombre_Completo)}')">
                ✎ Corregir
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="table-scroll-hint">
        <span>↔ Desliza horizontalmente para ver todos los participantes y acciones</span>
      </div>
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th style="min-width: 140px;">ID Inscripción</th>
              <th style="min-width: 90px;">DNI</th>
              <th style="min-width: 200px;">Nombre Completo</th>
              <th style="min-width: 100px;">Tipo</th>
              <th style="min-width: 100px;">Pago</th>
              <th style="min-width: 130px;">Cód. Consulta</th>
              <th style="min-width: 180px;">Acción</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  async confirmPayment(enrollmentId) {
    if (!confirm(`¿Confirma que el participante de la inscripción ${enrollmentId} ha completado el pago?`)) return;

    const res = await Api.post('adminUpdatePaymentStatus', { enrollmentId, status: 'Pagado' }, this.currentAuthToken);
    if (res.success) {
      alert('Pago confirmado y registrado en auditoría.');
      this.loadEnrollments();
    } else {
      alert('Error: ' + res.message);
    }
  },

  // --------------------------------------------------------------------------
  // IMPORTACIÓN DESDE EXCEL (SHEETJS)
  // --------------------------------------------------------------------------
  parsedExcelData: [],

  handleExcelFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
      alert('SheetJS (XLSX) no está cargado.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // raw: false para leer strings y preservar ceros del DNI
        const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false });
        this.processExcelRows(rows);
      } catch (err) {
        console.error('[Admin] Error leyendo Excel:', err);
        alert('No fue posible leer el archivo Excel.');
      }
    };
    reader.readAsArrayBuffer(file);
  },

  processExcelRows(rows) {
    const previewContainer = document.getElementById('excel-preview-container');
    const saveBtn = document.getElementById('btn-save-excel-import');
    
    this.parsedExcelData = [];
    const errors = [];

    rows.forEach((row, idx) => {
      // Buscar columnas tolerando mayúsculas/minúsculas y variaciones comunes
      const dniKey = Object.keys(row).find(k => {
        const up = k.trim().toUpperCase();
        return up === 'DNI' || up.includes('DNI') || up.includes('DOCUMENTO') || up.includes('CEDULA') || up.includes('IDENTIFICACION');
      });
      const nameKey = Object.keys(row).find(k => {
        const up = k.trim().toUpperCase();
        return up.includes('NOMBRE') || up.includes('APELLIDO') || up.includes('ALUMNO') || up.includes('ESTUDIANTE') || up.includes('PARTICIPANTE');
      });
      const certKey = Object.keys(row).find(k => {
        const up = k.trim().toUpperCase();
        return up.includes('TIPO') || up.includes('MODALIDAD') || up.includes('CERTIFICADO');
      });
      const voucherKey = Object.keys(row).find(k => {
        const up = k.trim().toUpperCase();
        return up.includes('VOUCHER') || up.includes('REFERENCIA') || up.includes('COMPROBANTE') || up.includes('OPERACION') || up.includes('RECIBO');
      });

      const rawDni = dniKey ? String(row[dniKey]).trim() : '';
      const rawName = nameKey ? String(row[nameKey]).trim() : '';
      const rawCert = certKey ? String(row[certKey]).trim() : 'Virtual';
      const rawVoucher = voucherKey ? String(row[voucherKey]).trim() : '';

      const dni = Validation.normalizeDNI(rawDni);
      const name = Validation.normalizeName(rawName);

      if (!Validation.isValidDNI(dni)) {
        errors.push(`Fila ${idx + 2}: DNI inválido '${rawDni}' (debe tener 8 dígitos).`);
      } else if (!Validation.isValidFullName(name)) {
        errors.push(`Fila ${idx + 2}: Nombre inválido '${rawName}'.`);
      } else {
        this.parsedExcelData.push({
          DNI: dni,
          Nombre_Completo: name,
          Tipo_Certificado: rawCert.toLowerCase().includes('fisic') ? 'Fisico' : 'Virtual',
          Referencia_Comprobante: rawVoucher
        });
      }
    });

    let html = `
      <div class="alert alert-info" style="margin-top: 1rem;">
        Se leyeron <strong>${rows.length}</strong> filas. Válidas para importar: <strong>${this.parsedExcelData.length}</strong>.
      </div>
    `;

    if (errors.length > 0) {
      html += `
        <div class="alert alert-warning">
          <strong>Advertencias detectadas:</strong>
          <ul style="padding-left: 1rem; margin-top: 0.25rem;">
            ${errors.slice(0, 5).map(e => `<li>${Validation.escapeHTML(e)}</li>`).join('')}
            ${errors.length > 5 ? `<li>... y ${errors.length - 5} observaciones más.</li>` : ''}
          </ul>
        </div>
      `;
    }

    previewContainer.innerHTML = html;
    saveBtn.disabled = this.parsedExcelData.length === 0;
  },

  async executeExcelImport() {
    const eventId = document.getElementById('import-event-select')?.value;
    if (!eventId) {
      alert('Seleccione un evento de destino.');
      return;
    }

    if (!confirm(`¿Confirma la importación de ${this.parsedExcelData.length} registros para el evento ${eventId}?`)) return;

    const saveBtn = document.getElementById('btn-save-excel-import');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Importando...';

    const res = await Api.post('adminBatchImport', { eventId, records: this.parsedExcelData }, this.currentAuthToken);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Confirmar e Importar Registros';

    if (res.success) {
      alert(`Importación completada: ${res.data?.imported || 0} registros nuevos añadidos.`);
      this.parsedExcelData = [];
      document.getElementById('excel-file-input').value = '';
      document.getElementById('excel-preview-container').innerHTML = '';
      saveBtn.disabled = true;
    } else {
      alert('Error en la importación: ' + res.message);
    }
  },

  // --------------------------------------------------------------------------
  // EMISIÓN MASIVA DE CERTIFICADOS FÍSICOS
  // --------------------------------------------------------------------------
  async executeBatchPhysicalEmission() {
    const eventId = document.getElementById('batch-event-select')?.value;
    const feedbackBox = document.getElementById('batch-emission-feedback');
    const startBtn = document.getElementById('btn-start-batch');

    if (!eventId) {
      alert('Seleccione un evento.');
      return;
    }

    startBtn.disabled = true;
    feedbackBox.style.display = 'block';
    feedbackBox.innerHTML = `<div class="loading-container"><div class="spinner"></div><p>Recuperando participantes elegibles y plantilla del evento...</p></div>`;

    try {
      const res = await Api.post('adminGetBatchCertificateData', { eventId }, this.currentAuthToken);

      if (!res.success) {
        feedbackBox.innerHTML = `<div class="alert alert-danger">${Validation.escapeHTML(res.message)}</div>`;
        return;
      }

      const { participants, templateBase64, config } = res.data;

      if (!participants || participants.length === 0) {
        feedbackBox.innerHTML = `
          <div class="alert alert-warning">
            No se encontraron participantes con certificado FÍSICO pagado y evento finalizado para emitir.
          </div>
        `;
        return;
      }

      // Convertir base64 plantilla
      const binaryString = atob(templateBase64);
      const len = binaryString.length;
      const templateBytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        templateBytes[i] = binaryString.charCodeAt(i);
      }

      feedbackBox.innerHTML = `
        <div class="alert alert-info">
          Generando lote consolidado de <strong>${participants.length}</strong> certificados físicos...
          <div style="margin-top: 0.5rem; font-weight: 600;" id="batch-progress-text">Iniciando motor PDF...</div>
        </div>
      `;

      const items = participants.map(p => ({
        templateBytes,
        participantName: p.Nombre_Completo,
        config
      }));

      // Renderizar en bloques con progreso
      const consolidatedPdfBytes = await PdfEngine.generateBatchPdf(items, (current, total) => {
        const pText = document.getElementById('batch-progress-text');
        if (pText) pText.textContent = `Procesando: ${current} de ${total} certificados...`;
      });

      // Descargar PDF consolidado
      PdfEngine.downloadPdf(consolidatedPdfBytes, `Lote_Fisicos_${eventId}_Total_${participants.length}.pdf`);

      feedbackBox.innerHTML = `
        <div class="alert alert-success">
          <strong>¡Lote generado exitosamente!</strong> Se consolidaron ${participants.length} certificados físicos en un solo archivo PDF listo para impresión.
        </div>
      `;
    } catch (err) {
      console.error('[Admin Batch] Error:', err);
      feedbackBox.innerHTML = `<div class="alert alert-danger">Error generando el lote: ${Validation.escapeHTML(err.message)}</div>`;
    } finally {
      startBtn.disabled = false;
    }
  },

  // --------------------------------------------------------------------------
  // EDICIÓN DE PARTICIPANTES (CORRECCIÓN DE DATOS)
  // --------------------------------------------------------------------------
  openEditParticipantModal(participanteId, dni, nombreCompleto) {
    document.getElementById('part-form-id').value = participanteId || '';
    document.getElementById('part-form-dni').value = dni || '';
    document.getElementById('part-form-name').value = nombreCompleto || '';
    this.openModal('modal-participant');
  },

  async saveParticipant() {
    const participanteId = document.getElementById('part-form-id').value.trim();
    const dni = document.getElementById('part-form-dni').value.trim();
    const nombreCompleto = document.getElementById('part-form-name').value.trim();

    if (!Validation.isValidDNI(dni)) {
      alert('El DNI debe tener exactamente 8 dígitos.');
      return;
    }
    if (!Validation.isValidFullName(nombreCompleto)) {
      alert('Ingrese un nombre y apellidos válidos.');
      return;
    }

    const saveBtn = document.getElementById('btn-save-part');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    try {
      const res = await Api.post('adminUpdateParticipant', {
        participanteId,
        dni,
        nombreCompleto: Validation.normalizeName(nombreCompleto)
      }, this.currentAuthToken);

      if (res.success) {
        alert('Datos del participante actualizados correctamente.');
        this.closeModal('modal-participant');
        this.loadEnrollments();
      } else {
        alert('Error: ' + res.message);
      }
    } catch (err) {
      console.error('[Admin saveParticipant] Error:', err);
      alert('Error de conexión al actualizar datos.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar Cambios';
    }
  },

  // --------------------------------------------------------------------------
  // CONFIGURACIÓN DE CERTIFICADO Y PLANTILLA PDF
  // --------------------------------------------------------------------------
  async openCertConfigModal(eventId) {
    if (!eventId) return;

    try {
      const res = await Api.post('adminGetCertConfig', { eventId }, this.currentAuthToken);
      const cfg = res.data || {};

      document.getElementById('cert-cfg-event-id').value = eventId;
      document.getElementById('cert-cfg-id').value = cfg.Configuracion_Certificado_ID || ('CFG-' + eventId);
      document.getElementById('cert-cfg-template-id').value = cfg.Link_Plantilla || '';
      document.getElementById('cert-cfg-pos-y').value = cfg.Posicion_Y !== undefined ? cfg.Posicion_Y : 260;
      document.getElementById('cert-cfg-font-size').value = cfg.Tamano_Fuente_Inicial || 32;
      document.getElementById('cert-cfg-color').value = cfg.Color_Texto || '#1B365D';
      document.getElementById('cert-cfg-alignment').value = cfg.Alineacion || 'Centrado';
      document.getElementById('cert-cfg-font').value = cfg.Fuente_URL || 'GreatVibes';
      document.getElementById('cert-cfg-status').value = cfg.Estado_Configuracion || 'Publicado';
      document.getElementById('cert-cfg-page').value = cfg.Pagina_Certificado || 1;

      this.openModal('modal-cert-config');
    } catch (err) {
      console.error('[Admin openCertConfig] Error:', err);
      alert('No fue posible cargar la configuración del certificado.');
    }
  },

  async saveCertConfig() {
    const eventId = document.getElementById('cert-cfg-event-id').value;
    const rawTemplate = document.getElementById('cert-cfg-template-id').value.trim();
    const driveMatch = rawTemplate.match(/\/d\/([a-zA-Z0-9_-]+)/) || rawTemplate.match(/id=([a-zA-Z0-9_-]+)/);
    const templateId = driveMatch ? driveMatch[1] : rawTemplate;
    document.getElementById('cert-cfg-template-id').value = templateId;

    const posY = Number(document.getElementById('cert-cfg-pos-y').value);
    const fontSize = Number(document.getElementById('cert-cfg-font-size').value);
    const color = document.getElementById('cert-cfg-color').value.trim();
    const alignment = document.getElementById('cert-cfg-alignment').value;
    const font = document.getElementById('cert-cfg-font').value;
    const status = document.getElementById('cert-cfg-status').value;
    const page = Number(document.getElementById('cert-cfg-page').value) || 1;

    if (!templateId) {
      alert('Ingrese el ID o enlace de la plantilla PDF en Google Drive.');
      return;
    }

    const payload = {
      eventId,
      config: {
        Configuracion_Certificado_ID: document.getElementById('cert-cfg-id').value || ('CFG-' + eventId),
        Link_Plantilla: templateId,
        Pagina_Certificado: page,
        Posicion_X: 0,
        Posicion_Y: posY,
        Ancho_Maximo_Nombre: 600,
        Tamano_Fuente_Inicial: fontSize,
        Tamano_Fuente_Minimo: 18,
        Fuente_URL: font,
        Alineacion: alignment,
        Color_Texto: color,
        Estado_Configuracion: status
      }
    };

    const saveBtn = document.getElementById('btn-save-cert-cfg');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    try {
      const res = await Api.post('adminSaveCertConfig', payload, this.currentAuthToken);
      if (res.success) {
        alert('Configuración de certificado guardada y vinculada al evento exitosamente.');
        this.closeModal('modal-cert-config');
        this.loadEvents();
      } else {
        alert('Error al guardar configuración: ' + res.message);
      }
    } catch (err) {
      console.error('[Admin saveCertConfig] Error:', err);
      alert('Error de conexión al guardar configuración.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar Configuración';
    }
  },

  // --------------------------------------------------------------------------
  // HISTORIAL DE AUDITORÍA
  // --------------------------------------------------------------------------
  async loadAuditLogs() {
    const container = document.getElementById('admin-audit-list');
    if (!container) return;

    container.innerHTML = `<div class="loading-container"><div class="spinner"></div><p>Cargando auditoría...</p></div>`;

    try {
      const res = await Api.post('adminGetAuditLogs', { limit: 50 }, this.currentAuthToken);
      if (!res.success) {
        container.innerHTML = `<div class="alert alert-danger">${Validation.escapeHTML(res.message)}</div>`;
        return;
      }

      const logs = res.data || [];
      if (logs.length === 0) {
        container.innerHTML = `<p style="color: var(--color-text-muted);">No hay acciones registradas en el libro de auditoría todavía.</p>`;
        return;
      }

      const rows = logs.map(log => `
        <tr>
          <td style="padding: 8px; white-space: nowrap;"><code>${Validation.escapeHTML(log.Timestamp || '')}</code></td>
          <td style="padding: 8px;">${Validation.escapeHTML(log.Usuario_Admin || '')}</td>
          <td style="padding: 8px;">
            <span class="badge" style="background: #E0E7FF; color: #3730A3; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">
              ${Validation.escapeHTML(log.Accion || '')}
            </span>
          </td>
          <td style="padding: 8px;"><code>${Validation.escapeHTML(log.Entidad_Afectada || '')}</code></td>
          <td style="padding: 8px;">${Validation.escapeHTML(log.Detalle || '')}</td>
        </tr>
      `).join('');

      container.innerHTML = `
        <div class="table-scroll-hint">
          <span>↔ Desliza horizontalmente para ver todos los detalles del registro de auditoría</span>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th style="min-width: 160px;">Fecha / Hora</th>
                <th style="min-width: 180px;">Directivo</th>
                <th style="min-width: 140px;">Acción</th>
                <th style="min-width: 140px;">Entidad</th>
                <th style="min-width: 250px;">Detalle</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    } catch (err) {
      console.error('[Admin Audit] Error:', err);
      container.innerHTML = `<div class="alert alert-danger">Error cargando auditoría: ${Validation.escapeHTML(err.message)}</div>`;
    }
  }
};
