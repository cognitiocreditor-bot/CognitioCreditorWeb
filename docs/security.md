# DIRECTRICES DE CIBERSEGURIDAD Y PROTECCIÓN DE DATOS
## Círculo de Estudios COGNITIO CREDITOR

Este documento recopila las políticas técnicas implementadas para proteger la confidencialidad, integridad y disponibilidad del sistema.

---

## 1. Principio de Mínimo Privilegio en Google Drive y Sheets
- El archivo de Google Sheets que actúa como base de datos **nunca debe configurarse con enlace público de edición o lectura**.
- El acceso está restringido exclusivamente a la cuenta de Google que desplegó la Web App de Apps Script.
- Las plantillas PDF en Google Drive deben residir en una carpeta privada. El backend en Google Apps Script (`CertificateService.gs`) actúa como custodio y sirve la plantilla únicamente a solicitudes que han demostrado autenticación o elegibilidad de emisión.

---

## 2. Prevención de Enumeración y Fuga de Información Personal
- **Doble Factor de Consulta**: Para consultar un certificado se requiere el DNI junto al **Código de Consulta** único generado al momento de la inscripción.
- **Mensajes Prudentes (Regla F)**: Cuando una búsqueda no arroja resultados, el sistema responde con un mensaje neutral que no revela si el DNI existe o no en los registros.
- **Minimización de Datos en Endpoints Públicos**: La operación pública `getPublicEvents` excluye expresamente identificadores de archivos de plantilla, enlaces administrativos y notas internas. El endpoint de consulta individual jamás retorna la lista de otros participantes ni estados de pago ajenos.

---

## 3. Autenticación y Autorización Administrativa
- **Prohibición de Contraseñas Fijas en Frontend**: No existen contraseñas ni validaciones de rol simuladas en el código JavaScript del navegador.
- **Google Identity Services (OAuth2)**: Toda operación privilegiada (confirmar pagos, modificar eventos, importar desde Excel, emitir lotes físicos) exige el envío de un `id_token` firmado criptográficamente por Google.
- **Verificación en el Servidor**: El backend (`AuthService.gs`) verifica el token contra `https://oauth2.googleapis.com/tokeninfo` y contrasta el correo contra la lista blanca estricta `CONFIG.ADMIN_EMAILS`. Si el correo no figura en la directiva, la petición es abortada inmediatamente.

---

## 4. Trazabilidad y Auditoría Inmutable
- Todas las operaciones críticas de escritura administrativa quedan registradas en la hoja `Logs_Auditoria` con:
  - Marca temporal en zona `America/Lima`.
  - Correo del directivo responsable.
  - Acción ejecutada (`CONFIRMAR_PAGO`, `IMPORTAR_EXCEL`, `TOGGLE_EVENTO`, `GENERAR_LOTE_FISICO`).
  - Identificador de la entidad afectada.
- Los logs no almacenan información financiera sensible ni contraseñas.
