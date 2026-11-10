/**
 * MÓDULO DE PANEL ADMINISTRATIVO: COGNITIO CREDITOR (`emisor.html`)
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
  currentAdminRole: null,
  eventsCache: [],
  enrollmentsCache: [],
  usersCache: [],
  eventFilter: 'active',

  /**
   * Inicializa el entorno administrativo.
   */
  async init() {
    this.setupAuth();
    this.setupTabs();
    this.setupDNIIndicators();
    await this.restoreSession();
  },

  /**
   * Intenta restaurar silenciosamente la sesión guardada en sessionStorage tras una recarga (F5).
   */
  async restoreSession() {
    const savedToken = sessionStorage.getItem('cognitio_admin_token');
    if (!savedToken) return;

    try {
      const res = await Api.post('adminAuthenticate', {}, savedToken);
      if (res && res.success && res.data) {
        this.currentAuthToken = savedToken;
        this.currentAdminRole = res.data.role || sessionStorage.getItem('cognitio_admin_role') || 'Operador';
        this.currentAdminEmail = res.data.email;
        this.onLoginSuccess(res.data);
      } else {
        console.warn('[Admin] Sesión expirada o no autorizada por backend.');
        sessionStorage.removeItem('cognitio_admin_token');
        sessionStorage.removeItem('cognitio_admin_role');
      }
    } catch (err) {
      console.warn('[Admin] Error restaurando sesión almacenada:', err);
      sessionStorage.removeItem('cognitio_admin_token');
      sessionStorage.removeItem('cognitio_admin_role');
    }
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

    const googleBtnContainer = document.getElementById('google-signin-btn-container');
    if (googleBtnContainer) {
      google.accounts.id.renderButton(
        googleBtnContainer,
        { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular' }
      );
    }
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

      this.currentAdminRole = authCheck.data.role || 'Operador';
      this.currentAdminEmail = authCheck.data.email || decodedJson.email;

      this.onLoginSuccess(authCheck.data);
    } catch (err) {
      console.error('[Admin] Error decodificando token:', err);
      alert('Error al validar la sesión con Google.');
    }
  },

  async onLoginSuccess(userData) {
    this.currentAdminRole = userData.role || this.currentAdminRole || 'Operador';
    this.currentAdminEmail = userData.email || this.currentAdminEmail;

    if (this.currentAuthToken) {
      sessionStorage.setItem('cognitio_admin_token', this.currentAuthToken);
      sessionStorage.setItem('cognitio_admin_role', this.currentAdminRole);
    }

    document.getElementById('auth-gate-section').style.display = 'none';
    document.getElementById('admin-workspace-section').style.display = 'block';

    // Barra superior del directivo con email y badge de rol
    this.renderUserBar(this.currentAdminEmail, this.currentAdminRole);

    // Adaptación visual por roles (RBAC)
    this.applyRoleRestrictions();

    // Cargar datos iniciales (Eventos y Dashboard administrativo activo)
    await this.loadEvents();
    this.loadDashboard('all');
  },

  logout() {
    this.currentAuthToken = null;
    this.currentAdminEmail = null;
    this.currentAdminRole = null;
    sessionStorage.removeItem('cognitio_admin_token');
    sessionStorage.removeItem('cognitio_admin_role');

    document.getElementById('auth-gate-section').style.display = 'block';
    document.getElementById('admin-workspace-section').style.display = 'none';

    const tabBtnUsers = document.getElementById('tab-btn-users');
    if (tabBtnUsers) {
      tabBtnUsers.style.display = 'none';
    }
  },

  /**
   * Renderiza la información del directivo autenticado en la barra superior con badge accesible.
   */
  renderUserBar(email, role) {
    const displayEl = document.getElementById('admin-user-display');
    if (!displayEl) return;
    const badgeClass = this.getRoleBadgeClass(role);
    displayEl.innerHTML = `${Validation.escapeHTML(email || 'Directiva')} <span class="badge ${badgeClass}">(${Validation.escapeHTML(role || 'Operador')})</span>`;
  },

  /**
   * Retorna la clase CSS de badge asociada a cada rol institucional.
   */
  getRoleBadgeClass(role) {
    switch (String(role).toLowerCase()) {
      case 'superadmin':
        return 'badge-superadmin';
      case 'admin':
        return 'badge-admin';
      case 'operador':
        return 'badge-operador';
      default:
        return 'badge-operador';
    }
  },

  /**
   * Aplica reglas de visibilidad y acceso según el rol activo (SuperAdmin vs Admin vs Operador).
   */
  applyRoleRestrictions() {
    const isSuperAdmin = this.currentAdminRole === 'SuperAdmin';
    const isOperador = this.currentAdminRole === 'Operador';

    // Pestaña 6 (Directiva y Permisos): visible exclusivamente para SuperAdmin
    const tabBtnUsers = document.getElementById('tab-btn-users');
    if (tabBtnUsers) {
      tabBtnUsers.style.display = isSuperAdmin ? 'inline-flex' : 'none';

      // Si no es SuperAdmin y estuviese activa la pestaña de usuarios, redirigir a tab-dashboard
      if (!isSuperAdmin) {
        const tabUsersContent = document.getElementById('tab-users');
        if (tabUsersContent && tabUsersContent.style.display !== 'none') {
          tabUsersContent.style.display = 'none';
          const tabDashboard = document.getElementById('tab-dashboard');
          if (tabDashboard) tabDashboard.style.display = 'block';
          document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
          const firstTabBtn = document.querySelector('.admin-tab-btn[data-target="tab-dashboard"]');
          if (firstTabBtn) firstTabBtn.classList.add('active');
        }
      }
    }

    // Botón de creación de evento en pestaña 1: deshabilitar o no mostrar para Operador
    const btnNewEvent = document.querySelector('button[onclick*="openNewEventModal"]');
    if (btnNewEvent) {
      btnNewEvent.style.display = isOperador ? 'none' : 'inline-block';
    }
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

        if (targetId === 'tab-dashboard') {
          this.loadDashboard();
        }
        if (targetId === 'tab-events') {
          this.loadEvents();
        }
        if (targetId === 'tab-audit') {
          this.loadAuditLogs();
        }
        if (targetId === 'tab-users') {
          this.loadAdminUsers();
        }
      });
    });
  },

  /**
   * Configura el formateo y contador reactivo en tiempo real para inputs de DNI (8 dígitos).
   */
  setupDNIIndicators() {
    const dniInput = document.getElementById('admin-reg-dni');
    const dniIndicator = document.getElementById('admin-reg-dni-indicator');
    if (dniInput && dniIndicator) {
      dniInput.addEventListener('input', () => {
        const val = dniInput.value.replace(/\D/g, '').slice(0, 8);
        dniInput.value = val;
        const len = val.length;
        if (len === 8) {
          dniIndicator.textContent = '8/8 ✓';
          dniIndicator.classList.add('ready');
        } else {
          dniIndicator.textContent = `${len}/8`;
          dniIndicator.classList.remove('ready');
        }
      });
    }
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
  // GESTIÓN DEL DASHBOARD ADMINISTRATIVO (FASE E)
  // --------------------------------------------------------------------------

  /**
   * Carga y renderiza el Dashboard Administrativo con KPIs, barras semánticas,
   * tabla resumen por evento y auditoría en vivo.
   * Consume la acción 'adminGetDashboardStats' del backend.
   * @param {string|null} [eventId=null] - ID del evento a filtrar o 'all' para consolidado
   */
  async loadDashboard(eventId = null) {
    const contentArea = document.getElementById('dashboard-content-area');
    if (!contentArea) return;

    const filterSelect = document.getElementById('dashboard-event-filter');
    const selectedEventId = eventId !== null ? eventId : (filterSelect?.value || 'all');
    if (filterSelect && filterSelect.value !== selectedEventId) {
      filterSelect.value = selectedEventId;
    }

    // 1. Estado de Carga Visual (Skeleton Shimmer de Alta Precisión)
    contentArea.innerHTML = `
      <div class="dashboard-skeleton-grid" aria-busy="true" aria-label="Cargando métricas analíticas...">
        <div class="dashboard-skeleton-kpi"></div>
        <div class="dashboard-skeleton-kpi"></div>
        <div class="dashboard-skeleton-kpi"></div>
        <div class="dashboard-skeleton-kpi"></div>
      </div>
      <div class="dashboard-sections-flow">
        <div class="dashboard-skeleton-block"></div>
        <div class="dashboard-skeleton-block"></div>
      </div>
    `;

    try {
      // Asegurar que eventsCache esté disponible para nombres de eventos y filtros
      if (!this.eventsCache || this.eventsCache.length === 0) {
        const eventsRes = await Api.post('adminGetEvents', {}, this.currentAuthToken);
        if (eventsRes && eventsRes.success && Array.isArray(eventsRes.data)) {
          this.eventsCache = eventsRes.data;
          this.populateEventSelectors();
        }
      }

      // 2. Consumir la acción adminGetDashboardStats de Google Apps Script
      let stats = null;
      const res = await Api.post('adminGetDashboardStats', { eventId: selectedEventId }, this.currentAuthToken);

      if (res && res.success && res.data) {
        stats = res.data;
      } else {
        // Fallback de resiliencia: si el endpoint remoto devuelve error o está en despliegue
        console.warn('[Admin Dashboard] adminGetDashboardStats sin datos remotos; calculando métricas locales de respaldo...');
        stats = await this._buildFallbackDashboardStats(selectedEventId);
      }

      // 3. Renderizar componentes analíticos
      this.renderDashboardView(stats, selectedEventId);

      // 4. Actualizar timestamp accesible de sincronización
      const lastUpdatedEl = document.getElementById('dashboard-last-updated');
      if (lastUpdatedEl) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        lastUpdatedEl.textContent = `${timeStr} (${dateStr})`;
      }
    } catch (err) {
      console.error('[Admin Dashboard] Error en loadDashboard:', err);
      contentArea.innerHTML = `
        <div class="alert alert-danger" style="margin-top: 1rem;">
          <strong>No fue posible sincronizar el Dashboard:</strong> ${Validation.escapeHTML(err.message || 'Error de red o comunicación con Google Apps Script.')}
          <div style="margin-top: 0.75rem;">
            <button type="button" class="btn btn-outline btn-sm" onclick="window.CognitioAdmin.loadDashboard('${selectedEventId}')">↻ Reintentar</button>
          </div>
        </div>
      `;
    }
  },

  /**
   * Genera estadísticas analíticas de respaldo calculadas a partir de eventos y auditoría en caché.
   * Evita bloqueos operativos si el backend remoto experimenta latencia o falta de acción.
   */
  async _buildFallbackDashboardStats(selectedEventId) {
    const activeEvents = this.eventsCache.filter(e => e.Estado === 'Activo');
    const totalEventsCount = this.eventsCache.length;

    // Obtener los últimos registros de auditoría si es posible
    let recentLogs = [];
    try {
      const auditRes = await Api.post('adminGetAuditLogs', { limit: 8 }, this.currentAuthToken);
      if (auditRes && auditRes.success && Array.isArray(auditRes.data)) {
        recentLogs = auditRes.data;
      }
    } catch (e) {
      console.warn('[Admin Dashboard Fallback] No se pudo obtener auditoría:', e);
    }

    let eventsList = this.eventsCache.map(e => ({
      eventoId: e.Evento_ID,
      titulo: e.Titulo_Evento,
      fecha: e.Fecha_Evento,
      modalidad: e.Modalidad || 'Virtual',
      totalInscritos: 0,
      pagados: 0,
      pendientes: 0,
      fisicos: 0,
      tasaConciliacion: 0
    }));

    if (selectedEventId !== 'all') {
      eventsList = eventsList.filter(e => e.eventoId === selectedEventId);
    }

    return {
      totalInscritos: 0,
      pagados: 0,
      pendientes: 0,
      anulados: 0,
      virtuales: 0,
      fisicos: 0,
      participantesUnicos: 0,
      eventosActivos: activeEvents.length,
      totalEventos: totalEventsCount,
      tasaConciliacion: 0,
      eventos: eventsList,
      actividadReciente: recentLogs
    };
  },

  /**
   * Renderiza el contenido visual completo del Dashboard Administrativo.
   */
  renderDashboardView(stats, selectedEventId) {
    const contentArea = document.getElementById('dashboard-content-area');
    if (!contentArea) return;

    // Normalización de métricas cuantitativas
    const totalInscritos = Number(stats.totalInscritos ?? stats.totalInscripciones ?? stats.totalEnrollments ?? 0) || 0;
    const pagados = Number(stats.pagados ?? stats.totalPagados ?? stats.paidCount ?? 0) || 0;
    const pendientes = Number(stats.pendientes ?? stats.totalPendientes ?? stats.pendingCount ?? 0) || 0;
    const anulados = Number(stats.anulados ?? stats.reembolsados ?? stats.totalAnulados ?? 0) || 0;

    const virtuales = Number(stats.virtuales ?? stats.certificadosVirtuales ?? stats.virtualCount ?? 0) || 0;
    const fisicos = Number(stats.fisicos ?? stats.certificadosFisicos ?? stats.fisicoCount ?? 0) || 0;

    const participantesUnicos = Number(stats.participantesUnicos ?? stats.totalParticipantes ?? stats.uniqueParticipants ?? (totalInscritos > 0 ? totalInscritos : 0)) || 0;
    const eventosActivos = Number(stats.eventosActivos ?? this.eventsCache.filter(e => e.Estado === 'Activo').length) || 0;
    const totalEventos = Number(stats.totalEventos ?? this.eventsCache.length) || 0;

    // Tasas porcentuales calculadas
    const tasaConciliacion = stats.tasaConciliacion !== undefined 
      ? Number(stats.tasaConciliacion)
      : (totalInscritos > 0 ? Math.round((pagados / totalInscritos) * 100) : 0);

    const pctPagado = totalInscritos > 0 ? ((pagados / totalInscritos) * 100).toFixed(1) : '0.0';
    const pctPendiente = totalInscritos > 0 ? ((pendientes / totalInscritos) * 100).toFixed(1) : '0.0';
    const pctAnulado = totalInscritos > 0 ? Math.max(0, 100 - parseFloat(pctPagado) - parseFloat(pctPendiente)).toFixed(1) : '0.0';

    const sumModalidad = (virtuales + fisicos);
    const pctVirtual = sumModalidad > 0 ? ((virtuales / sumModalidad) * 100).toFixed(1) : (totalInscritos > 0 ? '100.0' : '0.0');
    const pctFisico = sumModalidad > 0 ? ((fisicos / sumModalidad) * 100).toFixed(1) : '0.0';

    // Lista de eventos para tabla de rendimiento
    const rawEvents = stats.eventos || stats.eventosResumen || stats.eventsSummary || [];
    let eventsList = rawEvents.map(e => {
      const id = e.Evento_ID || e.eventoId || e.id || '';
      const titulo = e.Titulo_Evento || e.titulo || e.nombre || 'Evento';
      const fecha = e.Fecha_Evento || e.fecha || '-';
      const modalidad = e.Modalidad || e.modalidad || 'Virtual';
      const totalInc = Number(e.Total_Inscritos ?? e.totalInscritos ?? e.inscritos ?? 0) || 0;
      const pag = Number(e.Pagados ?? e.pagados ?? 0) || 0;
      const pend = Number(e.Pendientes ?? e.pendientes ?? 0) || 0;
      const fis = Number(e.Fisicos ?? e.fisicos ?? e.certificadosFisicos ?? 0) || 0;
      const tc = e.Tasa_Conciliacion !== undefined 
        ? Number(e.Tasa_Conciliacion) 
        : (totalInc > 0 ? Math.round((pag / totalInc) * 100) : 0);
      return { id, titulo, fecha, modalidad, totalInscritos: totalInc, pagados: pag, pendientes: pend, fisicos: fis, tasaConciliacion: tc };
    });

    if (eventsList.length === 0 && this.eventsCache.length > 0) {
      eventsList = this.eventsCache.map(e => ({
        id: e.Evento_ID,
        titulo: e.Titulo_Evento,
        fecha: e.Fecha_Evento,
        modalidad: e.Modalidad || 'Virtual',
        totalInscritos: 0,
        pagados: 0,
        pendientes: 0,
        fisicos: 0,
        tasaConciliacion: 0
      }));
    }

    if (selectedEventId !== 'all') {
      eventsList = eventsList.filter(e => e.id === selectedEventId);
    }

    // Actividad reciente (Auditoría en vivo)
    const rawActivity = stats.actividadReciente || stats.actividad || stats.logs || stats.recentActivity || [];
    const recentActivity = Array.isArray(rawActivity) ? rawActivity.slice(0, 8) : [];

    // Filas de la tabla de rendimiento
    const eventRows = eventsList.length > 0 ? eventsList.map(e => {
      const isConciliado = e.tasaConciliacion >= 75;
      const miniFillWidth = Math.min(100, Math.max(0, e.tasaConciliacion));
      return `
        <tr>
          <td>
            <strong style="color: var(--color-primary); display: block; line-height: 1.3;">${Validation.escapeHTML(e.titulo)}</strong>
            <span style="font-size: 0.74rem; color: var(--color-text-muted); font-family: monospace;">${Validation.escapeHTML(e.id)}</span>
          </td>
          <td style="white-space: nowrap;">${Validation.escapeHTML(e.fecha)}</td>
          <td>
            <span class="badge ${e.modalidad === 'Virtual' ? 'badge-info' : 'badge-purple'}">
              ${Validation.escapeHTML(e.modalidad)}
            </span>
          </td>
          <td style="text-align: center;"><strong>${e.totalInscritos}</strong></td>
          <td>
            <div style="font-size: 0.8rem; line-height: 1.2;">
              <span style="color: #059669; font-weight: 600;">${e.pagados} pag</span> &bull; 
              <span style="color: #D97706; font-weight: 600;">${e.pendientes} pend</span>
            </div>
          </td>
          <td style="text-align: center;">
            <span class="badge ${e.fisicos > 0 ? 'badge-purple' : 'badge-secondary'}">${e.fisicos}</span>
          </td>
          <td>
            <div class="table-mini-progress" title="${e.tasaConciliacion}% conciliado">
              <div class="table-mini-bar">
                <div class="table-mini-fill" style="width: ${miniFillWidth}%; background-color: ${isConciliado ? '#059669' : '#D97706'};"></div>
              </div>
              <span class="table-mini-percent">${e.tasaConciliacion}%</span>
            </div>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button type="button" class="btn btn-outline btn-sm" onclick="window.CognitioAdmin.viewEventEnrollments('${Validation.escapeHTML(e.id)}')" title="Gestionar inscripciones y pagos de este evento">
              Ver inscripciones
            </button>
          </td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">
          No hay eventos coincidentes con el filtro seleccionado.
        </td>
      </tr>
    `;

    // Ítems del feed de actividad reciente
    const activityItems = recentActivity.length > 0 ? recentActivity.map(log => {
      const action = String(log.Accion || log.accion || 'ACCION').toUpperCase();
      let badgeClass = 'badge-primary';
      let actionLabel = action;

      if (action.includes('PAGO') || action.includes('CONFIRMAR')) {
        badgeClass = 'badge-success';
      } else if (action.includes('EVENTO')) {
        badgeClass = 'badge-info';
      } else if (action.includes('CERTIFICADO') || action.includes('EMISION')) {
        badgeClass = 'badge-purple';
      } else if (action.includes('EXCEL') || action.includes('IMPORT')) {
        badgeClass = 'badge-warning';
      } else if (action.includes('USUARIO') || action.includes('ROL') || action.includes('REVOCAR')) {
        badgeClass = 'badge-danger';
      }

      const userDisplay = log.Usuario_Admin || log.usuarioAdmin || log.admin || 'Directiva';
      const timestampRaw = log.Timestamp || log.timestamp || log.fecha || '';
      let formattedTime = timestampRaw;
      if (timestampRaw) {
        try {
          const d = new Date(timestampRaw);
          if (!isNaN(d.getTime())) {
            formattedTime = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
          }
        } catch (e) {}
      }

      const detail = log.Detalle || log.detalle || log.actionDetails || '';

      return `
        <article class="activity-feed-card">
          <div class="activity-feed-card-header">
            <span class="badge ${badgeClass}">${Validation.escapeHTML(actionLabel)}</span>
            <span class="activity-feed-time">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              ${Validation.escapeHTML(formattedTime)}
            </span>
          </div>
          <div class="activity-feed-user-row">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span class="activity-feed-user" title="${Validation.escapeHTML(userDisplay)}">${Validation.escapeHTML(userDisplay)}</span>
          </div>
          <div class="activity-feed-desc">${Validation.escapeHTML(detail)}</div>
        </article>
      `;
    }).join('') : `
      <div class="activity-feed-empty">
        <p class="empty-title">Sin registros recientes de auditoría</p>
        <p class="empty-desc">Las operaciones de la directiva y cambios de pago se mostrarán aquí en tiempo real.</p>
      </div>
    `;

    // Ensamblar la vista completa
    contentArea.innerHTML = `
      <!-- CUADRÍCULA DE MÉTRICAS KPI -->
      <section class="dashboard-grid" aria-label="Métricas Principales">
        
        <!-- KPI 1: Inscripciones Totales -->
        <article class="dashboard-kpi-card kpi-accent">
          <div class="kpi-top">
            <span class="kpi-label">Inscripciones Totales</span>
            <div class="kpi-icon-wrap bg-accent-soft" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
            </div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${totalInscritos}</span>
            <span class="kpi-badge ${tasaConciliacion >= 75 ? 'badge-success' : 'badge-warning'}">
              ${tasaConciliacion}% Conciliado
            </span>
          </div>
          <p class="kpi-footer-text">
            ${selectedEventId === 'all' ? 'Alumnos inscritos en el catálogo general.' : `Filtrado por evento: ${Validation.escapeHTML(selectedEventId)}`}
          </p>
        </article>

        <!-- KPI 2: Pagos Conciliados y Distribución Semántica -->
        <article class="dashboard-kpi-card kpi-success">
          <div class="kpi-top">
            <span class="kpi-label">Conciliación de Pagos</span>
            <div class="kpi-icon-wrap bg-success-soft" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
            </div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${pagados}</span>
            <span class="kpi-badge badge-success">${pctPagado}% Pagado</span>
          </div>
          <div class="distribution-bar-container" aria-label="Distribución porcentual de pagos">
            <div class="distribution-bar" role="progressbar" aria-valuenow="${tasaConciliacion}" aria-valuemin="0" aria-valuemax="100">
              <div class="distribution-segment segment-paid" style="width: ${pctPagado}%;" title="Pagados: ${pagados} (${pctPagado}%)"></div>
              <div class="distribution-segment segment-pending" style="width: ${pctPendiente}%;" title="Pendientes: ${pendientes} (${pctPendiente}%)"></div>
              <div class="distribution-segment segment-canceled" style="width: ${pctAnulado}%;" title="Anulados/Reembolsados: ${anulados} (${pctAnulado}%)"></div>
            </div>
            <div class="distribution-legend">
              <span class="legend-item"><span class="legend-dot dot-paid"></span> <strong class="legend-value">${pagados}</strong> Pagados</span>
              <span class="legend-item"><span class="legend-dot dot-pending"></span> <strong class="legend-value">${pendientes}</strong> Pend.</span>
              <span class="legend-item"><span class="legend-dot dot-canceled"></span> <strong class="legend-value">${anulados}</strong> Anul.</span>
            </div>
          </div>
        </article>

        <!-- KPI 3: Modalidad de Certificados -->
        <article class="dashboard-kpi-card kpi-purple">
          <div class="kpi-top">
            <span class="kpi-label">Modalidad Certificados</span>
            <div class="kpi-icon-wrap bg-purple-soft" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
            </div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${virtuales} <span style="font-size: 1.1rem; font-weight: 500; color: var(--color-text-muted);">/ ${fisicos}</span></span>
            <span class="kpi-badge badge-purple">${pctFisico}% Físicos</span>
          </div>
          <div class="distribution-bar-container" aria-label="Distribución de certificados digitales y físicos">
            <div class="distribution-bar">
              <div class="distribution-segment segment-virtual" style="width: ${pctVirtual}%;" title="Virtuales: ${virtuales} (${pctVirtual}%)"></div>
              <div class="distribution-segment segment-physical" style="width: ${pctFisico}%;" title="Físicos: ${fisicos} (${pctFisico}%)"></div>
            </div>
            <div class="distribution-legend">
              <span class="legend-item"><span class="legend-dot dot-virtual"></span> <strong class="legend-value">${virtuales}</strong> Virtuales (${pctVirtual}%)</span>
              <span class="legend-item"><span class="legend-dot dot-physical"></span> <strong class="legend-value">${fisicos}</strong> Físicos (${pctFisico}%)</span>
            </div>
          </div>
        </article>

        <!-- KPI 4: Participantes Únicos y Cobertura -->
        <article class="dashboard-kpi-card kpi-info">
          <div class="kpi-top">
            <span class="kpi-label">Participantes y Cobertura</span>
            <div class="kpi-icon-wrap bg-info-soft" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${participantesUnicos}</span>
            <span class="kpi-badge badge-info">${eventosActivos} Activos</span>
          </div>
          <p class="kpi-footer-text">
            ${eventosActivos} eventos en curso de un total de ${totalEventos} gestionados.
          </p>
        </article>

      </section>

      <!-- SECCIÓN INFERIOR: RENDIMIENTO POR EVENTO Y AUDITORÍA (FLUJO VERTICAL INTEGRADO) -->
      <div class="dashboard-sections-flow">
        
        <!-- PANEL 1: Rendimiento por Evento (Ancho Completo) -->
        <section class="dashboard-panel-card" aria-label="Rendimiento Operativo por Evento">
          <div class="dashboard-panel-header">
            <div>
              <h3 class="dashboard-panel-title">
                Rendimiento Operativo por Evento
              </h3>
              <p class="dashboard-panel-subtitle">
                Balance de inscripciones, conciliación de pagos y modalidades registradas.
              </p>
            </div>
            <div class="dashboard-panel-actions">
              <span class="badge badge-secondary">${eventsList.length} evento${eventsList.length === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div class="table-scroll-hint">
            <span>Desliza horizontalmente para ver todas las métricas</span>
          </div>
          <div class="table-responsive">
            <table class="admin-table">
              <thead>
                <tr>
                  <th style="min-width: 180px;">Evento</th>
                  <th style="min-width: 95px;">Fecha</th>
                  <th style="min-width: 90px;">Modalidad</th>
                  <th style="min-width: 75px; text-align: center;">Inscritos</th>
                  <th style="min-width: 120px;">Conciliación</th>
                  <th style="min-width: 70px; text-align: center;">Físicos</th>
                  <th style="min-width: 110px;">% Conciliado</th>
                  <th style="min-width: 115px; text-align: right;">Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${eventRows}
              </tbody>
            </table>
          </div>
        </section>

        <!-- PANEL 2: Actividad Reciente de la Directiva (Ancho Completo con Cuadrícula) -->
        <section class="dashboard-panel-card" aria-label="Actividad Reciente y Trazabilidad">
          <div class="dashboard-panel-header">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <h3 class="dashboard-panel-title">Actividad Reciente de la Directiva</h3>
                <span class="badge badge-success" style="font-size: 0.7rem;">En vivo</span>
              </div>
              <p class="dashboard-panel-subtitle">
                Últimas operaciones administrativas registradas en la auditoría inmutable.
              </p>
            </div>
            <div class="dashboard-panel-actions">
              <button type="button" class="btn btn-outline btn-sm" onclick="document.querySelector('.admin-tab-btn[data-target=\\'tab-audit\\']').click()">
                Ver Historial Completo en Auditoría &rarr;
              </button>
            </div>
          </div>

          <div class="activity-feed-grid" role="feed" aria-label="Historial reciente de operaciones directivas">
            ${activityItems}
          </div>
        </section>

      </div>
    `;
  },

  /**
   * Navega ergonómicamente a la pestaña de inscripciones prefiltrando el evento seleccionado.
   * @param {string} eventId - Identificador del evento
   */
  viewEventEnrollments(eventId) {
    if (!eventId) return;

    const tabButtons = document.querySelectorAll('.admin-tab-btn');
    const enrollmentsTabBtn = document.querySelector('.admin-tab-btn[data-target="tab-enrollments"]');
    
    if (enrollmentsTabBtn) {
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');
      
      enrollmentsTabBtn.classList.add('active');
      const targetContent = document.getElementById('tab-enrollments');
      if (targetContent) targetContent.style.display = 'block';

      const selectEl = document.getElementById('filter-event-select');
      if (selectEl) {
        selectEl.value = eventId;
      }

      this.loadEnrollments();
      targetContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    const isOperador = this.currentAdminRole === 'Operador';

    const rows = filteredEvents.map(evt => {
      const isPublished = evt.Estado === 'Activo';
      return `
        <tr>
          <td><strong>${Validation.escapeHTML(evt.Evento_ID)}</strong></td>
          <td>${Validation.escapeHTML(evt.Titulo_Evento)}</td>
          <td>${Validation.escapeHTML(evt.Fecha_Evento)}</td>
          <td>
            <span class="badge ${isPublished ? 'badge-active' : 'badge-inactive'}">
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
              ${!isOperador ? `
                <button class="btn btn-secondary btn-sm" style="color: var(--color-primary); border-color: var(--color-border);" onclick="window.CognitioAdmin.openCertConfigModal('${evt.Evento_ID}')">
                  Diploma & Plantilla
                </button>
                <button class="btn btn-outline btn-sm" style="color: #DC2626; border-color: #FCA5A5;" onclick="window.CognitioAdmin.deleteEvent('${evt.Evento_ID}')" title="Eliminar evento si no tiene alumnos inscritos">
                  🗑️ Eliminar
                </button>
              ` : ''}
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
    
    // Limpiar campos de cronograma de entrega física
    const physDates = document.getElementById('event-form-physical-dates');
    if (physDates) physDates.value = '';
    const physPlace = document.getElementById('event-form-physical-place');
    if (physPlace) physPlace.value = '';
    const physTime = document.getElementById('event-form-physical-time');
    if (physTime) physTime.value = '';
    
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

    // Cargar campos de cronograma de entrega física
    const physDates = document.getElementById('event-form-physical-dates');
    if (physDates) physDates.value = evt.Fecha_Entrega_Fisica || '';
    const physPlace = document.getElementById('event-form-physical-place');
    if (physPlace) physPlace.value = evt.Lugar_Entrega_Fisica || '';
    const physTime = document.getElementById('event-form-physical-time');
    if (physTime) physTime.value = evt.Horario_Entrega_Fisica || '';

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
    const physicalDates = document.getElementById('event-form-physical-dates') ? document.getElementById('event-form-physical-dates').value.trim() : '';
    const physicalPlace = document.getElementById('event-form-physical-place') ? document.getElementById('event-form-physical-place').value.trim() : '';
    const physicalTime = document.getElementById('event-form-physical-time') ? document.getElementById('event-form-physical-time').value.trim() : '';

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
      Descripcion: desc,
      Fecha_Entrega_Fisica: physicalDates,
      Lugar_Entrega_Fisica: physicalPlace,
      Horario_Entrega_Fisica: physicalTime
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
    const selectors = ['import-event-select', 'config-event-select', 'batch-event-select', 'filter-event-select', 'admin-reg-event-select'];
    selectors.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const opts = this.eventsCache.map(e => `<option value="${e.Evento_ID}">${e.Evento_ID}: ${Validation.escapeHTML(e.Titulo_Evento)}</option>`).join('');
      el.innerHTML = opts;
    });

    // Poblar selector del Dashboard analítico preservando selección actual
    const dashFilter = document.getElementById('dashboard-event-filter');
    if (dashFilter) {
      const currentVal = dashFilter.value || 'all';
      let html = `<option value="all">Todos los Eventos (Vista Global)</option>`;
      this.eventsCache.forEach(e => {
        html += `<option value="${e.Evento_ID}">${e.Evento_ID}: ${Validation.escapeHTML(e.Titulo_Evento)}</option>`;
      });
      dashFilter.innerHTML = html;
      dashFilter.value = currentVal;
    }
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

  /**
   * Determina la clase CSS del badge según el estado canónico de pago.
   */
  getPaymentBadgeClass(status) {
    switch (status) {
      case 'Pagado':
        return 'badge-success';
      case 'Pendiente':
        return 'badge-warning';
      case 'Anulado':
        return 'badge-danger';
      case 'Reembolsado':
        return 'badge-info';
      default:
        return 'badge-secondary';
    }
  },

  /**
   * Retorna un glifo o ícono semántico para el estado de pago.
   */
  getPaymentStatusIcon(status) {
    switch (status) {
      case 'Pagado':
        return '✓';
      case 'Pendiente':
        return '⏳';
      case 'Anulado':
        return '✕';
      case 'Reembolsado':
        return '↩';
      default:
        return '•';
    }
  },

  /**
   * Renderiza la tabla de inscripciones con soporte de gestión de pagos reversible.
   */
  renderEnrollmentsTable() {
    const container = document.getElementById('admin-enrollments-list');
    if (this.enrollmentsCache.length === 0) {
      container.innerHTML = `<p style="color: var(--color-text-muted);">No hay inscripciones registradas para este evento.</p>`;
      return;
    }

    const rows = this.enrollmentsCache.map(ins => {
      const status = ins.Estado_Pago || 'Pendiente';
      const isPaid = status === 'Pagado';
      const isPending = status === 'Pendiente';
      const isCancelled = status === 'Anulado';
      const isRefunded = status === 'Reembolsado';

      const badgeClass = this.getPaymentBadgeClass(status);
      const icon = this.getPaymentStatusIcon(status);

      return `
        <tr>
          <td style="padding: 8px;"><code>${Validation.escapeHTML(ins.Inscripcion_ID)}</code></td>
          <td style="padding: 8px;">${Validation.escapeHTML(ins.DNI)}</td>
          <td style="padding: 8px;">${Validation.escapeHTML(ins.Nombre_Completo)}</td>
          <td style="padding: 8px;">${Validation.escapeHTML(ins.Tipo_Certificado)}</td>
          <td style="padding: 8px;">
            <span class="badge ${badgeClass}">
              ${icon} ${Validation.escapeHTML(status)}
            </span>
          </td>
          <td style="padding: 8px;"><code>${Validation.escapeHTML(ins.Codigo_Consulta)}</code></td>
          <td style="padding: 8px;">
            <div class="admin-table-actions">
              ${isPending ? `
                <button type="button" class="btn btn-success btn-sm" onclick="window.CognitioAdmin.confirmPayment('${ins.Inscripcion_ID}')" title="Confirmar pago verificado">
                  ✓ Confirmar Pago
                </button>
              ` : ''}
              ${isPaid ? `
                <span class="badge badge-success" style="font-size: 0.72rem; padding: 2px 7px;">✓ Pagado</span>
              ` : ''}
              ${isCancelled ? `
                <span class="badge badge-danger" style="font-size: 0.72rem; padding: 2px 7px;">✕ Anulado</span>
              ` : ''}
              ${isRefunded ? `
                <span class="badge badge-info" style="font-size: 0.72rem; padding: 2px 7px;">↩ Reembolsado</span>
              ` : ''}
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.CognitioAdmin.openPaymentModal('${ins.Inscripcion_ID}', '${Validation.escapeHTML(status)}', '${Validation.escapeHTML(ins.Nombre_Completo).replace(/'/g, "\\'")}')" title="Gestionar y cambiar estado de pago">
                ⚙ Gestionar Pago
              </button>
              <button type="button" class="btn btn-outline btn-sm" onclick="window.CognitioAdmin.openEditParticipantModal('${ins.Participante_ID}', '${ins.DNI}', '${Validation.escapeHTML(ins.Nombre_Completo).replace(/'/g, "\\'")}')" title="Corregir datos de participante">
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
              <th style="min-width: 110px;">Estado Pago</th>
              <th style="min-width: 130px;">Cód. Consulta</th>
              <th style="min-width: 230px;">Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  /**
   * Confirmación rápida de pago verificado (atajo para inscripciones pendientes).
   */
  async confirmPayment(enrollmentId) {
    if (!confirm(`¿Confirma que el participante de la inscripción ${enrollmentId} ha completado el pago?`)) return;

    const res = await Api.post('adminUpdatePaymentStatus', {
      enrollmentId,
      status: 'Pagado',
      reason: 'Confirmación directa de pago verificado por directiva'
    }, this.currentAuthToken);

    if (res && res.success) {
      alert('Pago confirmado y registrado en auditoría.');
      await this.loadEnrollments();
    } else {
      alert('Error: ' + (res?.message || 'Error al confirmar pago'));
    }
  },

  /**
   * Abre el modal para gestionar flexiblemente el estado de pago de una inscripción.
   */
  openPaymentModal(enrollmentId, currentStatus, participantName) {
    const enrollment = this.enrollmentsCache.find(e => e.Inscripcion_ID === enrollmentId);
    const resolvedName = enrollment?.Nombre_Completo || participantName || 'Participante';
    const resolvedStatus = enrollment?.Estado_Pago || currentStatus || 'Pendiente';

    const idInput = document.getElementById('payment-modal-enrollment-id');
    const nameSpan = document.getElementById('payment-modal-participant-name');
    const codeSpan = document.getElementById('payment-modal-enrollment-code');
    const statusSpan = document.getElementById('payment-modal-current-status');
    const statusSelect = document.getElementById('payment-modal-new-status');
    const reasonInput = document.getElementById('payment-modal-reason');

    if (idInput) idInput.value = enrollmentId;
    if (nameSpan) nameSpan.textContent = resolvedName;
    if (codeSpan) codeSpan.textContent = enrollmentId;

    if (statusSpan) {
      statusSpan.textContent = `${this.getPaymentStatusIcon(resolvedStatus)} ${resolvedStatus}`;
      statusSpan.className = `badge ${this.getPaymentBadgeClass(resolvedStatus)}`;
    }

    if (statusSelect) {
      statusSelect.value = resolvedStatus;
    }

    if (reasonInput) {
      reasonInput.value = '';
    }

    this.onPaymentStatusSelectChange(resolvedStatus);
    this.openModal('modal-payment-status');
  },

  /**
   * Actualiza dinámicamente la interfaz del modal según la obligatoriedad del motivo.
   */
  onPaymentStatusSelectChange(newStatus) {
    const reqSpan = document.getElementById('payment-modal-reason-req');
    const helpSmall = document.getElementById('payment-modal-reason-help');
    const reasonTextarea = document.getElementById('payment-modal-reason');

    if (newStatus === 'Pagado') {
      if (reqSpan) {
        reqSpan.textContent = '(Opcional)';
        reqSpan.style.color = 'var(--color-text-muted)';
      }
      if (helpSmall) {
        helpSmall.textContent = 'Opcional al confirmar o mantener Pagado. Se registrará en la bitácora de auditoría.';
      }
      if (reasonTextarea) {
        reasonTextarea.required = false;
        reasonTextarea.placeholder = 'Opcional: Detalle de verificación bancaria, número de operación o voucher.';
      }
    } else {
      if (reqSpan) {
        reqSpan.textContent = '* (Obligatorio)';
        reqSpan.style.color = 'var(--color-danger)';
      }
      if (helpSmall) {
        helpSmall.textContent = 'Obligatorio al revertir o anular por exigencia de auditoría institucional. Se registrará con su correo de directivo.';
      }
      if (reasonTextarea) {
        reasonTextarea.required = true;
        reasonTextarea.placeholder = 'Indique detalladamente el motivo de la corrección o reversión (ej: Voucher digitado por error, Reembolso solicitado por participante, etc.)';
      }
    }
  },

  /**
   * Guarda el cambio de estado de pago en el backend garantizando auditoría inmutable.
   */
  async savePaymentStatusChange() {
    const enrollmentId = document.getElementById('payment-modal-enrollment-id')?.value?.trim();
    const newStatus = document.getElementById('payment-modal-new-status')?.value?.trim();
    const reasonInput = document.getElementById('payment-modal-reason');
    const reason = (reasonInput?.value || '').trim();

    if (!enrollmentId) {
      alert('Error: No se ha seleccionado una inscripción válida.');
      return;
    }

    const validStatuses = ['Pagado', 'Pendiente', 'Anulado', 'Reembolsado'];
    if (!validStatuses.includes(newStatus)) {
      alert('Error: El estado seleccionado no es válido. Debe ser Pagado, Pendiente, Anulado o Reembolsado.');
      return;
    }

    if (newStatus !== 'Pagado' && !reason) {
      alert('Debe especificar el motivo de la corrección o cambio de estado de pago.');
      if (reasonInput) reasonInput.focus();
      return;
    }

    const saveBtn = document.getElementById('btn-save-payment-status');
    const originalText = saveBtn ? saveBtn.textContent : 'Guardar Cambio de Estado';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando cambio...';
    }

    try {
      const res = await Api.post('adminUpdatePaymentStatus', {
        enrollmentId,
        status: newStatus,
        reason: reason || (newStatus === 'Pagado' ? 'Confirmación de pago verificado' : '')
      }, this.currentAuthToken);

      if (res && res.success) {
        alert(`Estado de pago actualizado correctamente a "${newStatus}".`);
        this.closeModal('modal-payment-status');
        await this.loadEnrollments();
      } else {
        alert('Error al actualizar estado: ' + (res?.message || 'Error no especificado por el servidor.'));
      }
    } catch (err) {
      console.error('[Admin savePaymentStatusChange] Error:', err);
      alert('Error de conexión al guardar el nuevo estado de pago.');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    }
  },

  // --------------------------------------------------------------------------
  // REGISTRO INDIVIDUAL ADMINISTRATIVO DE PARTICIPANTES
  // --------------------------------------------------------------------------

  /**
   * Abre el modal de registro individual administrativo de participantes.
   */
  openRegisterParticipantModal() {
    const select = document.getElementById('admin-reg-event-select');
    if (select) {
      if (this.eventsCache && this.eventsCache.length > 0) {
        select.innerHTML = this.eventsCache.map(e => `<option value="${e.Evento_ID}">${e.Evento_ID}: ${Validation.escapeHTML(e.Titulo_Evento)}</option>`).join('');
      }
      const currentFilterEvent = document.getElementById('filter-event-select')?.value;
      if (currentFilterEvent && select.querySelector(`option[value="${currentFilterEvent}"]`)) {
        select.value = currentFilterEvent;
      }
    }

    const dniInput = document.getElementById('admin-reg-dni');
    if (dniInput) dniInput.value = '';
    const nameInput = document.getElementById('admin-reg-name');
    if (nameInput) nameInput.value = '';
    const certTypeSelect = document.getElementById('admin-reg-cert-type');
    if (certTypeSelect) certTypeSelect.value = 'Virtual';
    const paymentStatusSelect = document.getElementById('admin-reg-payment-status');
    if (paymentStatusSelect) paymentStatusSelect.value = 'Pendiente';
    const voucherInput = document.getElementById('admin-reg-voucher');
    if (voucherInput) voucherInput.value = '';

    const dniIndicator = document.getElementById('admin-reg-dni-indicator');
    if (dniIndicator) {
      dniIndicator.textContent = '0/8';
      dniIndicator.classList.remove('ready');
    }

    this.openModal('modal-admin-register-participant');
    if (dniInput) {
      setTimeout(() => dniInput.focus(), 80);
    }
  },

  /**
   * Guarda un participante individual ingresado directamente por la directiva institucional.
   */
  async saveIndividualParticipant() {
    const eventSelect = document.getElementById('admin-reg-event-select');
    const dniInput = document.getElementById('admin-reg-dni');
    const nameInput = document.getElementById('admin-reg-name');
    const certTypeSelect = document.getElementById('admin-reg-cert-type');
    const paymentStatusSelect = document.getElementById('admin-reg-payment-status');
    const voucherInput = document.getElementById('admin-reg-voucher');
    const saveBtn = document.getElementById('btn-save-admin-register');

    const eventId = eventSelect?.value?.trim() || '';
    const rawDni = dniInput?.value || '';
    const dni = Validation.normalizeDNI(rawDni);
    const rawName = nameInput?.value || '';
    const cleanName = Validation.normalizeName(rawName);
    const certType = certTypeSelect?.value || 'Virtual';
    const paymentStatus = paymentStatusSelect?.value || 'Pendiente';
    const voucher = voucherInput?.value?.trim() || '';

    if (!eventId) {
      alert('Por favor seleccione un evento de destino.');
      if (eventSelect) eventSelect.focus();
      return;
    }

    if (!Validation.isValidDNI(dni)) {
      alert('El DNI ingresado no es válido. Debe contener exactamente 8 dígitos numéricos.');
      if (dniInput) dniInput.focus();
      return;
    }

    if (!Validation.isValidFullName(cleanName)) {
      alert('Por favor ingrese un nombre y apellido formal válido (mínimo 3 caracteres alfabéticos).');
      if (nameInput) nameInput.focus();
      return;
    }

    const payload = {
      eventId,
      dni,
      nombreCompleto: cleanName,
      tipoCertificado: certType,
      initialPaymentStatus: paymentStatus,
      referenciaComprobante: voucher
    };

    const prevBtnText = saveBtn ? saveBtn.textContent : 'Completar Registro';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Registrando participante...';
    }

    try {
      const res = await Api.post('adminRegisterParticipant', payload, this.currentAuthToken);

      if (!res || !res.success) {
        alert('Error al registrar participante: ' + (res?.message || 'Error no especificado por el servidor.'));
        return;
      }

      const data = res.data || {};
      const enrollmentId = data.enrollmentId || data.Inscripcion_ID || 'INS-N/A';
      const queryCode = data.queryCode || data.Codigo_Consulta || 'N/A';
      const isExisting = Boolean(data.isExisting);
      const partStatus = data.paymentStatus || data.Estado_Pago || paymentStatus;

      let msg = '';
      if (isExisting) {
        msg = `ℹ️ INFORMACIÓN DE REGISTRO PREVIO:\n\nEl participante con DNI ${dni} ya se encontraba formalmente inscrito en este evento.\n\n• ID Inscripción: ${enrollmentId}\n• Código de Consulta: ${queryCode}\n• Estado de Pago: ${partStatus}\n\nNo se crearon registros duplicados.`;
      } else {
        msg = `✅ ¡PARTICIPANTE REGISTRADO CON ÉXITO!\n\n• Nombre: ${cleanName}\n• DNI: ${dni}\n• ID Inscripción: ${enrollmentId}\n• Código de Consulta: ${queryCode}\n• Estado Inicial de Pago: ${partStatus}\n• Modalidad Certificado: ${certType}\n\nEntregue o comparta el Código de Consulta con el participante para el seguimiento de su acreditación.`;
      }

      alert(msg);

      this.closeModal('modal-admin-register-participant');

      const filterSelect = document.getElementById('filter-event-select');
      if (filterSelect) {
        filterSelect.value = eventId;
      }
      await this.loadEnrollments();
    } catch (err) {
      console.error('[Admin saveIndividualParticipant] Error:', err);
      alert('Error de conexión al procesar el registro del participante: ' + (err.message || 'Error desconocido'));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = prevBtnText;
      }
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
  },

  // --------------------------------------------------------------------------
  // GESTIÓN DE DIRECTIVA Y PERMISOS RBAC (Solo SuperAdmin)
  // --------------------------------------------------------------------------

  /**
   * Carga la lista de directivos desde el backend e invoca el renderizado de la tabla.
   */
  async loadAdminUsers() {
    const listContainer = document.getElementById('admin-users-list');
    if (!listContainer) return;

    if (this.currentAdminRole !== 'SuperAdmin') {
      listContainer.innerHTML = `<div class="alert alert-warning">Se requieren privilegios de SuperAdmin para gestionar los permisos de la directiva.</div>`;
      return;
    }

    listContainer.innerHTML = `<div class="loading-container"><div class="spinner"></div><p>Cargando directivos...</p></div>`;

    try {
      const res = await Api.post('adminGetUsers', {}, this.currentAuthToken);
      if (!res.success) {
        listContainer.innerHTML = `<div class="alert alert-danger">${Validation.escapeHTML(res.message || 'Error al obtener usuarios directivos.')}</div>`;
        return;
      }

      this.usersCache = res.data || [];
      this.renderAdminUsersTable();
    } catch (err) {
      console.error('[Admin Users] Error cargando lista:', err);
      listContainer.innerHTML = `<div class="alert alert-danger">Error de comunicación: ${Validation.escapeHTML(err.message)}</div>`;
    }
  },

  /**
   * Renderiza la tabla responsive de directivos con badges visuales y acciones.
   */
  renderAdminUsersTable() {
    const listContainer = document.getElementById('admin-users-list');
    if (!listContainer) return;

    if (!this.usersCache || this.usersCache.length === 0) {
      listContainer.innerHTML = `<p style="color: var(--color-text-muted); padding: 1rem 0;">No hay directivos registrados.</p>`;
      return;
    }

    const rows = this.usersCache.map(u => {
      const userId = u.Usuario_ID || u.Email || '';
      const email = u.Email || '';
      const name = u.Nombre_Completo || '-';
      const role = u.Rol || 'Operador';
      const status = u.Estado || 'Activo';
      const lastAccess = u.Ultimo_Acceso || 'Sin accesos registrados';
      const isActive = status === 'Activo';
      const roleBadgeClass = this.getRoleBadgeClass(role);
      const statusBadgeClass = isActive ? 'badge-active' : 'badge-inactive';

      const toggleActionLabel = isActive ? 'Revocar / Desactivar' : 'Activar';
      const toggleActionClass = isActive ? 'btn-outline' : 'btn-success';
      const toggleActionStyle = isActive ? 'color: #DC2626; border-color: #FCA5A5;' : '';

      return `
        <tr>
          <td><code>${Validation.escapeHTML(userId)}</code></td>
          <td><strong>${Validation.escapeHTML(email)}</strong></td>
          <td>${Validation.escapeHTML(name)}</td>
          <td>
            <span class="badge ${roleBadgeClass}">${Validation.escapeHTML(role)}</span>
          </td>
          <td>
            <span class="badge ${statusBadgeClass}">${Validation.escapeHTML(status)}</span>
          </td>
          <td style="font-size: 0.8rem; color: var(--color-text-muted);">${Validation.escapeHTML(lastAccess)}</td>
          <td>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              <button class="btn btn-outline btn-sm" onclick="window.CognitioAdmin.openEditUserModal('${userId}')" title="Modificar rol o estado">
                ✎ Modificar Rol
              </button>
              <button class="btn ${toggleActionClass} btn-sm" style="${toggleActionStyle}" onclick="window.CognitioAdmin.revokeAdminUser('${userId}', '${status}')" title="${isActive ? 'Desactivar acceso de este directivo' : 'Habilitar acceso de este directivo'}">
                ${toggleActionLabel}
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
              <th style="min-width: 110px;">ID Directivo</th>
              <th style="min-width: 220px;">Correo de Google</th>
              <th style="min-width: 200px;">Nombre Completo</th>
              <th style="min-width: 120px;">Rol</th>
              <th style="min-width: 100px;">Estado</th>
              <th style="min-width: 150px;">Último Acceso</th>
              <th style="min-width: 240px;">Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  /**
   * Abre el modal para registrar un nuevo directivo con campos limpios.
   */
  openNewUserModal() {
    const titleEl = document.getElementById('modal-admin-user-title');
    if (titleEl) titleEl.textContent = 'Registrar Nuevo Directivo';
    
    document.getElementById('admin-user-form-id').value = '';
    const emailInput = document.getElementById('admin-user-form-email');
    emailInput.value = '';
    emailInput.disabled = false;
    document.getElementById('admin-user-form-name').value = '';
    document.getElementById('admin-user-form-role').value = 'Admin';
    document.getElementById('admin-user-form-status').value = 'Activo';
    this.openModal('modal-admin-user');
  },

  /**
   * Abre el modal para editar el rol y estado de un directivo existente.
   */
  openEditUserModal(userId) {
    const user = this.usersCache.find(u => u.Usuario_ID === userId || u.Email === userId);
    if (!user) {
      alert('Directivo no encontrado en la memoria local.');
      return;
    }

    const titleEl = document.getElementById('modal-admin-user-title');
    if (titleEl) titleEl.textContent = 'Modificar Directivo: ' + (user.Email || '');

    document.getElementById('admin-user-form-id').value = user.Usuario_ID || '';
    const emailInput = document.getElementById('admin-user-form-email');
    emailInput.value = user.Email || '';
    emailInput.disabled = true; // El email de Google no debe alterarse
    document.getElementById('admin-user-form-name').value = user.Nombre_Completo || '';
    document.getElementById('admin-user-form-role').value = user.Rol || 'Operador';
    document.getElementById('admin-user-form-status').value = user.Estado || 'Activo';
    this.openModal('modal-admin-user');
  },

  /**
   * Valida y guarda el directivo (creación o actualización) en el backend.
   */
  async saveAdminUser() {
    const userId = document.getElementById('admin-user-form-id').value.trim();
    const email = document.getElementById('admin-user-form-email').value.trim();
    const name = document.getElementById('admin-user-form-name').value.trim();
    const role = document.getElementById('admin-user-form-role').value;
    const status = document.getElementById('admin-user-form-status').value;

    if (!email || !Validation.isValidEmail(email)) {
      alert('Por favor ingrese una dirección de correo institucional o de Google válida.');
      return;
    }

    if (!name || name.length < 3) {
      alert('Por favor ingrese el nombre completo formal del directivo.');
      return;
    }

    const payload = {
      usuarioId: userId,
      email: email,
      nombreCompleto: name,
      rol: role,
      estado: status
    };

    const btn = document.getElementById('btn-save-admin-user');
    const prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      const res = await Api.post('adminSaveUser', payload, this.currentAuthToken);
      if (!res.success) {
        alert(res.message || 'Error al guardar el directivo.');
        return;
      }

      alert('Directivo guardado exitosamente.');
      this.closeModal('modal-admin-user');
      await this.loadAdminUsers();
    } catch (err) {
      console.error('[Admin Users] Error en saveAdminUser:', err);
      alert('Ocurrió un error al intentar guardar el directivo: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  },

  /**
   * Revoca (desactiva) o reactiva el acceso de un directivo con confirmación de seguridad.
   */
  async revokeAdminUser(userId, currentStatus) {
    const user = this.usersCache.find(u => u.Usuario_ID === userId || u.Email === userId);
    const identifier = user ? user.Email : userId;
    const isActive = currentStatus === 'Activo';

    if (isActive) {
      if (user && user.Email && this.currentAdminEmail && user.Email.toLowerCase() === this.currentAdminEmail.toLowerCase()) {
        if (!confirm("⚠️ ATENCIÓN: Está a punto de revocar su propio usuario activo. Si continúa, perderá el acceso al panel administrativo inmediatamente. ¿Desea continuar?")) {
          return;
        }
      }
      if (!confirm(`¿Está seguro de revocar el acceso del directivo '${identifier}'? El usuario no podrá acceder al panel de administración.`)) {
        return;
      }

      try {
        const res = await Api.post('adminRevokeUser', { userId }, this.currentAuthToken);
        if (!res.success) {
          alert(res.message || 'Error al revocar el acceso del directivo.');
          return;
        }

        alert('Acceso revocado exitosamente.');
        await this.loadAdminUsers();
      } catch (err) {
        console.error('[Admin Users] Error revocando acceso:', err);
        alert('Error al revocar acceso: ' + err.message);
      }
    } else {
      if (!confirm(`¿Desea reactivar el acceso del directivo '${identifier}'?`)) {
        return;
      }

      try {
        const res = await Api.post('adminSaveUser', {
          usuarioId: user ? user.Usuario_ID : userId,
          email: user ? user.Email : userId,
          nombreCompleto: user ? user.Nombre_Completo : '',
          rol: user ? user.Rol : 'Operador',
          estado: 'Activo'
        }, this.currentAuthToken);

        if (!res.success) {
          alert(res.message || 'Error al reactivar el directivo.');
          return;
        }

        alert('Directivo reactivado con éxito.');
        await this.loadAdminUsers();
      } catch (err) {
        console.error('[Admin Users] Error reactivando acceso:', err);
        alert('Error al reactivar directivo: ' + err.message);
      }
    }
  }
};
