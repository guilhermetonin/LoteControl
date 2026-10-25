import * as XLSX from 'xlsx';
import {
  extractDia,
  extractHorario,
  isPixHistorico,
  parseMonetaryValue,
} from '../utils/rules';

export interface PixTransaction {
  id: string; // Unique stable identity (e.g. `tx_12`)
  rowNumber: number; // Original 1-based row number in the sheet
  dataLancamento?: string;
  dataMovimento?: string;
  historico: string;
  documento: string;
  valor: number; // e.g. 10.12 or -54.00
  valorCentavos: number; // Integer cents for exact sorting & arithmetic
  rawValor: string;
  formattedBr: string; // e.g. '10,12' or '-54,00'
  saldo?: number;
  dia: string; // 'DIA 01', 'DIA 02', ..., 'DIA 00', or 'Não identificado'
  horario: string | null; // '05:23', or null
  isPix: boolean;
  observacao?: string; // Optional observation / complementary note
}

export interface StatementParseResult {
  fileName: string;
  fileHash: string;
  sheetName: string;
  allSheets: string[];
  totalRawRows: number;
  totalValidTransactions: number;
  pixTransactions: PixTransaction[];
  availableHistoricos: string[]; // All unique PIX descriptions
  initialSelectedHistoricos: string[]; // Pre-selected default descriptions
  availableDias: string[]; // All unique Dia values sorted
  errors: string[];
}

/**
 * Normalizes header strings: removes accents, trims, lowercases, removes excess spaces.
 */
export function normalizeHeader(header: unknown): string {
  if (header === null || header === undefined) return '';
  return String(header)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes a SHA-256 hash from an ArrayBuffer or binary string.
 */
export async function computeFileHash(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const digestBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(digestBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback hash for environments without Web Crypto API (e.g. Node tests if needed)
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return `hash_${(hash >>> 0).toString(16)}_${buffer.byteLength}`;
}

export interface ColumnIndices {
  headerRowIndex: number;
  historicoIndex: number;
  documentoIndex: number;
  valorIndex: number;
  dataLancamentoIndex: number;
  dataMovimentoIndex: number;
  saldoIndex: number;
}

/**
 * Scans rows of a sheet to locate the header row and map column positions.
 */
export function locateColumns(rows: unknown[][]): {
  indices: ColumnIndices | null;
  missingColumns: string[];
} {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;

    let historicoIndex = -1;
    let documentoIndex = -1;
    let valorIndex = -1;
    let dataLancamentoIndex = -1;
    let dataMovimentoIndex = -1;
    let saldoIndex = -1;

    for (let c = 0; c < row.length; c++) {
      const cellVal = normalizeHeader(row[c]);

      if (cellVal.includes('historico')) {
        historicoIndex = c;
      } else if (cellVal.includes('documento') || cellVal === 'doc') {
        documentoIndex = c;
      } else if (
        cellVal.includes('valor lancamento') ||
        cellVal === 'valor' ||
        cellVal.includes('valor lanc')
      ) {
        valorIndex = c;
      } else if (cellVal.includes('data lancamento') || cellVal.includes('dt lancamento')) {
        dataLancamentoIndex = c;
      } else if (cellVal.includes('data movimento') || cellVal.includes('dt movimento')) {
        dataMovimentoIndex = c;
      } else if (cellVal.includes('saldo')) {
        saldoIndex = c;
      }
    }

    if (historicoIndex !== -1 && documentoIndex !== -1 && valorIndex !== -1) {
      return {
        indices: {
          headerRowIndex: r,
          historicoIndex,
          documentoIndex,
          valorIndex,
          dataLancamentoIndex,
          dataMovimentoIndex,
          saldoIndex,
        },
        missingColumns: [],
      };
    }
  }

  // Determine what is missing from the entire search
  const foundHeaders = new Set<string>();
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (row && Array.isArray(row)) {
      row.forEach((cell) => {
        const norm = normalizeHeader(cell);
        if (norm) foundHeaders.add(norm);
      });
    }
  }

  const missing: string[] = [];
  let hasHist = false;
  let hasDoc = false;
  let hasVal = false;

  foundHeaders.forEach((h) => {
    if (h.includes('historico')) hasHist = true;
    if (h.includes('documento')) hasDoc = true;
    if (h.includes('valor')) hasVal = true;
  });

  if (!hasHist) missing.push('Histórico');
  if (!hasDoc) missing.push('Documento');
  if (!hasVal) missing.push('Valor Lançamento');

  return { indices: null, missingColumns: missing.length > 0 ? missing : ['Histórico', 'Documento', 'Valor Lançamento'] };
}

