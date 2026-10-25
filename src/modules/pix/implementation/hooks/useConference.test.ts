import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConferenceState } from './useConference';
import { StatementParseResult, PixTransaction } from '../services/statementParser';
import { clearSavedMarks } from '../services/storage';

function createMockParseResult(hash = 'mock_hash_123'): StatementParseResult {
  const pixTransactions: PixTransaction[] = [
    {
      id: 'tx_1',
      rowNumber: 1,
      historico: 'CRED PIX CHAVE',
      documento: '010523',
      valor: 10,
      valorCentavos: 1000,
      rawValor: '10,00',
      formattedBr: '10,00',
      dia: 'DIA 01',
      horario: '05:23',
      isPix: true,
    },
    {
      id: 'tx_2',
      rowNumber: 2,
      historico: 'CRED PIX CHAVE',
      documento: '010524',
      valor: 10,
      valorCentavos: 1000,
      rawValor: '10,00',
      formattedBr: '10,00',
      dia: 'DIA 01',
      horario: '05:24',
      isPix: true,
    },
    {
      id: 'tx_3',
      rowNumber: 3,
      historico: 'CRED PIX CHAVE',
      documento: '010525',
      valor: 10,
      valorCentavos: 1000,
      rawValor: '10,00',
      formattedBr: '10,00',
      dia: 'DIA 01',
      horario: '05:25',
      isPix: true,
    },
    {
      id: 'tx_4',
      rowNumber: 4,
      historico: 'PIX RECEBIDO DADOS CONTA',
      documento: '020830',
      valor: 25.5,
      valorCentavos: 2550,
      rawValor: '25,50',
      formattedBr: '25,50',
      dia: 'DIA 02',
      horario: '08:30',
      isPix: true,
    },
    {
      id: 'tx_5',
      rowNumber: 5,
      historico: 'CRED PIX QR COD DIN',
      documento: '020835',
      valor: 50,
      valorCentavos: 5000,
      rawValor: '50,00',
      formattedBr: '50,00',
      dia: 'DIA 02',
      horario: '08:35',
      isPix: true,
    },
    {
      id: 'tx_6',
      rowNumber: 6,
      historico: 'DEVOLUCAO PIX ENVIADO',
      documento: '030936',
      valor: -54,
      valorCentavos: -5400,
      rawValor: '-54,00',
      formattedBr: '-54,00',
      dia: 'DIA 03',
      horario: '09:36',
      isPix: true,
    },
  ];

  return {
    fileName: 'test.xlsx',
    fileHash: hash,
    sheetName: 'Sheet1',
    allSheets: ['Sheet1'],
    totalRawRows: 10,
    totalValidTransactions: 6,
    pixTransactions,
    availableHistoricos: [
      'CRED PIX CHAVE',
      'CRED PIX QR COD DIN',
      'DEVOLUCAO PIX ENVIADO',
      'PIX RECEBIDO DADOS CONTA',
    ],
    initialSelectedHistoricos: ['CRED PIX CHAVE', 'PIX RECEBIDO DADOS CONTA'],
    availableDias: ['DIA 01', 'DIA 02', 'DIA 03'],
    errors: [],
  };
}

