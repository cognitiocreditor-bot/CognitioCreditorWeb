/**
 * CAPA DE ACCESO A DATOS (DAO) — GOOGLE APPS SCRIPT
 * Maneja la lectura y persistencia de filas en Google Sheets con tipado estricto.
 */

const Database = {
  getSpreadsheet() {
    if (CONFIG.SPREADSHEET_ID && !CONFIG.SPREADSHEET_ID.includes("TU_SPREADSHEET_ID")) {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    }
    return SpreadsheetApp.getActiveSpreadsheet();
  },

  getSheet(sheetName) {
    const ss = this.getSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`La hoja '${sheetName}' no existe en el Spreadsheet configurado.`);
    }
    return sheet;
  },

  /**
   * Lee todos los registros de una hoja convirtiéndolos en array de objetos.
   * @param {string} sheetName
   * @returns {Array<Object>}
   */
  getAll(sheetName) {
    const sheet = this.getSheet(sheetName);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const headers = data[0].map(h => String(h).trim());
    const records = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const obj = { _rowIndex: i + 1 };
      let hasData = false;

      for (let j = 0; j < headers.length; j++) {
        const val = row[j];
        if (val !== "" && val !== null && val !== undefined) hasData = true;
        // Preservar strings para DNI y fechas
        if (headers[j] === "DNI") {
          obj[headers[j]] = String(val).trim();
        } else if (val instanceof Date) {
          obj[headers[j]] = Utilities.formatDate(val, CONFIG.TIMEZONE, "yyyy-MM-dd");
        } else {
          obj[headers[j]] = val;
        }
      }

      if (hasData) records.push(obj);
    }

    return records;
  },

  /**
   * Inserta una fila en la hoja especificada respetando el orden de encabezados.
   * @param {string} sheetName
   * @param {Object} rowData
   */
  insert(sheetName, rowData) {
    const sheet = this.getSheet(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = [];

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      let val = rowData[header] !== undefined ? rowData[header] : "";

      // Forzar formato de texto para DNI anteponiendo apóstrofe si es string numérico
      if (header === "DNI" && typeof val === "string") {
        newRow.push("'" + val);
      } else {
        newRow.push(val);
      }
    }

    sheet.appendRow(newRow);
    return rowData;
  },

  /**
   * Actualiza una columna específica de una fila por su índice.
   */
  updateCell(sheetName, rowIndex, columnName, newValue) {
    const sheet = this.getSheet(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const colIndex = headers.indexOf(columnName) + 1;

    if (colIndex === 0) {
      throw new Error(`La columna '${columnName}' no existe en '${sheetName}'.`);
    }

    sheet.getRange(rowIndex, colIndex).setValue(newValue);
  },

  /**
   * Ejecuta una operación crítica protegida por un cerrojo atómico de Google Apps Script.
   * Evita condiciones de carrera entre múltiples usuarios o directivos concurrentes.
   * @param {Function} callback
   * @param {number} timeoutMs - Tiempo máximo de espera en cola (por defecto 25s)
   */
  withLock(callback, timeoutMs = 25000) {
    const lock = LockService.getScriptLock();
    const hasLock = lock.tryLock(timeoutMs);
    if (!hasLock) {
      throw new Error("El servidor está procesando múltiples solicitudes simultáneas de alta demanda. Por favor, reintente en unos instantes.");
    }
    try {
      return callback();
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * Actualiza múltiples campos de una fila existente en UNA SOLA LLAMADA en bloque (setValues),
   * reduciendo drásticamente la latencia y eliminando múltiples RPCs celda por celda.
   * @param {string} sheetName
   * @param {number} rowIndex
   * @param {Object} rowData
   */
  updateRow(sheetName, rowIndex, rowData) {
    const sheet = this.getSheet(sheetName);
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const currentRowValues = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (rowData[header] !== undefined) {
        let val = rowData[header];
        if (header === "DNI" && typeof val === "string") {
          currentRowValues[j] = "'" + val;
        } else {
          currentRowValues[j] = val;
        }
      }
    }

    // Escritura en bloque atómica de toda la fila
    sheet.getRange(rowIndex, 1, 1, lastCol).setValues([currentRowValues]);
  },

  /**
   * Inserta múltiples registros en una sola operación atómica de bloque.
   * Esencial para importaciones masivas de la directiva (Excel) sin riesgo de timeout.
   * @param {string} sheetName
   * @param {Array<Object>} rowsData
   * @returns {number} Cantidad de filas insertadas
   */
  insertBatch(sheetName, rowsData) {
    if (!rowsData || rowsData.length === 0) return 0;
    const sheet = this.getSheet(sheetName);
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    const matrix = rowsData.map(rowData => {
      const row = [];
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        let val = rowData[header] !== undefined ? rowData[header] : "";
        if (header === "DNI" && typeof val === "string") {
          row.push("'" + val);
        } else {
          row.push(val);
        }
      }
      return row;
    });

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, matrix.length, headers.length).setValues(matrix);
    return matrix.length;
  },

  /**
   * Elimina de forma atómica y segura una fila localizándola por su Clave Primaria (PK).
   * Evita descuadres de índices y jamás elimina la fila 1 de cabeceras.
   * @param {string} sheetName
   * @param {string} pkColumnName
   * @param {string} pkValue
   * @returns {boolean}
   */
  deleteRowByPk(sheetName, pkColumnName, pkValue) {
    const sheet = this.getSheet(sheetName);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return false;

    const headers = data[0].map(h => String(h).trim());
    const colIdx = headers.indexOf(pkColumnName);
    if (colIdx === -1) {
      throw new Error(`La columna PK '${pkColumnName}' no existe en '${sheetName}'.`);
    }

    const cleanPk = String(pkValue).trim();
    for (let i = 1; i < data.length; i++) {
      const val = String(data[i][colIdx]).trim();
      if (val === cleanPk) {
        const physicalRow = i + 1;
        if (physicalRow > 1) {
          sheet.deleteRow(physicalRow);
          return true;
        }
      }
    }
    return false;
  }
};
