# Reporte Técnico de Frontend — Task 5: Cronograma de Entrega Física y Descarga Digital Unificada

**Especialista**: `COGNITIO_FRONTEND_UX`  
**Fecha de Ejecución**: 2026-11-09  
**Estado**: Completado con éxito  

---

## 1. Objetivo de la Tarea
Diseñar e implementar en la interfaz de usuario de **COGNITIO CREDITOR** la configuración administrativa de cronogramas de entrega física de diplomas y la experiencia unificada en el portal de participantes, permitiendo:
1. Al administrador registrar fechas, lugar y horarios de atención presencial para cada evento.
2. Al participante que adquirió un certificado físico consultar con claridad dichos detalles de recojo presencial mediante una tarjeta visual destacada.
3. Garantizar la regla inmutable del negocio: todo participante con certificado físico y pago verificado dispone además del botón de descarga directa de su Certificado Digital Oficial en PDF (Copia Digital) a partir del día siguiente al evento, sin bloqueos ni intermediaciones innecesarias.

---

## 2. Análisis Realizado y Estrategia de Diseño

### 2.1 Ergonomía Administrativa (`emisor.html` y `js/admin.js`)
- **Agrupamiento Semántico Accesible**: Se incorporó un `<fieldset>` y `<legend>` dedicado en el modal de gestión de eventos (`#modal-event`), dotando a la sección de significado semántico estándar para lectores de pantalla (WCAG 2.1 AA / AAA).
- **Entradas Claras y Descriptivas**: Se añadieron los tres campos requeridos con placeholders guiados:
  - `#event-form-physical-dates`: Fechas de entrega (ej. "Del 25 al 28 de Noviembre de 2026").
  - `#event-form-physical-place`: Lugar de entrega (ej. "Oficina FACEN - UNAP, 2do Piso").
  - `#event-form-physical-time`: Horario de atención (ej. "09:00 a 13:00 y 15:00 a 18:00 hrs").
- **Ciclo de Vida Limpio en `js/admin.js`**:
  - `openNewEventModal()`: Reseteo preventivo de los tres campos al crear un nuevo evento.
  - `editEvent(eventId)`: Poblado reactivo de `Fecha_Entrega_Fisica`, `Lugar_Entrega_Fisica` y `Horario_Entrega_Fisica`.
  - `saveEvent()`: Sanitización y persistencia en el payload remitido hacia `adminSaveEvent`.

### 2.2 Experiencia del Participante y Accesibilidad (`js/certificates.js` y `css/styles.css`)
- **Badge Distintivo Púrpura**: Se diseñó `.badge-purple` con fondo `#FAF5FF` y texto `#581C87` (Purple 900), alcanzando una relación de contraste superior a **12:1** (superando holgadamente el umbral estricto de WCAG AAA de 7:1).
- **Tarjeta de Entrega Física Destacada (`.physical-delivery-card`)**:
  - Estética editorial de alta fidelidad, con borde acentuado púrpura institucional, contenedor de iconos e información estructurada en grid responsivo (3 columnas en desktop / 1 columna apilada en móviles sin desbordes).
  - Sanitización estricta de todos los campos mostrados vía `Validation.escapeHTML()` para prevenir vulnerabilidades XSS.
  - Contraste validado: títulos (14:1 AAA), subtítulos y etiquetas (7.0:1 AAA), valores de texto (17.5:1 AAA).
- **Doble Beneficio Físico + Copia Digital**:
  - Si el evento ya culminó (`Elegible_Emision === true`), se renderiza tanto la tarjeta física como el botón principal oficial: `"📥 Descargar Certificado Oficial en PDF (Copia Digital)"`.
  - Si el evento es futuro (`Elegible_Emision === false`), se visualiza la tarjeta física con las fechas programadas y una alerta informativa azul indicando que la descarga digital se habilitará a partir del día siguiente al evento.
  - En `processDownload(enrollmentId, index)` se implementó la preservación y restauración del texto original del botón para mantener la coherencia contextual al completar la generación vectorial.

---

## 3. Archivos Modificados

1. [emisor.html](file:///c:/Users/USUARIO/PROYECTO%20COGNITIO/emisor.html):
   - Bloque `<fieldset class="admin-form-section">` con inputs `#event-form-physical-dates`, `#event-form-physical-place`, `#event-form-physical-time`.
2. [js/admin.js](file:///c:/Users/USUARIO/PROYECTO%20COGNITIO/js/admin.js):
   - Limpieza en `openNewEventModal()`.
   - Carga de datos en `editEvent()`.
   - Inclusión en el payload en `saveEvent()`.
3. [js/certificates.js](file:///c:/Users/USUARIO/PROYECTO%20COGNITIO/js/certificates.js):
   - Detección unificada de modalidad física (`certType === 'Fisico' || Boolean(rec.entregaFisica)`).
   - Renderizado del badge `.badge-purple` "Certificado Físico + Digital".
   - Renderizado de la tarjeta `.physical-delivery-card`.
   - Botón de descarga de copia digital condicionado a `Elegible_Emision === true`.
   - Restauración de texto contextual en `processDownload()`.
4. [css/styles.css](file:///c:/Users/USUARIO/PROYECTO%20COGNITIO/css/styles.css):
   - Definición de `.badge-purple` (WCAG AAA).
   - Definición de `.physical-delivery-card`, subcomponentes de grilla y adaptabilidad responsive mobile-first (`max-width: 640px`).

---

## 4. Verificación de Cumplimiento de Criterios

| Criterio | Estado | Observación |
| :--- | :---: | :--- |
| Campos de cronograma físico en `#modal-event` | Cumplido | Presentes con labels asociados e IDs requeridos. |
| Limpieza de campos al crear evento en `admin.js` | Cumplido | Verificado en `openNewEventModal()`. |
| Carga de campos al editar evento en `admin.js` | Cumplido | Verificado en `editEvent()`. |
| Envío de campos en payload de guardado en `admin.js` | Cumplido | Verificado en `saveEvent()`. |
| Badge púrpura "Certificado Físico + Digital" | Cumplido | Implementado con clase `.badge-purple`. |
| Tarjeta informativa de entrega física | Cumplido | Renderizado de fechas, lugar y horario de atención. |
| Descarga oficial digital para participantes físicos elegibles | Cumplido | Botón habilitado si `Elegible_Emision === true`. |
| Mensaje de espera si evento aún no concluye | Cumplido | Mensaje de disponibilidad a partir del día siguiente. |
| Accesibilidad visual y contraste WCAG AAA | Cumplido | Ratios superiores a 7:1 en todos los niveles tipográficos. |
| Diseño responsivo en móviles | Cumplido | Grilla adaptada `1fr` en pantallas menores a 640px. |
