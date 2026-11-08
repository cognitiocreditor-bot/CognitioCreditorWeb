/**
 * MÓDULO DE EVENTOS — COGNITIO CREDITOR
 * Carga de eventos públicos, renderizado de tarjetas, skeleton loading y apertura de inscripción.
 */

import { Api } from './api.js';
import { Validation } from './validation.js';

export const Events = {
  containerElement: null,

  /**
   * Inicializa la vista de eventos en el portal.
   * @param {string} containerSelector
   */
  async init(containerSelector = '#events-container') {
    this.containerElement = document.querySelector(containerSelector);
    if (!this.containerElement) return;

    this.renderLoading();
    await this.loadEvents();
  },

  /**
   * Muestra estado de carga con skeletons fluidos y accesibilidad.
   */
  renderLoading() {
    this.containerElement.innerHTML = `
      <div class="events-grid" role="status" aria-live="polite" aria-label="Cargando agenda de eventos académicos...">
        <div class="skeleton-card" style="height: 380px;"></div>
        <div class="skeleton-card" style="height: 380px;"></div>
        <div class="skeleton-card" style="height: 380px;"></div>
      </div>
    `;
  },

  /**
   * Carga eventos desde la API y gestiona errores o ausencia de datos.
   */
  async loadEvents() {
    try {
      const response = await Api.get('getPublicEvents');

      if (!response.success) {
        this.renderError(response.message || 'No fue posible cargar los eventos.');
        return;
      }

      const events = response.data || [];
      if (events.length === 0) {
        this.renderEmpty();
        return;
      }

      this.renderEvents(events);
    } catch (err) {
      console.error('[Events] Error al cargar:', err);
      this.renderError('Ocurrió un error inesperado al consultar los eventos.');
    }
  },

  /**
   * Renderiza la cuadrícula de eventos activos.
   * @param {Array} events
   */
  renderEvents(events) {
    const html = events.map(evt => {
      const imageSrc = Validation.formatImageUrl(evt.Imagen_URL);
      const title = Validation.escapeHTML(evt.Titulo_Evento || 'Evento Académico');
      const speaker = Validation.escapeHTML(evt.Expositor || 'Por confirmar');
      const date = evt.Fecha_Evento ? Validation.escapeHTML(evt.Fecha_Evento) : 'Próximamente';
      const time = evt.Hora_Evento ? ` a las ${Validation.escapeHTML(evt.Hora_Evento)}` : '';
      const modality = Validation.escapeHTML(evt.Modalidad || 'Virtual');
      const description = Validation.escapeHTML(evt.Descripcion || '');
      const externalLink = evt.Link_Formulario ? evt.Link_Formulario.trim() : '';

      return `
        <article class="event-card" id="event-${Validation.escapeHTML(evt.Evento_ID)}">
          <div class="event-image-wrapper">
            <img src="${imageSrc}" alt="Banner de ${title}" class="event-image" loading="lazy" onerror="this.src='assets/images/logo.jpg'">
            <span class="event-badge-modalidad">${modality}</span>
          </div>
          <div class="event-content">
            <div class="event-meta">
              <span>📅 ${date}${time}</span>
            </div>
            <h3 class="event-title">${title}</h3>
            <div class="event-speaker">
              <span>🎙️ ${speaker}</span>
            </div>
            <p class="event-description">${description}</p>
            <div class="event-footer">
              ${externalLink ? `
                <a href="${Validation.escapeHTML(externalLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-block">
                  Inscribirse en Formulario Oficial ↗
                </a>
              ` : `
                <button type="button" class="btn btn-primary btn-block" onclick="window.CognitioPortal.openEnrollmentModal('${Validation.escapeHTML(evt.Evento_ID)}', '${title}')">
                  Inscribirse en el Portal
                </button>
              `}
            </div>
          </div>
        </article>
      `;
    }).join('');

    this.containerElement.innerHTML = `
      <div class="events-grid">
        ${html}
      </div>
    `;
  },

  /**
   * Estado sin eventos públicos (Empty State institucional).
   */
  renderEmpty() {
    this.containerElement.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">📅</div>
        <h3 class="empty-title">Próximos Eventos en Programación</h3>
        <p class="empty-desc">Actualmente estamos consolidando la nueva agenda académica de conferencias y talleres. Síguenos en nuestros canales oficiales para conocer las convocatorias inmediatas.</p>
        <div style="margin-top: 1.25rem;">
          <a href="#contacto" class="btn btn-secondary btn-sm">Ver Canales Oficiales</a>
        </div>
      </div>
    `;
  },

  /**
   * Estado de error en la carga.
   */
  renderError(msg) {
    this.containerElement.innerHTML = `
      <div class="alert alert-danger" role="alert" style="max-width: 540px; margin: 1.5rem auto; text-align: center;">
        <div>
          <strong>Error de sincronización:</strong> ${Validation.escapeHTML(msg)}
          <div style="margin-top: 0.75rem;">
            <button class="btn btn-outline btn-sm" onclick="window.CognitioPortal.reloadEvents()">↻ Reintentar Carga</button>
          </div>
        </div>
      </div>
    `;
  }
};
