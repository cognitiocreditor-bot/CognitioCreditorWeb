# Reporte de Implementación: Task 1 — Esquema de Base de Datos y Módulo de Autenticación Dinámica RBAC

**Fecha:** 2026-11-09  
**Especialista:** `cognitio-backend-data` (Backend, Datos e Integraciones)  
**Estado:** Completado con Éxito  

---

## 1. Resumen Ejecutivo
Se implementó de manera integral la persistencia estructurada y la lógica de negocio en el backend (Google Apps Script) para el sistema de Control de Acceso Basado en Roles (RBAC) dinámico, erradicando la lista blanca estática codificada en el código fuente (`CONFIG.ADMIN_EMAILS`) y habilitando la gestión descentralizada de usuarios directivos en la hoja `Usuarios_Admin` con 3 niveles de privilegio (`SuperAdmin`, `Admin`, `Operador`).

Adicionalmente, se ampliaron las cabeceras de la entidad `Eventos` con los campos de entrega física de constancias (`Fecha_Entrega_Fisica`, `Lugar_Entrega_Fisica`, `Horario_Entrega_Fisica`), asegurando su persistencia e integridad.

---

## 2. Modificaciones Detalladas por Archivo

### A. `backend/Config.js`
- Se agregó el identificador de hoja `USUARIOS_ADMIN: "Usuarios_Admin"` dentro del objeto `SHEETS`.
- Se definió la lista `BOOTSTRAP_SUPERADMINS` con los correos autorizados de rescate:
  - `valentinbabiloniarodriguez@gmail.com`
  - `danielgarciaisern6c@gmail.com`
  - `cognitiocreditor@gmail.com`
- Se formalizó la constante `ROLES` con los identificadores `SUPERADMIN: "SuperAdmin"`, `ADMIN: "Admin"`, `OPERADOR: "Operador"`.
- Se mantuvo `ADMIN_EMAILS` preservando compatibilidad histórica hacia atrás.

### B. `backend/SetupDatabase.js`
- **Hoja `Eventos`**: Se anexaron al final de `headers` las columnas `Fecha_Entrega_Fisica`, `Lugar_Entrega_Fisica` y `Horario_Entrega_Fisica`, configurando su tipado como texto sin formato (`@`) para evitar deformaciones numéricas.
- **Hoja `Usuarios_Admin`**: Se definió la estructura oficial:
  - Cabeceras: `["Usuario_ID", "Email", "Nombre_Completo", "Rol", "Estado", "Fecha_Alta", "Creado_Por", "Ultimo_Acceso"]`.
  - Columnas de texto: Columna 1 (Usuario_ID), Columna 2 (Email) y Columna 4 (Rol).
  - Validaciones estrictas: Columna 4 (Rol) dropdown `["SuperAdmin", "Admin", "Operador"]` y Columna 5 (Estado) dropdown `["Activo", "Inactivo"]`.
- **Hoja `Logs_Auditoria`**: Se expandieron las acciones auditables permitidas para incluir `GUARDAR_USUARIO_ADMIN` y `REVOCAR_USUARIO_ADMIN`, garantizando la inserción fluida de trazas de auditoría.

### C. `backend/AuthService.js`
- **Jerarquía RBAC**: Se incorporó el diccionario `ROLE_HIERARCHY` (`SuperAdmin: 3`, `Admin: 2`, `Operador: 1`) y la función `hasPermission(userRole, requiredRole)`.
- **Verificación Dinámica (`verifyToken`)**:
  - Consulta token info contra el endpoint oficial de Google OAuth2.
  - Normaliza correo en minúsculas y sin espacios.
  - Consulta dinámicamente la hoja `Usuarios_Admin`.
  - **Mecanismo Bootstrap de Rescate**: Si la hoja está vacía o el directivo no está registrado, pero su correo figura en `BOOTSTRAP_SUPERADMINS`, se auto-registra en la hoja con rol `SuperAdmin` y estado `Activo`, evitando bloqueos operativos.
  - **Validación de Estado**: Rechaza con error a usuarios en estado `Inactivo` o revocados.
  - **Control de Privilegio**: Si la operación exige un rol específico, valida jerárquicamente contra `hasPermission` y rechaza si el nivel es insuficiente.
  - **Auditoría de Acceso**: Actualiza la columna `Ultimo_Acceso` con timestamp local (`America/Lima`).
  - Retorna `{ email, name, role, authorized: true }`.

