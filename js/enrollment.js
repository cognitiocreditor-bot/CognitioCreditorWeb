/**
 * MÓDULO DE INSCRIPCIÓN PROPIA — COGNITIO CREDITOR
 * Valida datos de participantes y procesa el registro seguro contra el backend.
 */

import { Api } from './api.js';
import { Validation } from './validation.js';

export const Enrollment = {
  modalElement: null,
  currentEventId: null,

  /**
   * Inicializa el modal y los escuchadores del formulario de inscripción.
   */
  init() {
    this.modalElement = document.getElementById('enrollment-modal');
    const form = document.getElementById('enrollment-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  },

  /**
   * Abre el modal de inscripción para un evento determinado.
   */
  openModal(eventId, eventTitle) {
    this.currentEventId = eventId;
    const titleEl = document.getElementById('modal-event-title');
    const eventIdInput = document.getElementById('modal-event-id');
    const alertBox = document.getElementById('enrollment-feedback');
    const form = document.getElementById('enrollment-form');

    if (titleEl) titleEl.textContent = eventTitle;
    if (eventIdInput) eventIdInput.value = eventId;
    if (alertBox) {
      alertBox.style.display = 'none';
      alertBox.innerHTML = '';
    }
    if (form) form.reset();

    if (this.modalElement) {
      this.modalElement.style.display = 'flex';
      // Foco accesible al primer input
      const firstInput = document.getElementById('enroll-dni');
      if (firstInput) firstInput.focus();
    }
  },

  /**
   * Cierra el modal de inscripción.
   */
  closeModal() {
    if (this.modalElement) {
      this.modalElement.style.display = 'none';
    }
    this.currentEventId = null;
  },

  /**
   * Procesa el envío del formulario de inscripción.
   */
  async handleSubmit(e) {
    e.preventDefault();
    const alertBox = document.getElementById('enrollment-feedback');
    const submitBtn = document.getElementById('enroll-submit-btn');

    const dniRaw = document.getElementById('enroll-dni')?.value || '';
    const nameRaw = document.getElementById('enroll-name')?.value || '';
    const certType = document.getElementById('enroll-cert-type')?.value || 'Virtual';
    const voucherRef = document.getElementById('enroll-voucher')?.value || '';

    const dni = Validation.normalizeDNI(dniRaw);
    const fullName = Validation.normalizeName(nameRaw);

    // Validación rigurosa de entradas
    if (!Validation.isValidDNI(dni)) {
      this.showAlert('El DNI debe contener exactamente 8 dígitos numéricos.', 'danger');
      return;
    }

    if (!Validation.isValidFullName(fullName)) {
      this.showAlert('Ingrese un nombre y apellidos válidos (mínimo 3 caracteres, sin caracteres especiales).', 'danger');
      return;
    }

    // Bloqueo de botón para prevenir múltiples envíos
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner spinner-sm"></span> Registrando...`;

    try {
      const payload = {
        Evento_ID: this.currentEventId,
        DNI: dni,
        Nombre_Completo: fullName,
        Tipo_Certificado: certType,
        Referencia_Comprobante: voucherRef.trim()
      };

      const response = await Api.post('registerEnrollment', payload);

      if (!response.success) {
        this.showAlert(response.message || 'No fue posible completar la inscripción.', 'danger');
        return;
      }

      // Éxito: Mostrar Código de Consulta
      const queryCode = response.data?.Codigo_Consulta || 'ASIGNADO';
      alertBox.className = 'alert alert-success';
      alertBox.style.display = 'block';
      alertBox.innerHTML = `
        <div>
          <strong>¡Inscripción registrada exitosamente!</strong>
          <p style="margin: 0.5rem 0;">Guarde su <strong>Código de Consulta</strong> para obtener su certificado cuando esté disponible:</p>
          <div style="background: #FFFFFF; color: #065F46; padding: 0.5rem; border-radius: 4px; font-size: 1.25rem; font-weight: 700; text-align: center; border: 2px dashed #059669; letter-spacing: 2px;">
            ${Validation.escapeHTML(queryCode)}
          </div>
          <p style="font-size: 0.85rem; margin-top: 0.5rem;">
            <em>Nota: Si su inscripción requiere pago, este debe ser validado por la directiva antes de la emisión del certificado.</em>
          </p>
        </div>
      `;

      // Ocultar campos de formulario
      document.getElementById('enrollment-form-fields').style.display = 'none';
      submitBtn.style.display = 'none';
    } catch (err) {
      console.error('[Enrollment] Error:', err);
      this.showAlert('Ocurrió un error inesperado al procesar la inscripción.', 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Completar Inscripción`;
    }
  },

  showAlert(msg, type = 'info') {
    const alertBox = document.getElementById('enrollment-feedback');
    if (!alertBox) return;
    alertBox.className = `alert alert-${type}`;
    alertBox.style.display = 'block';
    alertBox.textContent = msg;
  }
};
