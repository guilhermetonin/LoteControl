import { describe, it, expect, beforeEach } from 'vitest';
import { formatValuesForClipboard } from './clipboard';
import { PixTransaction } from './statementParser';
import { loadSavedMarks, saveMarks, clearSavedMarks } from './storage';

describe('Clipboard Service', () => {
  it('formats values one per line with Brazilian comma, preserving negatives and duplicates', () => {
    const mockTxs: PixTransaction[] = [
      {
        id: 'tx_1',
        rowNumber: 1,
        historico: 'DEVOLUCAO PIX ENVIADO',
        documento: '030936',
        valor: -54,
        valorCentavos: -5400,
        rawValor: '-54',
        formattedBr: '-54,00',
        dia: 'DIA 03',
        horario: '09:36',
        isPix: true,
      },
      {
        id: 'tx_2',
        rowNumber: 2,
        historico: 'CRED PIX CHAVE',
        documento: '030640',
        valor: 10,
        valorCentavos: 1000,
        rawValor: '10',
        formattedBr: '10,00',
        dia: 'DIA 03',
        horario: '06:40',
        isPix: true,
      },
      {
        id: 'tx_3',
        rowNumber: 3,
        historico: 'CRED PIX CHAVE',
        documento: '030653',
        valor: 10,
        valorCentavos: 1000,
        rawValor: '10',
        formattedBr: '10,00',
        dia: 'DIA 03',
        horario: '06:53',
        isPix: true,
      },
    ];

    const result = formatValuesForClipboard(mockTxs);
    expect(result).toBe('-54,00\n10,00\n10,00');
  });

  it('returns empty string when transactions list is empty', () => {
    expect(formatValuesForClipboard([])).toBe('');
  });
});

describe('Storage Service', () => {
  it('saves and restores marks for the same file hash', () => {
    const hash = 'abc123hash';
    const checked = new Set(['tx_1', 'tx_5', 'tx_99']);

    saveMarks(hash, 'test.xlsx', checked);

    const loaded = loadSavedMarks(hash);
    expect(loaded.size).toBe(3);
    expect(loaded.has('tx_1')).toBe(true);
    expect(loaded.has('tx_5')).toBe(true);
    expect(loaded.has('tx_99')).toBe(true);
  });

  it('does NOT restore marks for a different file hash', () => {
    const hash1 = 'file1_hash';
    const hash2 = 'file2_hash';

    saveMarks(hash1, 'file1.xlsx', new Set(['tx_1']));

    const loadedForFile2 = loadSavedMarks(hash2);
    expect(loadedForFile2.size).toBe(0);
  });

  it('clears saved marks correctly', () => {
    const hash = 'file_to_clear';
    saveMarks(hash, 'file.xlsx', new Set(['tx_10']));

    clearSavedMarks(hash);
    const loaded = loadSavedMarks(hash);
    expect(loaded.size).toBe(0);
  });
});
