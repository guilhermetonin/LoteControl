const crypto = require('crypto');

const ALLOWED_LOTERICAS = new Set(['CAÇULA', 'SORTE GRANDE', 'PUPINS']);
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function parseDateValue(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  let match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/);
  if (match) return { ano: Number(match[1]), mes: Number(match[2]), dia: Number(match[3]) };
  match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\D|$)/);
  if (match) return { dia: Number(match[1]), mes: Number(match[2]), ano: Number(match[3]) };
  if (/^\d{5}(?:\.\d+)?$/.test(value)) {
    const serial = Math.floor(Number(value));
    if (serial >= 20000 && serial <= 80000) {
      const date = new Date(EXCEL_EPOCH_UTC + serial * 86400000);
      return { ano: date.getUTCFullYear(), mes: date.getUTCMonth() + 1, dia: date.getUTCDate() };
    }
  }
  return null;
}

function validTargetDate(date) {
  if (!date || !Number.isInteger(date.dia) || !Number.isInteger(date.mes) || !Number.isInteger(date.ano)
    || date.dia < 1 || date.dia > 31 || date.mes < 1 || date.mes > 12 || date.ano < 2000 || date.ano > 2100) return false;
  const actual = new Date(Date.UTC(date.ano, date.mes - 1, date.dia));
  return actual.getUTCFullYear() === date.ano && actual.getUTCMonth() + 1 === date.mes && actual.getUTCDate() === date.dia;
}

function toTargetDate(tx, fallback) {
  let invalidFullDate = null;
  for (const candidate of [tx?.dataMovimento, tx?.dataLancamento]) {
    const parsed = parseDateValue(candidate);
    if (!parsed) continue;
    if (validTargetDate(parsed)) return parsed;
    if (!invalidFullDate) invalidFullDate = parsed;
  }
  if (invalidFullDate) return invalidFullDate;
  const dayMatch = String(tx?.dia || '').match(/(\d{1,2})/);
  return { dia: dayMatch ? Number(dayMatch[1]) : 0, mes: Number(fallback?.mes), ano: Number(fallback?.ano) };
}

function buildReportEntry(tx, payload, loterica) {
  const date = toTargetDate(tx, { mes: payload.fallbackMonth, ano: payload.fallbackYear });
  const label = tx.documento || tx.id || '';
  if (!validTargetDate(date)) {
    throw new Error(`Não foi possível determinar uma data válida para o lançamento ${label}. Confira a data do extrato, o mês, o ano e o dia do documento.`);
  }
  const cents = Number(tx.valorCentavos);
  if (!tx.id || !Number.isSafeInteger(cents) || cents <= 0) throw new Error(`O lançamento ${label} tem uma identificação ou um valor inválido.`);

  const stableSource = `${payload.conferenceId || 'sem-conferencia'}:${tx.id}:${loterica}`;
  const id = `pix_checkpix_${crypto.createHash('sha256').update(stableSource).digest('hex').slice(0, 32)}`;
  return {
    id,
    loterica,
    ano: date.ano,
    mes: date.mes,
    dia: date.dia,
    data_formatada: `${date.ano}-${String(date.mes).padStart(2, '0')}-${String(date.dia).padStart(2, '0')}`,
    valor: cents / 100,
    tipo: 'sobra',
    funcionario: 'Conferência Pix',
    cliente: String(tx.historico || 'PIX pendente').slice(0, 180),
    status: 'pendente',
    observacoes: [
      `Importado do Pix: ${String(payload.fileName || '').slice(0, 160)}`,
      tx.documento ? `Documento: ${String(tx.documento).slice(0, 100)}` : '',
      tx.horario ? `Horário: ${String(tx.horario).slice(0, 20)}` : '',
      tx.dia ? `Dia identificado no extrato: ${String(tx.dia).slice(0, 20)}` : '',
      `Transação de origem: ${String(tx.id).slice(0, 100)}`,
    ].filter(Boolean).join(' | '),
  };
}

function sameTransferredEntry(existing, incoming) {
  return existing.id === incoming.id
    && String(existing.loterica).toUpperCase() === incoming.loterica
    && Number(existing.ano) === incoming.ano
    && Number(existing.mes) === incoming.mes
    && Number(existing.dia) === incoming.dia
    && Math.round(Number(existing.valor) * 100) === Math.round(incoming.valor * 100)
    && String(existing.tipo).toLowerCase() === 'sobra'
    && String(existing.status || 'pendente').toLowerCase() === 'pendente'
    && Number(existing.deleted || 0) === 0
    && String(existing.funcionario || '') === incoming.funcionario
    && String(existing.cliente || '') === incoming.cliente
    && String(existing.observacoes || '') === incoming.observacoes;
}

function transferPendingToReport({ reportDb, driveSync, payload }) {
  if (!reportDb) throw new Error('O banco do Relatório ainda não está disponível.');
  const { transactions, targetLoterica, mode } = payload || {};
  const loterica = String(targetLoterica || '').toUpperCase().trim();
  if (!ALLOWED_LOTERICAS.has(loterica)) throw new Error('Selecione uma lotérica de destino válida.');
  if (!Array.isArray(transactions) || transactions.length === 0) throw new Error('Não há pendentes para enviar.');

  const prepared = transactions.map((tx) => buildReportEntry(tx, payload, loterica));
  const byId = new Map();
  for (const entry of prepared) {
    const previous = byId.get(entry.id);
    if (previous && !sameTransferredEntry(previous, entry)) throw new Error(`Há IDs de origem conflitantes no lote (${entry.id}).`);
    byId.set(entry.id, entry);
  }
  const uniqueEntries = Array.from(byId.values());

  // A database transaction and one atomic file replacement make a batch all-or-nothing.
  // A retry after a crash is idempotent because every destination ID is derived from source IDs.
  for (const entry of uniqueEntries) {
    const existing = reportDb.getLancamentoById(entry.id);
    if (existing && !sameTransferredEntry(existing, entry)) {
      throw new Error(`O identificador ${entry.id} já existe no Relatório com dados diferentes. Nenhum lançamento foi movido.`);
    }
  }
  const result = reportDb.insertPixTransferBatch(uniqueEntries);
  if (result.inserted + result.skipped !== uniqueEntries.length) {
    throw new Error('O Relatório não confirmou todos os lançamentos do lote.');
  }
  for (const entry of uniqueEntries) {
    const stored = reportDb.getLancamentoById(entry.id);
    if (!stored || !sameTransferredEntry(stored, entry)) {
      throw new Error(`O Relatório não confirmou a gravação do lançamento ${entry.id}.`);
    }
  }
  driveSync?.triggerDebouncedSync();
  return { success: true, inserted: result.inserted, skipped: result.skipped, mode: mode === 'move' ? 'move' : 'copy' };
}

module.exports = { buildReportEntry, parseDateValue, toTargetDate, transferPendingToReport, validTargetDate };
