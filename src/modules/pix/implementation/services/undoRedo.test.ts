import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConferenceState } from '../hooks/useConference';
import type { StatementParseResult, PixTransaction } from './statementParser';
import { dbClient } from './dbClient';

const testStore = new Map<string, Set<string>>();

// Mock dbClient
vi.mock('./dbClient', () => {
  return {
    dbClient: {
      getCheckedIds: vi.fn(async (confId: string) => testStore.get(confId) || new Set<string>()),
      toggleCheck: vi.fn(async (confId: string, txId: string) => {
        if (!testStore.has(confId)) testStore.set(confId, new Set());
        const s = testStore.get(confId)!;
        if (s.has(txId)) {
          s.delete(txId);
          return false;
        } else {
          s.add(txId);
          return true;
        }
      }),
      setCheck: vi.fn(async (confId: string, txId: string, checked: boolean) => {
        if (!testStore.has(confId)) testStore.set(confId, new Set());
        const s = testStore.get(confId)!;
        if (checked) s.add(txId);
        else s.delete(txId);
      }),
      setMultipleChecks: vi.fn(async (confId: string, ids: string[], checked: boolean) => {
        if (!testStore.has(confId)) testStore.set(confId, new Set());
        const s = testStore.get(confId)!;
        ids.forEach((id) => (checked ? s.add(id) : s.delete(id)));
      }),
      clearConferenceMarks: vi.fn(async (confId: string) => {
        testStore.delete(confId);
      }),
      updateTransactionObservation: vi.fn(async () => {}),
      addTransaction: vi.fn(async () => {}),
      deleteTransaction: vi.fn(async () => {}),
    },
  };
});

const mockTransactions: PixTransaction[] = [
  {
    id: 'tx_01',
    rowNumber: 1,
    historico: 'CRED PIX CHAVE',
    documento: '1001',
    valor: 15.5,
    valorCentavos: 1550,
    rawValor: '15,50',
    formattedBr: '15,50',
    dia: 'DIA 01',
    horario: '10:00:00',
    isPix: true,
  },
  {
    id: 'tx_02',
    rowNumber: 2,
    historico: 'CRED PIX QRCODE',
    documento: '1002',
    valor: 50.0,
    valorCentavos: 5000,
    rawValor: '50,00',
    formattedBr: '50,00',
    dia: 'DIA 01',
    horario: '11:00:00',
    isPix: true,
  },
  {
    id: 'tx_03',
    rowNumber: 3,
    historico: 'CRED PIX TRANSF',
    documento: '1003',
    valor: 100.0,
    valorCentavos: 10000,
    rawValor: '100,00',
    formattedBr: '100,00',
    dia: 'DIA 02',
    horario: '12:00:00',
    isPix: true,
  },
];

const mockParseResult: StatementParseResult = {
  fileName: 'extrato-test.xlsx',
  fileHash: 'hash_test_123',
  sheetName: 'Planilha1',
  allSheets: ['Planilha1'],
  totalRawRows: 10,
  totalValidTransactions: 3,
  pixTransactions: mockTransactions,
  availableHistoricos: ['CRED PIX CHAVE', 'CRED PIX QRCODE', 'CRED PIX TRANSF'],
  initialSelectedHistoricos: ['CRED PIX CHAVE', 'CRED PIX QRCODE', 'CRED PIX TRANSF'],
  availableDias: ['DIA 01', 'DIA 02'],
  errors: [],
};

async function setupHook() {
  const rendered = renderHook(() =>
    useConferenceState(mockParseResult, 'conf_1', 'keep_in_list')
  );
  await act(async () => {
    await Promise.resolve();
  });
  return rendered;
}