describe('useConferenceState Hook', () => {
  beforeEach(() => {
    clearSavedMarks('mock_hash_123');
  });

  it('initializes with TODOS as default day and pre-selects habitual PIX historicos', () => {
    const mockData = createMockParseResult();
    const { result } = renderHook(() => useConferenceState(mockData));

    expect(result.current.selectedDia).toBe('TODOS');
    expect(result.current.selectedHistoricos.has('CRED PIX CHAVE')).toBe(true);
    expect(result.current.selectedHistoricos.has('PIX RECEBIDO DADOS CONTA')).toBe(true);
    // Non-default ones are not selected initially
    expect(result.current.selectedHistoricos.has('CRED PIX QR COD DIN')).toBe(false);
    expect(result.current.selectedHistoricos.has('DEVOLUCAO PIX ENVIADO')).toBe(false);

    // Initial filtered transactions: tx_1, tx_2, tx_3, tx_4 (4 items)
    expect(result.current.filteredTransactions).toHaveLength(4);
    expect(result.current.pendentes).toHaveLength(4);
    expect(result.current.conferidos).toHaveLength(0);
    expect(result.current.stats.totalCount).toBe(4);
    expect(result.current.stats.conferidosCount).toBe(0);
    expect(result.current.stats.pendentesCount).toBe(4);
    expect(result.current.stats.percentCompleted).toBe(0);
  });

  it('controls duplicated values individually without crosstalk', () => {
    const mockData = createMockParseResult();
    const { result } = renderHook(() => useConferenceState(mockData));

    // tx_1, tx_2, tx_3 all have value R$ 10,00
    // Mark tx_1
    act(() => {
      result.current.toggleCheck('tx_1');
    });

    expect(result.current.checkedIds.has('tx_1')).toBe(true);
    expect(result.current.checkedIds.has('tx_2')).toBe(false);
    expect(result.current.checkedIds.has('tx_3')).toBe(false);

    // Conferidos should have 1 item (tx_1), pendentes should have 3 items (tx_2, tx_3, tx_4)
    expect(result.current.conferidos).toHaveLength(1);
    expect(result.current.conferidos[0].id).toBe('tx_1');
    expect(result.current.pendentes).toHaveLength(3);
    expect(result.current.pendentes.map((t) => t.id)).toEqual(['tx_2', 'tx_3', 'tx_4']);

    // Unmark tx_1 returns it to pendentes
    act(() => {
      result.current.toggleCheck('tx_1');
    });
    expect(result.current.conferidos).toHaveLength(0);
    expect(result.current.pendentes).toHaveLength(4);
  });

  it('preserves marks when switching day or historico filters', () => {
    const mockData = createMockParseResult();
    const { result } = renderHook(() => useConferenceState(mockData));

    // Check tx_1 in DIA 01
    act(() => {
      result.current.toggleCheck('tx_1');
    });
    expect(result.current.stats.conferidosCount).toBe(1);

    // Change day to DIA 02
    act(() => {
      result.current.setSelectedDia('DIA 02');
    });

    // In DIA 02, tx_1 is not shown in current filtered items
    expect(result.current.filteredTransactions).toHaveLength(1); // tx_4
    expect(result.current.conferidos).toHaveLength(0);
    expect(result.current.pendentes).toHaveLength(1);

    // Check tx_4 in DIA 02
    act(() => {
      result.current.toggleCheck('tx_4');
    });
    expect(result.current.conferidos).toHaveLength(1);

    // Switch back to TODOS: both tx_1 and tx_4 must remain checked!
    act(() => {
      result.current.setSelectedDia('TODOS');
    });
    expect(result.current.checkedIds.has('tx_1')).toBe(true);
    expect(result.current.checkedIds.has('tx_4')).toBe(true);
    expect(result.current.conferidos).toHaveLength(2);
    expect(result.current.pendentes).toHaveLength(2);
  });

  it('selects all historicos and clears all historicos', () => {
    const mockData = createMockParseResult();
    const { result } = renderHook(() => useConferenceState(mockData));

    act(() => {
      result.current.selectAllHistoricos();
    });
    expect(result.current.selectedHistoricos.size).toBe(4);
    expect(result.current.filteredTransactions).toHaveLength(6);

    act(() => {
      result.current.clearAllHistoricos();
    });
    expect(result.current.selectedHistoricos.size).toBe(0);
    expect(result.current.filteredTransactions).toHaveLength(0);
  });

  it('calculates correct completion stats and totals in cents', () => {
    const mockData = createMockParseResult();
    const { result } = renderHook(() => useConferenceState(mockData));

    // 4 items: tx_1 (10), tx_2 (10), tx_3 (10), tx_4 (25.50) -> total 55.50 (5550 centavos)
    expect(result.current.stats.totalCentavos).toBe(5550);
    expect(result.current.stats.totalValor).toBe(55.5);

    // Mark 2 of the 4 items (tx_1 and tx_2 = 20.00)
    act(() => {
      result.current.toggleCheck('tx_1');
      result.current.toggleCheck('tx_2');
    });

    expect(result.current.stats.conferidosCount).toBe(2);
    expect(result.current.stats.pendentesCount).toBe(2);
    expect(result.current.stats.percentCompleted).toBe(50);
    expect(result.current.stats.conferidosValor).toBe(20);
    expect(result.current.stats.pendentesValor).toBe(35.5);
  });

  it('correctly filters transactions when combining day and history filters simultaneously (AND logic)', () => {
    const mockData = createMockParseResult();
    const { result } = renderHook(() => useConferenceState(mockData));

    // Initially with default historicos ('CRED PIX CHAVE' and 'PIX RECEBIDO DADOS CONTA')
    // and selectedDia = 'TODOS', we have 4 items: tx_1, tx_2, tx_3, tx_4
    expect(result.current.filteredTransactions).toHaveLength(4);

    // Apply day filter: 'DIA 02'
    act(() => {
      result.current.setSelectedDia('DIA 02');
    });
    // On DIA 02, only tx_4 has 'PIX RECEBIDO DADOS CONTA' (tx_5 is 'CRED PIX QR COD DIN' which is not selected)
    expect(result.current.filteredTransactions).toHaveLength(1);
    expect(result.current.filteredTransactions[0].id).toBe('tx_4');

    // Deselect 'PIX RECEBIDO DADOS CONTA' so only 'CRED PIX CHAVE' is active
    act(() => {
      result.current.toggleHistorico('PIX RECEBIDO DADOS CONTA');
    });
    // On DIA 02 with only 'CRED PIX CHAVE', there are 0 matches
    expect(result.current.filteredTransactions).toHaveLength(0);

    // Switch day to 'DIA 01'
    act(() => {
      result.current.setSelectedDia('DIA 01');
    });
    // On DIA 01 with 'CRED PIX CHAVE', matches tx_1, tx_2, tx_3
    expect(result.current.filteredTransactions).toHaveLength(3);
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual(['tx_1', 'tx_2', 'tx_3']);
  });
});
