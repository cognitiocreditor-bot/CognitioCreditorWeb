# Plan de Implementación: Mejoras Integrales de COGNITIO CREDITOR

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar las cuatro mejoras auditadas y autorizadas (Autenticación RBAC dinámica, Gestión reversible de pagos, Registro individual administrativo y Cronograma de entrega física con descarga digital) sin alterar la lógica de generación digital ni el importador Excel masivo.

**Architecture:** Arquitectura serverless desacoplada con frontend SPA/MPA en HTML5/CSS3/ES6 nativo alojado estáticamente y backend en Google Apps Script (Web App RESTful) con persistencia en Google Sheets blindado con cerrojos atómicos (`LockService`). Se extiende el modelo de datos con la nueva hoja `Usuarios_Admin` y columnas de entrega física en `Eventos`, se introduce control de acceso por roles (RBAC) validando tokens de Google Identity Services y se actualiza el motor de evaluación de reglas de negocio para certificados.

**Tech Stack:** JavaScript (ES Modules), HTML5 semántico, CSS3 moderno, Google Apps Script, Google Sheets API, Google Identity Services (GIS OAuth2), pdf-lib + @pdf-lib/fontkit, SheetJS (xlsx), Node.js (test runner).

**Spec:** Contexto y requerimientos auditados en la Fase 0, contrastados con [`docs/architecture.md`](file:///c:/Users/USUARIO/PROYECTO%20COGNITIO/docs/architecture.md), [`docs/spreadsheet-schema.md`](file:///c:/Users/USUARIO/PROYECTO%20COGNITIO/docs/spreadsheet-schema.md), [`docs/security.md`](file:///c:/Users/USUARIO/PROYECTO%20COGNITIO/docs/security.md) y [`AGENTS.md`](file:///c:/Users/USUARIO/PROYECTO%20COGNITIO/AGENTS.md).

## Global Constraints

- Prohibido modificar o reemplazar el importador masivo SheetJS (`batchImport` y UI asociada).
- Prohibido cambiar la regla de descarga de certificados digitales (descarga habilitada a partir del día siguiente a la fecha del evento: `todayLimaStr > eventDate`).
- Los compradores de certificado físico también tienen derecho a descargar su certificado digital una vez concluido el evento.
- Prohibida la autenticación ficticia en cliente; cada acción administrativa protegida debe ser validada en el backend contrastando el ID token con Google y el rol en la base de datos.
- Prohibido eliminar registros de `Inscripciones` o `Participantes` al revertir o corregir pagos.
- No comenzar la implementación del Dashboard administrativo en esta fase.
- Preservar el formato de texto (`@`) para la columna DNI asegurando ceros iniciales en 8 dígitos.
- Todas las escrituras administrativas concurrentes deben estar protegidas mediante `Database.withLock`.

## Review Focus

1. **Reversión de pago a Pendiente:** Un participante que ya tenía su pago marcado como Pagado y se corrige a Pendiente debe ver bloqueada inmediatamente la descarga del certificado digital tanto en el portal público como en el endpoint `getTemplatePdf`.
2. **Entrega de certificado físico con evento en curso:** Un participante con certificado físico cuyo evento se realiza hoy o en el futuro debe recibir el mensaje de espera hasta el día siguiente al evento, pero visualizando ya las fechas y lugar de recojo programados.
3. **Protección contra orfandad de SuperAdmin:** El sistema debe impedir categóricamente revocar, desactivar o degradar al último `SuperAdmin` activo en `Usuarios_Admin`.
4. **Registro individual con DNI existente:** Si un alumno ya existe en `Participantes` por un evento anterior, el registro individual debe reutilizar su `Participante_ID` y generar una nueva `Inscripcion_ID` sin corromper sus inscripciones previas.
5. **Persistencia de sesión en F5:** Al recargar la página `emisor.html`, el directivo debe mantenerse autenticado mediante el token temporal almacenado en `sessionStorage`, validando sus permisos sin requerir pulsar nuevamente el botón de Google.

---

### Task 1: Esquema de Base de Datos y Módulo de Autenticación Dinámica RBAC (Backend)

**Files:**
- Modify: `backend/Config.js:1-31`
- Modify: `backend/SetupDatabase.js:15-115`
- Modify: `backend/AuthService.js:1-64`
- Modify: `backend/AdminService.js:1-50`
- Modify: `backend/Code.js:54-135`
- Test: `tests/unit/rbac-auth.test.js`

**Interfaces:**
- Consumes: `UrlFetchApp` (Google tokeninfo), `Database.getAll`, `Database.insert`, `Database.updateRow`.
- Produces:
  - `AuthService.verifyToken(idToken, requiredRole = null)`: `{ email: string, name: string, role: string, authorized: boolean }`
  - `AdminService.getAdminUsers()`: `Array<AdminUser>`
  - `AdminService.saveAdminUser(payload, actorEmail)`: `AdminUser`
  - `AdminService.revokeAdminUser(userId, actorEmail)`: `{ success: boolean, userId: string }`
  - Endpoints: `adminGetUsers`, `adminSaveUser`, `adminRevokeUser`.

- [ ] **Step 1: Escribir la prueba unitaria de RBAC y jerarquía de permisos**

Crear archivo `tests/unit/rbac-auth.test.js` que pruebe la función pura de verificación de roles y jerarquía:
```javascript
// tests/unit/rbac-auth.test.js
import { assert } from './test-helper.js';

const ROLES = {
  SUPERADMIN: 'SuperAdmin',
  ADMIN: 'Admin',
  OPERADOR: 'Operador'
};

const ROLE_HIERARCHY = {
  SuperAdmin: 3,
  Admin: 2,
  Operador: 1
};

function hasRolePermission(userRole, requiredRole) {
  if (!userRole || !ROLE_HIERARCHY[userRole]) return false;
  if (!requiredRole) return true;
  return ROLE_HIERARCHY[userRole] >= (ROLE_HIERARCHY[requiredRole] || 99);
}

// Tests
assert(hasRolePermission('SuperAdmin', 'SuperAdmin') === true, 'SuperAdmin cumple permiso SuperAdmin');
assert(hasRolePermission('SuperAdmin', 'Admin') === true, 'SuperAdmin cumple permiso Admin');
assert(hasRolePermission('SuperAdmin', 'Operador') === true, 'SuperAdmin cumple permiso Operador');
assert(hasRolePermission('Admin', 'SuperAdmin') === false, 'Admin no cumple permiso SuperAdmin');
assert(hasRolePermission('Admin', 'Operador') === true, 'Admin cumple permiso Operador');
assert(hasRolePermission('Operador', 'Admin') === false, 'Operador no cumple permiso Admin');
assert(hasRolePermission('Invalido', 'Operador') === false, 'Rol desconocido rechazado');
```

- [ ] **Step 2: Ejecutar la prueba para verificar su comportamiento**

Run: `node tests/unit/rbac-auth.test.js`  
Expected: PASS o FAIL si no existe el helper. Crear el archivo `tests/unit/test-helper.js` con el helper de aserción estándar si no existe.

- [ ] **Step 3: Actualizar `backend/Config.js`**

Agregar el nombre de hoja `SHEETS.USUARIOS_ADMIN: "Usuarios_Admin"` y la lista de respaldo `BOOTSTRAP_SUPERADMINS` con los 3 correos aprobados:
```javascript
  SHEETS: {
    EVENTOS: "Eventos",
    PARTICIPANTES: "Participantes",
    INSCRIPCIONES: "Inscripciones",
    CONFIG_CERT: "Configuracion_Certificados",
    AUDITORIA: "Logs_Auditoria",
    USUARIOS_ADMIN: "Usuarios_Admin"
  },
  BOOTSTRAP_SUPERADMINS: [
    "valentinbabiloniarodriguez@gmail.com",
    "danielgarciaisern6c@gmail.com",
    "cognitiocreditor@gmail.com"
  ],
  ROLES: {
    SUPERADMIN: "SuperAdmin",
    ADMIN: "Admin",
    OPERADOR: "Operador"
  }
```

- [ ] **Step 4: Actualizar `backend/SetupDatabase.js`**

Añadir la definición de la hoja `Usuarios_Admin` con sus cabeceras, formato texto en `Usuario_ID`, `Email`, `Rol`, y validación desplegable para `Rol` (`["SuperAdmin", "Admin", "Operador"]`) y `Estado` (`["Activo", "Inactivo"]`).  
Asimismo, agregar las columnas de entrega física en la definición de `Eventos`: `Fecha_Entrega_Fisica`, `Lugar_Entrega_Fisica`, `Horario_Entrega_Fisica`.

- [ ] **Step 5: Implementar verificación dinámica y RBAC en `backend/AuthService.js`**

1. `verifyToken(idToken, requiredRole = null)`:
   - Valida el token con `https://oauth2.googleapis.com/tokeninfo?id_token=...`.
   - Consulta la hoja `Usuarios_Admin`.
   - Si la hoja está vacía o el correo figura en `BOOTSTRAP_SUPERADMINS`, auto-asigna `SuperAdmin`.
   - Si existe en la hoja, verifica que `Estado === "Activo"`.
   - Evalúa `hasRolePermission(user.Rol, requiredRole)`. Si no cumple, lanza error de autorización.
   - Actualiza `Ultimo_Acceso` del usuario.
   - Retorna `{ email, name, role, authorized: true }`.

- [ ] **Step 6: Implementar CRUD administrativo de usuarios en `backend/AdminService.js` y `backend/Code.js`**

1. `getAdminUsers(actorEmail)`: Retorna la lista de usuarios de la hoja `Usuarios_Admin`.
2. `saveAdminUser(payload, actorEmail)`: Crea o actualiza un directivo (valida que el actor sea `SuperAdmin`).
3. `revokeAdminUser(userId, actorEmail)`: Desactiva a un directivo (impide desactivar si es el único `SuperAdmin` activo).
4. En `backend/Code.js`: Enlazar `action === "adminGetUsers"`, `action === "adminSaveUser"`, `action === "adminRevokeUser"` exigiendo permisos de `SuperAdmin`.

- [ ] **Step 7: Verificar ejecución de pruebas unitarias de RBAC**

Run: `node tests/unit/rbac-auth.test.js`  
Expected: PASS sin errores.

---

### Task 2: Gestión de Usuarios y Directiva en Panel Administrativo (Frontend)

**Files:**
- Modify: `emisor.html:70-130, 200-240, 400-440`
- Modify: `js/admin.js:10-140, 700-888`
- Modify: `css/styles.css:1-100`

**Interfaces:**
- Consumes: `Api.post('adminAuthenticate')`, `Api.post('adminGetUsers')`, `Api.post('adminSaveUser')`, `Api.post('adminRevokeUser')`.
- Produces:
  - `Admin.currentAdminRole`: string (`SuperAdmin`, `Admin`, `Operador`)
  - `Admin.loadAdminUsers()`
  - `Admin.openNewUserModal()`, `Admin.editUserRole(id)`, `Admin.revokeUser(id)`
  - Pestaña `#tab-users` y modal `#modal-admin-user`.

- [ ] **Step 1: Agregar soporte de persistencia de sesión en `sessionStorage` en `js/admin.js`**

En `Admin.handleGoogleCredentialResponse` y `Admin.init`:
- Guardar `sessionStorage.setItem('cognitio_admin_token', token)` tras login exitoso.
- Guardar `sessionStorage.setItem('cognitio_admin_role', role)`.
- En `Admin.init()`: Si existe token en `sessionStorage`, ejecutar `Api.post('adminAuthenticate', {}, savedToken)` en segundo plano para restaurar sesión automáticamente en F5 sin pedir click al usuario.
- En `Admin.logout()`: Limpiar `sessionStorage.removeItem('cognitio_admin_token')` y `cognitio_admin_role`.

- [ ] **Step 2: Agregar interfaz de la Pestaña 6 (Directiva y Usuarios) en `emisor.html`**

1. En `<nav class="admin-nav">`:
   ```html
   <button class="admin-tab-btn" id="tab-btn-users" data-target="tab-users" style="display: none;">6. Directiva y Permisos</button>
   ```
2. Añadir la sección `<div id="tab-users" class="admin-tab-content">` con tabla de directivos, botón "+ Registrar Directivo" y filtros de estado.
3. Añadir el modal `#modal-admin-user` para registrar/editar correo de Google, nombre y selector de rol (`SuperAdmin`, `Admin`, `Operador`).

- [ ] **Step 3: Implementar la lógica cliente en `js/admin.js`**

1. `Admin.loadAdminUsers()`: invoca `Api.post('adminGetUsers', {}, token)` y renderiza la tabla con badges de rol y botones de acción.
2. `Admin.openNewUserModal()` y `Admin.saveUser()`: valida email con `Validation.isValidEmail`, envía payload al backend y recarga la tabla.
3. `Admin.revokeUser(userId)`: solicita confirmación y despacha `adminRevokeUser`.
4. Control de visibilidad por rol: Si `currentAdminRole === 'SuperAdmin'`, mostrar botón de pestaña directiva; si es `Operador`, deshabilitar botones de borrado de eventos y configuración de plantillas.

- [ ] **Step 4: Verificar visualmente y mediante pruebas la sesión persistente y el control de directiva**

Comprobar en navegador o prueba de scripts que las funciones de administración de usuarios y persistencia de token operan correctamente.

---

### Task 3: Gestión Reversible de Estados de Pago (Backend y Frontend)

**Files:**
- Modify: `backend/AdminService.js:40-65`
- Modify: `backend/Code.js:96-100`
- Modify: `emisor.html:112-130, 360-398`
- Modify: `js/admin.js:400-478`
- Test: `tests/unit/payment-transitions.test.js`

**Interfaces:**
- Consumes: `Database.withLock`, `Database.updateRow`, `AuthService.logAudit`.
- Produces:
  - `AdminService.updatePaymentStatus(enrollmentId, status, reason, adminEmail)`
  - Modal `#modal-payment-status` en `emisor.html`
  - `Admin.openPaymentModal(enrollmentId, currentStatus, participantName)`
  - `Admin.savePaymentStatusChange()`

- [ ] **Step 1: Escribir la prueba unitaria de transiciones de pago y consistencia**

Crear archivo `tests/unit/payment-transitions.test.js`:
```javascript
import { assert } from './test-helper.js';

function processPaymentTransition(currentRecord, newStatus, reason, nowLimaStr) {
  const ALLOWED_STATUSES = ['Pendiente', 'Pagado', 'Anulado', 'Reembolsado'];
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error('Estado de pago no permitido: ' + newStatus);
  }
  if (!reason || !reason.trim()) {
    throw new Error('Se requiere un motivo obligatorio para la corrección de pago.');
  }

  const updated = { ...currentRecord, Estado_Pago: newStatus };
  if (newStatus === 'Pagado') {
    updated.Fecha_Pago = nowLimaStr;
  } else if (newStatus === 'Pendiente') {
    updated.Fecha_Pago = ''; // Limpiar fecha de pago
  }
  // En Anulado o Reembolsado se conserva historial o se marca según política
  return updated;
}

// Tests
const baseRecord = {
  Inscripcion_ID: 'INS-2026-0001',
  Estado_Pago: 'Pendiente',
  Fecha_Pago: ''
};

// 1. Transición normal a Pagado
const paid = processPaymentTransition(baseRecord, 'Pagado', 'Voucher validado BCP', '2026-11-09 10:00:00');
assert(paid.Estado_Pago === 'Pagado', 'Estado cambiado a Pagado');
assert(paid.Fecha_Pago === '2026-11-09 10:00:00', 'Fecha_Pago asignada al pagar');

// 2. Reversión a Pendiente (corrección de error)
const reverted = processPaymentTransition(paid, 'Pendiente', 'Error en voucher digitado', '2026-11-09 11:00:00');
assert(reverted.Estado_Pago === 'Pendiente', 'Estado revertido a Pendiente');
assert(reverted.Fecha_Pago === '', 'Fecha_Pago vaciada al revertir a Pendiente');
assert(reverted.Inscripcion_ID === 'INS-2026-0001', 'Inscripción preservada intacta');

// 3. Rechazo de transición sin motivo
let threw = false;
try {
  processPaymentTransition(paid, 'Pendiente', '', '2026-11-09 11:00:00');
} catch (e) {
  threw = true;
}
assert(threw === true, 'Transición rechazada si motivo está vacío');
```

- [ ] **Step 2: Ejecutar la prueba unitaria**

Run: `node tests/unit/payment-transitions.test.js`  
Expected: PASS.

- [ ] **Step 3: Actualizar `backend/AdminService.js` para soportar reversión con motivo**

Modificar `updatePaymentStatus(enrollmentId, status, reason, adminEmail)`:
- Validar que `status` pertenezca a `["Pendiente", "Pagado", "Anulado", "Reembolsado"]`.
- Si `status === "Pagado"`, asignar `Fecha_Pago: todayStr`.
- Si `status === "Pendiente"`, vaciar `Fecha_Pago: ""`.
- Conservar los campos `Inscripcion_ID`, `Participante_ID`, `Codigo_Consulta` sin alterar.
- Registrar auditoría: `AuthService.logAudit(adminEmail, "CAMBIO_ESTADO_PAGO", enrollmentId, 'De ' + target.Estado_Pago + ' a ' + status + '. Motivo: ' + reason)`.

- [ ] **Step 4: Implementar modal y disparador de gestión de pago en `emisor.html` y `js/admin.js`**

1. En `emisor.html`: Agregar el modal `#modal-payment-status`:
   - Muestra ID de inscripción, DNI, nombre del alumno y estado actual.
   - Selector `<select id="payment-status-select">` con opciones: `Pagado`, `Pendiente`, `Anulado`, `Reembolsado`.
   - Área de texto `<textarea id="payment-reason-input" required>` para justificación obligatoria.
2. En `js/admin.js` (`renderEnrollmentsTable`):
   - Reemplazar el texto estático `✓ Pagado` por un botón o menú interactivo:  
     `<button class="btn btn-outline btn-sm" onclick="window.CognitioAdmin.openPaymentModal('${ins.Inscripcion_ID}', '${ins.Estado_Pago}', '${Validation.escapeHTML(ins.Nombre_Completo)}')">⚙ Gestionar Pago</button>`.
3. Implementar `Admin.savePaymentStatusChange()`: Valida motivo, despacha a backend y recarga la tabla de inscripciones.

- [ ] **Step 5: Ejecutar pruebas y verificar no-destrucción de inscripciones**

Run: `node tests/unit/payment-transitions.test.js`  
Expected: PASS.

---

### Task 4: Registro Individual Administrativo de Participantes (Backend y Frontend)

**Files:**
- Modify: `backend/AdminService.js:70-130`
- Modify: `backend/Code.js:100-115`
- Modify: `emisor.html:115-130, 395-430`
- Modify: `js/admin.js:400-470`
- Test: `tests/unit/individual-registration.test.js`

**Interfaces:**
- Consumes: `Database.withLock`, `Database.insert`, `Validation.normalizeDNI`, `Validation.normalizeName`.
- Produces:
  - `AdminService.registerIndividualParticipant(payload, adminEmail)`: `{ enrollmentId, participantId, queryCode, paymentStatus }`
  - Modal `#modal-admin-register-participant` en `emisor.html`
  - `Admin.openRegisterParticipantModal()`, `Admin.saveIndividualParticipant()`
  - Integridad: 0 modificaciones a `batchImport` ni a SheetJS.

- [ ] **Step 1: Escribir la prueba unitaria de registro individual y prevención de duplicados**

Crear archivo `tests/unit/individual-registration.test.js`:
```javascript
import { assert } from './test-helper.js';

function validateAndPrepareIndividualRegistration(payload, existingParticipants, existingEnrollments) {
  const { eventId, dni, fullName, certType, initialPaymentStatus, voucherRef } = payload;
  
  if (!eventId || !dni || !fullName) {
    throw new Error('Faltan campos obligatorios para el registro.');
  }

  let cleanDni = String(dni).trim().replace(/\D/g, '');
  if (cleanDni.length <= 8) cleanDni = cleanDni.padStart(8, '0');
  if (cleanDni.length !== 8) throw new Error('DNI inválido');

  // Buscar participante existente
  let part = existingParticipants.find(p => p.DNI === cleanDni);
  let participantId = part ? part.Participante_ID : 'PAR-NEW001';

  // Verificar si ya está inscrito
  const duplicate = existingEnrollments.find(e => e.Participante_ID === participantId && e.Evento_ID === eventId);
  if (duplicate) {
    return { isDuplicate: true, enrollmentId: duplicate.Inscripcion_ID, code: duplicate.Codigo_Consulta };
  }

  return {
    isDuplicate: false,
    participantId,
    cleanDni,
    cleanName: fullName.trim().toUpperCase(),
    certType: certType === 'Fisico' ? 'Fisico' : 'Virtual',
    paymentStatus: initialPaymentStatus === 'Pagado' ? 'Pagado' : 'Pendiente'
  };
}

// Tests
const mockParts = [{ Participante_ID: 'PAR-0001', DNI: '71234567', Nombre_Completo: 'JUAN PEREZ' }];
const mockEnrolls = [{ Inscripcion_ID: 'INS-001', Participante_ID: 'PAR-0001', Evento_ID: 'EVT-2026-001', Codigo_Consulta: 'CC-123456' }];

// 1. Registro nuevo exitoso
const res1 = validateAndPrepareIndividualRegistration({
  eventId: 'EVT-2026-001',
  dni: '45678901',
  fullName: 'Maria Rodriguez',
  certType: 'Virtual',
  initialPaymentStatus: 'Pagado'
}, mockParts, mockEnrolls);
assert(res1.isDuplicate === false, 'Registro nuevo detectado');
assert(res1.cleanDni === '45678901', 'DNI limpio');
assert(res1.paymentStatus === 'Pagado', 'Pago inicial Pagado respetado');

// 2. Detección de duplicado existente
const res2 = validateAndPrepareIndividualRegistration({
  eventId: 'EVT-2026-001',
  dni: '71234567',
  fullName: 'Juan Perez',
  certType: 'Virtual',
  initialPaymentStatus: 'Pendiente'
}, mockParts, mockEnrolls);
assert(res2.isDuplicate === true, 'Duplicado detectado');
assert(res2.code === 'CC-123456', 'Código existente recuperado');
```

- [ ] **Step 2: Ejecutar la prueba unitaria**

Run: `node tests/unit/individual-registration.test.js`  
Expected: PASS.

- [ ] **Step 3: Implementar `registerIndividualParticipant` en `backend/AdminService.js`**

Implementar el método bajo cerrojo atómico `Database.withLock`:
- Normalizar DNI (`cleanDNI.padStart(8, '0')`).
- Buscar en `Participantes` o crear nuevo registro `PAR-XXXXXXXX`.
- Verificar duplicados en `Inscripciones` para el mismo `Evento_ID`.
- Generar `Codigo_Consulta` (`CC-XXXXXX`) e `Inscripcion_ID` (`INS-YYYY-XXXXXX`).
- Establecer `Estado_Pago` según el selector (`Pagado` o `Pendiente`) y `Fecha_Pago` correspondiente.
- Insertar en `Inscripciones`.
- Registrar auditoría: `AuthService.logAudit(adminEmail, "REGISTRO_INDIVIDUAL_ADMIN", enrollmentId, 'DNI: ' + cleanDNI + ', Pago: ' + paymentStatus)`.
- Retornar `{ enrollmentId, participantId, queryCode, paymentStatus }`.

- [ ] **Step 4: Enlazar en `backend/Code.js`**

Añadir el enrutamiento para `action === "adminRegisterParticipant"`, validando rol directivo mínimo (`Operador`).

- [ ] **Step 5: Añadir modal y botón en `emisor.html` y `js/admin.js`**

1. En `emisor.html` (Pestaña 2): Agregar botón `<button class="btn btn-success btn-sm" onclick="window.CognitioAdmin.openRegisterParticipantModal()">+ Registrar Participante Individual</button>`.
2. Crear modal `#modal-admin-register-participant` con:
   - Selector de Evento de Destino.
   - DNI con contador reactivo `0/8`.
   - Nombres y Apellidos Completos.
   - Selector de Tipo de Certificado (`Virtual` / `Fisico`).
   - Selector de Estado de Pago Inicial (`Pendiente` / `Pagado`).
   - Referencia / Voucher (opcional).
3. En `js/admin.js`: Implementar `openRegisterParticipantModal()` y `saveIndividualParticipant()`. Al guardar con éxito, cerrar modal, notificar el código generado y refrescar la tabla de inscripciones.

- [ ] **Step 6: Verificar que el importador Excel no haya sido alterado**

Ejecutar comprobación de código asegurando que `batchImport` y `handleExcelFileSelect` se mantengan exactamente iguales.

---

### Task 5: Cronograma de Entrega Física y Descarga Digital Unificada (Backend y Frontend)

**Files:**
- Modify: `backend/EventService.js:80-150`
- Modify: `backend/CertificateService.js:80-125`
- Modify: `emisor.html:215-275`
- Modify: `js/admin.js:280-360`
- Modify: `index.html:260-315`
- Modify: `js/certificates.js:120-215`
- Test: `tests/unit/business-rules.test.js`

**Interfaces:**
- Consumes: `Eventos.Fecha_Entrega_Fisica`, `Eventos.Lugar_Entrega_Fisica`, `Eventos.Horario_Entrega_Fisica`.
- Produces:
  - `CertificateService.query`: respuesta con `Elegible_Emision = true` para `Fisico` si el evento concluyó, acompañada del objeto `Entrega_Fisica`.
  - Campos de entrega física en el modal `#modal-event` de `emisor.html`.
  - Visualización dual en `index.html` (botón de descarga PDF + tarjeta de cronograma de entrega presencial).

- [ ] **Step 1: Actualizar la prueba de reglas de negocio en `tests/unit/business-rules.test.js`**

Modificar `evaluateBusinessRules` en `tests/unit/business-rules.test.js` para validar la nueva lógica unificada:
```javascript
// Caso 4: Regla C + D (Certificado físico pagado y evento concluido)
// AHORA ES ELEGIBLE PARA DESCARGAR DIGITALMENTE Y RECIBE CRONOGRAMA FÍSICO
const resC = evaluateBusinessRules({
  eventStatus: 'Finalizado',
  eventDate: '2026-10-10',
  paymentStatus: 'Pagado',
  certType: 'Fisico',
  todayLimaStr: today
});
assert(resC.elegible === true, 'Participante físico pagado puede descargar certificado digital tras concluir el evento');
assert(resC.rule === 'REGLA_C_FISICO_Y_DIGITAL', 'Código de regla es REGLA_C_FISICO_Y_DIGITAL');
```

- [ ] **Step 2: Ejecutar la prueba unitaria para verificar que detecte el cambio**

Run: `node tests/unit/business-rules.test.js`  
Expected: PASS tras actualizar la función pura de prueba.

- [ ] **Step 3: Actualizar `backend/EventService.js`**

En `saveEvent`:
- Guardar `Fecha_Entrega_Fisica`, `Lugar_Entrega_Fisica` y `Horario_Entrega_Fisica` en la hoja `Eventos`.
- En `getPublicEvents` y `getAllEventsAdmin`, incluir estos tres campos para el consumo del frontend.

- [ ] **Step 4: Actualizar `backend/CertificateService.js`**

Modificar `query(dni, queryCode)`:
- Si `ins.Estado_Pago === "Pagado"`:
  - Evaluar si el evento ya concluyó (`todayLimaStr > eventDate`).
  - Si concluyó:
    - `elegibleEmision = true`.
    - Si `ins.Tipo_Certificado === "Fisico"`:
      - `codigoRegla = "REGLA_C_FISICO_Y_DIGITAL"`.
      - `mensajeRegla = "Certificado digital listo para descargar. Además, revisa el cronograma de entrega física."`.
      - Adjuntar datos de entrega:
        ```javascript
        entregaFisica: {
          fechas: evt.Fecha_Entrega_Fisica || "Por coordinar con la directiva",
          lugar: evt.Lugar_Entrega_Fisica || "FACEN - UNAP",
          horario: evt.Horario_Entrega_Fisica || "En horario académico"
        }
        ```
    - Si `ins.Tipo_Certificado === "Virtual"`:
      - `codigoRegla = "REGLA_D_VIRTUAL_LISTO"`.
      - `mensajeRegla = "Certificado listo para generar y descargar."`.
  - Si el evento no ha concluido (`todayLimaStr <= eventDate`):
    - `elegibleEmision = false`.
    - `codigoRegla = "REGLA_B_FUTURO"`.
    - Si es físico, incluir de todas formas las fechas de entrega física programadas.

- [ ] **Step 5: Actualizar formulario de eventos en `emisor.html` y `js/admin.js`**

1. En `emisor.html` (`#modal-event`): Añadir sección "Entrega de Certificados Físicos":
   - `<input type="text" id="event-form-physical-dates" class="form-control" placeholder="Ej. Del 25 al 28 de Noviembre de 2026">`
   - `<input type="text" id="event-form-physical-place" class="form-control" placeholder="Ej. Oficina FACEN - UNAP, 2do Piso">`
   - `<input type="text" id="event-form-physical-time" class="form-control" placeholder="Ej. 09:00 a 13:00 y 15:00 a 18:00 hrs">`
2. En `js/admin.js`: Rellenar estos campos en `editEvent()` y enviarlos en el payload de `saveEvent()`.

- [ ] **Step 6: Actualizar visualización en `js/certificates.js`**

En `renderResults(records)`:
- Si `rec.Codigo_Regla === 'REGLA_C_FISICO_Y_DIGITAL'` o `rec.Tipo_Certificado === 'Fisico'`:
  - Renderizar tarjeta destacada de **Entrega Física Programada** con fechas, lugar y horario.
  - Si `rec.Elegible_Emision === true`, renderizar **además** el botón oficial:  
    `📥 Descargar Certificado Oficial en PDF (Copia Digital)`.

- [ ] **Step 7: Ejecutar suite de pruebas de reglas de negocio**

Run: `node tests/unit/business-rules.test.js`  
Expected: PASS (12/12 o superior).

---

### Task 6: Verificación Integral, Pruebas Automatizadas y Documentación

**Files:**
- Modify: `docs/spreadsheet-schema.md`
- Modify: `docs/architecture.md`
- Modify: `docs/security.md`
- Test: `tests/unit/business-rules.test.js`
- Test: `tests/unit/validation.test.js`
- Test: `tests/unit/rbac-auth.test.js`
- Test: `tests/unit/payment-transitions.test.js`
- Test: `tests/unit/individual-registration.test.js`

- [ ] **Step 1: Ejecutar todas las pruebas unitarias automatizadas**

Run:
```bash
node tests/unit/business-rules.test.js
node tests/unit/validation.test.js
node tests/unit/rbac-auth.test.js
node tests/unit/payment-transitions.test.js
node tests/unit/individual-registration.test.js
```
Expected: Todas las pruebas en estado PASS.

- [ ] **Step 2: Actualizar `docs/spreadsheet-schema.md`**

Documentar la nueva hoja `Usuarios_Admin` y las columnas agregadas a la hoja `Eventos` (`Fecha_Entrega_Fisica`, `Lugar_Entrega_Fisica`, `Horario_Entrega_Fisica`).

- [ ] **Step 3: Actualizar `docs/architecture.md` y `docs/security.md`**

Incorporar los ADR correspondientes al RBAC dinámico en Google Sheets y a la gestión reversible de pagos con auditoría.

- [ ] **Step 4: Confirmación de no regresión en importador Excel**

Verificar que la importación masiva mediante Excel con SheetJS funcione de forma íntegra e independiente.
