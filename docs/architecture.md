# REGISTRO DE DECISIONES DE ARQUITECTURA (ADR)
## Círculo de Estudios COGNITIO CREDITOR

Este documento recopila las decisiones de ingeniería de software, justificaciones y compensaciones (trade-offs) adoptadas para la plataforma.

---

## ADR-001: Despliegue de Frontend Estático en GitHub Pages / Cloudflare Pages
- **Estado**: Aprobado por el Propietario.
- **Contexto**: Se requiere una plataforma pública accesible, de alta disponibilidad, sin costos de servidor y sin mantenimiento de infraestructura compleja.
- **Decisión**: Utilizar una arquitectura Single/Multi-Page basada en HTML5 semántico, CSS3 moderno y módulos nativos de JavaScript (ES Modules), alojada en un proveedor de páginas estáticas gratuito (GitHub Pages / Cloudflare Pages).
- **Consecuencias**: Costo recurrente cero, despliegue continuo mediante Git, desacoplamiento absoluto del backend y seguridad inherente contra ataques del lado del servidor.

---

## ADR-002: Backend Serverless en Google Apps Script con Google Sheets
- **Estado**: Aprobado por el Propietario.
- **Contexto**: La directiva del Círculo gestiona sus actividades en el ecosistema de Google Workspace (Drive, Sheets). Se requiere persistencia confiable sin incurrir en cuotas de bases de datos tradicionales.
- **Decisión**: Implementar un backend en Google Apps Script publicado como Web App, actuando como API RESTful (endpoints `doGet` y `doPost`), con Google Sheets como motor de persistencia relacional.
- **Consecuencias**: Integración nativa con Google Drive para plantillas PDF, sin costos de base de datos, administración directa desde hojas de cálculo por parte de la directiva y control granular de cuotas diarias.

---

## ADR-003: Autenticación Administrativa mediante Google Identity Services (GIS OAuth2)
- **Estado**: Aprobado por el Propietario.
- **Contexto**: El panel administrativo `emisor.html` requiere restringir el acceso exclusivamente a los miembros autorizados de la directiva, impidiendo accesos mediante credenciales fijas o validaciones cliente falsas.
- **Decisión**: Emplear el SDK oficial de Google Identity Services en el cliente para obtener un `id_token` o credencial OAuth2 firmada por Google. El backend de Google Apps Script valida la identidad contra el endpoint de verificación de Google y contrasta el correo electrónico contra la lista de administradores autorizados.
- **Consecuencias**: Máxima seguridad sin gestionar contraseñas locales ni almacenes de hashes. Autenticación delegada a Google con revocación inmediata.

---

## ADR-004: Factor Doble de Consulta de Certificados (DNI + Código de Consulta)
- **Estado**: Aprobado por el Propietario.
- **Contexto**: El DNI por sí solo es susceptible de ataques de enumeración (adivinación masiva de participantes y estados de pago).
- **Decisión**: La consulta pública exige el DNI del participante acompañado de su **Código de Consulta** único (asignado al momento de la inscripción). Se mantiene un fallback de interfaz prudente en caso de consultas donde el participante requiera asistencia.
- **Consecuencias**: Protección rigurosa de datos personales y cumplimiento con la Ley de Protección de Datos Personales (Ley N° 29733 de Perú).

---

## ADR-005: Motor Cliente de Generación de Certificados con `pdf-lib` y `fontkit`
- **Estado**: Aprobado por el Propietario.
- **Contexto**: Generar cientos de PDFs en Google Apps Script superaría el límite de tiempo de ejecución (timeout de 6 minutos de Google Apps Script) y la cuota de memoria.
- **Decisión**: Delegar la maquetación e inyección tipográfica al navegador del cliente utilizando `pdf-lib` y `@pdf-lib/fontkit`. El backend únicamente suministra la plantilla base (PDF vectorial) y las coordenadas autorizadas.
- **Consecuencias**:
  - Tiempo de generación casi instantáneo para el participante.
  - Generación masiva de hasta cientos de certificados en `emisor.html` sin sobrecargar las cuotas de Google.
  - Conservación íntegra de la fidelidad vectorial, dimensiones y calidad del PDF original.

---

## ADR-006: Autenticación Dinámica RBAC en Google Sheets y Bootstrap SuperAdmin
- **Estado**: Aprobado por el Propietario.
- **Contexto**: La lista fija de administradores codificada en código fuente (`Config.ADMIN_EMAILS`) generaba rigidez operativa, obligaba a redespliegues de la Web App ante cambios en la directiva y carecía de granularidad de roles.
- **Decisión**: Implementar una hoja de persistencia `Usuarios_Admin` con jerarquía de 3 roles (`SuperAdmin`, `Admin`, `Operador`) evaluada en backend por `AuthService.js` en cada operación sensible. Para evitar bloqueos permanentes (lockout) por tablas vacías o desconfiguradas, se incorporó un mecanismo inmutable de bootstrap que reconoce a 3 correos fundadores como `SuperAdmin` de contingencia.
- **Consecuencias**:
  - Gestión dinámica y en tiempo real de directivos desde el panel administrativo `emisor.html`.
  - Verificación estricta en cada petición HTTP protegida (cero seguridad simulada por CSS/JS).
  - Regla de resguardo: ningún SuperAdmin puede revocar su propia cuenta ni al último SuperAdmin activo.

