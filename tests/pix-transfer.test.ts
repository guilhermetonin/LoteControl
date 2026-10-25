import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { buildReportEntry, parseDateValue, transferPendingToReport } = require('../electron/pix-transfer.cjs');

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-001', rowNumber: 1, historico: 'CRED PIX CHAVE', documento: '010923',
    valor: 25, valorCentavos: 2500, rawValor: '25,00', formattedBr: '25,00',
    dia: 'DIA 01', horario: '09:23', isPix: true, dataMovimento: '2026-09-01',
    ...overrides,
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    conferenceId: 'conference-abc', fileName: 'caixa-setembro.xlsx', targetLoterica: 'CAÇULA',
    fallbackMonth: 8, fallbackYear: 2026, mode: 'move', transactions: [transaction()], ...overrides,
  };
}

class MemoryReportDb {
  rows = new Map<string, any>();
  failBatch = false;
  getLancamentoById(id: string) { return this.rows.get(id) || null; }
  insertPixTransferBatch(entries: any[]) {
    if (this.failBatch) throw new Error('disk full');
    let inserted = 0, skipped = 0;
    for (const entry of entries) {
      if (this.rows.has(entry.id)) { skipped++; continue; }
      this.rows.set(entry.id, { ...entry, deleted: 0 }); inserted++;
    }
    return { inserted, skipped };
  }
}

describe('Pix → Relatório', () => {
  it('interpreta datas completas, brasileiras e seriais do Excel', () => {
    expect(parseDateValue('2026-09-01')).toEqual({ ano: 2026, mes: 9, dia: 1 });
    expect(parseDateValue('01/09/2026')).toEqual({ dia: 1, mes: 9, ano: 2026 });
    expect(parseDateValue('46266')).toEqual({ ano: 2026, mes: 9, dia: 1 });
  });

  it('grava como Sobrando no dia da data do extrato e deduplica uma repetição', () => {
    const reportDb = new MemoryReportDb(); const sync = { triggerDebouncedSync: vi.fn() };
    const first = transferPendingToReport({ reportDb, driveSync: sync, payload: payload() });
    expect(first).toMatchObject({ success: true, inserted: 1, skipped: 0, mode: 'move' });
    const [saved] = reportDb.rows.values();
    expect(saved).toMatchObject({ ano: 2026, mes: 9, dia: 1, tipo: 'sobra', status: 'pendente', valor: 25, deleted: 0 });
    expect(saved.data_formatada).toBe('2026-09-01');
    expect(transferPendingToReport({ reportDb, driveSync: sync, payload: payload() })).toMatchObject({ success: true, inserted: 0, skipped: 1, mode: 'move' });
    expect(reportDb.rows.size).toBe(1); expect(sync.triggerDebouncedSync).toHaveBeenCalledTimes(2);
  });

  it('usa o dia DIA XX com mês/ano de referência quando falta data completa', () => {
    const entry = buildReportEntry(transaction({ dataMovimento: '', dataLancamento: '', dia: 'DIA 07' }), payload(), 'PUPINS');
    expect(entry).toMatchObject({ loterica: 'PUPINS', ano: 2026, mes: 8, dia: 7, tipo: 'sobra' });
  });

  it('rejeita data impossível sem gravar nem solicitar sincronização', () => {
    const reportDb = new MemoryReportDb(); const sync = { triggerDebouncedSync: vi.fn() };
    expect(() => transferPendingToReport({ reportDb, driveSync: sync, payload: payload({ transactions: [transaction({ dataMovimento: '2026-02-31', dataLancamento: '', dia: 'DIA 31' })], fallbackMonth: 2 }) })).toThrow(/data válida/);
    expect(reportDb.rows.size).toBe(0); expect(sync.triggerDebouncedSync).not.toHaveBeenCalled();
  });

  it('bloqueia conflito e tombstone para não confirmar um pendente invisível no Relatório', () => {
    const reportDb = new MemoryReportDb(); const entry = buildReportEntry(transaction(), payload(), 'CAÇULA');
    reportDb.rows.set(entry.id, { ...entry, deleted: 1 });
    expect(() => transferPendingToReport({ reportDb, payload: payload() })).toThrow(/dados diferentes/);
  });

  it('não retorna sucesso se o lote não consegue persistir', () => {
    const reportDb = new MemoryReportDb(); reportDb.failBatch = true; const sync = { triggerDebouncedSync: vi.fn() };
    expect(() => transferPendingToReport({ reportDb, driveSync: sync, payload: payload() })).toThrow('disk full');
    expect(reportDb.rows.size).toBe(0); expect(sync.triggerDebouncedSync).not.toHaveBeenCalled();
  });
});
