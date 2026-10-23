/**
 * MOTOR DE GENERACIÓN DE PDF CLIENTE — COGNITIO CREDITOR
 * Diseñado con pdf-lib y fontkit para renderizado vectorial fiel,
 * auto-escalado tipográfico y centrado exacto por evento.
 */

import { CONFIG } from './config.js';
import { Validation } from './validation.js';

export const PdfEngine = {
  /**
   * Asegura que PDFLib, fontkit y la tipografía institucional estén listos antes de generar.
   */
  async ensureReady() {
    // 1. Esperar a PDFLib
    if (typeof PDFLib === 'undefined') {
      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 120));
        if (typeof PDFLib !== 'undefined') break;
      }
    }
    if (typeof PDFLib === 'undefined') {
      throw new Error('El motor de generación PDF aún se está iniciando. Por favor reintente en unos instantes.');
    }

    // 2. Esperar a fontkit (para fuentes TrueType vectoriales)
    if (typeof fontkit === 'undefined') {
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (typeof fontkit !== 'undefined') break;
      }
    }

    // 3. Precargar en memoria la tipografía institucional única para todos los certificados
    await this._loadFontBytes('Cinzel');
    return true;
  },

  /**
   * Catálogo oficial de la tipografía institucional.
   */
  FONTS: {
    'Cinzel': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/cinzel/static/Cinzel-Bold.ttf'
  },
  _fontCache: {},

  /**
   * Descarga o recupera de la caché en memoria los bytes de la tipografía oficial.
   */
  async _loadFontBytes(fontSpec = 'Cinzel') {
    const targetUrl = this.FONTS['Cinzel'];
    if (this._fontCache[targetUrl]) {
      return this._fontCache[targetUrl];
    }

    try {
      const response = await fetch(targetUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      this._fontCache[targetUrl] = uint8;
      return uint8;
    } catch (err) {
      console.warn('[PdfEngine] No se pudo descargar Cinzel, se usará la fuente solemne nativa:', err);
      return null;
    }
  },

  /**
   * Carga la tipografía institucional ÚNICA para el 100% de los certificados.
   * Elimina cualquier discrepancia entre eventos y garantiza que TODOS salgan idénticos.
   */
  async _embedDocumentFont(pdfDoc, config = {}) {
    // 1. Priorizar la tipografía institucional Cinzel
    try {
      const fontBytes = await this._loadFontBytes('Cinzel');
      if (fontBytes && typeof fontkit !== 'undefined') {
        return await pdfDoc.embedFont(fontBytes);
      }
    } catch (customErr) {
      console.warn('[PdfEngine] Error incrustando Cinzel TTF, recurriendo a fuente solemne integrada:', customErr);
    }

    // 2. Fallback garantizado: Times Roman Cursiva Negrita (nativa e inmutable)
    return await pdfDoc.embedFont(PDFLib.StandardFonts.TimesRomanBoldItalic);
  },

  /**
   * Genera un certificado virtual individual en el navegador del cliente.
   * @param {Object} certData - Datos del certificado y plantilla autorizada
   * @returns {Promise<Uint8Array>} Bytes del PDF generado
   */
  async generateCertificatePdf(certData) {
    await this.ensureReady();

    const {
      templateBytes,      // ArrayBuffer o Uint8Array del PDF plantilla
      participantName,    // Nombre del participante
      config              // Configuración de coordenadas y tipografía
    } = certData;

    if (!templateBytes || templateBytes.byteLength === 0) {
      throw new Error('La plantilla PDF suministrada es inválida o está vacía.');
    }

    // 1. Cargar el documento PDF original preservando su estructura vectorial
    const pdfDoc = await PDFLib.PDFDocument.load(templateBytes);

    // 2. Registrar fontkit para admitir fuentes TrueType/OpenType personalizadas y tildes/ñ
    if (typeof fontkit !== 'undefined') {
      pdfDoc.registerFontkit(fontkit);
    }

    // 3. Obtener la página especificada en la configuración (1-indexed a 0-indexed)
    const pageIndex = Math.max(0, (config.Pagina_Certificado || 1) - 1);
    const pages = pdfDoc.getPages();
    if (pageIndex >= pages.length) {
      throw new Error(`La página ${config.Pagina_Certificado} no existe en la plantilla (total: ${pages.length}).`);
    }
    const page = pages[pageIndex];
    const { width: pageWidth, height: pageHeight } = page.getSize();

    // 4. Cargar la fuente tipográfica autorizada (Caligráfica por defecto o configurada)
    const customFont = await this._embedDocumentFont(pdfDoc, config);

    // 5. Normalizar el nombre a formato Título (Iniciales en mayúscula, resto en minúscula)
    const cleanName = Validation.toTitleCase(participantName);
    const initialSize = Number(config.Tamano_Fuente_Inicial) || CONFIG.CERTIFICATE_CONFIG.DEFAULT_FONT_SIZE;
    const minSize = Number(config.Tamano_Fuente_Minimo) || CONFIG.CERTIFICATE_CONFIG.MIN_FONT_SIZE;
    const maxWidth = Number(config.Ancho_Maximo_Nombre) || (pageWidth * 0.75);

    let currentFontSize = initialSize;
    let textWidth = customFont.widthOfTextAtSize(cleanName, currentFontSize);

    // Reducción proporcional de fuente si excede el ancho límite
    while (textWidth > maxWidth && currentFontSize > minSize) {
      currentFontSize -= 1;
      textWidth = customFont.widthOfTextAtSize(cleanName, currentFontSize);
    }

    // 6. Cálculo del posicionamiento y centrado horizontal
    let x = Number(config.Posicion_X);
    const y = Number(config.Posicion_Y);

    if (config.Alineacion === 'Centrado' || isNaN(x) || x <= 0) {
      // Centrado absoluto respecto al ancho total de la página
      x = (pageWidth - textWidth) / 2;
    }

    // 7. Parsear color del texto (soporte Hex ej. #1B365D)
    const textColor = this._parseColor(config.Color_Texto || CONFIG.CERTIFICATE_CONFIG.DEFAULT_COLOR);

    // 8. Dibujar el nombre en las coordenadas calculadas
    console.log(`[PdfEngine] Inyectando nombre: "${cleanName}" | Fuente: ${customFont.name} | Tamaño: ${currentFontSize}pt | Coordenadas: (X=${x.toFixed(1)}, Y=${y})`);
    page.drawText(cleanName, {
      x,
      y,
      size: currentFontSize,
      font: customFont,
      color: textColor
    });

    // 9. Guardar y retornar bytes del PDF final
    return await pdfDoc.save();
  },

  /**
   * Genera un lote consolidado de múltiples certificados para emisión física.
   * @param {Array<Object>} items - Lista de inscripciones y plantillas
   * @param {Function} onProgress - Callback de avance (index, total)
   */
  async generateBatchPdf(items, onProgress = null) {
    await this.ensureReady();

    const mergedDoc = await PDFLib.PDFDocument.create();
    if (typeof fontkit !== 'undefined') {
      mergedDoc.registerFontkit(fontkit);
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (onProgress) onProgress(i + 1, items.length);

      const singlePdfBytes = await this.generateCertificatePdf(item);
      const tempDoc = await PDFLib.PDFDocument.load(singlePdfBytes);
      const copiedPages = await mergedDoc.copyPages(tempDoc, tempDoc.getPageIndices());
      copiedPages.forEach(p => mergedDoc.addPage(p));
    }

    return await mergedDoc.save();
  },

  /**
   * Convierte un código Hexadecimal en objeto RGB para pdf-lib.
   * @param {string} hex
   */
  _parseColor(hex) {
    if (!hex || typeof hex !== 'string') return PDFLib.rgb(0.04, 0.15, 0.25);
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return PDFLib.rgb(0.04, 0.15, 0.25);

    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    return PDFLib.rgb(r, g, b);
  },

  /**
   * Dispara la descarga de un buffer de PDF en el navegador del usuario.
   * @param {Uint8Array} pdfBytes
   * @param {string} fileName
   */
  downloadPdf(pdfBytes, fileName = 'Certificado_Cognitio_Creditor.pdf') {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }
};
