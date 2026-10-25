import { describe, it, expect } from 'vitest';
import { extractDia, extractHorario, isPixHistorico, parseMonetaryValue, formatCurrencyBr } from './rules';

describe('Caixa PIX Business Rules', () => {
  describe('extractDia', () => {
    it('extracts dia from 6-digit documents correctly', () => {
      expect(extractDia('010523')).toBe('DIA 01');
      expect(extractDia('012012')).toBe('DIA 01');
      expect(extractDia('011026')).toBe('DIA 01');
      expect(extractDia('024003')).toBe('DIA 02');
      expect(extractDia('100611')).toBe('DIA 10');
      expect(extractDia('210709')).toBe('DIA 21');
    });

    it('extracts dia from 5-digit documents (first digit rule)', () => {
      expect(extractDia('10523')).toBe('DIA 01');
      expect(extractDia('24003')).toBe('DIA 02');
      expect(extractDia('91438')).toBe('DIA 09');
    });

    it('preserves DIA 00 for zeros documents', () => {
      expect(extractDia('000000')).toBe('DIA 00');
      expect(extractDia('000394')).toBe('DIA 00');
      expect(extractDia('000905')).toBe('DIA 00');
      expect(extractDia('006104')).toBe('DIA 00');
    });

    it('handles single digits or edge cases safely', () => {
      expect(extractDia(null)).toBe('Não identificado');
      expect(extractDia(undefined)).toBe('Não identificado');
      expect(extractDia('')).toBe('Não identificado');
      expect(extractDia('ABC')).toBe('Não identificado');
    });
  });

  describe('extractHorario', () => {
    it('extracts horario when last 4 digits represent a valid time', () => {
      expect(extractHorario('010523')).toBe('05:23');
      expect(extractHorario('012012')).toBe('20:12');
      expect(extractHorario('011026')).toBe('10:26');
      expect(extractHorario('062338')).toBe('23:38');
      expect(extractHorario('070805')).toBe('08:05');
    });

    it('returns null when last 4 digits are NOT a valid time', () => {
      // 024003 -> 40:03 is invalid hour
      expect(extractHorario('024003')).toBeNull();
      // 024006 -> 40:06 is invalid hour
      expect(extractHorario('024006')).toBeNull();
      // Minutes > 59
      expect(extractHorario('011265')).toBeNull();
    });

    it('does NOT treat 000000 as valid time', () => {
      expect(extractHorario('000000')).toBeNull();
    });

    it('handles short or non-standard documents safely', () => {
      expect(extractHorario('123')).toBeNull();
      expect(extractHorario('')).toBeNull();
      expect(extractHorario(null)).toBeNull();
    });
  });

  describe('isPixHistorico', () => {
    it('detects PIX in beginning, middle, or end of string, case-insensitively', () => {
      expect(isPixHistorico('CRED PIX CHAVE')).toBe(true);
      expect(isPixHistorico('PIX RECEBIDO DADOS CONTA')).toBe(true);
      expect(isPixHistorico('CRED PIX QR COD DIN')).toBe(true);
      expect(isPixHistorico('DEVOLUCAO PIX ENVIADO')).toBe(true);
      expect(isPixHistorico('PAGAMENTO pix TESTE')).toBe(true);
      expect(isPixHistorico('TRANSFERENCIA REALIZADA PIX')).toBe(true);
    });

    it('returns false for non-PIX transactions', () => {
      expect(isPixHistorico('DEBITO PRESTACAO CONTAS')).toBe(false);
      expect(isPixHistorico('PAGAMENTO DE PREMIO SISPL')).toBe(false);
      expect(isPixHistorico('VENDA COTA VIRTUAL')).toBe(false);
      expect(isPixHistorico('ARRECADACAO JOGOS LOT')).toBe(false);
      expect(isPixHistorico('CR CARRO FORTE COL NORMAL')).toBe(false);
      expect(isPixHistorico(null)).toBe(false);
      expect(isPixHistorico('')).toBe(false);
    });
  });

  describe('parseMonetaryValue and formatting', () => {
    it('parses numeric values and formats correctly', () => {
      const res1 = parseMonetaryValue(696);
      expect(res1.valor).toBe(696);
      expect(res1.centavos).toBe(69600);
      expect(res1.formattedBr).toBe('696,00');

      const res2 = parseMonetaryValue(10.12);
      expect(res2.valor).toBe(10.12);
      expect(res2.centavos).toBe(1012);
      expect(res2.formattedBr).toBe('10,12');
    });

    it('parses Brazilian string formats and preserves negative signs', () => {
      const res3 = parseMonetaryValue('-181.424,58');
      expect(res3.valor).toBe(-181424.58);
      expect(res3.centavos).toBe(-18142458);
      expect(res3.formattedBr).toBe('-181424,58');

      const res4 = parseMonetaryValue('-54,00');
      expect(res4.valor).toBe(-54);
      expect(res4.centavos).toBe(-5400);
      expect(res4.formattedBr).toBe('-54,00');
    });

    it('formats display currency according to Brazilian standard', () => {
      expect(formatCurrencyBr(696)).toBe('R$ 696,00');
      expect(formatCurrencyBr(10.12)).toBe('R$ 10,12');
      expect(formatCurrencyBr(-181424.58)).toBe('-R$ 181.424,58');
      expect(formatCurrencyBr(-54)).toBe('-R$ 54,00');
    });
  });

  describe('calculation on generated reference rows', () => {
    it('matches the spreadsheet day formula for 1,901 synthetic transaction documents', () => {
      const docs = Array.from({ length: 1901 }, (_item, index) => {
        const day = (index % 31) + 1;
        const document = `${String(day).padStart(2, '0')}${String(index).padStart(4, '0')}`;
        return { document, expected: `DIA ${String(day).padStart(2, '0')}` };
      });
      expect(docs).toHaveLength(1901);
      expect(docs.every(({ document, expected }) => extractDia(document) === expected)).toBe(true);
    });
  });
});
