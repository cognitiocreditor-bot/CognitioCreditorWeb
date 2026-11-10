# DIRECTRICES DE CIBERSEGURIDAD Y PROTECCIÓN DE DATOS
## Círculo de Estudios COGNITIO CREDITOR

Este documento recopila las políticas técnicas implementadas para proteger la confidencialidad, integridad y disponibilidad del sistema.

---

## 1. Principio de Mínimo Privilegio en Google Drive y Sheets
- El archivo de Google Sheets que actúa como base de datos **nunca debe configurarse con enlace público de edición o lectura**.
- El acceso está restringido exclusivamente a la cuenta de Google que desplegó la Web App de Apps Script.
- Las plantillas PDF en Google Drive deben residir en una carpeta privada. El backend en Google Apps Script (`CertificateService.js`) actúa como custodio y sirve la plantilla únicamente a solicitudes que han demostrado autenticación o elegibilidad de emisión.

---

## 2. Prevención de Enumeración y Fuga de Información Personal
- **Doble Factor de Consulta**: Para consultar un certificado se requiere el DNI junto al **Código de Consulta** único generado al momento de la inscripción.
- **Mensajes Prudentes (Regla F)**: Cuando una búsqueda no arroja resultados, el sistema responde con un mensaje neutral que no revela si el DNI existe o no en los registros.
- **Minimización de Datos en Endpoints Públicos**: La operación pública `getPublicEvents` excluye expresamente identificadores de archivos de plantilla, enlaces administrativos y notas internas. El endpoint de consulta individual jamás retorna la lista de otros participantes ni estados de pago ajenos.

---

## 3. Autenticación y Autorización Administrativa Dinámica (RBAC)
- **Prohibición de Contraseñas Fijas en Frontend**: No existen contraseñas ni validaciones de rol simuladas en el código JavaScript del cliente.
- **Google Identity Services (OAuth2)**: Toda operación privilegiada (gestión de usuarios, modificar eventos, registrar participantes, cambiar estados de pago, emitir lotes físicos) exige el envío de un `id_token` firmado criptográficamente por Google.
- **Verificación en el Servidor**: El backend (`AuthService.js`) verifica el token contra `https://oauth2.googleapis.com/tokeninfo` o el validador nativo de Google y contrasta el correo contra la hoja relacional `Usuarios_Admin`.
- **Matriz de Control de Acceso Basada en Roles (RBAC)**:
  - **SuperAdmin (Nivel 3)**: Acceso total al sistema. Exclusivo para gestión de usuarios directivos (creación, edición de rol, revocación de cuentas), reconfiguración estructural de eventos y auditoría integral.
  - **Admin (Nivel 2)**: Creación y edición de eventos, configuración de cronogramas físicos, importación masiva en Excel, registro individual de participantes y transiciones de pago.
  - **Operador (Nivel 1)**: Consulta operativa de participantes, verificación y emisión de certificados individuales y en lote.
- **Resguardo Contra Bloqueo Total (Bootstrap Fallback)**:
  - En caso de una hoja `Usuarios_Admin` desierta o corrupta, `AuthService.js` evalúa los correos de emergencia declarados en `Config.BOOTSTRAP_SUPERADMIN_EMAILS` (`valentinbabiloniarodriguez@gmail.com`, `danielgarciaisern6c@gmail.com`, `cognitiocreditor@gmail.com`), asignándoles permisos de `SuperAdmin` de manera inmediata para restaurar la gobernanza.
  - Regla de auto-protección: Ningún `SuperAdmin` puede revocar su propia cuenta ni revocar al último `SuperAdmin` activo del sistema.
- **Gestión de Sesión Cliente Segura**:
  - El token de identidad se conserva exclusivamente en `sessionStorage` para permitir navegación fluida entre pestañas durante la sesión activa.
  - Al cerrar la pestaña o el navegador, la sesión expira automáticamente. En cada petición backend, el token se valida de nuevo contra Google y Google Sheets.

---