---

## ADR-007: Gestión Reversible y Auditable de Estados de Pago
- **Estado**: Aprobado por el Propietario.
- **Contexto**: Los errores humanos al registrar vouchers o pagos erróneos eran irreversibles o conllevaban la eliminación manual de filas en Sheets, con riesgo de pérdida de integridad referencial.
- **Decisión**: Diseñar una máquina de estados de pago soportada en `AdminService.updatePaymentStatus` que permite transiciones entre `Pendiente`, `Pagado`, `Anulado` y `Reembolsado`. Toda transición hacia un estado distinto de `Pagado` exige obligatoriamente un motivo justificado y queda registrada de forma inmutable en `Logs_Auditoria`.
- **Consecuencias**:
  - Operaciones 100% no destructivas: nunca se eliminan registros de `Inscripciones` ni `Participantes`.
  - Al revertir de `Pagado` a `Pendiente`, el campo `Fecha_Pago` se vacía automáticamente para revocar la elegibilidad de descarga digital.
  - Auditoría forense completa con responsable, timestamp y motivo de cambio.

---

## ADR-008: Cronograma de Entrega Física y Descarga Digital Unificada para Participantes Físicos
- **Estado**: Aprobado por el Propietario.
- **Contexto**: Los participantes que adquieren certificados físicos recibían confirmación pero desconocían cuándo y dónde recogerlos. Además, existía ambigüedad sobre si tenían derecho a la descarga digital antes o después de la entrega física.
- **Decisión**:
  1. Extender el esquema de `Eventos` con columnas `Fecha_Entrega_Fisica`, `Lugar_Entrega_Fisica` y `Horario_Entrega_Fisica`, configurables desde el modal de eventos en `emisor.html`.
  2. Implementar la regla de negocio `REGLA_C_FISICO_Y_DIGITAL`: todo participante con certificado físico y pago verificado adquiere el derecho a descargar su certificado digital idéntico al virtual **a partir del día calendario siguiente a la culminación del evento** (`todayLimaStr > eventDate`), informando paralelamente el cronograma de entrega física.
- **Consecuencias**:
  - El motor de PDF (`PdfEngine.js`) y la regla canónica de descarga digital permanecen intactos sin regresiones.
  - El participante visualiza en una tarjeta destacada (`.physical-delivery-card`) la fecha, lugar y horarios de atención para el recojo físico.

---

## ADR-009: Registro Individual Administrativo Concurrente con Reutilización de Perfiles
- **Estado**: Aprobado por el Propietario.
- **Contexto**: Las inscripciones directas en el panel de directiva solo podían realizarse mediante importación masiva de Excel (SheetJS), lo cual resultaba ineficiente para registros puntuales o extemporáneos.
- **Decisión**: Implementar `AdminService.registerIndividualParticipant` con bloqueo atómico `LockService.getScriptLock()`, saneamiento de DNI a 8 dígitos (`padStart(8, '0')`), búsqueda de participante preexistente por DNI para evitar duplicidad en `Participantes`, validación contra doble inscripción en el mismo evento y asignación de estado de pago inicial (`Pagado` o `Pendiente`).
- **Consecuencias**:
  - Preservación íntegra y sin modificaciones del flujo de importación masiva por Excel (`processExcelRows`).
  - Capacidad para inscribir asistentes individuales en segundos con generación instantánea de `Inscripcion_ID` y `Codigo_Consulta`.
  - Prevención garantizada de colisiones de IDs y duplicación de perfiles de usuario.

---

## ADR-010: Dashboard Administrativo con Métricas Agregadas y Filtrado por Evento
- **Estado**: Aprobado por el Propietario.
- **Contexto**: La directiva carecía de un panorama ejecutivo centralizado para evaluar el desempeño de sus conferencias, la tasa de conciliación de pagos, la demanda de certificados físicos frente a virtuales y la trazabilidad de actividad reciente.
- **Decisión**: Implementar `AdminService.getDashboardStats(eventId, adminEmail)` despachado en `backend/Code.js` mediante la acción `adminGetDashboardStats`. En el frontend de `emisor.html`, situar una pestaña inicial `#tab-dashboard` con tarjetas KPI responsivas, barras de distribución porcentual de alto contraste (WCAG AAA), tabla de desglose por evento con filtros dinámicos y feed cronológico de auditoría reciente.
- **Consecuencias**:
  - Consulta eficiente en una sola pasada de lectura (`Database.getAll`), sin saturar cuotas de Google Apps Script mediante polling continuo.
  - Blindaje contra divisiones por cero (`NaN` o `Infinity`) en eventos vacíos o cancelados.
  - Visibilidad integral y en tiempo real de los indicadores clave para la toma de decisiones directivas.
