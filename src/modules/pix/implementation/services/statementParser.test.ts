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
    expect(result.initialSelectedHistoricos).toContain('PIX MANUAL DE DADOS');
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

  it('correctly imports transactions with thousands separators and raw numbers without truncating', async () => {
    const workbook = XLSX.utils.book_new();
    const sheetData = [
      ['Data Lançamento', 'Data Movimento', 'Histórico', 'Documento', 'Valor Lançamento', 'Saldo'],
      ['20/10/2026', '20/10/2026', 'CRED PIX CHAVE', '201544', 2501.05, 1000], // Doc 201544: numeric
      ['26/10/2026', '26/10/2026', 'CRED PIX CHAVE', '260704', '24,277.54', 2000], // Doc 260704: text US format
      ['27/10/2026', '27/10/2026', 'CRED PIX CHAVE', '271112', '5.696,29', 3000], // Doc 271112: text BR format
      ['20/10/2026', '20/10/2026', 'CRED PIX CHAVE', '201553', 6.15, 4000],
      ['20/10/2026', '20/10/2026', 'CRED PIX CHAVE', '201739', '500,41', 5000],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    // Explicitly add a number format to C2 (first data row valor)
    ws['E2'].z = '#,##0.00';

    XLSX.utils.book_append_sheet(workbook, ws, 'Extrato');
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer | Uint8Array;
    const buffer = new Uint8Array(bytes as any).buffer as ArrayBuffer;

    const result = await parseStatement(buffer, 'extrato-milhar.xlsx');
    expect(result.errors).toHaveLength(0);
    expect(result.pixTransactions).toHaveLength(5);

    const doc201544 = result.pixTransactions.find((t) => t.documento === '201544');
    expect(doc201544).toBeDefined();
    expect(doc201544?.valor).toBe(2501.05);
    expect(doc201544?.valorCentavos).toBe(250105);
    expect(doc201544?.formattedBr).toBe('2501,05');

    const doc260704 = result.pixTransactions.find((t) => t.documento === '260704');
    expect(doc260704).toBeDefined();
    expect(doc260704?.valor).toBe(24277.54);
    expect(doc260704?.valorCentavos).toBe(2427754);
    expect(doc260704?.formattedBr).toBe('24277,54');

    const doc271112 = result.pixTransactions.find((t) => t.documento === '271112');
    expect(doc271112).toBeDefined();
    expect(doc271112?.valor).toBe(5696.29);
    expect(doc271112?.valorCentavos).toBe(569629);
    expect(doc271112?.formattedBr).toBe('5696,29');

    const doc201553 = result.pixTransactions.find((t) => t.documento === '201553');
    expect(doc201553?.valor).toBe(6.15);

    const doc201739 = result.pixTransactions.find((t) => t.documento === '201739');
    expect(doc201739?.valor).toBe(500.41);

    // Sorting order must put the largest (24277.54) at the end, not at the beginning as 24.28
    const lastTx = result.pixTransactions[result.pixTransactions.length - 1];
    expect(lastTx.documento).toBe('260704');
    expect(lastTx.valor).toBe(24277.54);
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

  it('rejects Protege headers with a module-specific instruction', () => {
    const { indices, missingColumns } = locateColumns([
      ['CNPJ', 'Data', 'Evento', 'Transação', 'Total'],
      ['123', '01/10/2026', 'Depósito', 'TX-1', '10'],
    ]);
    expect(indices).toBeNull();
    expect(missingColumns[0]).toContain('módulo Protege');
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

  it('aborts parsing and collects structured error details when invalid or ambiguous monetary values are present', async () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      ['Histórico', 'Documento', 'Valor Lançamento', 'Data Lançamento', 'Data Movimento', 'Saldo'],
      ['CRED PIX CHAVE', '201544', '2,501.05', '20/10/2026', '20/10/2026', '100,00'], // valid
      ['CRED PIX CHAVE', '201545', '1,2,3', '20/10/2026', '20/10/2026', '100,00'], // malformed thousands
      ['CRED PIX CHAVE', '201546', '1,234', '20/10/2026', '20/10/2026', '100,00'], // ambiguous
      ['CRED PIX CHAVE', '201547', 'INV_VAL', '20/10/2026', '20/10/2026', '100,00'], // invalid chars
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Extrato');
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer | Uint8Array;
    const buffer = new Uint8Array(bytes as any).buffer as ArrayBuffer;

    const result = await parseStatement(buffer, 'extrato-invalido.xlsx');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.pixTransactions).toHaveLength(0); // Zero transactions created
    expect(result.totalValidTransactions).toBe(0);

    const errorMsg = result.errors[0];
    expect(errorMsg).toMatch(/foram encontrados 3 lançamento\(s\) PIX com valores monetários inválidos ou ambíguos/);
    expect(errorMsg).toContain('Linha 3 (Doc: 201545');
    expect(errorMsg).toContain('Linha 4 (Doc: 201546');
    expect(errorMsg).toContain('Linha 5 (Doc: 201547');
    expect(errorMsg).toContain('Verifique os dados no extrato e tente novamente');
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