## 4. Gestión No Destructiva y Trazabilidad Inmutable de Pagos
- **Cero Eliminación de Datos**: Las operaciones de corrección o reversión de pago (`Pendiente`, `Anulado`, `Reembolsado`) modifican únicamente el campo `Estado_Pago` sin invocar en ningún caso `deleteRow()`. Las inscripciones y participantes permanecen protegidos.
- **Motivo Obligatorio de Reversión**: Para evitar modificaciones no autorizadas o descuidos operativos, cualquier transición hacia un estado distinto de `Pagado` exige un campo de justificación no vacío (`motivo`), el cual se consolida en la auditoría.
- **Revocación Inmediata de Descarga**: Cuando una inscripción pasa de `Pagado` a `Pendiente`, el campo `Fecha_Pago` se vacía automáticamente en Google Sheets, impidiendo al instante cualquier descarga de certificado en `index.html`.

---

## 5. Trazabilidad y Auditoría Forense (`Logs_Auditoria`)
- Todas las operaciones críticas de escritura administrativa quedan registradas de manera inmutable en la hoja `Logs_Auditoria` con:
  - Marca temporal en zona horaria oficial `America/Lima` (UTC-5).
  - Correo electrónico de Google del directivo responsable.
  - Código canónico de acción:
    - `LOGIN_ADMIN`: Inicio de sesión exitoso con rol asignado.
    - `GUARDAR_USUARIO_ADMIN`: Creación o modificación de rol de un administrador.
    - `REVOCAR_USUARIO_ADMIN`: Revocación del acceso a un directivo.
    - `CAMBIO_ESTADO_PAGO`: Transición de estado con anterior/nuevo estado y motivo justificado.
    - `REGISTRO_INDIVIDUAL_ADMIN`: Alta manual de participante con DNI y estado inicial.
    - `CREAR_EVENTO` / `EDITAR_EVENTO`: Configuración del evento y cronograma de entrega física.
    - `IMPORTAR_EXCEL`: Importación masiva por lotes con conteo de filas.
    - `GENERAR_LOTE`: Emisión masiva de certificados físicos/virtuales.
  - Identificador unívoco de la entidad afectada (`INS-xxxx`, `USR-xxxx`, `EVT-xxxx`).
  - Detalle textual descriptivo libre de contraseñas o datos financieros confidenciales.

---

## 6. Hardening de Aplicación y Mitigación de Vulnerabilidades Específicas

### 6.1 Blindaje RBAC en Capa de Entrada (SEC-01)
- Cada acción despachada en `backend/Code.js` (`adminSaveEvent`, `adminDeleteEvent`, `adminToggleEventStatus`, `adminSaveCertConfig`, `adminUpdatePaymentStatus`, `adminUpdateParticipant`, `adminRegisterParticipant`, `adminBatchImport`) ejecuta explícitamente:
  `if (!AuthService.hasPermission(adminUser.role, "Admin")) throw new Error(...)`
- Se garantiza el principio de defensa en profundidad: aún si un atacante manipula el frontend o efectúa peticiones HTTP directas al endpoint Apps Script con un token válido de rol `Operador`, las acciones mutativas de administración son rechazadas a nivel de backend.

### 6.2 Neutralización contra Inyección de Fórmulas / CSV Injection (SEC-02)
- En hojas de cálculo en la nube (Google Sheets), cualquier celda que inicie con `=`, `+`, `@` o `-` no numérico puede ser interpretada como comando o fórmula ejecutable.
- Para neutralizar este vector:
  - En backend (`Database.js -> sanitizeCellValue`): Todo texto que inicie con `=, +, @` o `-` no numérico es sanitizado anteponiendo un apóstrofe literal (`'`) antes de escribirse en Google Sheets mediante `insert`, `updateRow`, `insertBatch` o `updateCell`.
  - En frontend (`Validation.sanitizeFormula`): Se provee sanitización defensiva simétrica para formularios y validaciones cliente.
  - El campo DNI siempre se fuerza con formato de texto (`'07123456`) para resguardar ceros a la izquierda y prevenir conversiones numéricas destructivas.
