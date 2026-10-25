import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useTableSelection } from './useTableSelection';
import type { PixTransaction } from '../services/statementParser';

const mockTransactions: PixTransaction[] = [
  {
    id: 'tx-1',
    rowNumber: 1,
    dataLancamento: '01/10/2026',
    dataMovimento: '01/10/2026',
    dia: 'DIA 01',
    horario: '10:00',
    historico: 'CRED PIX CHAVE',
    documento: '011000',
    valor: 15.0,
    valorCentavos: 1500,
    formattedBr: '15,00',
    saldo: 1000,
    isPix: true,
  },
  {
    id: 'tx-2',
    rowNumber: 2,
    dataLancamento: '01/10/2026',
    dataMovimento: '01/10/2026',
    dia: 'DIA 01',
    horario: '10:30',
    historico: 'CRED PIX CHAVE',
    documento: '011030',
    valor: 15.0,
    valorCentavos: 1500,
    formattedBr: '15,00',
    saldo: 1015,
    isPix: true,
  },
  {
    id: 'tx-3',
    rowNumber: 3,
    dataLancamento: '02/10/2026',
    dataMovimento: '02/10/2026',
    dia: 'DIA 02',
    horario: '11:00',
    historico: 'PIX RECEBIDO DADOS CONTA',
    documento: '021100',
    valor: 20.0,
    valorCentavos: 2000,
    formattedBr: '20,00',
    saldo: 1035,
    isPix: true,
  },
  {
    id: 'tx-4',
    rowNumber: 4,
    dataLancamento: '02/10/2026',
    dataMovimento: '02/10/2026',
    dia: 'DIA 02',
    horario: '12:00',
    historico: 'CRED PIX CHAVE',
    documento: '021200',
    valor: 50.0,
    valorCentavos: 5000,
    formattedBr: '50,00',
    saldo: 1085,
    isPix: true,
  },
];

