# ESQUEMA DE BASE DE DATOS — GOOGLE SHEETS
## Círculo de Estudios COGNITIO CREDITOR

Este documento define la estructura oficial, tipos de datos, restricciones y formato de celdas para el archivo de Google Sheets que actúa como base de datos del sistema.

---

## 1. Reglas Generales de Formateo
1. **Tratamiento del DNI**: La columna `DNI` en todas las hojas debe tener formato de **Texto sin formato** (Plain text) para preservar ceros iniciales (ej. `'01234567'`).
2. **Zona Horaria**: Todas las fechas y horas registradas deben corresponder a `America/Lima` (UTC-5).
3. **Identificadores Únicos**:
   - `Evento_ID`: Prefijo `EVT-` seguido de año y correlativo (ej. `EVT-2026-001`).
   - `Participante_ID`: Prefijo `PAR-` seguido de correlativo de 6 dígitos (ej. `PAR-000001`).
   - `Inscripcion_ID`: Prefijo `INS-` seguido de año y correlativo (ej. `INS-2026-0001`).
   - `Configuracion_Certificado_ID`: Prefijo `CFG-` seguido del ID del evento (ej. `CFG-EVT-2026-001`).
   - `Codigo_Consulta`: Token alfanumérico seguro de 6 a 8 caracteres (ej. `CC-8F4A2B`).

---

## 2. Hoja 1: `Eventos`

| Columna | Nombre de Cabecera | Tipo de Dato | Obligatorio | Valores Permitidos / Descripción |
|:---|:---|:---|:---:|:---|
| A | `Evento_ID` | Texto | Sí | PK. Ej: `EVT-2026-001` |
| B | `Titulo_Evento` | Texto | Sí | Título oficial del evento |
| C | `Descripcion` | Texto multilínea | Sí | Descripción detallada |
| D | `Fecha_Evento` | Fecha (YYYY-MM-DD) | Sí | Fecha calendario de realización |
| E | `Hora_Evento` | Texto (HH:mm) | No | Hora de inicio (ej. `19:00`) |
| F | `Expositor` | Texto | Sí | Nombre y cargo del ponente |
| G | `Imagen_URL` | Texto (URL) | No | URL de banner promocional |
| H | `Link_Formulario` | Texto (URL) | No | Enlace a Google Forms u otro formulario externo |
| I | `Link_Plantilla` | Texto | No | ID del archivo PDF en Google Drive |
| J | `Estado` | Texto | Sí | `Borrador`, `Activo`, `Finalizado`, `Cancelado`, `Inactivo` |
| K | `Modalidad` | Texto | Sí | `Virtual`, `Presencial`, `Hibrido` |
| L | `Fecha_Publicacion` | Fecha-Hora | No | Marca temporal desde la cual es visible al público |
| M | `Configuracion_Certificado_ID` | Texto | No | FK a `Configuracion_Certificados` |

---

## 3. Hoja 2: `Participantes`

| Columna | Nombre de Cabecera | Tipo de Dato | Obligatorio | Valores Permitidos / Descripción |
|:---|:---|:---|:---:|:---|
| A | `Participante_ID` | Texto | Sí | PK. Ej: `PAR-000001` |
| B | `DNI` | Texto (8 dígitos) | Sí | Documento de identidad nacional (formato texto) |
| C | `Nombre_Completo` | Texto | Sí | Nombre y apellidos en orden formal para certificados |
| D | `Fecha_Registro` | Fecha-Hora | Sí | Timestamp de creación del registro |
| E | `Estado_Registro` | Texto | Sí | `Activo`, `Observado`, `Inactivo` |

---

## 4. Hoja 3: `Inscripciones`

| Columna | Nombre de Cabecera | Tipo de Dato | Obligatorio | Valores Permitidos / Descripción |
|:---|:---|:---|:---:|:---|
| A | `Inscripcion_ID` | Texto | Sí | PK. Ej: `INS-2026-0001` |
| B | `Participante_ID` | Texto | Sí | FK a `Participantes` |
| C | `Evento_ID` | Texto | Sí | FK a `Eventos` |
| D | `Tipo_Certificado` | Texto | Sí | `Virtual`, `Fisico` |
| E | `Estado_Pago` | Texto | Sí | `Pendiente`, `Pagado`, `Anulado`, `Reembolsado` |
| F | `Fecha_Pago` | Fecha-Hora | No | Fecha en la que la directiva confirmó el pago |
| G | `Referencia_Comprobante`| Texto | No | N° de operación bancaria, voucher o recibo |
| H | `Estado_Inscripcion`| Texto | Sí | `Registrada`, `Confirmada`, `Cancelada` |
| I | `Codigo_Consulta` | Texto | Sí | Código de consulta individual para el participante |
| J | `Fecha_Emision` | Fecha-Hora | No | Fecha del primer PDF emitido |

