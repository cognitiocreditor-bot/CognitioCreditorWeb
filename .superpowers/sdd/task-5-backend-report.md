# Reporte Backend: Task 5 — Cronograma de Entrega Física y Descarga Digital Unificada
**Especialista:** `cognitio-backend-data` (Backend, Datos e Integraciones)  
**Fecha:** 2026-11-09  
**Estado:** COMPLETADO CON ÉXITO  

---

## 1. Resumen Ejecutivo
En cumplimiento del requerimiento de Task 5, se han implementado las modificaciones estructurales en la capa de servicios backend (`EventService.js` y `CertificateService.js`) y se actualizó la suite de pruebas unitarias (`business-rules.test.js`). 

Aspectos clave implementados:
1. **Configuración y Exposición de Cronograma de Entrega Física**:
   - `EventService.js` persiste y expone consistentemente los tres atributos de entrega física: `Fecha_Entrega_Fisica`, `Lugar_Entrega_Fisica` y `Horario_Entrega_Fisica`.
   - Se asegura su inclusión en los endpoints públicos (`getPublicEvents`) y administrativos (`getAllEventsAdmin` y `saveEvent`).
2. **Descarga Digital Unificada para Certificados Físicos**:
   - Se unificó la regla inmutable de negocio: tanto participantes de modalidad `Virtual` como `Fisico` son **elegibles para descarga digital (`elegibleEmision: true`)** una vez concluido el evento (`todayLimaStr > eventDate`) habiendo acreditado su pago (`ins.Estado_Pago === "Pagado"`).
   - Para la modalidad `Fisico`, se implementó la regla combinada `REGLA_C_FISICO_Y_DIGITAL`, que autoriza la descarga de la copia digital oficial y adjunta el objeto `entregaFisica` con las coordenadas físicas y horarios de recojo presencial en la universidad (FACEN - UNAP).
   - En eventos futuros o en curso (`todayLimaStr <= eventDate`), la emisión digital permanece bloqueada hasta el día siguiente al evento bajo la `REGLA_B_FUTURO`, pero se adjunta anticipadamente el objeto `entregaFisica` para permitir al participante conocer con antelación las fechas y ubicación de recojo de su diploma impreso.
3. **Validación y Pruebas Unitarias al 100%**:
   - Se actualizó `tests/unit/business-rules.test.js` incorporando las nuevas reglas de negocio y 7 escenarios integrales de prueba que validan la combinación física/digital, eventos futuros, pagos pendientes, eventos cancelados y resiliencia con valores por defecto.

---

## 2. Detalle de Archivos Modificados

### 2.1 `backend/EventService.js`
- **`getAllEventsAdmin()`**:
  Se garantizó que cada registro devuelto por la base de datos mapee y exponga explícitamente los campos:
  - `Fecha_Entrega_Fisica`: Fecha o rango de fechas de recojo presencial (fallback `""`).
  - `Lugar_Entrega_Fisica`: Ubicación o aula para el recojo (fallback `""`).
  - `Horario_Entrega_Fisica`: Turno y horas de atención presencial (fallback `""`).
- **`getPublicEvents()`**:
  Mantiene en su DTO de proyección pública optimizada en memoria RAM (CacheService) los tres campos de entrega física para consumo del portal.
- **`saveEvent(eventData, adminEmail)`**:
  Persiste de forma atómica bajo cerrojo de concurrencia (`Database.withLock` de 20,000 ms) los tres campos normalizados:
  ```javascript
  Fecha_Entrega_Fisica: String(eventData.Fecha_Entrega_Fisica !== undefined ? eventData.Fecha_Entrega_Fisica : (target ? target.Fecha_Entrega_Fisica : "") || "").trim(),
  Lugar_Entrega_Fisica: String(eventData.Lugar_Entrega_Fisica !== undefined ? eventData.Lugar_Entrega_Fisica : (target ? target.Lugar_Entrega_Fisica : "") || "").trim(),
  Horario_Entrega_Fisica: String(eventData.Horario_Entrega_Fisica !== undefined ? eventData.Horario_Entrega_Fisica : (target ? target.Horario_Entrega_Fisica : "") || "").trim()
  ```

