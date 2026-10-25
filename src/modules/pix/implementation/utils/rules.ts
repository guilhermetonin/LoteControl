/**
 * Business rules for Caixa PIX Statement extraction and normalization
 */

/**
 * Extracts and normalizes the "Dia" from Documento.
 *
 * Formula from Google Sheets:
 * ="DIA "&SE(NÚM.CARACT(B2)=5;ESQUERDA(B2;1);ESQUERDA(B2;2))
 *
 * Rules:
 * - If Documento has exactly 5 digits, extract the 1st digit.
 * - If Documento has at least 2 digits and != 5, extract the first 2 digits.
 * - Normalized display format: 'DIA 01', 'DIA 02', ..., preserving 'DIA 00'.
 * - If not recognizable or invalid, return 'Não identificado'.
 */
export function extractDia(documento: string | number | null | undefined): string {
  if (documento === null || documento === undefined) {
    return 'Não identificado';
  }

  // Treat as string and trim
  let docStr = String(documento).trim();
  if (!docStr) {
    return 'Não identificado';
  }

  // Check if string contains digits
  const digitMatch = docStr.match(/^\d+/);
  if (!digitMatch) {
    return 'Não identificado';
  }

  // Standard rule based on formula:
  // If exactly 5 characters/digits
  if (docStr.length === 5) {
    const dayNum = parseInt(docStr.substring(0, 1), 10);
    if (isNaN(dayNum)) return 'Não identificado';
    return `DIA ${String(dayNum).padStart(2, '0')}`;
  }

  // If at least 2 characters
  if (docStr.length >= 2) {
    const prefix = docStr.substring(0, 2);
    // Special preservation of '00'
    if (prefix === '00') {
      return 'DIA 00';
    }
    const dayNum = parseInt(prefix, 10);
    if (isNaN(dayNum)) return 'Não identificado';
    return `DIA ${String(dayNum).padStart(2, '0')}`;
  }

  // If single digit
  if (docStr.length === 1) {
    const dayNum = parseInt(docStr, 10);
    if (isNaN(dayNum)) return 'Não identificado';
    return `DIA ${String(dayNum).padStart(2, '0')}`;
  }

  return 'Não identificado';
}

/**
 * Extracts Horário from the last 4 digits of Documento, if valid.
 *
 * Rules:
 * - HH: 00 to 23
 * - MM: 00 to 59
 * - Documents filled with zeros (e.g. 000000) are NOT considered a valid time.
 * - If not valid time or doc too short, return null (Não identificado).
 */
export function extractHorario(documento: string | number | null | undefined): string | null {
  if (documento === null || documento === undefined) {
    return null;
  }

  const docStr = String(documento).trim();
  if (docStr.length < 5) {
    return null;
  }

  // Documents consisting purely of zeros (e.g. '000000') should NOT be treated as valid time 00:00
  if (/^0+$/.test(docStr)) {
    return null;
  }

  // Extract last 4 digits
  const suffix = docStr.slice(-4);
  if (!/^\d{4}$/.test(suffix)) {
    return null;
  }

  const hh = parseInt(suffix.substring(0, 2), 10);
  const mm = parseInt(suffix.substring(2, 4), 10);

  if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Checks if a description contains 'PIX' (case-insensitive, trimmed).
 */
export function isPixHistorico(historico: string | null | undefined): boolean {
  if (!historico) return false;
  return /\bPIX\b|PIX/i.test(historico);
}

/**
 * Normalizes monetary value to cents integer to avoid floating point issues,
 * and standard floating-point representation.
 * Supports Brazilian formats: '1.234,56', '-181.424,58', '696,00' or raw numbers: 696, -181424.58.
 */
export function parseMonetaryValue(value: unknown): { valor: number; centavos: number; formattedBr: string } {
  if (value === null || value === undefined || value === '') {
    return { valor: 0, centavos: 0, formattedBr: '0,00' };
  }

  let num: number;

  if (typeof value === 'number') {
    num = value;
  } else {
    let str = String(value).trim();
    // Remove currency symbols and non-breaking spaces
    str = str.replace(/R\$/g, '').replace(/\s+/g, '').trim();

    // Check if Brazilian format with comma as decimal separator (e.g. '1.234,56' or '-181.424,58')
    if (str.includes(',')) {
      // Remove thousands separator '.'
      str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes('.') && (str.match(/\./g) || []).length > 1) {
      // e.g. 1.234.567 -> treat last or invalid
      str = str.replace(/\.(?=.*\.)/g, '');
    }

    num = parseFloat(str);
    if (isNaN(num)) {
      num = 0;
    }
  }

  // Calculate centavos integer safely
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const centavos = Math.round(absNum * 100) * (isNegative ? -1 : 1);
  const finalValor = centavos / 100;

  // Format Brazilian plain text value for copying: e.g. '5,00', '-54,00'
  const sign = isNegative ? '-' : '';
  const absCentavos = Math.abs(centavos);
  const intPart = Math.floor(absCentavos / 100).toString();
  const decPart = (absCentavos % 100).toString().padStart(2, '0');
  const formattedBr = `${sign}${intPart},${decPart}`;

  return {
    valor: finalValor,
    centavos,
    formattedBr,
  };
}

/**
 * Formats a monetary value for visual display in Brazilian currency (e.g. 'R$ 1.234,56' or '-R$ 181.424,58').
 */
export function formatCurrencyBr(valor: number): string {
  const isNegative = valor < 0;
  const absVal = Math.abs(valor);

  const formatted = absVal.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return isNegative ? `-R$ ${formatted}` : `R$ ${formatted}`;
}

/**
 * Formats a monetary value without the 'R$' prefix (e.g. '6,75', '100,00', '1.000,00', '-54,00').
 * Used in the conference list and pendentes panel for a clean spreadsheet appearance.
 */
export function formatCurrencyPlain(valor: number): string {
  const isNegative = valor < 0;
  const absVal = Math.abs(valor);

  const formatted = absVal.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return isNegative ? `-${formatted}` : formatted;
}