---

## 5. Hoja 4: `Configuracion_Certificados`

| Columna | Nombre de Cabecera | Tipo de Dato | Obligatorio | Valores Permitidos / Descripción |
|:---|:---|:---|:---:|:---|
| A | `Configuracion_Certificado_ID` | Texto | Sí | PK. Ej: `CFG-EVT-2026-001` |
| B | `Evento_ID` | Texto | Sí | FK a `Eventos` |
| C | `Link_Plantilla` | Texto | Sí | ID del archivo PDF plantilla en Google Drive |
| D | `Pagina_Certificado` | Número | Sí | Número de página (comienza en 1, defecto: 1) |
| E | `Posicion_X` | Número | Sí | Coordenada horizontal (puntos). Centrado si aplica |
| F | `Posicion_Y` | Número | Sí | Coordenada vertical medida desde el borde inferior |
| G | `Ancho_Maximo_Nombre` | Número | Sí | Ancho máximo permitido antes del autoajuste |
| H | `Tamano_Fuente_Inicial`| Número | Sí | Tamaño en puntos tipográficos (ej. 32) |
| I | `Tamano_Fuente_Minimo` | Número | Sí | Tamaño límite inferior de escala (ej. 16) |
| J | `Fuente_URL` | Texto | No | Identificador o ruta de fuente personalizada |
| K | `Alineacion` | Texto | Sí | `Centrado`, `Izquierda`, `Derecha` |
| L | `Color_Texto` | Texto (Hex) | Sí | Color tipográfico (ej. `#1B365D`) |
| M | `Escala_o_Unidad_Referencia` | Texto | Sí | `pt` (puntos tipográficos 72 dpi) |
| N | `Estado_Configuracion`| Texto | Sí | `Borrador`, `Publicado` |

---

## 6. Hoja 5: `Logs_Auditoria`

| Columna | Nombre de Cabecera | Tipo de Dato | Obligatorio | Valores Permitidos / Descripción |
|:---|:---|:---|:---:|:---|
| A | `Log_ID` | Texto | Sí | PK autogenerada |
| B | `Timestamp` | Fecha-Hora | Sí | Timestamp de la operación en `America/Lima` |
| C | `Usuario_Admin` | Texto | Sí | Email de Google de la persona que ejecutó la acción |
| D | `Accion` | Texto | Sí | `CONFIRMAR_PAGO`, `CREAR_EVENTO`, `EDITAR_EVENTO`, `GENERAR_LOTE`, `IMPORTAR_EXCEL` |
| E | `Entidad_Afectada` | Texto | Sí | ID del registro modificado (ej. `INS-2026-0001`) |
| F | `Detalle` | Texto | No | Resumen de la acción sin datos sensibles |

---

## 7. Gobernanza de Datos y Reglas de Protección Automatizadas

Para evitar la corrupción de datos y la pérdida de integridad referencial identificadas en el análisis de riesgos, se aplican las siguientes defensas a través de [`backend/SetupDatabase.js`](file:///c:/Users/USUARIO/PROYECTO%20COGNITIO/backend/SetupDatabase.js):

1. **Blindaje de Cabeceras**: La Fila 1 de las 5 pestañas se encuentra protegida con advertencia (`WarningOnly`) y congelada (`FrozenRows: 1`) para evitar alteraciones de nombres que rompan los mapeos del DAO (`Database.js`).
2. **Validación de Integridad de DNI**:
   - Validación nativa por fórmula: `=REGEXMATCH(TO_TEXT(B2), "^\d{8}$")` (Rechaza entradas no numéricas o de longitud distinta a 8).
   - Formateo forzado a `@` (*Plain Text*) en columnas de claves foráneas y DNI.
   - Trigger reactivo `onEdit` que auto-completa con ceros a la izquierda (`padStart(8, "0")`) ante pegados accidentales.
3. **Listas Desplegables de Estados**: Los campos de estado y modalidad restringen la entrada exclusivamente a los valores canónicos permitidos, previniendo discrepancias por mayúsculas/minúsculas o espacios accidentales.

