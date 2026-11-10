# Task 5 Brief: Cronograma de Entrega Física y Descarga Digital Unificada (Backend y Frontend)

## Objetivo
Implementar la configuración administrativa de cronogramas de entrega para certificados físicos en los eventos, permitiendo a los compradores de certificados físicos visualizar sus fechas y lugar de recojo, y garantizando sin alteraciones la regla inmutable: los certificados digitales están disponibles para descarga a partir del día siguiente al evento tanto para la modalidad Virtual como para la modalidad Física.

## Requerimientos Específicos
1. **`backend/EventService.js`**:
   - En `saveEvent(eventData, adminEmail)`:
     - Persistir `Fecha_Entrega_Fisica: String(eventData.Fecha_Entrega_Fisica || "").trim()`
     - Persistir `Lugar_Entrega_Fisica: String(eventData.Lugar_Entrega_Fisica || "").trim()`
     - Persistir `Horario_Entrega_Fisica: String(eventData.Horario_Entrega_Fisica || "").trim()`
   - En `getPublicEvents()` y `getAllEventsAdmin()`:
     - Incluir estos tres campos en el mapeo de retorno.

2. **`backend/CertificateService.js`**:
   - En `query(dni, queryCode)`:
     - Si `ins.Estado_Pago === "Pagado"`:
       - Si el evento ya culminó (`todayLimaStr > eventDate`):
         - `elegibleEmision = true` (tanto para `Virtual` como para `Fisico`).
         - Si `ins.Tipo_Certificado === "Fisico"`:
           - `codigoRegla = "REGLA_C_FISICO_Y_DIGITAL"`
           - `mensajeRegla = "Certificado digital listo para descargar. Además, revisa el cronograma de entrega física de tu certificado impreso."`
           - Incluir en el objeto retornado:
             ```javascript
             entregaFisica: {
               fechas: evt ? (evt.Fecha_Entrega_Fisica || "Por coordinar con la directiva") : "Por coordinar",
               lugar: evt ? (evt.Lugar_Entrega_Fisica || "FACEN - UNAP") : "FACEN - UNAP",
               horario: evt ? (evt.Horario_Entrega_Fisica || "Horario académico") : "Horario académico"
             }
             ```
         - Si `ins.Tipo_Certificado === "Virtual"`:
           - `codigoRegla = "REGLA_D_VIRTUAL_LISTO"`
           - `mensajeRegla = "Certificado listo para generar y descargar."`
       - Si el evento es futuro o se celebra hoy (`todayLimaStr <= eventDate`):
         - `elegibleEmision = false`
         - `codigoRegla = "REGLA_B_FUTURO"`
         - `mensajeRegla = "Tu certificado estará disponible para descarga a partir del día siguiente al término del evento."`
         - Si `ins.Tipo_Certificado === "Fisico"`:
           - Incluir también `entregaFisica` con las fechas y lugar configurados para informar con anticipación.

3. **`emisor.html` y `js/admin.js`**:
   - En `#modal-event` de `emisor.html`:
     - Agregar bloque agrupado "Programación de Entrega de Certificados Físicos":
       - Input `#event-form-physical-dates`: Fecha(s) de Entrega Física (ej: "Del 25 al 28 de Noviembre de 2026").
       - Input `#event-form-physical-place`: Lugar de Entrega Física (ej: "Oficina del Círculo - FACEN UNAP, 2do Piso").
       - Input `#event-form-physical-time`: Horario de Atención (ej: "09:00 a 13:00 y 15:00 a 18:00 hrs").
   - En `js/admin.js`:
     - En `openNewEventModal`: limpiar estos campos.
     - En `editEvent(eventId)`: cargar los valores de `evt.Fecha_Entrega_Fisica`, `evt.Lugar_Entrega_Fisica`, `evt.Horario_Entrega_Fisica`.
     - En `saveEvent()`: leer los valores y agregarlos al payload de `adminSaveEvent`.

4. **`js/certificates.js`**:
   - En `renderResults(records)`:
     - Si `rec.Tipo_Certificado === 'Fisico'`:
       - Mostrar badge distintivo "Certificado Físico + Digital".
       - Si existe `rec.entregaFisica`, renderizar una tarjeta visual destacada con los detalles de entrega:
         - 📦 Fechas de Entrega
         - 📍 Lugar de Entrega
         - ⏰ Horario de Atención
       - Si `rec.Elegible_Emision === true`:
         - Mostrar botón de descarga en PDF del certificado digital oficial:
           `<button type="button" class="btn btn-primary btn-block" id="btn-download-${index}" onclick="window.CognitioPortal.downloadCertificate('${rec.Inscripcion_ID}', ${index})">📥 Descargar Certificado Oficial en PDF (Copia Digital)</button>`.
       - Si `rec.Elegible_Emision === false`:
         - Mostrar el mensaje de espera de disponibilidad digital al día siguiente al evento, acompañado de la tarjeta de entrega física.

5. **`tests/unit/business-rules.test.js`**:
   - Actualizar los casos de prueba para validar:
     1. Participante físico pagado y evento concluido -> `elegible: true`, regla `REGLA_C_FISICO_Y_DIGITAL`, datos de entrega física presentes.
     2. Participante físico pagado y evento futuro -> `elegible: false`, regla `REGLA_B_FUTURO`, datos de entrega física presentes.
     3. Participante virtual pagado y evento concluido -> `elegible: true`, regla `REGLA_D_VIRTUAL_LISTO`.
     4. Participante con pago pendiente -> `elegible: false`, regla `REGLA_A_PAGO_PENDIENTE`.

Reportar en `.superpowers/sdd/task-5-report.md`.