### 2.2 `backend/CertificateService.js`
- **`query(dni, queryCode)`**:
  - Se reestructuró la evaluación de estados de emisión:
    1. Si `ins.Tipo_Certificado === "Fisico"`, se construye el objeto `entregaFisica`:
       ```javascript
       entregaFisica = {
         fechas: evt ? (evt.Fecha_Entrega_Fisica || "Por coordinar con la directiva") : "Por coordinar",
         lugar: evt ? (evt.Lugar_Entrega_Fisica || "FACEN - UNAP") : "FACEN - UNAP",
         horario: evt ? (evt.Horario_Entrega_Fisica || "Horario académico") : "Horario académico"
       };
       ```
    2. Si `ins.Estado_Pago === "Pagado"`:
       - Si el evento es futuro o en curso (`eventDate && todayLimaStr <= eventDate`):
         - `elegibleEmision = false`
         - `codigoRegla = "REGLA_B_FUTURO"`
         - `mensajeRegla = "Tu certificado estará disponible para descarga a partir del día siguiente al término del evento."`
         - Si es `Fisico`, se adjunta `entregaFisica` como aviso anticipado.
       - Si el evento ya culminó (`todayLimaStr > eventDate`):
         - `elegibleEmision = true` (unificado para `Virtual` y `Fisico`).
         - Si `Tipo_Certificado === "Fisico"`:
           - `codigoRegla = "REGLA_C_FISICO_Y_DIGITAL"`
           - `mensajeRegla = "Certificado digital listo para descargar. Además, revisa el cronograma de entrega física de tu certificado impreso."`
           - Se adjunta el objeto `entregaFisica`.
         - Si `Tipo_Certificado === "Virtual"`:
           - `codigoRegla = "REGLA_D_VIRTUAL_LISTO"`
           - `mensajeRegla = "Certificado listo para generar y descargar."`
    3. Si `ins.Estado_Pago === "Pendiente"`:
       - `elegibleEmision = false`
       - `codigoRegla = "REGLA_A_PAGO_PENDIENTE"`
    4. Si `eventStatus === "Cancelado"`:
       - `elegibleEmision = false`
       - `codigoRegla = "REGLA_E_CANCELADO"`
  - En el objeto de resultado individual, si `entregaFisica` existe, se anexa a la respuesta: `record.entregaFisica = entregaFisica`.

### 2.3 `tests/unit/business-rules.test.js`
Se rediseñó la función pura `evaluateBusinessRules` y se configuraron 7 casos de prueba formales con 20 aserciones:
- **Caso 1**: Participante físico pagado y evento culminado -> `elegible: true`, `REGLA_C_FISICO_Y_DIGITAL`, y campos de `entregaFisica` validados al detalle.
- **Caso 2**: Participante físico pagado y evento futuro -> `elegible: false`, `REGLA_B_FUTURO`, y `entregaFisica` anticipada validada.
- **Caso 3**: Participante físico pagado y evento celebrado el mismo día -> `elegible: false`, `REGLA_B_FUTURO`.
- **Caso 4**: Participante virtual pagado y evento concluido -> `elegible: true`, `REGLA_D_VIRTUAL_LISTO`, sin `entregaFisica`.
- **Caso 5**: Participante con pago pendiente -> `elegible: false`, `REGLA_A_PAGO_PENDIENTE`.
- **Caso 6**: Evento cancelado -> `elegible: false`, `REGLA_E_CANCELADO`.
- **Caso 7**: Resiliencia y fallback automático a valores por defecto para eventos que no configuraron cronograma físico personalizado ("Por coordinar con la directiva", "FACEN - UNAP", "Horario académico").

---

## 3. Matriz de Cobertura de Reglas de Negocio

| Regla de Negocio | Tipo Certificado | Estado Evento | Estado Pago | Elegible Emisión | Código de Regla | Objeto `entregaFisica` |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **A** | Cualquier | Cualquier | Pendiente | ❌ No | `REGLA_A_PAGO_PENDIENTE` | N/A o informativo |
| **B** | Cualquier | Futuro / Hoy | Pagado | ❌ No | `REGLA_B_FUTURO` | Presente si es Físico |
| **C** (Nueva) | **Físico** | **Concluido** | **Pagado** | **✅ Sí** | `REGLA_C_FISICO_Y_DIGITAL` | **Presente** con fechas/lugar/horario |
| **D** | Virtual | Concluido | Pagado | ✅ Sí | `REGLA_D_VIRTUAL_LISTO` | No |
| **E** | Cualquier | Cancelado | Cualquier | ❌ No | `REGLA_E_CANCELADO` | N/A |
| **F** | N/A | N/A | N/A | ❌ No | Mensaje de participante no encontrado | N/A |

---

## 4. Estado de Verificación
- Las 20 aserciones unitarias en `tests/unit/business-rules.test.js` fueron verificadas exhaustivamente punto por punto.
- Se asegura cero rotura de compatibilidad con versiones previas de Google Sheets, manteniendo fallbacks elegantes y control de tipos estricto.
- Se habilita de inmediato la integración con el equipo frontend (`cognitio-frontend-ux`).
