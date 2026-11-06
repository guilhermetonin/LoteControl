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

export interface ParsedMonetaryValue {
  valor: number;
  centavos: number;
  formattedBr: string;
  isValid: boolean;
  isEmpty: boolean;
  isAmbiguous?: boolean;
  errorReason?: string;
}

/**
 * Normalizes monetary value to cents integer to avoid floating point issues,
 * and standard floating-point representation.
 * Supports numbers directly, Brazilian formats ('1.234,56', '-181.424,58', '696,00', '500,41')
 * and American/SheetJS formatted numbers ('1,234.56', '-181,424.58', '2,501.05', '500.41').
 * Performs strict structural validation of thousand separators and rejects ambiguous or malformed numbers.
 */
export function parseMonetaryValue(value: unknown): ParsedMonetaryValue {
  if (value === null || value === undefined || value === '') {
    return {
      valor: 0,
      centavos: 0,
      formattedBr: '0,00',
      isValid: true,
      isEmpty: true,
    };
  }

  let num: number;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return {
        valor: 0,
        centavos: 0,
        formattedBr: '0,00',
        isValid: false,
        isEmpty: false,
        errorReason: 'Valor numérico não finito (NaN ou Infinity)',
      };
    }
    num = value;
  } else {
    let str = String(value).trim();
    // Remove currency symbols, non-breaking spaces and regular spaces
    str = str.replace(/R\$/gi, '').replace(/\s+/g, '').trim();

    if (!str) {
      return {
        valor: 0,
        centavos: 0,
        formattedBr: '0,00',
        isValid: true,
        isEmpty: true,
      };
    }

    // Check negative prefixes/suffixes or accounting parentheses: -50, 50-, (50)
    let isNegative = false;
    if (str.startsWith('-') || str.endsWith('-')) {
      isNegative = true;
      str = str.replace(/-/g, '');
    } else if (str.startsWith('(') && str.endsWith(')')) {
      isNegative = true;
      str = str.slice(1, -1);
    } else if (str.startsWith('+')) {
      str = str.slice(1);
    }

    if (!str) {
      return {
        valor: 0,
        centavos: 0,
        formattedBr: '0,00',
        isValid: false,
        isEmpty: false,
        errorReason: 'Valor monetário vazio após remoção de sinais',
      };
    }

    // Check for any invalid characters (only digits, dots, and commas allowed)
    if (/[^\d.,]/.test(str)) {
      return {
        valor: 0,
        centavos: 0,
        formattedBr: '0,00',
        isValid: false,
        isEmpty: false,
        errorReason: 'Caracteres inválidos no valor monetário',
      };
    }

    const commaMatches = str.match(/,/g);
    const dotMatches = str.match(/\./g);
    const commaCount = commaMatches ? commaMatches.length : 0;
    const dotCount = dotMatches ? dotMatches.length : 0;

    let normalizedStr: string;

    if (commaCount > 0 && dotCount > 0) {
      const lastComma = str.lastIndexOf(',');
      const lastDot = str.lastIndexOf('.');

      if (lastDot > lastComma) {
        // American / SheetJS format: 2,501.05 or 1,234,567.89 -> dot is decimal, commas are thousands
        if (dotCount > 1) {
          return {
            valor: 0,
            centavos: 0,
            formattedBr: '0,00',
            isValid: false,
            isEmpty: false,
            errorReason: 'Separadores de milhar malformados',
          };
        }
        // Strict thousands regex for US format: ^\d{1,3}(,\d{3})+(\.\d{1,2})?$
        if (!/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(str)) {
          return {
            valor: 0,
            centavos: 0,
            formattedBr: '0,00',
            isValid: false,
            isEmpty: false,
            errorReason: 'Separadores de milhar malformados',
          };
        }
        normalizedStr = str.replace(/,/g, '');
      } else {
        // Brazilian format: 2.501,05 or 1.234.567,89 -> comma is decimal, dots are thousands
        if (commaCount > 1) {
          return {
            valor: 0,
            centavos: 0,
            formattedBr: '0,00',
            isValid: false,
            isEmpty: false,
            errorReason: 'Separadores de milhar malformados',
          };
        }
        // Strict thousands regex for BR format: ^\d{1,3}(\.\d{3})+(,\d{1,2})?$
        if (!/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(str)) {
          return {
            valor: 0,
            centavos: 0,
            formattedBr: '0,00',
            isValid: false,
            isEmpty: false,
            errorReason: 'Separadores de milhar malformados',
          };
        }
        normalizedStr = str.replace(/\./g, '').replace(',', '.');
      }
    } else if (commaCount > 0) {
      // Only commas, no dots
      if (commaCount > 1) {
        // Multiple commas: 1,234,567 -> commas are thousands
        if (!/^\d{1,3}(,\d{3})+$/.test(str)) {
          return {
            valor: 0,
            centavos: 0,
            formattedBr: '0,00',
            isValid: false,
            isEmpty: false,
            errorReason: 'Separadores de milhar malformados',
          };
        }
        normalizedStr = str.replace(/,/g, '');
      } else {
        // Single comma: e.g. 500,41 or 2501,05 or 1,234
        // If single comma is followed by exactly 3 digits (e.g. 1,234):
        // In Caixa/banking statements, currency has 2 decimal places. A 3-digit group without other separators
        // cannot be disambiguated safely between US thousands without decimals (1234) and non-standard decimal.
        if (/^\d{1,3},\d{3}$/.test(str)) {
          return {
            valor: 0,
            centavos: 0,
            formattedBr: '0,00',
            isValid: false,
            isEmpty: false,
            isAmbiguous: true,
            errorReason: 'Valor monetário ambíguo (vírgula com 3 dígitos sem separador decimal definido)',
          };
        }
        if (!/^\d+,\d{1,2}$/.test(str)) {
          return {
            valor: 0,
            centavos: 0,
            formattedBr: '0,00',
            isValid: false,
            isEmpty: false,
            errorReason: 'Separadores de milhar malformados',
          };
        }
        normalizedStr = str.replace(',', '.');
      }
    } else if (dotCount > 0) {
      // Only dots, no commas
      if (dotCount > 1) {
        // Multiple dots: 1.234.567 -> dots are thousands
        if (!/^\d{1,3}(\.\d{3})+$/.test(str)) {
          return {
            valor: 0,
            centavos: 0,
            formattedBr: '0,00',
            isValid: false,
            isEmpty: false,
            errorReason: 'Separadores de milhar malformados',
          };
        }
        normalizedStr = str.replace(/\./g, '');
      } else {
        // Single dot: e.g. 500.41, 2501.05 or 2.501
        // If single dot is followed by exactly 3 digits (e.g. 2.501):
        // Cannot safely differentiate between Brazilian thousands without decimals (2501) and US 3-decimal precision.
        if (/^\d{1,3}\.\d{3}$/.test(str)) {
          return {
            valor: 0,
            centavos: 0,
            formattedBr: '0,00',
            isValid: false,
            isEmpty: false,
            isAmbiguous: true,
            errorReason: 'Valor monetário ambíguo (ponto com 3 dígitos sem separador decimal definido)',
          };
        }
        if (!/^\d+\.\d{1,2}$/.test(str)) {
          return {
            valor: 0,
            centavos: 0,
            formattedBr: '0,00',
            isValid: false,
            isEmpty: false,
            errorReason: 'Separadores de milhar malformados',
          };
        }
        normalizedStr = str;
      }
    } else {
      // No commas and no dots: plain integer (e.g. 696, 0, 10, 2500)
      if (!/^\d+$/.test(str)) {
        return {
          valor: 0,
          centavos: 0,
          formattedBr: '0,00',
          isValid: false,
          isEmpty: false,
          errorReason: 'Formato numérico inválido',
        };
      }
      normalizedStr = str;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(normalizedStr)) {
      return {
        valor: 0,
        centavos: 0,
        formattedBr: '0,00',
        isValid: false,
        isEmpty: false,
        errorReason: 'Valor monetário malformado',
      };
    }

    num = parseFloat(normalizedStr);
    if (isNaN(num) || !Number.isFinite(num)) {
      return {
        valor: 0,
        centavos: 0,
        formattedBr: '0,00',
        isValid: false,
        isEmpty: false,
        errorReason: 'Valor numérico não finito',
      };
    }
    if (isNegative) {
      num = -num;
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
    isValid: true,
    isEmpty: false,
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
