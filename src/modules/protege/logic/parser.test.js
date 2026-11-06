import { describe, expect, it } from 'vitest';
import { processarLinhasBrutas } from './parser.js';
import { ProtegeStore } from './store.js';

describe('importação Protege de Sorte Grande', () => {
  it('rejeita uma planilha Pix ou desconhecida antes da importação', () => {
    const pix = processarLinhasBrutas([
      ['Histórico', 'Documento', 'Valor Lançamento'],
      ['CRED PIX CHAVE', '123', '10,00'],
    ]);
    expect(pix.success).toBe(false);
    expect(pix.error).toContain('módulo Pix');
    const unknown = processarLinhasBrutas([['Nome', 'Telefone'], ['Ana', '123']]);
    expect(unknown.success).toBe(false);
  });

  it('filtra calendário por mês e ano completos', () => {
    const store = new ProtegeStore({ records: [
      { id: 'oct', lotericaKey: 'cacula', dataIso: '2026-10-02', dataOnly: '02/10/2026', diaMes: '02/10', usuario: '1' },
      { id: 'nov', lotericaKey: 'cacula', dataIso: '2026-11-02', dataOnly: '02/11/2026', diaMes: '02/11', usuario: '1' },
      { id: 'other-year', lotericaKey: 'cacula', dataIso: '2025-10-02', dataOnly: '02/10/2025', diaMes: '02/10', usuario: '1' },
    ] });
    expect(store.getAvailableMonths()).toEqual(['2025-10', '2026-10', '2026-11']);
    store.setFiltroMes('2026-10');
    expect(store.getFilteredRecords().map((record) => record.id)).toEqual(['oct']);
    expect(store.getDaysWithEntries()).toEqual([2]);
  });

  it('reconhece CNPJ numérico sem o zero inicial da célula Excel', () => {
    const result = processarLinhasBrutas([
      ['CNPJ', 'Data', 'Cofre', 'Usuário', 'Evento', 'Transação', 'Total'],
      [5304693000120, '01/10/2026 10:30', 'Cofre 1', '12', 'Depósito', 'TX-1', 100],
    ]);

    expect(result.success).toBe(true);
    expect(result.identifiedLotericas.map((company) => company.key)).toEqual(['sorteGrande']);
    expect(result.records[0].cnpj).toBe('05304693000120');
  });

  it('restaura registros e histórico salvos com a chave antiga da lotérica', () => {
    const store = new ProtegeStore({
      lotericaAtiva: 'sorte-grande',
      records: [{ id: 'old-record', lotericaKey: 'sorte-grande', usuario: '12', dataOnly: '01/10/2026' }],
      historicoImportacoes: [{
        id: 'old-import',
        recordIds: ['old-record'],
        identifiedLotericas: [{ key: 'sorte-grande', nome: 'Sorte Grande' }],
      }],
      filtroImportacaoId: 'old-import',
    });

    expect(store.lotericaAtiva).toBe('sorteGrande');
    expect(store.getRecordsForActiveLoterica()).toHaveLength(1);
    expect(store.getAvailableUsers()).toEqual(['12']);
    store.setFiltroImportacao('old-import');
    expect(store.getFilteredRecords()).toHaveLength(1);
  });
});
