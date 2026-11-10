/**
 * PRUEBAS UNITARIAS: CONTROL DE ACCESO BASADO EN ROLES (RBAC) Y AUTENTICACIÓN DINÁMICA
 * Círculo de Estudios COGNITIO CREDITOR
 * Ejecutable mediante: node tests/unit/rbac-auth.test.js
 */

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FALLÓ: ${message}`);
    failed++;
  }
}

// ---------------------------------------------------------
// MODELO RBAC PURO DEL SERVIDOR (AuthService)
// ---------------------------------------------------------
const AuthServiceModel = {
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
  },

  normalizeEmail(email) {
    if (!email || typeof email !== "string") return "";
    return email.toLowerCase().trim();
  },

  isValidEmail(email) {
    const clean = this.normalizeEmail(email);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  },

  /**
   * Simula la lógica de autorización de verifyToken
   */
  authorizeUser({ email, dbUsers, bootstrapSuperAdmins, requiredRole }) {
    const cleanEmail = this.normalizeEmail(email);
    if (!this.isValidEmail(cleanEmail)) {
      throw new Error("Dirección de correo inválida.");
    }

    let user = dbUsers.find(u => this.normalizeEmail(u.Email) === cleanEmail);

    const isBootstrap = bootstrapSuperAdmins.map(b => this.normalizeEmail(b)).includes(cleanEmail);

    if (!user) {
      if (isBootstrap) {
        // Auto-registro en memoria
        user = {
          Usuario_ID: "ADM-BOOTSTRAP",
          Email: cleanEmail,
          Nombre_Completo: "SuperAdmin Inicial",
          Rol: "SuperAdmin",
          Estado: "Activo"
        };
      } else {
        throw new Error(`El correo '${cleanEmail}' no cuenta con permisos administrativos en COGNITIO CREDITOR.`);
      }
    }

    if (user.Estado !== "Activo") {
      throw new Error(`El usuario '${cleanEmail}' se encuentra inactivo o revocado en el sistema.`);
    }

    if (requiredRole && !this.hasPermission(user.Rol, requiredRole)) {
      throw new Error(`No cuenta con privilegios de ${requiredRole}. Su rol actual es '${user.Rol}'.`);
    }

    return {
      email: cleanEmail,
      role: user.Rol,
      authorized: true
    };
  },

  /**
   * Simula la regla de integridad de revocación de SuperAdmins
   */
  canRevokeUser(targetUserId, dbUsers) {
    const target = dbUsers.find(u => u.Usuario_ID === targetUserId || this.normalizeEmail(u.Email) === this.normalizeEmail(targetUserId));
    if (!target) throw new Error("Usuario directivo no encontrado.");

    if (target.Rol === "SuperAdmin" && target.Estado === "Activo") {
      const activeSuperAdmins = dbUsers.filter(u => u.Rol === "SuperAdmin" && u.Estado === "Activo");
      if (activeSuperAdmins.length <= 1) {
        throw new Error("No se puede revocar al único SuperAdmin activo.");
      }
    }
    return true;
  }
};

console.log("==================================================");
console.log("--- INICIANDO PRUEBAS UNITARIAS: RBAC & AUTH ---");
console.log("==================================================");

// ---------------------------------------------------------
// SUITE 1: Jerarquía de Roles Numérica
// ---------------------------------------------------------
console.log("\n[Suite 1] Jerarquía de Roles RBAC:");
assert(AuthServiceModel.ROLE_HIERARCHY["SuperAdmin"] === 3, "SuperAdmin posee el mayor nivel de privilegio (3)");
assert(AuthServiceModel.ROLE_HIERARCHY["Admin"] === 2, "Admin posee nivel intermedio de privilegio (2)");
assert(AuthServiceModel.ROLE_HIERARCHY["Operador"] === 1, "Operador posee nivel base de privilegio (1)");
assert((AuthServiceModel.ROLE_HIERARCHY["SuperAdmin"] > AuthServiceModel.ROLE_HIERARCHY["Admin"]), "SuperAdmin supera en privilegio a Admin");
assert((AuthServiceModel.ROLE_HIERARCHY["Admin"] > AuthServiceModel.ROLE_HIERARCHY["Operador"]), "Admin supera en privilegio a Operador");

// ---------------------------------------------------------
// SUITE 2: Matriz de Permisos (hasPermission)
// ---------------------------------------------------------
console.log("\n[Suite 2] Evaluación de Permisos Cruzados (hasPermission):");
// SuperAdmin
assert(AuthServiceModel.hasPermission("SuperAdmin", "SuperAdmin") === true, "SuperAdmin accede a recursos de SuperAdmin");
assert(AuthServiceModel.hasPermission("SuperAdmin", "Admin") === true, "SuperAdmin hereda acceso a recursos de Admin");
assert(AuthServiceModel.hasPermission("SuperAdmin", "Operador") === true, "SuperAdmin hereda acceso a recursos de Operador");
assert(AuthServiceModel.hasPermission("SuperAdmin", null) === true, "SuperAdmin accede a recursos generales (requiredRole = null)");

// Admin
assert(AuthServiceModel.hasPermission("Admin", "SuperAdmin") === false, "Admin es bloqueado de recursos de SuperAdmin");
assert(AuthServiceModel.hasPermission("Admin", "Admin") === true, "Admin accede a recursos de Admin");
assert(AuthServiceModel.hasPermission("Admin", "Operador") === true, "Admin hereda acceso a recursos de Operador");
assert(AuthServiceModel.hasPermission("Admin", null) === true, "Admin accede a recursos generales (requiredRole = null)");

// Operador
assert(AuthServiceModel.hasPermission("Operador", "SuperAdmin") === false, "Operador es bloqueado de recursos de SuperAdmin");
assert(AuthServiceModel.hasPermission("Operador", "Admin") === false, "Operador es bloqueado de recursos de Admin");
assert(AuthServiceModel.hasPermission("Operador", "Operador") === true, "Operador accede a recursos de Operador");
assert(AuthServiceModel.hasPermission("Operador", null) === true, "Operador accede a recursos generales (requiredRole = null)");

// Roles Inválidos o Nulos
assert(AuthServiceModel.hasPermission(null, "Operador") === false, "Rol nulo no tiene permisos");
assert(AuthServiceModel.hasPermission("", "Operador") === false, "Rol vacío no tiene permisos");
assert(AuthServiceModel.hasPermission("Visitante", "Operador") === false, "Rol no reconocido no tiene permisos");

// ---------------------------------------------------------
// SUITE 3: Validación y Normalización de Correos
// ---------------------------------------------------------
console.log("\n[Suite 3] Normalización y Validación de Correo:");
assert(AuthServiceModel.normalizeEmail("  DanielGarciaIsern6c@Gmail.COM  ") === "danielgarciaisern6c@gmail.com", "Limpia espacios y transforma a minúsculas");
assert(AuthServiceModel.normalizeEmail("") === "", "Cadena vacía normalizada a vacía");
assert(AuthServiceModel.normalizeEmail(null) === "", "Valor nulo normalizado a vacío");
assert(AuthServiceModel.isValidEmail("cognitiocreditor@gmail.com") === true, "Correo estándar de Google es válido");
assert(AuthServiceModel.isValidEmail("invalido@") === false, "Correo incompleto es rechazado");
assert(AuthServiceModel.isValidEmail("sin_arroba.com") === false, "Correo sin arroba es rechazado");

// ---------------------------------------------------------
// SUITE 4: Mecanismo de Bootstrap y Rescate
// ---------------------------------------------------------
console.log("\n[Suite 4] Mecanismo de Bootstrap SuperAdmin:");
const bootstrapSuperAdmins = [
  "valentinbabiloniarodriguez@gmail.com",
  "danielgarciaisern6c@gmail.com",
  "cognitiocreditor@gmail.com"
];

// Caso A: SuperAdmin bootstrap inicia por primera vez (base vacía)
const resBootstrap = AuthServiceModel.authorizeUser({
  email: "VALENTINBABILONIARODRIGUEZ@GMAIL.COM",
  dbUsers: [],
  bootstrapSuperAdmins,
  requiredRole: "SuperAdmin"
});
assert(resBootstrap.authorized === true, "SuperAdmin bootstrap se autoriza aun con base vacía");
assert(resBootstrap.role === "SuperAdmin", "SuperAdmin bootstrap recibe rol SuperAdmin automáticamente");

// Caso B: Correo desconocido fuera de bootstrap y base de datos
let rejectedUnknown = false;
try {
  AuthServiceModel.authorizeUser({
    email: "hacker@desconocido.com",
    dbUsers: [],
    bootstrapSuperAdmins,
    requiredRole: "Operador"
  });
} catch (err) {
  rejectedUnknown = true;
  assert(err.message.includes("no cuenta con permisos administrativos"), "Correo desconocido es rechazado tajantemente");
}
assert(rejectedUnknown === true, "Excepción de seguridad disparada para correo no autorizado");

// Caso C: Usuario desactivado (revocado)
let rejectedInactive = false;
try {
  AuthServiceModel.authorizeUser({
    email: "danielgarciaisern6c@gmail.com",
    dbUsers: [
      {
        Usuario_ID: "ADM-001",
        Email: "danielgarciaisern6c@gmail.com",
        Rol: "SuperAdmin",
        Estado: "Inactivo"
      }
    ],
    bootstrapSuperAdmins,
    requiredRole: "Admin"
  });
} catch (err) {
  rejectedInactive = true;
  assert(err.message.includes("inactivo o revocado"), "Directivo inactivo es rechazado inmediatamente");
}
assert(rejectedInactive === true, "Excepción de seguridad disparada para directivo inactivo");

// ---------------------------------------------------------
// SUITE 5: Rechazo de Operaciones con Privilegios Insuficientes
// ---------------------------------------------------------
console.log("\n[Suite 5] Rechazo de Roles Insuficientes en Endpoints:");
const directivos = [
  { Usuario_ID: "ADM-SA", Email: "sa@cognitio.com", Rol: "SuperAdmin", Estado: "Activo" },
  { Usuario_ID: "ADM-AD", Email: "ad@cognitio.com", Rol: "Admin", Estado: "Activo" },
  { Usuario_ID: "ADM-OP", Email: "op@cognitio.com", Rol: "Operador", Estado: "Activo" }
];

let rejectedAdminAttempt = false;
try {
  AuthServiceModel.authorizeUser({
    email: "ad@cognitio.com",
    dbUsers: directivos,
    bootstrapSuperAdmins,
    requiredRole: "SuperAdmin"
  });
} catch (err) {
  rejectedAdminAttempt = true;
  assert(err.message.includes("No cuenta con privilegios de SuperAdmin"), "Admin no puede invocar funciones de SuperAdmin");
}
assert(rejectedAdminAttempt === true, "Rechazo efectivo de escalamiento de privilegios para Admin");

let rejectedOperadorAttempt = false;
try {
  AuthServiceModel.authorizeUser({
    email: "op@cognitio.com",
    dbUsers: directivos,
    bootstrapSuperAdmins,
    requiredRole: "Admin"
  });
} catch (err) {
  rejectedOperadorAttempt = true;
  assert(err.message.includes("No cuenta con privilegios de Admin"), "Operador no puede invocar funciones de Admin");
}
assert(rejectedOperadorAttempt === true, "Rechazo efectivo de escalamiento de privilegios para Operador");

// ---------------------------------------------------------
// SUITE 6: Regla de Integridad de SuperAdmin Único
// ---------------------------------------------------------
console.log("\n[Suite 6] Regla de Integridad: Revocación de SuperAdmin:");
const singleSuperAdminList = [
  { Usuario_ID: "ADM-01", Email: "super@cognitio.com", Rol: "SuperAdmin", Estado: "Activo" },
  { Usuario_ID: "ADM-02", Email: "admin@cognitio.com", Rol: "Admin", Estado: "Activo" }
];

let rejectedSingleRevoke = false;
try {
  AuthServiceModel.canRevokeUser("ADM-01", singleSuperAdminList);
} catch (err) {
  rejectedSingleRevoke = true;
  assert(err.message === "No se puede revocar al único SuperAdmin activo.", "Protege al único SuperAdmin activo contra auto-bloqueo");
}
assert(rejectedSingleRevoke === true, "Bloqueo exitoso de revocación de SuperAdmin único");

// Si hay 2 SuperAdmins activos, la revocación es permitida
const twoSuperAdminsList = [
  { Usuario_ID: "ADM-01", Email: "super1@cognitio.com", Rol: "SuperAdmin", Estado: "Activo" },
  { Usuario_ID: "ADM-02", Email: "super2@cognitio.com", Rol: "SuperAdmin", Estado: "Activo" },
  { Usuario_ID: "ADM-03", Email: "admin@cognitio.com", Rol: "Admin", Estado: "Activo" }
];
assert(AuthServiceModel.canRevokeUser("ADM-01", twoSuperAdminsList) === true, "Permite revocar SuperAdmin cuando queda al menos otro SuperAdmin activo");
assert(AuthServiceModel.canRevokeUser("ADM-03", twoSuperAdminsList) === true, "Permite revocar Admin sin restricciones de SuperAdmin");

// ---------------------------------------------------------
// RESUMEN FINAL
// ---------------------------------------------------------
console.log("\n==================================================");
console.log(`RESUMEN: TOTAL: ${passed + failed} | APROBADAS: ${passed} | FALLIDAS: ${failed}`);
console.log("==================================================");

if (failed > 0) {
  process.exit(1);
}
