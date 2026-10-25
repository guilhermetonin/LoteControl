// ==========================================================================
// CheckProtege - Parser de Planilhas de Cofres Protege (.xlsx / .csv)
// ==========================================================================

import { LOTERICAS, CNPJ_TO_LOTERICA, formatarCNPJ } from './constants.js';

/**
 * Normaliza texto de cabeçalho para comparação
 */
function normalizarTexto(txt) {
  return String(txt || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Mapeia índices de colunas com base no cabeçalho
 */
function mapearColunas(headerRow) {
  const mapa = {
    cnpj: -1,
    data: -1,
    cofre: -1,
    usuario: -1,
    evento: -1,
    transacao: -1,
    dataTransacao: -1,
    dataIntegracao: -1,
    corte: -1,
    cedulas: -1,
    total: -1,
    n1: -1,
    n2: -1,
    n5: -1,
    n10: -1,
    n20: -1,
    n50: -1,
    n100: -1,
    n200: -1
  };

  headerRow.forEach((colName, idx) => {
    const norm = normalizarTexto(colName);
    if (!norm) return;

    if (norm === 'cnpj') mapa.cnpj = idx;
    else if (norm === 'data') mapa.data = idx; // Coluna Data exata
    else if (norm.includes('data transa')) mapa.dataTransacao = idx;
    else if (norm.includes('data integra')) mapa.dataIntegracao = idx;
    else if (norm === 'cofre') mapa.cofre = idx;
    else if (norm === 'usuario') mapa.usuario = idx;
    else if (norm === 'evento') mapa.evento = idx;
    else if (norm.includes('transa') && !norm.includes('data')) mapa.transacao = idx;
    else if (norm === 'corte') mapa.corte = idx;
    else if (norm.includes('cedula')) mapa.cedulas = idx;
    else if (norm === 'total') mapa.total = idx;
    // Cédulas específicas
    else if (norm.includes('1,00') || norm.includes('1.00')) mapa.n1 = idx;
    else if (norm.includes('2,00') || norm.includes('2.00')) mapa.n2 = idx;
    else if (norm.includes('5,00') || norm.includes('5.00')) mapa.n5 = idx;
    else if (norm.includes('10,00') || norm.includes('10.00')) mapa.n10 = idx;
    else if (norm.includes('20,00') || norm.includes('20.00')) mapa.n20 = idx;
    else if (norm.includes('50,00') || norm.includes('50.00')) mapa.n50 = idx;
    else if (norm.includes('100,00') || norm.includes('100.00')) mapa.n100 = idx;
    else if (norm.includes('200,00') || norm.includes('200.00')) mapa.n200 = idx;
  });

  // Fallbacks para posições padrão das planilhas Protege caso algum cabeçalho falhe
  if (mapa.cnpj === -1) mapa.cnpj = 0;
  if (mapa.data === -1) mapa.data = 1;
  if (mapa.cofre === -1) mapa.cofre = 2;
  if (mapa.usuario === -1) mapa.usuario = 3;
  if (mapa.evento === -1) mapa.evento = 4;
  if (mapa.transacao === -1) mapa.transacao = 5;
  if (mapa.dataTransacao === -1) mapa.dataTransacao = 6;
  if (mapa.dataIntegracao === -1) mapa.dataIntegracao = 7;
  if (mapa.corte === -1) mapa.corte = 8;
  if (mapa.n1 === -1) mapa.n1 = 9;
  if (mapa.n2 === -1) mapa.n2 = 10;
  if (mapa.n5 === -1) mapa.n5 = 11;
  if (mapa.n10 === -1) mapa.n10 = 12;
  if (mapa.n20 === -1) mapa.n20 = 13;
  if (mapa.n50 === -1) mapa.n50 = 14;
  if (mapa.n100 === -1) mapa.n100 = 15;
  if (mapa.n200 === -1) mapa.n200 = 16;
  if (mapa.cedulas === -1) mapa.cedulas = 17;
  if (mapa.total === -1) mapa.total = 24;

  return mapa;
}

/**
 * Converte valor numérico de célula de forma segura
 */
function parseNumero(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim().replace('R$', '').trim();
  // Trata formato brasileiro (1.500,50 -> 1500.50) ou padrão simples
  if (str.includes(',') && str.includes('.')) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (str.includes(',')) {
    return parseFloat(str.replace(',', '.')) || 0;
  }
  return parseFloat(str) || 0;
}

/**
 * Processa linhas brutas extraídas da planilha
 */
export function processarLinhasBrutas(rows) {
  if (!rows || rows.length < 2) {
    return {
      success: false,
      error: 'A planilha está vazia ou não contém dados suficientes.',
      identifiedLotericas: [],
      unknownCNPJs: [],
      validRecordsCount: 0,
      ignoredRowsCount: rows ? rows.length : 0,
      recordsByLoterica: {},
      records: []
    };
  }

  const headerRow = rows[0].map(c => String(c || '').trim());
  const col = mapearColunas(headerRow);

  const records = [];
  const recordsByLoterica = {};
  const cnpjsEncontrados = new Set();
  const unknownCNPJs = new Set();
  let ignoredRowsCount = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) {
      ignoredRowsCount++;
      continue;
    }

    const firstCell = String(row[0] || '').trim();
    const rowStr = row.map(c => String(c || '')).join(' ');

    // 1. Ignorar linhas vazias
    if (!firstCell && row.every(c => !c || String(c).trim() === '')) {
      ignoredRowsCount++;
      continue;
    }

    // 2. Ignorar linhas de Subtotal
    if (
      normalizarTexto(firstCell).includes('subtotal') ||
      normalizarTexto(rowStr).includes('subtotal')
    ) {
      ignoredRowsCount++;
      continue;
    }

    // 3. Ignorar repetição de cabeçalho
    if (firstCell.toUpperCase() === 'CNPJ') {
      ignoredRowsCount++;
      continue;
    }

    // Extrair CNPJ limpo
    const rawCNPJ = String(row[col.cnpj] || '').trim();
    // XLSX can expose numeric CNPJs without their leading zero (e.g. Sorte Grande).
    const cnpjDigits = rawCNPJ.replace(/\D/g, '');
    const cnpj = cnpjDigits.length < 14 ? cnpjDigits.padStart(14, '0') : cnpjDigits;

    // Extrair Transação e Data
    const transacao = String(row[col.transacao] || '').trim();
    const data = String(row[col.data] || '').trim();

    // Se não tiver transação nem data válida, não é um registro de transação válido
    if (!transacao || !data) {
      ignoredRowsCount++;
      continue;
    }

    cnpjsEncontrados.add(cnpj);

    // Identificar a lotérica pelo CNPJ
    const configLoterica = CNPJ_TO_LOTERICA[cnpj];
    let lotericaKey = 'desconhecida';
    let lotericaNome = 'Não Identificada';

    if (configLoterica) {
      lotericaKey = configLoterica.key;
      lotericaNome = configLoterica.nome;
    } else {
      unknownCNPJs.add(cnpj || rawCNPJ || 'N/A');
    }

    // Extrair dados
    const cofre = String(row[col.cofre] || '').trim();
    const usuario = String(row[col.usuario] || '').trim();
    const evento = String(row[col.evento] || '').trim();
    const dataTransacao = String(row[col.dataTransacao] || '').trim();
    const dataIntegracao = String(row[col.dataIntegracao] || '').trim();

    // Notas
    const n1 = parseNumero(row[col.n1]);
    const n2 = parseNumero(row[col.n2]);
    const n5 = parseNumero(row[col.n5]);
    const n10 = parseNumero(row[col.n10]);
    const n20 = parseNumero(row[col.n20]);
    const n50 = parseNumero(row[col.n50]);
    const n100 = parseNumero(row[col.n100]);
    const n200 = parseNumero(row[col.n200]);
    const cedulas = parseNumero(row[col.cedulas]);

    // Soma das cédulas em Reais
    const somaCedulasReais =
      n1 * 1 +
      n2 * 2 +
      n5 * 5 +
      n10 * 10 +
      n20 * 20 +
      n50 * 50 +
      n100 * 100 +
      n200 * 200;

    let total = parseNumero(row[col.total]);
    // Se o total estiver zerado ou vazio mas houver cédulas, usa a soma das cédulas
    if (total === 0 && somaCedulasReais > 0) {
      total = somaCedulasReais;
    }

    // Cálculo com precisão de centavos inteiros (ex: R$ 19.698,00 -> 1969800 centavos)
    const totalCentavos = Math.round(total * 100);

    // Extrair data para badge (coluna Data, ex: 01/10/2026 09:14:32 -> 01/10/2026 e 01/10)
    const dataOnly = data.split(' ')[0] || data;
    const partesData = dataOnly.split('/');
    let dataIso = '';
    let diaMes = dataOnly;

    if (partesData.length === 3) {
      const d = partesData[0].padStart(2, '0');
      const m = partesData[1].padStart(2, '0');
      const y = partesData[2];
      diaMes = `${d}/${m}`;
      dataIso = `${y}-${m}-${d}`;
    }

    // ID único para detecção de duplicatas (Cofre + Transação ou CNPJ + Transação)
    const uniqueId = `${cnpj || cofre}_${transacao}`;

    const record = {
      id: uniqueId,
      cnpj,
      cnpjFormatado: formatarCNPJ(cnpj),
      lotericaKey,
      lotericaNome,
      data,
      dataOnly,
      dataIso,
      diaMes,
      cofre,
      usuario, // Identificação exata do usuário (string)
      evento, // 'Depósito' ou 'Coleta'
      transacao,
      dataTransacao,
      dataIntegracao,
      cedulas,
      notas: {
        n1,
        n2,
        n5,
        n10,
        n20,
        n50,
        n100,
        n200
      },
      total,
      totalCentavos
    };

    records.push(record);

    if (!recordsByLoterica[lotericaKey]) {
      recordsByLoterica[lotericaKey] = [];
    }
    recordsByLoterica[lotericaKey].push(record);
  }

  // Identificação das lotéricas reconhecidas
  const identifiedLotericas = [];
  cnpjsEncontrados.forEach(c => {
    if (CNPJ_TO_LOTERICA[c]) {
      identifiedLotericas.push(CNPJ_TO_LOTERICA[c]);
    }
  });

  return {
    success: true,
    totalRowsInFile: rows.length,
    validRecordsCount: records.length,
    ignoredRowsCount,
    identifiedLotericas,
    unknownCNPJs: Array.from(unknownCNPJs),
    hasMultipleCompanies: identifiedLotericas.length > 1 || unknownCNPJs.size > 0,
    recordsByLoterica,
    records
  };
}

/**
 * Lê um arquivo Excel (buffer ou ArrayBuffer) usando a biblioteca SheetJS (XLSX)
 */
export function parseExcelBuffer(buffer, XLSX_LIB) {
  const XLSX = XLSX_LIB || (typeof window !== 'undefined' ? window.XLSX : null);
  if (!XLSX) {
    throw new Error('Biblioteca XLSX (SheetJS) não encontrada.');
  }

  const workbook = XLSX.read(buffer, {
    type: buffer instanceof ArrayBuffer ? 'array' : 'buffer',
    cellDates: false
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('A planilha não contém abas.');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true
  });

  return processarLinhasBrutas(rawRows);
}
