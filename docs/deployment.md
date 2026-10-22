# MANUAL DE INSTALACIÓN, DESPLIEGUE Y OPERACIÓN
## Círculo de Estudios COGNITIO CREDITOR

Este manual describe paso a paso cómo poner en funcionamiento la plataforma web, el backend en Google Apps Script y la base de datos en Google Sheets.

---

### Paso 1: Crear y Configurar el Repositorio en GitHub
1. Inicie sesión en [GitHub](https://github.com/) y cree un nuevo repositorio público o privado (ej. `cognitio-creditor-web`).
2. Clone o suba los archivos de esta carpeta al repositorio (`index.html`, `emisor.html`, `privacidad.html`, carpetas `css/`, `js/`, `assets/`, `docs/`).

---

### Paso 2: Crear las Hojas en Google Sheets
1. Vaya a [Google Sheets](https://sheets.new) y cree una nueva hoja de cálculo llamada **Base de Datos - Cognitio Creditor**.
2. Conforme al archivo [spreadsheet-schema.md](file:///docs/spreadsheet-schema.md), cree exactamente 5 pestañas:
   - `Eventos`
   - `Participantes`
   - `Inscripciones`
   - `Configuracion_Certificados`
   - `Logs_Auditoria`
3. Copie las cabeceras exactas en la fila 1 de cada pestaña.
4. Seleccione la columna **B (DNI)** en `Participantes` e `Inscripciones`, y elija en el menú: *Formato > Número > Texto sin formato*.

---

### Paso 3: Instalar y Desplegar el Backend en Google Apps Script
1. Dentro de su Google Sheet, vaya al menú superior: **Extensiones > Apps Script**.
2. Cree los archivos `.gs` copiando el contenido de la carpeta `backend/`:
   - `Config.gs` (desde `backend/Config.js`)
   - `Database.gs` (desde `backend/Database.js`)
   - `AuthService.gs` (desde `backend/AuthService.js`)
   - `EventService.gs` (desde `backend/EventService.js`)
   - `EnrollmentService.gs` (desde `backend/EnrollmentService.js`)
   - `CertificateService.gs` (desde `backend/CertificateService.js`)
   - `AdminService.gs` (desde `backend/AdminService.js`)
   - `Código.gs` (desde `backend/Code.js`)
3. En la barra superior derecha, haga clic en el botón azul **Implementar > Nueva implementación**.
4. Seleccione tipo: **Aplicación web**.
5. Configure:
   - **Ejecutar como**: *Yo (tu cuenta)*.
   - **Quién tiene acceso**: *Cualquier usuario* (permite que los participantes consulten su certificado sin loguearse).
6. Haga clic en **Implementar**, conceda los permisos solicitados y copie la **URL de la aplicación web** generada (terminada en `/exec`).

---

### Paso 4: Configurar los Permisos de Acceso en Google Drive
1. En Google Drive, cree una carpeta llamada **COGNITIO - Plantillas de Certificados**.
2. Suba los archivos PDF de sus diplomas en blanco.
3. Asegúrese de que la cuenta que desplegó el Apps Script tenga permisos de lectura sobre esos archivos.
4. Obtenga el **ID de archivo** de cada plantilla (ej. si el enlace es `https://drive.google.com/file/d/1aBcDeFg12345/view`, el ID es `1aBcDeFg12345`).

---

### Paso 5: Registrar las Cuentas Autorizadas de la Directiva
1. Abra `backend/Config.js` (o `Config.gs` en Apps Script).
2. Agregue los correos de Gmail de los miembros de la directiva dentro del arreglo `ADMIN_EMAILS`:
   ```javascript
   ADMIN_EMAILS: [
     "presidente.cognitio@gmail.com",
     "academica.cognitio@gmail.com"
   ]
   ```
3. Guarde los cambios en Apps Script.

---

### Paso 6: Configurar las URLs y el Logotipo en el Frontend
1. Abra el archivo `js/config.js`.
2. Pegue la URL del Apps Script obtenida en el Paso 3 en `BACKEND_API_URL`:
   ```javascript
   BACKEND_API_URL: "https://script.google.com/macros/s/AKfycb.../exec"
   ```
3. Ingrese su Client ID de Google Identity Services en `GOOGLE_CLIENT_ID`.
4. Configure el número oficial de WhatsApp en `WHATSAPP_NUMBER` (ej. `51999888777`) y las URLs de Facebook e Instagram.

---

### Paso 7: Preparar y Registrar una Nueva Plantilla PDF
1. Diseñe el certificado en formato vectorial (Illustrator, Canva, Word, etc.) en tamaño A4 apaisado u horizontal y expórtelo como PDF.
2. Déjelo sin el nombre del participante (el sistema lo inyectará dinámicamente).
3. Súbalo a su carpeta de Drive y copie su ID.

---

### Paso 8: Configurar las Coordenadas del Nombre
1. En la hoja `Configuracion_Certificados`, registre una fila para el evento con los siguientes valores estándar sugeridos para A4 horizontal:
   - `Pagina_Certificado`: `1`
   - `Posicion_X`: `0` (centrado automático)
   - `Posicion_Y`: `260` (ajuste vertical según el diseño)
   - `Ancho_Maximo_Nombre`: `600`
   - `Tamano_Fuente_Inicial`: `32`
   - `Tamano_Fuente_Minimo`: `18`
   - `Alineacion`: `Centrado`
   - `Color_Texto`: `#0A2540`
2. Puede ajustar la coordenada `Posicion_Y` realizando una prueba de consulta individual.

---

### Paso 9: Registrar Eventos y Participantes
- **Eventos**: Puede registrarlos directamente en la hoja `Eventos` de Sheets o a través del botón en `emisor.html`.
- **Participantes**: Se registran automáticamente cuando los alumnos completan el formulario en el portal, o bien en masa subiendo la lista de inscritos en Excel desde `emisor.html > Importación Excel`.

---

### Paso 10: Confirmar Pagos
1. Ingrese a `emisor.html` con su cuenta de Google autorizada.
2. Vaya a la pestaña **2. Inscripciones y Pagos**.
3. Seleccione el evento.
4. Para cada alumno que haya verificado su voucher de recuperación, presione **✓ Confirmar Pago**. Su estado cambiará inmediatamente a `Pagado`.

---

### Paso 11: Generar Certificados
- **Certificados Virtuales**: Una vez finalizado el evento y confirmado el pago, los alumnos ingresan a `index.html#certificados`, escriben su DNI y su código de consulta, y descargan su PDF oficial.
- **Certificados Físicos**: La directiva ingresa a `emisor.html > 4. Lote Certificados Físicos`, selecciona el evento y presiona **Iniciar Generación Consolidada**. Se descargará un solo PDF con todos los certificados listos para enviar a imprenta.

---

### Paso 12: Realizar Pruebas
1. Ejecute las pruebas unitarias locales:
   ```bash
   node tests/unit/validation.test.js
   node tests/unit/business-rules.test.js
   ```
2. Abra `index.html` con una extensión de servidor local (ej. Live Server en VS Code o `npx serve .`) y simule una inscripción.

---

### Paso 13: Publicar el Sitio en GitHub Pages
1. En su repositorio de GitHub, vaya a **Settings > Pages**.
2. En **Build and deployment > Branch**, seleccione la rama `main` y la carpeta `/(root)`.
3. Guarde. En unos minutos, su portal estará disponible públicamente bajo una URL HTTPS gratuita del tipo `https://tu-usuario.github.io/cognitio-creditor-web/`.

---

### Paso 14: Actualizar la Plataforma sin Perder Datos
- El código frontend (HTML, CSS, JS) reside en GitHub y es completamente independiente de la base de datos.
- Para actualizar el diseño o añadir funciones, simplemente haga commit y push a GitHub.
- Los datos de inscritos, pagos y eventos en Google Sheets permanecen intactos y seguros.

---

### Paso 15: Copias de Seguridad y Recuperación
- Google Sheets cuenta con **Historial de versiones** nativo (*Archivo > Historial de versiones*), lo que permite restaurar el estado de cualquier celda a cualquier minuto anterior.
- Se recomienda descargar periódicamente una copia local (*Archivo > Descargar > Microsoft Excel (.xlsx)*) al concluir cada evento académico.
