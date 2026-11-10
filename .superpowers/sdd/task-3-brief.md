# Task 3 Brief: Gestión Reversible de Estados de Pago (Backend y Frontend)

## Objetivo
Implementar la gestión flexible, reversible y totalmente auditable de los estados de pago en el backend y frontend, permitiendo cambiar el estado de pago entre `Pagado`, `Pendiente`, `Anulado` y `Reembolsado` para corregir errores operativos, garantizando que jamás se eliminen inscripciones ni participantes al corregir un pago y registrando obligatoriamente el motivo de la corrección en `Logs_Auditoria`.

## Requerimientos Específicos
1. **`backend/AdminService.js`**:
   - Actualizar `updatePaymentStatus(enrollmentId, status, reason, adminEmail)`:
     - Validar que `status` pertenezca a la lista canónica de estados permitidos:
       `["Pendiente", "Pagado", "Anulado", "Reembolsado"]`.
     - Si `status !== "Pagado"`, exigir un motivo no vacío (`reason`), de lo contrario lanzar error: `"Debe especificar el motivo de la corrección o cambio de estado de pago."`.
     - Localizar la inscripción por `Inscripcion_ID`. Si no existe, lanzar error `"Inscripción no encontrada"`.
     - Lógica de consistencia cronológica:
       - Si `status === "Pagado"`, asignar `Fecha_Pago: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss")`.
       - Si `status === "Pendiente"`, vaciar la fecha: `Fecha_Pago: ""` (para reflejar que no hay pago confirmado activo).
       - Si `status === "Anulado"` o `"Reembolsado"`, conservar la fecha previa o vaciar según aplique sin romper el formato.
     - Preservar inmutables los identificadores `Inscripcion_ID`, `Participante_ID`, `Evento_ID`, `Codigo_Consulta`. **¡Jamás invocar deleteRow ni alterar el participante!**
     - Registrar en auditoría:
       `AuthService.logAudit(adminEmail, "CAMBIO_ESTADO_PAGO", enrollmentId, 'De ' + (target.Estado_Pago || 'Sin estado') + ' a ' + status + '. Motivo: ' + (reason || 'No especificado'))`.
     - Retornar `{ enrollmentId, status, previousStatus: target.Estado_Pago }`.

2. **`backend/Code.js`**:
   - En `doPost(e)`:
     - En `action === "adminUpdatePaymentStatus"`:
       - Asegurar que pase `payload.status` y `payload.reason`:
         `const res = AdminService.updatePaymentStatus(payload.enrollmentId, payload.status, payload.reason, adminUser.email);`
         `return jsonResponse({ success: true, data: res });`

3. **`emisor.html`**:
   - En la Pestaña 2 (Inscripciones y Pagos) o en la sección de modales:
     - Crear el modal `#modal-payment-status`:
       - Título: "Gestionar Estado de Pago de Inscripción".
       - Campo oculto: `#payment-modal-enrollment-id`.
       - Detalles de solo lectura:
         - Participante: `<span id="payment-modal-participant-name"></span>`
         - Inscripción: `<code id="payment-modal-enrollment-code"></code>`
         - Estado actual: `<span id="payment-modal-current-status" class="badge"></span>`
       - Selector `<select id="payment-modal-new-status" class="form-control" required>` con opciones:
         - `Pagado` (Confirmar o mantener pago)
         - `Pendiente` (Revertir a pago pendiente)
         - `Anulado` (Operación anulada)
         - `Reembolsado` (Abono devuelto al participante)
       - Campo `<textarea id="payment-modal-reason" class="form-control" rows="3" placeholder="Indique detalladamente el motivo de la corrección o cambio de estado (ej: Voucher digitado por error, Reembolso solicitado por participante, etc.)" required></textarea>`
       - Pie del modal: botón "Cancelar" y botón principal `<button type="submit" class="btn btn-primary" id="btn-save-payment-status">Guardar Cambio de Estado</button>`.

4. **`js/admin.js`**:
   - En `renderEnrollmentsTable()`:
     - En la columna "Acción":
       - Reemplazar el texto estático `✓ Pagado` por una interfaz interactiva donde el directivo siempre pueda gestionar el pago:
         - Si `!isPaid`: botón verde `✓ Confirmar Pago` + botón `⚙ Cambiar Estado`.
         - Si `isPaid`: badge verde `✓ Pagado` + botón `⚙ Cambiar Estado` (o un botón unificado `⚙ Gestionar Pago`).
   - Métodos en `Admin`:
     - `openPaymentModal(enrollmentId, currentStatus, participantName)`:
       - Rellena los datos en el modal `#modal-payment-status`.
       - Limpia el motivo y preselecciona el estado actual.
       - Abre el modal.
     - `savePaymentStatusChange()`:
       - Lee `enrollmentId`, `newStatus`, `reason`.
       - Si `newStatus !== 'Pagado'` y `!reason.trim()`, alertar al usuario que el motivo es obligatorio.
       - Envía petición `Api.post('adminUpdatePaymentStatus', { enrollmentId, status: newStatus, reason: reason.trim() }, this.currentAuthToken)`.
       - Al tener éxito, notificar al usuario, cerrar el modal y recargar la tabla con `loadEnrollments()`.
   - Exponer en `window.CognitioAdmin`:
     - `openPaymentModal`, `savePaymentStatusChange`.

5. **`tests/unit/payment-transitions.test.js`**:
   - Crear suite de pruebas unitarias que verifique:
     1. Transición de Pendiente a Pagado asignando timestamp.
     2. Reversión de Pagado a Pendiente limpiando `Fecha_Pago` y preservando `Inscripcion_ID`.
     3. Transiciones a `Anulado` y `Reembolsado`.
     4. Obligatoriedad del motivo para reversiones o correcciones.
     5. Rechazo de estados no reconocidos.

Reportar en `.superpowers/sdd/task-3-report.md`.
