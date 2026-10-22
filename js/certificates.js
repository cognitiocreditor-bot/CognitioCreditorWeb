/**
 * MÓDULO DE CONSULTA Y EMISIÓN DE CERTIFICADOS — COGNITIO CREDITOR
 * Ejecuta las validaciones de identidad, maneja parámetros URL (?dni=)
 * e interpreta las reglas obligatorias de negocio A a F.
 */

import { Api } from './api.js?v=4';
import { Validation } from './validation.js?v=4';
import { PdfEngine } from './pdf-engine.js?v=4';
import { CONFIG } from './config.js?v=4';

export const Certificates = {
  formElement: null,
  resultContainer: null,

  /**
   * Inicializa la vista de certificados.
   */
  init() {
    this.formElement = document.getElementById('cert-query-form');
    this.resultContainer = document.getElementById('cert-query-results');

    if (this.formElement) {
      this.formElement.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    // Soporte para pre-rellenar DNI desde la URL (index.html?dni=71234567)
    this.checkUrlParams();
  },

  /**
   * Lee el parámetro 'dni' en la URL y auto-rellena el campo.
   */
  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const dniParam = urlParams.get('dni');
    if (dniParam) {
      const dniInput = document.getElementById('query-dni');
      if (dniInput) {
        dniInput.value = dniParam.trim();
        // Si tiene longitud válida, autodespachar la consulta respetando seguridad
        if (Validation.isValidDNI(dniParam.trim())) {
          this.executeLookup(dniParam.trim());
        }
      }
    }
  },

  /**
   * Manejador de envío del formulario de consulta.
   */
  async handleSubmit(e) {
    e.preventDefault();
    const dniRaw = document.getElementById('query-dni')?.value || '';
    const codeRaw = document.getElementById('query-code')?.value || '';

    const dni = Validation.normalizeDNI(dniRaw);
    const code = codeRaw.trim();

    if (!Validation.isValidDNI(dni)) {
      this.renderMessage('El DNI debe contener exactamente 8 dígitos numéricos.', 'danger');
      return;
    }

    await this.executeLookup(dni, code);
  },

  /**
   * Ejecuta la petición de consulta al backend.
   */
  async executeLookup(dni, code = '') {
    this.renderLoading();

    try {
      const response = await Api.get('queryCertificate', { dni, code });

      if (!response.success) {
        // Regla F: Registro inexistente o consulta no válida (mensaje prudente)
        this.renderMessage(
          response.message || 'No se encontraron certificados disponibles para los datos ingresados. Si te inscribiste recientemente, verifica tu pago con la directiva.',
          'info'
        );
        return;
      }

      const records = response.data || [];
      if (records.length === 0) {
        this.renderMessage('No hay inscripciones registradas bajo este documento.', 'info');
        return;
      }

      this.renderResults(records);
    } catch (err) {
      console.error('[Certificates] Error en consulta:', err);
      this.renderMessage('Ocurrió un error de conexión al consultar el certificado. Intente nuevamente más tarde.', 'danger');
    }
  },

  renderLoading() {
    this.resultContainer.innerHTML = `
      <div class="loading-container" role="status" aria-live="polite">
        <div class="spinner"></div>
        <p>Verificando registro y elegibilidad de emisión...</p>
      </div>
    `;
  },

  renderMessage(msg, type = 'info') {
    this.resultContainer.innerHTML = `
      <div class="alert alert-${type}">
        <div>${Validation.escapeHTML(msg)}</div>
      </div>
    `;
  },

  /**
   * Renderiza el estado de las inscripciones del participante aplicando las Reglas A a E.
   */
  renderResults(records) {
    const html = records.map((rec, index) => {
      const eventTitle = Validation.escapeHTML(rec.Titulo_Evento || 'Evento');
      const participantName = Validation.escapeHTML(rec.Nombre_Completo || '');
      const certType = rec.Tipo_Certificado || 'Virtual';
      const paymentStatus = rec.Estado_Pago || 'Pendiente';
      const isEligible = Boolean(rec.Elegible_Emision);
      const ruleCode = rec.Codigo_Regla || '';
      const ruleMessage = rec.Mensaje_Regla || '';

      let statusBadge = '';
      let actionArea = '';

      // Regla A: Pago pendiente
      if (paymentStatus === 'Pendiente') {
        statusBadge = `<span class="badge" style="background: #FEF3C7; color: #92400E; padding: 4px 8px; border-radius: 4px; font-weight: 600;">Pago Pendiente</span>`;
        actionArea = `
          <div class="alert alert-warning" style="margin-top: 1rem;">
            <div>
              <p>Tu inscripción está registrada, pero el pago está pendiente de confirmación. Si ya realizaste el pago, comunícate con la directiva por WhatsApp.</p>
              <div style="margin-top: 0.75rem;">
                <a href="${this._getWhatsAppUrl(eventTitle)}" target="_blank" rel="noopener noreferrer" class="btn btn-success btn-sm">
                  💬 Contactar Directiva por WhatsApp
                </a>
              </div>
            </div>
          </div>
        `;
      }
      // Regla B: Evento futuro o en curso
      else if (ruleCode === 'REGLA_B_FUTURO') {
        statusBadge = `<span class="badge" style="background: #E0F2FE; color: #0369A1; padding: 4px 8px; border-radius: 4px; font-weight: 600;">En Espera</span>`;
        actionArea = `
          <div class="alert alert-info" style="margin-top: 1rem;">
            Tu certificado estará disponible a partir del día siguiente al evento.
          </div>
        `;
      }
      // Regla C: Certificado físico
      else if (certType === 'Fisico') {
        statusBadge = `<span class="badge" style="background: #F3E8FF; color: #6B21A8; padding: 4px 8px; border-radius: 4px; font-weight: 600;">Certificado Físico</span>`;
        actionArea = `
          <div class="alert alert-info" style="margin-top: 1rem;">
            <p>Tu certificado es físico. Coordina su entrega o recojo con la directiva del círculo.</p>
            <div style="margin-top: 0.75rem;">
              <a href="${this._getWhatsAppUrl(eventTitle)}" target="_blank" rel="noopener noreferrer" class="btn btn-success btn-sm">
                💬 Coordinar Recojo por WhatsApp
              </a>
            </div>
          </div>
        `;
      }
      // Regla D: Certificado virtual elegible para descarga
      else if (isEligible && certType === 'Virtual') {
        statusBadge = `<span class="badge" style="background: #D1FAE5; color: #065F46; padding: 4px 8px; border-radius: 4px; font-weight: 600;">Listo para Descargar</span>`;
        actionArea = `
          <div style="margin-top: 1.25rem;">
            <button type="button" class="btn btn-primary btn-block" id="btn-download-${index}" onclick="window.CognitioPortal.downloadCertificate('${rec.Inscripcion_ID}', ${index})">
              📥 Descargar Certificado Oficial en PDF
            </button>
          </div>
        `;
      }
      // Regla E: Evento cancelado
      else if (ruleCode === 'REGLA_E_CANCELADO') {
        statusBadge = `<span class="badge" style="background: #FEE2E2; color: #991B1B; padding: 4px 8px; border-radius: 4px; font-weight: 600;">Evento Cancelado</span>`;
        actionArea = `
          <div class="alert alert-danger" style="margin-top: 1rem;">
            Este evento fue cancelado. Comunícate con la directiva para cualquier regularización.
          </div>
        `;
      } else {
        actionArea = `
          <div class="alert alert-info" style="margin-top: 1rem;">
            ${Validation.escapeHTML(ruleMessage || 'Estado en proceso de verificación.')}
          </div>
        `;
      }

      return `
        <div class="result-card" style="margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
            <div>
              <h4 style="color: var(--color-primary); font-size: 1.15rem; margin-bottom: 0.25rem;">${eventTitle}</h4>
              <p style="color: var(--color-text-muted); font-size: 0.9rem;">Participante: <strong>${participantName}</strong></p>
            </div>
            <div>${statusBadge}</div>
          </div>
          ${actionArea}
        </div>
      `;
    }).join('');

    this.resultContainer.innerHTML = `
      <div style="margin-top: 2rem;">
        <h3 style="font-size: 1.25rem; color: var(--color-primary); margin-bottom: 1rem;">Certificados Encontrados</h3>
        ${html}
      </div>
    `;
  },

  /**
   * Descarga el PDF del certificado comunicándose con el motor cliente.
   */
  async processDownload(enrollmentId, index) {
    const btn = document.getElementById(`btn-download-${index}`);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner spinner-sm"></span> Generando PDF vectorial...`;
    }

    try {
      const response = await Api.get('getTemplatePdf', { enrollmentId });
      if (!response.success) {
        alert(response.message || 'No se pudo obtener la plantilla del certificado.');
        return;
      }

      const { templateBase64, participantName, config, fileName } = response.data;
      
      // Convertir base64 a Uint8Array
      const binaryString = atob(templateBase64);
      const len = binaryString.length;
      const templateBytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        templateBytes[i] = binaryString.charCodeAt(i);
      }

      // Generar PDF usando el motor cliente
      const pdfBytes = await PdfEngine.generateCertificatePdf({
        templateBytes,
        participantName,
        config
      });

      // Descargar archivo respetando formato de nombres seguro
      PdfEngine.downloadPdf(pdfBytes, fileName || `Certificado_${enrollmentId}.pdf`);
    } catch (err) {
      console.error('[Certificates] Error generando PDF:', err);
      alert('Ocurrió un error al procesar el archivo PDF: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `📥 Descargar Certificado Oficial en PDF`;
      }
    }
  },

  _getWhatsAppUrl(eventTitle) {
    if (CONFIG.WHATSAPP_NUMBER && !CONFIG.WHATSAPP_NUMBER.includes("TU_NUMERO_WHATSAPP")) {
      const msg = encodeURIComponent(`${CONFIG.WHATSAPP_DEFAULT_MESSAGE}mi inscripción en: ${eventTitle}`);
      return `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${msg}`;
    }
    if (CONFIG.WHATSAPP_URL && !CONFIG.WHATSAPP_URL.includes("TU_URL")) {
      return CONFIG.WHATSAPP_URL;
    }
    return '#';
  }
};
