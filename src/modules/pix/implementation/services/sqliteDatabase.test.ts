import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SqliteDatabaseService } from './sqliteDatabase';
import type { StatementParseResult } from './statementParser';

const TEST_DB_PATH = path.resolve(__dirname, '../../test_data_test.db');

function createSampleParseResult(fileHash = 'hash_123', fileName = 'extrato.xlsx'): StatementParseResult {
  return {
    fileName,
    fileHash,
    sheetName: 'Sheet1',
    allSheets: ['Sheet1'],
    totalRawRows: 5,
    totalValidTransactions: 4,
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
        id: 'tx_4',
        rowNumber: 4,
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
    ],
    availableHistoricos: ['CRED PIX CHAVE', 'DEVOLUCAO PIX ENVIADO', 'PIX RECEBIDO DADOS CONTA'],
    initialSelectedHistoricos: ['CRED PIX CHAVE', 'PIX RECEBIDO DADOS CONTA'],
    availableDias: ['DIA 01', 'DIA 02', 'DIA 03'],
    errors: [],
  };
}

describe('SqliteDatabaseService', () => {
  let dbService: SqliteDatabaseService;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    dbService = new SqliteDatabaseService();
    await dbService.init(TEST_DB_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch {}
    }
  });

  it('saves and retrieves conferences and transactions in SQLite', () => {
    const sample = createSampleParseResult();
    const confId = dbService.saveConference(sample);

    expect(confId).toBeDefined();

    const conferences = dbService.getConferences();
    expect(conferences).toHaveLength(1);
    expect(conferences[0].id).toBe(confId);
    expect(conferences[0].totalPix).toBe(4);
    expect(conferences[0].conferidosCount).toBe(0);
    expect(conferences[0].pendentesCount).toBe(4);
    expect(conferences[0].percentCompleted).toBe(0);

    const txs = dbService.getTransactions(confId);
    expect(txs).toHaveLength(4);
    expect(txs[0].id).toBe('tx_4'); // -54,00 is smallest
    expect(txs[0].valor).toBe(-54);
  });

  it('toggles transaction checkmarks and updates stats accurately', () => {
    const sample = createSampleParseResult();
    const confId = dbService.saveConference(sample);

    // Toggle tx_1
    const marked = dbService.toggleCheck(confId, 'tx_1');
    expect(marked).toBe(true);

    let checkedIds = dbService.getCheckedIds(confId);
    expect(checkedIds.has('tx_1')).toBe(true);
    expect(checkedIds.has('tx_2')).toBe(false); // duplicate value not marked!

    let conf = dbService.getConference(confId);
    expect(conf?.conferidosCount).toBe(1);
    expect(conf?.pendentesCount).toBe(3);
    expect(conf?.percentCompleted).toBe(25);

    // Toggle tx_1 again to unmark
    const unmarked = dbService.toggleCheck(confId, 'tx_1');
    expect(unmarked).toBe(false);

    checkedIds = dbService.getCheckedIds(confId);
    expect(checkedIds.has('tx_1')).toBe(false);

    conf = dbService.getConference(confId);
    expect(conf?.conferidosCount).toBe(0);
    expect(conf?.pendentesCount).toBe(4);
  });

  it('preserves checkmarks on disk and restores after re-init', async () => {
    const sample = createSampleParseResult();
    const confId = dbService.saveConference(sample);

    dbService.toggleCheck(confId, 'tx_1');
    dbService.toggleCheck(confId, 'tx_3');

    // Reopen database from disk
    const reopenedDb = new SqliteDatabaseService();
    await reopenedDb.init(TEST_DB_PATH);

    const conf = reopenedDb.getConference(confId);
    expect(conf).not.toBeNull();
    expect(conf?.conferidosCount).toBe(2);

    const checkedIds = reopenedDb.getCheckedIds(confId);
    expect(checkedIds.has('tx_1')).toBe(true);
    expect(checkedIds.has('tx_3')).toBe(true);
    expect(checkedIds.has('tx_2')).toBe(false);
  });

  it('saves and retrieves application settings in SQLite', () => {
    expect(dbService.getSetting('behavior_after_check', 'move_to_conferidos')).toBe('move_to_conferidos');

    dbService.setSetting('behavior_after_check', 'keep_in_list');
    expect(dbService.getSetting('behavior_after_check')).toBe('keep_in_list');
  });

  it('exports and restores backups accurately', async () => {
    const sample = createSampleParseResult('hash_backup', 'backup_test.xlsx');
    const confId = dbService.saveConference(sample);
    dbService.toggleCheck(confId, 'tx_1');
    dbService.setSetting('test_setting', 'val_123');

    const backup = dbService.exportBackup();
    expect(backup.version).toBe(1);
    expect(backup.settings.test_setting).toBe('val_123');
    expect(backup.conferences).toHaveLength(1);
    expect(backup.conferences[0].checkedIds).toContain('tx_1');

    // Wipe DB and restore
    dbService.deleteAllConferences();
    expect(dbService.getConferences()).toHaveLength(0);

    const result = dbService.restoreBackup(backup);
    expect(result.conferencesRestored).toBe(1);
    expect(dbService.getConferences()).toHaveLength(1);
    expect(dbService.getCheckedIds(confId).has('tx_1')).toBe(true);
    expect(dbService.getSetting('test_setting')).toBe('val_123');
  });

  it('deletes individual conference and deletes all history', () => {
    const s1 = createSampleParseResult('h1', 'file1.xlsx');
    const s2 = createSampleParseResult('h2', 'file2.xlsx');

    const id1 = dbService.saveConference(s1);
    const id2 = dbService.saveConference(s2);

    expect(dbService.getConferences()).toHaveLength(2);

    dbService.deleteConference(id1);
    const remaining = dbService.getConferences();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(id2);

    dbService.deleteAllConferences();
    expect(dbService.getConferences()).toHaveLength(0);
  });
});
