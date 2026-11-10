# Task 2 Brief: Gestión de Usuarios Directivos en Panel Administrativo (Frontend)

## Objetivo
Implementar la interfaz completa de gestión dinámica de usuarios y control de acceso basado en roles (RBAC) en el panel administrativo (`emisor.html` y `js/admin.js`), con persistencia de sesión en `sessionStorage` (para evitar cierres de sesión involuntarios al recargar la página o presionar F5).

## Requerimientos Específicos
1. **Persistencia de Sesión con `sessionStorage`**:
   - En `js/admin.js`:
     - Al autenticar con éxito (`onLoginSuccess` o `handleGoogleCredentialResponse`):
       - `sessionStorage.setItem('cognitio_admin_token', this.currentAuthToken);`
       - `sessionStorage.setItem('cognitio_admin_role', this.currentAdminRole);`
     - En `Admin.init()`:
       - Verificar si existe token guardado en `sessionStorage`.
       - Si existe, restaurar sesión silenciosamente invocando `Api.post('adminAuthenticate', {}, savedToken)`.
       - Si el backend confirma la sesión:
         - Actualizar `this.currentAuthToken = savedToken`, `this.currentAdminRole = res.data.role`, `this.currentAdminEmail = res.data.email`.
         - Invocar `this.onLoginSuccess(res.data)`.
       - Si el token ha expirado o no es válido:
         - Limpiar `sessionStorage` y permanecer en el gate de login sin bloquear la interfaz.
     - En `Admin.logout()`:
       - Limpiar `sessionStorage.removeItem('cognitio_admin_token')` y `cognitio_admin_role`.

2. **Adaptación de la Interfaz por Roles en `emisor.html`**:
   - Barra superior del directivo (`admin-user-display`):
     - Mostrar correo y badge de rol: `${email} (${role})`.
   - Navegación de pestañas:
     - Añadir botón de Pestaña 6 en `<nav class="admin-nav">`:
       `<button class="admin-tab-btn" id="tab-btn-users" data-target="tab-users" style="display: none;">6. Directiva y Permisos</button>`
     - Mostrar este botón únicamente si `currentAdminRole === 'SuperAdmin'`.
     - Si el rol es `Operador`, deshabilitar o no mostrar botones destructivos o de configuración avanzada (ej. eliminar evento, configurar diploma).

3. **Pestaña 6: Directiva y Permisos (`tab-users`) en `emisor.html`**:
   - Estructura:
     - Encabezado con título "Gestión de la Directiva y Permisos de Acceso" y descripción.
     - Barra de herramientas con botón "+ Registrar Directivo" y botón "↻ Actualizar Lista".
     - Contenedor `#admin-users-list` con tabla responsive que muestra:
       - ID (`Usuario_ID`), Correo de Google (`Email`), Nombre Completo, Rol (badge visual: `SuperAdmin` morado, `Admin` azul, `Operador` verde/gris), Estado (`Activo` / `Inactivo`), Último Acceso, Acciones.
     - Acciones por fila:
       - Botón "✎ Modificar Rol"
       - Botón "Revocar / Desactivar" (o "Activar" si está inactivo).

4. **Modal de Usuario Directivo (`#modal-admin-user`) en `emisor.html`**:
   - Campos:
     - `admin-user-form-id` (hidden)
     - Correo de Google (`admin-user-form-email`): input email requerido con validación.
     - Nombre Completo (`admin-user-form-name`): input texto requerido.
     - Rol (`admin-user-form-role`): selector con `SuperAdmin`, `Admin`, `Operador`.
     - Estado (`admin-user-form-status`): selector con `Activo`, `Inactivo`.
   - Botón cancelar y botón guardar ("Guardar Directivo").

5. **Lógica de Controlador en `js/admin.js`**:
   - `loadAdminUsers()`: Invoca `Api.post('adminGetUsers', {}, this.currentAuthToken)` y renderiza la tabla.
   - `openNewUserModal()`: Limpia campos y abre el modal.
   - `openEditUserModal(userId)`: Carga datos del usuario en el modal y permite modificar rol y estado.
   - `saveAdminUser()`: Valida inputs (`Validation.isValidEmail`, etc.) y despacha `adminSaveUser`.
   - `revokeAdminUser(userId)`: Pide confirmación al directivo y despacha `adminRevokeUser`.
   - Exponer en `window.CognitioAdmin`:
     `loadAdminUsers`, `openNewUserModal`, `openEditUserModal`, `saveAdminUser`, `revokeAdminUser`.

6. **Estilos en `css/styles.css`**:
   - Asegurar que badges de roles (`badge-superadmin`, `badge-admin`, `badge-operador`) y la tabla de directivos mantengan el diseño de alta fidelidad, contraste accesible y responsive design con scroll horizontal táctil.

Reportar en `.superpowers/sdd/task-2-report.md`.
