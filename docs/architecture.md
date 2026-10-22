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
- **Decisión**: Emplear el SDK oficial de Google Identity Services en el cliente para obtener un `id_token` o credencial OAuth2 firmada por Google. El backend de Google Apps Script valida la identidad contra el endpoint de verificación de Google y contrasta el correo electrónico contra la lista blanca configurada en `Config.ADMIN_EMAILS`.
- **Consecuencias**: Máxima seguridad sin gestionar contraseñas locales ni almacenes de hashes. Si un miembro deja la directiva, basta con remover su correo de la configuración del backend.

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
