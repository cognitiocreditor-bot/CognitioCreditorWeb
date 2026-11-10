# Task 1 Brief: Esquema de Base de Datos y Módulo de Autenticación Dinámica RBAC (Backend)

## Objetivo
Implementar en el backend (Google Apps Script) el sistema de autenticación dinámico con RBAC y persistencia en Google Sheets, eliminando la dependencia de correos fijos en el código (`CONFIG.ADMIN_EMAILS`) e incorporando la definición de la nueva hoja `Usuarios_Admin` y las columnas de entrega física en `Eventos`.

## Requerimientos Específicos
1. **`backend/Config.js`**:
   - Agregar en `SHEETS`: `USUARIOS_ADMIN: "Usuarios_Admin"`.
   - Definir `BOOTSTRAP_SUPERADMINS`:
     ```javascript
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
   - Mantener compatibilidad con llamadas existentes pero marcando `ADMIN_EMAILS` como respaldo de inicialización.

2. **`backend/SetupDatabase.js`**:
   - En `sheetDefinitions`:
     - Agregar hoja `Usuarios_Admin`:
       - `name: "Usuarios_Admin"`
       - `headers: ["Usuario_ID", "Email", "Nombre_Completo", "Rol", "Estado", "Fecha_Alta", "Creado_Por", "Ultimo_Acceso"]`
       - `textColumns: [1, 2, 4]` (A: Usuario_ID, B: Email, D: Rol)
       - `validations`:
         - Columna 4 (Rol): `["SuperAdmin", "Admin", "Operador"]`
         - Columna 5 (Estado): `["Activo", "Inactivo"]`
     - En hoja `Eventos`:
       - Agregar al final de `headers`: `"Fecha_Entrega_Fisica"`, `"Lugar_Entrega_Fisica"`, `"Horario_Entrega_Fisica"`.

3. **`backend/AuthService.js`**:
   - Función auxiliar de jerarquía de roles:
     ```javascript
     ROLE_HIERARCHY: {
       "SuperAdmin": 3,
       "Admin": 2,
       "Operador": 1
     },
     hasPermission(userRole, requiredRole) {
       if (!userRole) return false;
       if (!requiredRole) return true;
       const uLevel = this.ROLE_HIERARCHY[userRole] || 0;
       const rLevel = this.ROLE_HIERARCHY[requiredRole] || 99;
       return uLevel >= rLevel;
     }
     ```
   - Modificar `verifyToken(idToken, requiredRole = null)`:
     - Consultar Google `https://oauth2.googleapis.com/tokeninfo?id_token=...`.
     - Obtener email en minúsculas y limpio.
     - Buscar en `Database.getAll(CONFIG.SHEETS.USUARIOS_ADMIN)`.
     - Si la hoja está vacía o no existe el registro, pero el email está en `CONFIG.BOOTSTRAP_SUPERADMINS`:
       - Registrarlo automáticamente en `Usuarios_Admin` como `SuperAdmin` activo o tratarlo como SuperAdmin de rescate.
     - Si existe en la hoja:
       - Verificar que `Estado === 'Activo'`. Si no es activo, lanzar error de autorización.
       - Si no cumple `hasPermission(usuario.Rol, requiredRole)`, lanzar error: `No cuenta con privilegios de ${requiredRole}`.
       - Actualizar `Ultimo_Acceso` con timestamp actual en `America/Lima`.
     - Retornar `{ email, name: tokenInfo.name || usuario.Nombre_Completo, role: usuario.Rol, authorized: true }`.

4. **`backend/AdminService.js`**:
   - `getAdminUsers()`:
     - Lee todos los registros de `CONFIG.SHEETS.USUARIOS_ADMIN`.
   - `saveAdminUser(payload, actorEmail)`:
     - Bajo cerrojo `Database.withLock`.
     - Valida campos obligatorios: `email`, `rol`. Normaliza email a minúsculas.
     - Si ya existe por email, actualiza `Rol`, `Nombre_Completo`, `Estado`.
     - Si es nuevo, genera `Usuario_ID: "ADM-" + Utilities.getUuid().substring(0, 6).toUpperCase()`, `Fecha_Alta`, `Creado_Por: actorEmail`, `Estado: "Activo"`.
     - Registra auditoría: `AuthService.logAudit(actorEmail, "GUARDAR_USUARIO_ADMIN", payload.email, "Rol: " + payload.rol)`.
   - `revokeAdminUser(userId, actorEmail)`:
     - Bajo cerrojo `Database.withLock`.
     - Obtiene los directivos.
     - Localiza el usuario objetivo.
     - Regla de integridad: Si el usuario es `SuperAdmin` y es el ÚNICO `SuperAdmin` activo, rechazar con error: `"No se puede revocar al único SuperAdmin activo."`
     - Cambia `Estado = 'Inactivo'`.
     - Registra auditoría: `AuthService.logAudit(actorEmail, "REVOCAR_USUARIO_ADMIN", userId, "Directivo desactivado")`.

5. **`backend/Code.js`**:
   - En `doPost(e)`:
     - `action === "adminAuthenticate"`: retorna `adminUser` (que ahora incluye `{ email, name, role, authorized: true }`).
     - `action === "adminGetUsers"`: exige `AuthService.hasPermission(adminUser.role, "SuperAdmin")`, retorna `AdminService.getAdminUsers()`.
     - `action === "adminSaveUser"`: exige `AuthService.hasPermission(adminUser.role, "SuperAdmin")`, retorna `AdminService.saveAdminUser(payload, adminUser.email)`.
     - `action === "adminRevokeUser"`: exige `AuthService.hasPermission(adminUser.role, "SuperAdmin")`, retorna `AdminService.revokeAdminUser(payload.userId, adminUser.email)`.

6. **`tests/unit/rbac-auth.test.js`**:
   - Crear suite de prueba unitaria que verifique la jerarquía de roles, rechazo de roles insuficientes y validación de correo.

Reportar en `.superpowers/sdd/task-1-report.md`.
