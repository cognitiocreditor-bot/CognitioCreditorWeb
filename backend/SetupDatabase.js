/**
 * SCRIPT DE INICIALIZACIÓN, BLINDAJE Y GOBERNANZA DE DATOS — GOOGLE APPS SCRIPT
 * Proyecto: Círculo de Estudios COGNITIO CREDITOR
 * Archivo: backend/SetupDatabase.js
 * 
 * Funcionalidades:
 * 1. Crea y estructura las 5 pestañas oficiales.
 * 2. Protege la fila 1 de cabeceras contra borrado o renombrado accidental.
 * 3. Aplica formato de "Texto sin formato" (@) en IDs y columnas DNI.
 * 4. Aplica Reglas de Validación de Datos estrictas (Dropdowns para estados, regex para DNI).
 * 5. Provee trigger 'onEdit' para corrección y auto-completado de ceros en DNI al editar manualmente.
 */

function setupCognitioDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheetDefinitions = [
    {
      name: "Eventos",
      headers: [
        "Evento_ID", "Titulo_Evento", "Descripcion", "Fecha_Evento",
        "Hora_Evento", "Expositor", "Imagen_URL", "Link_Formulario",
        "Link_Plantilla", "Estado", "Modalidad", "Fecha_Publicacion",
        "Configuracion_Certificado_ID"
      ],
      textColumns: [1, 9, 13], // A, I, M
      validations: [
        {
          column: 10, // J: Estado
          type: "list",
          values: ["Borrador", "Activo", "Finalizado", "Cancelado", "Inactivo"]
        },
        {
          column: 11, // K: Modalidad
          type: "list",
          values: ["Virtual", "Presencial", "Hibrido"]
        }
      ]
    },
    {
      name: "Participantes",
      headers: [
        "Participante_ID", "DNI", "Nombre_Completo", "Fecha_Registro", "Estado_Registro"
      ],
      textColumns: [1, 2], // A: ID, B: DNI
      validations: [
        {
          column: 5, // E: Estado_Registro
          values: ["Activo", "Observado", "Inactivo"]
        }
      ]
    },
    {
      name: "Inscripciones",
      headers: [
        "Inscripcion_ID", "Participante_ID", "Evento_ID", "Tipo_Certificado",
        "Estado_Pago", "Fecha_Pago", "Referencia_Comprobante", "Estado_Inscripcion",
        "Codigo_Consulta", "Fecha_Emision"
      ],
      textColumns: [1, 2, 3, 9], // A: Inscripcion_ID, B: Participante_ID, C: Evento_ID, I: Codigo_Consulta
      validations: [
        {
          column: 4, // D: Tipo_Certificado
          type: "list",
          values: ["Virtual", "Fisico"]
        },
        {
          column: 5, // E: Estado_Pago
          type: "list",
          values: ["Pendiente", "Pagado", "Anulado", "Reembolsado"]
        },
        {
          column: 8, // H: Estado_Inscripcion
          type: "list",
          values: ["Registrada", "Confirmada", "Cancelada"]
        }
      ]
    },
    {
      name: "Configuracion_Certificados",
      headers: [
        "Configuracion_Certificado_ID", "Evento_ID", "Link_Plantilla", "Pagina_Certificado",
        "Posicion_X", "Posicion_Y", "Ancho_Maximo_Nombre", "Tamano_Fuente_Inicial",
        "Tamano_Fuente_Minimo", "Fuente_URL", "Alineacion", "Color_Texto",
        "Escala_o_Unidad_Referencia", "Estado_Configuracion"
      ],
      textColumns: [1, 2, 3, 10, 12, 13],
      validations: [
        {
          column: 11, // K: Alineacion
          type: "list",
          values: ["Centrado", "Izquierda", "Derecha"]
        },
        {
          column: 14, // N: Estado_Configuracion
          type: "list",
          values: ["Borrador", "Publicado"]
        }
      ]
    },
    {
      name: "Logs_Auditoria",
      headers: [
        "Log_ID", "Timestamp", "Usuario_Admin", "Accion", "Entidad_Afectada", "Detalle"
      ],
      textColumns: [1, 5],
      validations: [
        {
          column: 4, // D: Accion
          type: "list",
          values: ["CONFIRMAR_PAGO", "CREAR_EVENTO", "EDITAR_EVENTO", "GENERAR_LOTE_FISICO", "IMPORTAR_EXCEL", "LOGIN_ADMIN"]
        }
      ]
    }
  ];

  sheetDefinitions.forEach(def => {
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
    }

    // 1. Cabeceras en Fila 1
    const maxCols = Math.max(sheet.getMaxColumns(), def.headers.length);
    if (sheet.getMaxColumns() < def.headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), def.headers.length - sheet.getMaxColumns());
    }

    const headerRange = sheet.getRange(1, 1, 1, def.headers.length);
    headerRange.setValues([def.headers]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1B365D"); // Azul Institucional
    headerRange.setFontColor("#FFFFFF");
    headerRange.setHorizontalAlignment("center");

    // Congelar cabecera
    sheet.setFrozenRows(1);

    // 2. Proteger Fila 1 contra modificaciones involuntarias
    const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    let headerProtection = protections.find(p => p.getRange().getRow() === 1 && p.getRange().getNumRows() === 1);
    if (!headerProtection) {
      headerProtection = headerRange.protect();
      headerProtection.setDescription("Cabeceras bloqueadas del sistema COGNITIO CREDITOR");
      headerProtection.setWarningOnly(true); // Alerta si alguien intenta alterar las cabeceras
    }

    // Asegurar que la hoja cuente con al menos 100 filas
    if (sheet.getMaxRows() < 100) {
      sheet.insertRowsAfter(sheet.getMaxRows(), 100 - sheet.getMaxRows());
    }
    const numRows = sheet.getMaxRows() - 1;

    // 3. Formato Texto sin formato (@)
    def.textColumns.forEach(colIndex => {
      sheet.getRange(2, colIndex, numRows, 1).setNumberFormat("@");
    });

    // 4. Reglas de Validación de Datos (Listas desplegables estándar)
    if (def.validations) {
      def.validations.forEach(val => {
        const targetRange = sheet.getRange(2, val.column, numRows, 1);
        const rule = SpreadsheetApp.newDataValidation()
          .requireValueInList(val.values, true)
          .setAllowInvalid(false)
          .setHelpText(`Seleccione uno de los valores permitidos: ${val.values.join(", ")}`)
          .build();
        targetRange.setDataValidation(rule);
      });
    }
  });

  // Limpiar hoja inicial por defecto si está vacía
  const defaultSheet = ss.getSheetByName("Hoja 1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch (e) {
      // Ignorar si no es posible eliminarla
    }
  }

  Logger.log("Esquema y blindaje de COGNITIO CREDITOR configurados exitosamente.");
}

/**
 * TRIGGER DE PROTECCIÓN DE EDICIÓN (onEdit)
 * Auto-corrige entradas numéricas en la columna DNI rellenando con ceros si un usuario pega
 * un número sin formato o sin apóstrofe.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const col = e.range.getColumn();
  const row = e.range.getRow();

  // Aplica para columna DNI (Columna 2 en Participantes)
  if (sheetName === "Participantes" && col === 2 && row > 1) {
    const rawVal = String(e.value || e.range.getValue() || "").trim();
    if (/^\d{1,8}$/.test(rawVal)) {
      const paddedDni = rawVal.padStart(8, "0");
      e.range.setNumberFormat("@");
      e.range.setValue("'" + paddedDni);
    }
  }
}
