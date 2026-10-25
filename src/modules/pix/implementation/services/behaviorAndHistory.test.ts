import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SqliteDatabaseService } from './sqliteDatabase';
import type { StatementParseResult } from './statementParser';

const TEST_DB = path.resolve(__dirname, '../../test_behavior_history.db');

function createSampleStatement(fileHash = 'test_hash_unique', fileName = 'caixa_oct.xlsx'): StatementParseResult {
  return {
    fileName,
    fileHash,
    sheetName: 'Planilha1',
    allSheets: ['Planilha1'],
    totalRawRows: 10,
    totalValidTransactions: 3,
    pixTransactions: [
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
        historico: 'PIX RECEBIDO DADOS CONTA',
        documento: '011245',
        valor: 20,
        valorCentavos: 2000,
        rawValor: '20,00',
        formattedBr: '20,00',
        dia: 'DIA 01',
        horario: '12:45',
        isPix: true,
      },
      {
        id: 'tx_3',
        rowNumber: 3,
        historico: 'CRED PIX QR COD DIN',
        documento: '020815',
        valor: 35.5,
        valorCentavos: 3550,
        rawValor: '35,50',
        formattedBr: '35,50',
        dia: 'DIA 02',
        horario: '08:15',
        isPix: true,
      },
    ],
    availableHistoricos: ['CRED PIX CHAVE', 'CRED PIX QR COD DIN', 'PIX RECEBIDO DADOS CONTA'],
    initialSelectedHistoricos: ['CRED PIX CHAVE', 'PIX RECEBIDO DADOS CONTA'],
    availableDias: ['DIA 01', 'DIA 02'],
    errors: [],
  };
}

describe('Behavior and History Integration Tests', () => {
  let db: SqliteDatabaseService;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = new SqliteDatabaseService();
    await db.init(TEST_DB);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DB)) {
      try {
        fs.unlinkSync(TEST_DB);
      } catch {}
    }
  });

  it('altering behavior configuration persists in SQLite and does NOT erase previous marks', () => {
    const statement = createSampleStatement();
    const confId = db.saveConference(statement);

    // Mark tx_1 and tx_2
    db.toggleCheck(confId, 'tx_1');
    db.toggleCheck(confId, 'tx_2');
    expect(db.getCheckedIds(confId).size).toBe(2);

    // Set behavior to 'move_to_conferidos'
    db.setSetting('behavior_after_check', 'move_to_conferidos');
    expect(db.getSetting('behavior_after_check')).toBe('move_to_conferidos');

    // Switch behavior to 'keep_in_list'
    db.setSetting('behavior_after_check', 'keep_in_list');
    expect(db.getSetting('behavior_after_check')).toBe('keep_in_list');

    // Checked marks in SQLite must remain completely intact
    const checkedAfter = db.getCheckedIds(confId);
    expect(checkedAfter.size).toBe(2);
    expect(checkedAfter.has('tx_1')).toBe(true);
    expect(checkedAfter.has('tx_2')).toBe(true);
  });

  it('re-importing same file hash detects duplication and allows clean new session without inheriting previous marks', () => {
    const statement = createSampleStatement('same_hash_456', 'extrato_mesmo.xlsx');

    // Session 1
    const conf1Id = db.saveConference(statement);
    db.toggleCheck(conf1Id, 'tx_1');
    expect(db.getCheckedIds(conf1Id).has('tx_1')).toBe(true);

    // Re-importing: find by hash finds session 1
    const found = db.findConferenceByHash('same_hash_456');
    expect(found).not.toBeNull();
    expect(found?.id).toBe(conf1Id);

    // User chooses Option 2: "Iniciar Nova Conferência (Limpa)"
    const conf2Id = db.saveConference(statement, { newSession: true });
    expect(conf2Id).not.toBe(conf1Id);

    // Session 2 must start with 0 checked items (NO marks inherited from session 1)
    const session2Checked = db.getCheckedIds(conf2Id);
    expect(session2Checked.size).toBe(0);

    // Session 1 still has its mark preserved
    const session1Checked = db.getCheckedIds(conf1Id);
    expect(session1Checked.size).toBe(1);
    expect(session1Checked.has('tx_1')).toBe(true);
  });

  it('reopening a conference from history restores all transactions and checked states', () => {
    const statement = createSampleStatement('reopen_hash', 'antigo.xlsx');
    const confId = db.saveConference(statement);

    db.toggleCheck(confId, 'tx_1');
    db.updateConferenceFilters(confId, {
      selectedDia: 'DIA 01',
      selectedHistoricos: ['CRED PIX CHAVE'],
    });

    // Later: user reopens conference
    const conf = db.getConference(confId);
    expect(conf).not.toBeNull();
    expect(conf?.fileName).toBe('antigo.xlsx');
    expect(conf?.selectedDia).toBe('DIA 01');
    expect(conf?.selectedHistoricos).toEqual(['CRED PIX CHAVE']);
    expect(conf?.conferidosCount).toBe(1);
    expect(conf?.pendentesCount).toBe(2);

    const txs = db.getTransactions(confId);
    expect(txs).toHaveLength(3);
    const checked = db.getCheckedIds(confId);
    expect(checked.has('tx_1')).toBe(true);
    expect(checked.has('tx_2')).toBe(false);
  });
});