describe('useTableSelection', () => {
  it('handles normal single click by selecting only the clicked row and setting anchor', () => {
    const { result } = renderHook(() => useTableSelection(mockTransactions));

    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'tx-1');
    });

    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has('tx-1')).toBe(true);
    expect(result.current.anchorId).toBe('tx-1');

    // Clicking another row clears the first
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'tx-2');
    });

    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has('tx-1')).toBe(false);
    expect(result.current.selectedIds.has('tx-2')).toBe(true);
    expect(result.current.anchorId).toBe('tx-2');
  });

  it('handles Ctrl+click to toggle selection without clearing existing items', () => {
    const { result } = renderHook(() => useTableSelection(mockTransactions));

    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'tx-1');
    });
    expect(result.current.selectedIds.size).toBe(1);

    // Ctrl+click on tx-3
    act(() => {
      result.current.handleRowClick({ ctrlKey: true, metaKey: false, shiftKey: false } as any, 'tx-3');
    });
    expect(result.current.selectedIds.size).toBe(2);
    expect(result.current.selectedIds.has('tx-1')).toBe(true);
    expect(result.current.selectedIds.has('tx-3')).toBe(true);

    // Ctrl+click again on tx-1 deselects it
    act(() => {
      result.current.handleRowClick({ ctrlKey: true, metaKey: false, shiftKey: false } as any, 'tx-1');
    });
    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has('tx-1')).toBe(false);
    expect(result.current.selectedIds.has('tx-3')).toBe(true);
  });

  it('handles Shift+click range selection respecting list display order and persistent anchor', () => {
    const { result } = renderHook(() => useTableSelection(mockTransactions));

    // 1. Click tx-1 to set anchor
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'tx-1');
    });
    expect(result.current.anchorId).toBe('tx-1');

    // 2. Shift+click tx-3 selects tx-1, tx-2, tx-3
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: true } as any, 'tx-3');
    });
    expect(result.current.selectedIds.size).toBe(3);
    expect(result.current.selectedIds.has('tx-1')).toBe(true);
    expect(result.current.selectedIds.has('tx-2')).toBe(true);
    expect(result.current.selectedIds.has('tx-3')).toBe(true);
    expect(result.current.selectedIds.has('tx-4')).toBe(false);
    // Anchor remains tx-1
    expect(result.current.anchorId).toBe('tx-1');

    // 3. Shift+click tx-2 shrinks range using the SAME anchor tx-1
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: true } as any, 'tx-2');
    });
    expect(result.current.selectedIds.size).toBe(2);
    expect(result.current.selectedIds.has('tx-1')).toBe(true);
    expect(result.current.selectedIds.has('tx-2')).toBe(true);
    expect(result.current.selectedIds.has('tx-3')).toBe(false);

    // 4. Shift+click tx-4 expands range from original anchor tx-1 to tx-4
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: true } as any, 'tx-4');
    });
    expect(result.current.selectedIds.size).toBe(4);
    expect(result.current.selectedIds.has('tx-1')).toBe(true);
    expect(result.current.selectedIds.has('tx-2')).toBe(true);
    expect(result.current.selectedIds.has('tx-3')).toBe(true);
    expect(result.current.selectedIds.has('tx-4')).toBe(true);
  });

  it('computes financial summary accurately for equal and different values', () => {
    // 10 transactions of 15.00 each
    const tenItems: PixTransaction[] = Array.from({ length: 10 }).map((_, i) => ({
      id: `item-${i + 1}`,
      rowNumber: i + 1,
      dataLancamento: '01/10/2026',
      dataMovimento: '01/10/2026',
      dia: 'DIA 01',
      horario: '10:00',
      historico: 'CRED PIX CHAVE',
      documento: `01100${i}`,
      valor: 15.0,
      valorCentavos: 1500,
      formattedBr: '15,00',
      saldo: 1000,
      isPix: true,
    }));

    const { result } = renderHook(() => useTableSelection(tenItems));

    // Initially no summary
    expect(result.current.summary).toBeNull();

    // Select all 10 items via Shift+click from item-1 to item-10
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'item-1');
    });
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: true } as any, 'item-10');
    });

    expect(result.current.summary).not.toBeNull();
    expect(result.current.summary?.count).toBe(10);
    expect(result.current.summary?.totalValor).toBe(150.0);
    expect(result.current.summary?.mediaValor).toBe(15.0);

    // Test with mixed values: select tx-1 (15.00) and tx-4 (50.00) from mockTransactions
    const { result: mixedResult } = renderHook(() => useTableSelection(mockTransactions));
    act(() => {
      mixedResult.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'tx-1');
      mixedResult.current.handleRowClick({ ctrlKey: true, metaKey: false, shiftKey: false } as any, 'tx-4');
    });

    expect(mixedResult.current.summary?.count).toBe(2);
    expect(mixedResult.current.summary?.totalValor).toBe(65.0);
    expect(mixedResult.current.summary?.mediaValor).toBe(32.5);
  });

  it('purges nonexistent IDs when list items change (e.g. filter applied)', () => {
    let currentList = [...mockTransactions];
    const { result, rerender } = renderHook(() => useTableSelection(currentList));

    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'tx-1');
      result.current.handleRowClick({ ctrlKey: true, metaKey: false, shiftKey: false } as any, 'tx-4');
    });
    expect(result.current.selectedIds.size).toBe(2);

    // Filter applied: only tx-1 and tx-2 remain visible
    currentList = [mockTransactions[0], mockTransactions[1]];
    rerender();

    // tx-4 was purged because it is no longer in currentList
    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has('tx-1')).toBe(true);
    expect(result.current.selectedIds.has('tx-4')).toBe(false);
  });

  it('clears selection when clearSelection is called', () => {
    const { result } = renderHook(() => useTableSelection(mockTransactions));

    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'tx-1');
    });
    expect(result.current.selectedIds.size).toBe(1);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.anchorId).toBeNull();
    expect(result.current.summary).toBeNull();
  });
});
