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
      });
    });
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

  renderEventsTable() {
    const listContainer = document.getElementById('admin-events-list');
    if (this.eventsCache.length === 0) {
      listContainer.innerHTML = `<p style="color: var(--color-text-muted);">No hay eventos creados todavía.</p>`;
      return;
    }

    const rows = this.eventsCache.map(evt => {
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
            <button class="btn btn-outline btn-sm" onclick="window.CognitioAdmin.togglePublish('${evt.Evento_ID}', '${evt.Estado}')">
              ${isPublished ? 'Desactivar' : 'Activar'}
            </button>
            <button class="btn btn-secondary btn-sm" style="color: var(--color-primary); border-color: var(--color-border);" onclick="window.CognitioAdmin.selectEventForConfig('${evt.Evento_ID}')">
              Configurar Plantilla
            </button>
          </td>
        </tr>
      `;
    }).join('');

    listContainer.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;" class="admin-table">
        <thead>
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left;">
            <th style="padding: 8px;">ID</th>
            <th style="padding: 8px;">Título</th>
            <th style="padding: 8px;">Fecha</th>
            <th style="padding: 8px;">Estado</th>
            <th style="padding: 8px;">Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
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
            ${!isPaid ? `
              <button class="btn btn-success btn-sm" onclick="window.CognitioAdmin.confirmPayment('${ins.Inscripcion_ID}')">
                ✓ Confirmar Pago
              </button>
            ` : `
              <span style="color: var(--color-success); font-weight: 600;">✓ Conciliado</span>
            `}
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;" class="admin-table">
        <thead>
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left;">
            <th style="padding: 8px;">ID</th>
            <th style="padding: 8px;">DNI</th>
            <th style="padding: 8px;">Nombre</th>
            <th style="padding: 8px;">Tipo</th>
            <th style="padding: 8px;">Pago</th>
            <th style="padding: 8px;">Cód. Consulta</th>
            <th style="padding: 8px;">Acción</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
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
      // Buscar columnas tolerando mayúsculas/minúsculas
      const dniKey = Object.keys(row).find(k => k.trim().toUpperCase() === 'DNI');
      const nameKey = Object.keys(row).find(k => k.trim().toUpperCase().includes('NOMBRE'));
      const certKey = Object.keys(row).find(k => k.trim().toUpperCase().includes('TIPO'));
      const voucherKey = Object.keys(row).find(k => k.trim().toUpperCase().includes('VOUCHER') || k.trim().toUpperCase().includes('REFERENCIA'));

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
  }
};