/**
 * Standard habituais descriptions that must be pre-selected when present
 */
export const DEFAULT_PRESELECTED_HISTORICOS = [
  'CRED PIX CHAVE',
  'PIX RECEBIDO DADOS CONTA',
];

/**
 * Parses statement ArrayBuffer (xlsx, xls, csv) and returns parsed PIX transactions and metadata.
 */
export async function parseStatement(
  buffer: ArrayBuffer,
  fileName: string,
  preferredSheetName?: string
): Promise<StatementParseResult> {
  const errors: string[] = [];
  const fileHash = await computeFileHash(buffer);

  let workbook: XLSX.WorkBook;
  try {
    const data = new Uint8Array(buffer);
    workbook = XLSX.read(data, {
      type: 'array',
      raw: false, // Ensures leading zeros in text strings like "010523" are read as formatted text
      cellText: true,
      cellDates: true,
    });
  } catch (err: any) {
    return {
      fileName,
      fileHash,
      sheetName: '',
      allSheets: [],
      totalRawRows: 0,
      totalValidTransactions: 0,
      pixTransactions: [],
      availableHistoricos: [],
      initialSelectedHistoricos: [],
      availableDias: [],
      errors: [`Erro ao abrir o arquivo: ${err?.message || 'Arquivo inválido ou corrompido.'}`],
    };
  }

  const allSheets = workbook.SheetNames || [];
  if (allSheets.length === 0) {
    return {
      fileName,
      fileHash,
      sheetName: '',
      allSheets: [],
      totalRawRows: 0,
      totalValidTransactions: 0,
      pixTransactions: [],
      availableHistoricos: [],
      initialSelectedHistoricos: [],
      availableDias: [],
      errors: ['O arquivo de extrato não contém nenhuma planilha.'],
    };
  }

  // Find target sheet
  let targetSheetName = preferredSheetName;
  let targetSheet = targetSheetName ? workbook.Sheets[targetSheetName] : null;
  let chosenColumns: ColumnIndices | null = null;
  let missingColsList: string[] = [];

  if (targetSheet) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(targetSheet, { header: 1, raw: false });
    const { indices, missingColumns } = locateColumns(rows);
    chosenColumns = indices;
    missingColsList = missingColumns;
  } else {
    // Search across all sheets for the sheet with required columns
    for (const sName of allSheets) {
      const sheet = workbook.Sheets[sName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
      const { indices, missingColumns } = locateColumns(rows);
      if (indices) {
        targetSheetName = sName;
        targetSheet = sheet;
        chosenColumns = indices;
        break;
      } else if (missingColsList.length === 0) {
        missingColsList = missingColumns;
      }
    }
  }

  if (!targetSheet || !targetSheetName || !chosenColumns) {
    const errorMsg =
      missingColsList.length > 0
        ? `Colunas obrigatórias não encontradas no extrato: ${missingColsList.join(', ')}.`
        : 'Não foi possível localizar as colunas obrigatórias (Histórico, Documento, Valor Lançamento) no arquivo.';
    return {
      fileName,
      fileHash,
      sheetName: targetSheetName || allSheets[0] || '',
      allSheets,
      totalRawRows: 0,
      totalValidTransactions: 0,
      pixTransactions: [],
      availableHistoricos: [],
      initialSelectedHistoricos: [],
      availableDias: [],
      errors: [errorMsg],
    };
  }

  // Read raw sheet rows with both formatted text and raw numeric cell formats
  const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(targetSheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  const {
    headerRowIndex,
    historicoIndex,
    documentoIndex,
    valorIndex,
    dataLancamentoIndex,
    dataMovimentoIndex,
    saldoIndex,
  } = chosenColumns;

  const pixTransactions: PixTransaction[] = [];
  const historicoSet = new Set<string>();
  const diaSet = new Set<string>();
  let totalValid = 0;

  for (let r = headerRowIndex + 1; r < sheetRows.length; r++) {
    const row = sheetRows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rawHist = row[historicoIndex];
    const rawDoc = row[documentoIndex];
    const rawVal = row[valorIndex];

    // Check if entire row is empty
    if (
      (rawHist === '' || rawHist === undefined || rawHist === null) &&
      (rawDoc === '' || rawDoc === undefined || rawDoc === null) &&
      (rawVal === '' || rawVal === undefined || rawVal === null)
    ) {
      continue;
    }

    const historico = String(rawHist ?? '').trim();
    const documento = String(rawDoc ?? '').trim();

    // Check for summary or footer lines (e.g. 'Total', 'Saldo Anterior')
    const normHist = normalizeHeader(historico);
    if (
      normHist.startsWith('total') ||
      normHist.startsWith('saldo anterior') ||
      normHist.startsWith('resumo') ||
      normHist.startsWith('posicao consolidada')
    ) {
      continue;
    }

    totalValid++;

    // Process PIX
    const isPix = isPixHistorico(historico);
    if (!isPix) {
      continue;
    }

    const { valor, centavos, formattedBr } = parseMonetaryValue(rawVal);
    const dia = extractDia(documento);
    const horario = extractHorario(documento);

    historicoSet.add(historico);
    if (dia) {
      diaSet.add(dia);
    }

    const tx: PixTransaction = {
      id: `tx_${r}`,
      rowNumber: r + 1, // 1-based line number in sheet
      historico,
      documento,
      valor,
      valorCentavos: centavos,
      rawValor: String(rawVal ?? ''),
      formattedBr,
      dia,
      horario,
      isPix: true,
      dataLancamento:
        dataLancamentoIndex !== -1 && row[dataLancamentoIndex] !== undefined
          ? String(row[dataLancamentoIndex]).trim()
          : undefined,
      dataMovimento:
        dataMovimentoIndex !== -1 && row[dataMovimentoIndex] !== undefined
          ? String(row[dataMovimentoIndex]).trim()
          : undefined,
      saldo:
        saldoIndex !== -1 && row[saldoIndex] !== undefined
          ? parseMonetaryValue(row[saldoIndex]).valor
          : undefined,
    };

    pixTransactions.push(tx);
  }

  // Order PIX transactions ascending by monetary value (numeric centavos),
  // with secondary stable tie-break by original rowNumber
  pixTransactions.sort((a, b) => {
    if (a.valorCentavos !== b.valorCentavos) {
      return a.valorCentavos - b.valorCentavos;
    }
    return a.rowNumber - b.rowNumber;
  });

  const availableHistoricos = Array.from(historicoSet).sort((a, b) => a.localeCompare(b));

  // Determine initial selected historicos
  // Pre-select 'CRED PIX CHAVE' and 'PIX RECEBIDO DADOS CONTA' (case/accent tolerant)
  const initialSelectedHistoricos: string[] = [];
  availableHistoricos.forEach((h) => {
    const norm = normalizeHeader(h);
    const matchesDefault = DEFAULT_PRESELECTED_HISTORICOS.some(
      (dh) => normalizeHeader(dh) === norm
    );
    if (matchesDefault) {
      initialSelectedHistoricos.push(h);
    }
  });

  // Sort available dias in ascending order: 'DIA 01', 'DIA 02', ..., and 'DIA 00' at the start
  const availableDias = Array.from(diaSet).sort((a, b) => {
    if (a === 'DIA 00') return -1;
    if (b === 'DIA 00') return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  return {
    fileName,
    fileHash,
    sheetName: targetSheetName,
    allSheets,
    totalRawRows: sheetRows.length,
    totalValidTransactions: totalValid,
    pixTransactions,
    availableHistoricos,
    initialSelectedHistoricos,
    availableDias,
    errors,
  };
}
