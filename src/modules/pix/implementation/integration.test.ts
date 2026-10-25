import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseStatement } from './services/statementParser';
import { formatValuesForClipboard } from './services/clipboard';

describe('End-to-End Statement Processing on real Caixa Statement', () => {
  it('processes original-caixa.xlsx through the full business pipeline', async () => {
    const filePath = path.resolve(__dirname, '../fixtures/original-caixa.xlsx');
    const buf = fs.readFileSync(filePath);
    const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    // 1. Process statement
    const parsed = await parseStatement(buffer, 'original-caixa.xlsx');
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.totalValidTransactions).toBe(1901);
    expect(parsed.pixTransactions.length).toBeGreaterThan(0);

    // 2. Default habitual filters
    expect(parsed.initialSelectedHistoricos).toContain('CRED PIX CHAVE');
    expect(parsed.initialSelectedHistoricos).toContain('PIX RECEBIDO DADOS CONTA');

    // 3. Filter for CRED PIX CHAVE and PIX RECEBIDO DADOS CONTA on DIA 01
    const dia01Default = parsed.pixTransactions.filter(
      (tx) =>
        tx.dia === 'DIA 01' &&
        (tx.historico === 'CRED PIX CHAVE' || tx.historico === 'PIX RECEBIDO DADOS CONTA')
    );

    expect(dia01Default.length).toBeGreaterThan(0);

    // 4. Verify ordering is ascending
    for (let i = 0; i < dia01Default.length - 1; i++) {
      expect(dia01Default[i].valorCentavos).toBeLessThanOrEqual(
        dia01Default[i + 1].valorCentavos
      );
    }

    // 5. Test copy format on DIA 01 transactions
    const clipboardText = formatValuesForClipboard(dia01Default);
    const lines = clipboardText.split('\n');
    expect(lines.length).toBe(dia01Default.length);

    // Each line must be a formatted Brazilian number without 'R$', e.g. '6,00' or '696,00'
    lines.forEach((line) => {
      expect(line).toMatch(/^-?\d+,\d{2}$/);
      expect(line).not.toContain('R$');
    });
  });
});