### D. `backend/AdminService.js`
- **`getAdminUsers()`**: Recupera el conjunto completo de directivos registrados en `Usuarios_Admin`.
- **`saveAdminUser(payload, actorEmail)`**:
  - Operación protegida mediante cerrojo de concurrencia `Database.withLock`.
  - Normaliza correo y valida obligatoriedad de campos y pertenencia del rol.
  - Si el directivo ya existe, actualiza `Rol`, `Nombre_Completo` y `Estado`. Protege al único SuperAdmin activo contra degradaciones accidentales.
  - Si es nuevo, genera `Usuario_ID` (`ADM-XXXXXX`), registra `Fecha_Alta`, `Creado_Por: actorEmail` y `Estado: "Activo"`.
  - Registra evento en `Logs_Auditoria`: `GUARDAR_USUARIO_ADMIN`.
- **`revokeAdminUser(userId, actorEmail)`**:
  - Operación protegida bajo `Database.withLock`.
  - **Regla de Integridad de SuperAdmin Único**: Si el directivo es `SuperAdmin` y es el único activo, rechaza la operación lanzando: `"No se puede revocar al único SuperAdmin activo."`.
  - Cambia `Estado` a `"Inactivo"`.
  - Registra evento en `Logs_Auditoria`: `REVOCAR_USUARIO_ADMIN`.

### E. `backend/Code.js`
- En el despachador central `doPost(e)`:
  - `adminAuthenticate`: Retorna el objeto `adminUser` enriquecido con `role`.
  - `adminGetUsers`: Exige rol `SuperAdmin` mediante `AuthService.hasPermission(adminUser.role, "SuperAdmin")`, despachando a `AdminService.getAdminUsers()`.
  - `adminSaveUser`: Exige rol `SuperAdmin`, despachando a `AdminService.saveAdminUser(payload, adminUser.email)`.
  - `adminRevokeUser`: Exige rol `SuperAdmin`, despachando a `AdminService.revokeAdminUser(payload.userId, adminUser.email)`.

### F. `backend/EventService.js`
- Se alinearon `getPublicEvents()` y `saveEvent()` para mapear y persistir `Fecha_Entrega_Fisica`, `Lugar_Entrega_Fisica` y `Horario_Entrega_Fisica`.

### G. `tests/unit/rbac-auth.test.js` & `tests/runner.html`
- Se implementó una suite completa de pruebas unitarias que verifica:
  1. Jerarquía numérica de roles (`SuperAdmin > Admin > Operador`).
  2. Matriz de permisos cruzados (herencia hacia abajo y bloqueo hacia arriba).
  3. Normalización y validación de correos electrónicos.
  4. Auto-registro bootstrap para SuperAdmins iniciales.
  5. Rechazo tajante de correos no autorizados y usuarios inactivos.
  6. Bloqueo de escalamiento de privilegios en endpoints protegidos.
  7. Regla de integridad que impide revocar al único SuperAdmin activo del sistema.
- Se integraron las pruebas en `tests/runner.html` para verificación visual en el navegador por parte del equipo de QA.

---

## 3. Estado de Cumplimiento
- **Requisitos de Task 1:** 100% implementados.
- **Concurrencia:** Asegurada mediante `Database.withLock` en todas las mutaciones críticas.
- **Integridad:** Regla de no revocación del único SuperAdmin activo verificada.
