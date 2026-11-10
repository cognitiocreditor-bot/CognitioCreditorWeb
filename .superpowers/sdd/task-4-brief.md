# Task 4 Brief: Registro Individual Administrativo de Participantes (Backend y Frontend)

## Objetivo
Incorporar un formulario modal en el panel administrativo (`emisor.html`) que permita a los directivos registrar individualmente participantes en un evento, reutilizando las mismas validaciones canónicas que el sistema público, preservando 100% inalterado el importador masivo Excel (`batchImport` y SheetJS) y permitiendo definir el estado inicial de pago (`Pendiente` o `Pagado`).

## Requerimientos Específicos
1. **`backend/AdminService.js`**:
   - Implementar `registerIndividualParticipant(payload, adminEmail)`:
     - Bajo cerrojo atómico `Database.withLock(..., 25000)`.
     - Validar campos requeridos: `eventId`, `dni`, `nombreCompleto`.
     - Validar que el evento exista en `Eventos`.
     - Normalizar DNI (`cleanDNI = String(dni).trim().replace(/\D/g, '')`, padding a 8 dígitos). Validar que cumpla `^\d{8}$`.
     - Normalizar nombre: mayúsculas sin espacios redundantes.
     - Gestión del Participante:
       - Buscar en `Participantes` por DNI.
       - Si existe, reutilizar su `Participante_ID`.
       - Si no existe, crear nuevo registro:
         `Participante_ID = "PAR-" + Utilities.getUuid().substring(0, 8).toUpperCase()`
         `DNI = cleanDNI`
         `Nombre_Completo = cleanName`
         `Fecha_Registro = nowStr`
         `Estado_Registro = "Activo"`
         Insertar en `Participantes`.
     - Prevención de duplicados:
       - Buscar si ya existe inscripción con `Participante_ID === partId && Evento_ID === eventId && Estado_Inscripcion !== "Cancelada"`.
       - Si ya existe, retornar la inscripción existente con su `Codigo_Consulta` y mensaje: `"El participante ya se encontraba inscrito en este evento."` sin duplicar filas.
     - Si es nueva inscripción:
       - Generar `queryCode = "CC-" + Utilities.getUuid().substring(0, 6).toUpperCase()`.
       - Generar `enrollmentId = "INS-" + currentYear + "-" + Utilities.getUuid().substring(0, 6).toUpperCase()`.
       - Estado inicial de pago: `status = (initialPaymentStatus === "Pagado") ? "Pagado" : "Pendiente"`.
       - `Fecha_Pago`: Si es `Pagado`, `nowStr`; si es `Pendiente`, `""`.
       - Insertar en `Inscripciones`.
       - Registrar auditoría: `AuthService.logAudit(adminEmail, "REGISTRO_INDIVIDUAL_ADMIN", enrollmentId, 'DNI: ' + cleanDNI + ', Pago: ' + status)`.
       - Retornar `{ enrollmentId, participantId, queryCode, paymentStatus: status, isExisting: false }`.
   - **Regla Crítica**: No modificar ni reemplazar `batchImport`.

2. **`backend/Code.js`**:
   - En `doPost(e)`:
     - `action === "adminRegisterParticipant"`:
       - Invoca `AdminService.registerIndividualParticipant(payload, adminUser.email)`.
       - Retorna `{ success: true, data: res }`.

3. **`emisor.html`**:
   - En Pestaña 2 (`tab-enrollments`):
     - Agregar botón en la barra superior de inscripciones:
       `<button class="btn btn-success btn-sm" onclick="window.CognitioAdmin.openRegisterParticipantModal()">+ Registrar Participante Individual</button>`.
   - Crear el modal `#modal-admin-register-participant`:
     - Título: "Registrar Participante Individual".
     - Selector de Evento: `<select id="admin-reg-event-select" class="form-control" required></select>`.
     - Campo DNI: `<input type="text" id="admin-reg-dni" class="form-control" maxlength="8" required pattern="\d{8}" inputmode="numeric" placeholder="71234567">` con indicador reactivo `0/8`.
     - Campo Nombre Completo: `<input type="text" id="admin-reg-name" class="form-control" required placeholder="Nombres y apellidos completos">`.
     - Selector Tipo de Certificado: `<select id="admin-reg-cert-type" class="form-control"><option value="Virtual">Virtual (PDF descargable)</option><option value="Fisico">Físico (Entrega presencial)</option></select>`.
     - Selector Estado Inicial de Pago: `<select id="admin-reg-payment-status" class="form-control"><option value="Pendiente">Pendiente de Pago</option><option value="Pagado">Pagado (Confirmado en el acto)</option></select>`.
     - Campo Referencia / Voucher: `<input type="text" id="admin-reg-voucher" class="form-control" placeholder="Ej. OP-123456 o EFECTIVO">`.
     - Botón Cancelar y Botón `<button type="submit" class="btn btn-primary" id="btn-save-admin-register">Completar Registro</button>`.

4. **`js/admin.js`**:
   - `openRegisterParticipantModal()`:
     - Rellena `#admin-reg-event-select` con los eventos disponibles en `eventsCache`.
     - Preselecciona el evento actualmente filtrado si existe.
     - Limpia los campos del formulario.
     - Abre el modal `#modal-admin-register-participant`.
   - `saveIndividualParticipant()`:
     - Valida `Validation.isValidDNI(dni)` y `Validation.isValidFullName(name)`.
     - Despacha `Api.post('adminRegisterParticipant', payload, this.currentAuthToken)`.
     - Al tener éxito: muestra alerta con el `Codigo_Consulta` y el `Inscripcion_ID`, cierra el modal y recarga las inscripciones del evento seleccionado.
   - Exponer en `window.CognitioAdmin`:
     `openRegisterParticipantModal`, `saveIndividualParticipant`.

5. **`tests/unit/individual-registration.test.js`**:
   - Crear suite de pruebas unitarias que verifique:
     1. Normalización y padding de DNI con ceros a la izquierda.
     2. Creación de nuevo participante e inscripción.
     3. Reutilización de participante existente sin duplicar `Participante_ID`.
     4. Detección de duplicado exacto para el mismo evento.
     5. Registro con pago inicial `Pagado` asignando `Fecha_Pago`.
     6. Registro con pago inicial `Pendiente` dejando `Fecha_Pago` vacía.

Reportar en `.superpowers/sdd/task-4-report.md`.