describe('Undo / Redo (Desfazer e Refazer) System Tests', () => {
  beforeEach(() => {
    testStore.clear();
    vi.clearAllMocks();
  });

  it('initially has canUndo and canRedo as false', async () => {
    const { result } = await setupHook();

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('supports single toggle check undo and redo with visual highlight', async () => {
    const { result } = await setupHook();

    // 1. Toggle tx_01 (check it)
    await act(async () => {
      await result.current.toggleCheck('tx_01');
    });

    expect(result.current.checkedIds.has('tx_01')).toBe(true);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(dbClient.toggleCheck).toHaveBeenCalledWith('conf_1', 'tx_01');

    // 2. Undo
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.checkedIds.has('tx_01')).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.highlightedTxId).toBe('tx_01');
    expect(dbClient.setMultipleChecks).toHaveBeenCalledWith('conf_1', ['tx_01'], false);

    // 3. Redo
    await act(async () => {
      await result.current.redo();
    });

    expect(result.current.checkedIds.has('tx_01')).toBe(true);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.highlightedTxId).toBe('tx_01');
    expect(dbClient.setMultipleChecks).toHaveBeenCalledWith('conf_1', ['tx_01'], true);
  });

  it('immediately removes temporary highlight when user checks or unchecks any item', async () => {
    const { result } = await setupHook();

    // Toggle tx_01, then undo -> tx_01 gets highlighted
    await act(async () => {
      await result.current.toggleCheck('tx_01');
    });
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.highlightedTxId).toBe('tx_01');

    // User toggles another item (or same item) -> highlight is cleared immediately
    await act(async () => {
      await result.current.toggleCheck('tx_02');
    });

    expect(result.current.highlightedTxId).toBeNull();
  });

  it('supports multi-step sequential undo and redo in reverse order', async () => {
    const { result } = await setupHook();

    // Mark tx_01 then tx_02
    await act(async () => {
      await result.current.toggleCheck('tx_01');
    });
    await act(async () => {
      await result.current.toggleCheck('tx_02');
    });

    expect(result.current.checkedIds.has('tx_01')).toBe(true);
    expect(result.current.checkedIds.has('tx_02')).toBe(true);

    // Undo 1st step -> undoes tx_02
    await act(async () => {
      await result.current.undo();
    });
    expect(result.current.checkedIds.has('tx_02')).toBe(false);
    expect(result.current.checkedIds.has('tx_01')).toBe(true);
    expect(result.current.highlightedTxId).toBe('tx_02');

    // Undo 2nd step -> undoes tx_01
    await act(async () => {
      await result.current.undo();
    });
    expect(result.current.checkedIds.has('tx_01')).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.highlightedTxId).toBe('tx_01');

    // Redo 1st step -> restores tx_01
    await act(async () => {
      await result.current.redo();
    });
    expect(result.current.checkedIds.has('tx_01')).toBe(true);
    expect(result.current.checkedIds.has('tx_02')).toBe(false);

    // Redo 2nd step -> restores tx_02
    await act(async () => {
      await result.current.redo();
    });
    expect(result.current.checkedIds.has('tx_01')).toBe(true);
    expect(result.current.checkedIds.has('tx_02')).toBe(true);
  });

  it('clears redo stack when a new action is performed after undo', async () => {
    const { result } = await setupHook();

    await act(async () => {
      await result.current.toggleCheck('tx_01');
    });
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.canRedo).toBe(true);

    // Perform new action
    await act(async () => {
      await result.current.toggleCheck('tx_03');
    });

    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it('supports batch check and uncheck undo/redo', async () => {
    const { result } = await setupHook();

    // Check all filtered
    await act(async () => {
      await result.current.checkAllFiltered(mockTransactions);
    });

    expect(result.current.checkedIds.size).toBe(3);
    expect(result.current.canUndo).toBe(true);

    // Undo batch check
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.checkedIds.size).toBe(0);
    expect(result.current.canRedo).toBe(true);

    // Redo batch check
    await act(async () => {
      await result.current.redo();
    });

    expect(result.current.checkedIds.size).toBe(3);
  });

  it('supports adding and deleting manual transactions with undo/redo', async () => {
    const { result } = await setupHook();

    const manualTx: PixTransaction = {
      id: 'manual_999',
      rowNumber: 999,
      historico: 'CRED PIX AVULSO',
      documento: '999999',
      valor: 75.0,
      valorCentavos: 7500,
      rawValor: '75,00',
      formattedBr: '75,00',
      dia: 'DIA 01',
      horario: '15:30:00',
      isPix: true,
    };

    // 1. Add manual transaction
    await act(async () => {
      await result.current.addManualTransaction(manualTx);
    });

    expect(result.current.filteredTransactions.some((t) => t.id === 'manual_999')).toBe(true);
    expect(result.current.canUndo).toBe(true);

    // 2. Undo add
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.filteredTransactions.some((t) => t.id === 'manual_999')).toBe(false);
    expect(result.current.canRedo).toBe(true);

    // 3. Redo add
    await act(async () => {
      await result.current.redo();
    });

    expect(result.current.filteredTransactions.some((t) => t.id === 'manual_999')).toBe(true);

    // 4. Delete manual transaction
    await act(async () => {
      await result.current.deleteManualTransaction('manual_999');
    });

    expect(result.current.filteredTransactions.some((t) => t.id === 'manual_999')).toBe(false);

    // 5. Undo delete (restores transaction)
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.filteredTransactions.some((t) => t.id === 'manual_999')).toBe(true);
    expect(result.current.highlightedTxId).toBe('manual_999');
  });
});
