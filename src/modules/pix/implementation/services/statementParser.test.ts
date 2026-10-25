import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStatement, locateColumns, normalizeHeader } from './statementParser';

describe('Statement Parser Service', () => {
  it('parses a synthetic Caixa statement without bundling operational transaction data', async () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      ['Histórico', 'Documento', 'Valor Lançamento', 'Data Lançamento', 'Data Movimento', 'Saldo'],
      ['CRED PIX CHAVE', '010523', '10,00', '01/09/2026', '01/09/2026', '100,00'],
      ['PIX RECEBIDO DADOS CONTA', '020830', '10,00', '02/09/2026', '02/09/2026', '110,00'],
      ['CRED PIX QR COD DIN', '030915', '20,00', '03/09/2026', '03/09/2026', '130,00'],
      ['CRED PIX SAQUE', '040910', '5,00', '04/09/2026', '04/09/2026', '135,00'],
      ['DEVOLUCAO PIX ENVIADO', '050901', '-2,00', '05/09/2026', '05/09/2026', '133,00'],
      ['CRED PIX CHAVE', '060523', '10,00', '06/09/2026', '06/09/2026', '143,00'],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Extrato');
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer | Uint8Array;
    const buffer = new Uint8Array(bytes as any).buffer as ArrayBuffer;
    const result = await parseStatement(buffer, 'extrato-teste.xlsx');

    expect(result.errors).toHaveLength(0);
    expect(result.totalValidTransactions).toBe(rows.length - 1);
    expect(result.pixTransactions.length).toBeGreaterThan(0);

    // Initial pre-selection: must include CRED PIX CHAVE and PIX RECEBIDO DADOS CONTA
    expect(result.initialSelectedHistoricos).toContain('CRED PIX CHAVE');
    expect(result.initialSelectedHistoricos).toContain('PIX RECEBIDO DADOS CONTA');

    // Check available historicos contains other PIX types too
    expect(result.availableHistoricos).toContain('CRED PIX QR COD DIN');
    expect(result.availableHistoricos).toContain('CRED PIX SAQUE');
    expect(result.availableHistoricos).toContain('DEVOLUCAO PIX ENVIADO');

    // Check ordering: ascending numeric order
    for (let i = 0; i < result.pixTransactions.length - 1; i++) {
      expect(result.pixTransactions[i].valorCentavos).toBeLessThanOrEqual(
        result.pixTransactions[i + 1].valorCentavos
      );
    }

    // Verify negative values are sorted first (e.g. DEVOLUCAO PIX ENVIADO)
    const negativePix = result.pixTransactions.filter((t) => t.valor < 0);
    expect(negativePix.length).toBeGreaterThan(0);
    expect(result.pixTransactions[0].valor).toBeLessThan(0);

    // Check unique IDs for repeated values
    const allIds = new Set(result.pixTransactions.map((t) => t.id));
    expect(allIds.size).toBe(result.pixTransactions.length);

    // Check multiple identical values exist and have independent IDs
    const tens = result.pixTransactions.filter((t) => t.valor === 10);
    expect(tens.length).toBeGreaterThan(1);
    const tenIds = new Set(tens.map((t) => t.id));
    expect(tenIds.size).toBe(tens.length);
  });

  it('detects missing columns and displays clear error message', async () => {
    // Test with importar.csv (which has Nome, Telefone, Email, etc. but no bank columns)
    const bytes = new TextEncoder().encode('Nome,Telefone,Email\nAna,1111,ana@example.test');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = await parseStatement(buffer, 'importar.csv');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Colunas obrigatórias não encontradas/i);
    expect(result.errors[0]).toContain('Histórico');
    expect(result.errors[0]).toContain('Documento');
    expect(result.errors[0]).toContain('Valor Lançamento');
  });

  it('identifies columns regardless of order and normalized header names', () => {
    const rows = [
      ['Título qualquer'],
      ['VALOR', 'historico da transacao', 'DOC'],
      [10.5, 'CRED PIX CHAVE', '010523'],
    ];

    const { indices, missingColumns } = locateColumns(rows);
    expect(missingColumns).toHaveLength(0);
    expect(indices).not.toBeNull();
    expect(indices?.valorIndex).toBe(0);
    expect(indices?.historicoIndex).toBe(1);
    expect(indices?.documentoIndex).toBe(2);
    expect(indices?.headerRowIndex).toBe(1);
  });

  it('generates consistent file hash for same content and different for different content', async () => {
    const buf1 = new TextEncoder().encode('extrato teste 1').buffer;
    const buf2 = new TextEncoder().encode('extrato teste 1').buffer;
    const buf3 = new TextEncoder().encode('extrato teste 2').buffer;

    const res1 = await parseStatement(buf1, 'test1.csv');
    const res2 = await parseStatement(buf2, 'test1_copy.csv');
    const res3 = await parseStatement(buf3, 'test2.csv');

    expect(res1.fileHash).toBe(res2.fileHash);
    expect(res1.fileHash).not.toBe(res3.fileHash);
  });
});
