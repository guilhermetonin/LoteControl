import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import type { PixTransaction, StatementParseResult } from './statementParser';

export interface ConferenceRecord {
  id: string;
  fileHash: string;
  fileName: string;
  sheetName: string;
  importedAt: string;
  totalRawRows: number;
  totalValidTransactions: number;
  totalPix: number;
  conferidosCount: number;
  pendentesCount: number;
  percentCompleted: number;
  availableHistoricos: string[];
  initialSelectedHistoricos: string[];
  availableDias: string[];
  selectedDia: string;
  selectedHistoricos: string[];
  timeFilterStart: string;
  timeFilterEnd: string;
  isTimeFilterActive: boolean;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  settings: Record<string, string>;
  conferences: Array<{
    info: Omit<ConferenceRecord, 'totalPix' | 'conferidosCount' | 'pendentesCount' | 'percentCompleted'>;
    transactions: PixTransaction[];
    checkedIds: string[];
  }>;
}

let SQL: SqlJsStatic | null = null;

export class SqliteDatabaseService {
  private db: Database | null = null;
  private dbFilePath: string | null = null;

  async init(dbPath?: string): Promise<void> {
    if (!SQL) {
      try {
        if (typeof fs !== 'undefined' && fs?.existsSync && typeof path !== 'undefined' && path?.join) {
          const candidates = [
            path.join((process as any).resourcesPath || '', 'sql-wasm.wasm'),
            path.join(__dirname, 'sql-wasm.wasm'),
            path.join(__dirname, '../dist-electron/sql-wasm.wasm'),
            path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'),
            path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'),
          ];
          const wasmPath = candidates.find((p) => {
            try {
              return fs.existsSync(p);
            } catch {
              return false;
            }
          });

          if (wasmPath) {
            SQL = await initSqlJs({ locateFile: () => wasmPath });
          } else {
            SQL = await initSqlJs();
          }
        } else {
          SQL = await initSqlJs();
        }
      } catch {
        SQL = await initSqlJs();
      }
    }

    this.dbFilePath = dbPath || null;

    if (this.dbFilePath && typeof fs !== 'undefined' && fs?.existsSync && fs.existsSync(this.dbFilePath)) {
      try {
        const fileBuffer = fs.readFileSync(this.dbFilePath);
        this.db = new SQL.Database(fileBuffer);
      } catch (err) {
        throw new Error(`Não foi possível abrir o banco existente em ${this.dbFilePath}. O arquivo original foi preservado.`, { cause: err });
      }
    } else {
      this.db = new SQL.Database();
    }

    this.createSchema();
    this.persist();
  }

  private createSchema(): void {
    if (!this.db) throw new Error('Banco não inicializado');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conferences (
        id TEXT PRIMARY KEY,
        file_hash TEXT NOT NULL,
        file_name TEXT NOT NULL,
        sheet_name TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        total_raw_rows INTEGER NOT NULL,
        total_valid_transactions INTEGER NOT NULL,
        available_historicos TEXT NOT NULL,
        initial_selected_historicos TEXT NOT NULL,
        available_dias TEXT NOT NULL,
        selected_dia TEXT DEFAULT 'TODOS',
        selected_historicos TEXT,
        time_filter_start TEXT DEFAULT '',
        time_filter_end TEXT DEFAULT '',
        is_time_filter_active INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT NOT NULL,
        conference_id TEXT NOT NULL,
        row_number INTEGER NOT NULL,
        historico TEXT NOT NULL,
        documento TEXT NOT NULL,
        valor REAL NOT NULL,
        valor_centavos INTEGER NOT NULL,
        raw_valor TEXT NOT NULL,
        formatted_br TEXT NOT NULL,
        dia TEXT NOT NULL,
        horario TEXT,
        is_pix INTEGER NOT NULL DEFAULT 1,
        data_lancamento TEXT,
        data_movimento TEXT,
        saldo REAL,
        is_checked INTEGER NOT NULL DEFAULT 0,
        checked_at TEXT,
        observacao TEXT DEFAULT '',
        PRIMARY KEY (conference_id, id),
        FOREIGN KEY(conference_id) REFERENCES conferences(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_conference_id ON transactions(conference_id);
      CREATE INDEX IF NOT EXISTS idx_conferences_file_hash ON conferences(file_hash);
      CREATE INDEX IF NOT EXISTS idx_transactions_is_checked ON transactions(conference_id, is_checked);
    `);

    try {
      this.db.run("ALTER TABLE transactions ADD COLUMN observacao TEXT DEFAULT ''");
    } catch {
      // Column may already exist
    }
  }

  persist(): void {
    if (!this.db || !this.dbFilePath || typeof fs === 'undefined' || !fs?.writeFileSync) return;
    const tempPath = `${this.dbFilePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      const dir = typeof path !== 'undefined' && path?.dirname ? path.dirname(this.dbFilePath) : '';
      if (dir && typeof fs !== 'undefined' && fs?.existsSync && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = this.db.export();
      fs.writeFileSync(tempPath, Buffer.from(data), { flag: 'wx' });
      fs.renameSync(tempPath, this.dbFilePath);
    } catch (err) {
      console.error('Erro ao persistir banco no disco:', err);
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
      throw err;
    }
  }

  close(): void {
    this.persist();
    this.db?.close();
    this.db = null;
  }

  getSetting(key: string, defaultValue = ''): string {
    if (!this.db) return defaultValue;
    const stmt = this.db.prepare('SELECT value FROM app_settings WHERE key = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return String(row.value ?? defaultValue);
    }
    stmt.free();
    return defaultValue;
  }

  setSetting(key: string, value: string): void {
    if (!this.db) return;
    this.db.run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    );
    this.persist();
  }

  findConferenceByHash(fileHash: string): ConferenceRecord | null {
    if (!this.db) return null;
    const stmt = this.db.prepare('SELECT id FROM conferences WHERE file_hash = ? ORDER BY imported_at DESC LIMIT 1');
    stmt.bind([fileHash]);
    let confId: string | null = null;
    if (stmt.step()) {
      confId = String(stmt.getAsObject().id);
    }
    stmt.free();

    return confId ? this.getConference(confId) : null;
  }

  saveConference(
    parseResult: StatementParseResult,
    options?: { newSession?: boolean; initialCheckedIds?: Set<string> }
  ): string {
    if (!this.db) throw new Error('Banco não inicializado');

    const conferenceId = `conf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const importedAt = new Date().toISOString();

    const checkedIds = options?.initialCheckedIds || new Set<string>();

    this.db.run('BEGIN TRANSACTION;');
    try {
      this.db.run(
        `INSERT INTO conferences (
          id, file_hash, file_name, sheet_name, imported_at,
          total_raw_rows, total_valid_transactions,
          available_historicos, initial_selected_historicos, available_dias,
          selected_dia, selected_historicos
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          conferenceId,
          parseResult.fileHash,
          parseResult.fileName,
          parseResult.sheetName,
          importedAt,
          parseResult.totalRawRows,
          parseResult.totalValidTransactions,
          JSON.stringify(parseResult.availableHistoricos),
          JSON.stringify(parseResult.initialSelectedHistoricos),
          JSON.stringify(parseResult.availableDias),
          'TODOS',
          JSON.stringify(parseResult.initialSelectedHistoricos),
        ]
      );

      const stmt = this.db.prepare(`
        INSERT INTO transactions (
          id, conference_id, row_number, historico, documento, valor, valor_centavos,
          raw_valor, formatted_br, dia, horario, is_pix, data_lancamento, data_movimento, saldo,
          is_checked, checked_at, observacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const tx of parseResult.pixTransactions) {
        const isChecked = checkedIds.has(tx.id) ? 1 : 0;
        const checkedAt = isChecked ? importedAt : null;

        stmt.run([
          tx.id,
          conferenceId,
          tx.rowNumber,
          tx.historico,
          tx.documento,
          tx.valor,
          tx.valorCentavos,
          tx.rawValor,
          tx.formattedBr,
          tx.dia,
          tx.horario,
          1,
          tx.dataLancamento || null,
          tx.dataMovimento || null,
          tx.saldo ?? null,
          isChecked,
          checkedAt,
          tx.observacao || '',
        ]);
      }
      stmt.free();

      this.db.run('COMMIT;');
      this.persist();
      return conferenceId;
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
  }

  getConferences(): ConferenceRecord[] {
    if (!this.db) return [];

    const res = this.db.exec(`
      SELECT 
        c.*,
        COUNT(t.id) as total_pix,
        SUM(CASE WHEN t.is_checked = 1 THEN 1 ELSE 0 END) as conferidos_count,
        SUM(CASE WHEN t.is_checked = 0 THEN 1 ELSE 0 END) as pendentes_count
      FROM conferences c
      LEFT JOIN transactions t ON t.conference_id = c.id
      GROUP BY c.id
      ORDER BY c.imported_at DESC
    `);

    if (!res || res.length === 0) return [];

    const cols = res[0].columns;
    const rows = res[0].values;

    return rows.map((row) => {
      const obj: Record<string, any> = {};
      cols.forEach((col, i) => {
        obj[col] = row[i];
      });

      const totalPix = Number(obj.total_pix || 0);
      const conferidosCount = Number(obj.conferidos_count || 0);
      const pendentesCount = Number(obj.pendentes_count || 0);
      const percentCompleted = totalPix > 0 ? Math.round((conferidosCount / totalPix) * 100) : 0;

      return {
        id: obj.id,
        fileHash: obj.file_hash,
        fileName: obj.file_name,
        sheetName: obj.sheet_name,
        importedAt: obj.imported_at,
        totalRawRows: Number(obj.total_raw_rows),
        totalValidTransactions: Number(obj.total_valid_transactions),
        totalPix,
        conferidosCount,
        pendentesCount,
        percentCompleted,
        availableHistoricos: JSON.parse(obj.available_historicos || '[]'),
        initialSelectedHistoricos: JSON.parse(obj.initial_selected_historicos || '[]'),
        availableDias: JSON.parse(obj.available_dias || '[]'),
        selectedDia: obj.selected_dia || 'TODOS',
        selectedHistoricos: JSON.parse(obj.selected_historicos || '[]'),
        timeFilterStart: obj.time_filter_start || '',
        timeFilterEnd: obj.time_filter_end || '',
        isTimeFilterActive: Boolean(obj.is_time_filter_active),
      };
    });
  }

  getConference(id: string): ConferenceRecord | null {
    if (!this.db) return null;

    const stmt = this.db.prepare(`
      SELECT 
        c.*,
        COUNT(t.id) as total_pix,
        SUM(CASE WHEN t.is_checked = 1 THEN 1 ELSE 0 END) as conferidos_count,
        SUM(CASE WHEN t.is_checked = 0 THEN 1 ELSE 0 END) as pendentes_count
      FROM conferences c
      LEFT JOIN transactions t ON t.conference_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `);
    stmt.bind([id]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const obj: any = stmt.getAsObject();
    stmt.free();

    const totalPix = Number(obj.total_pix || 0);
    const conferidosCount = Number(obj.conferidos_count || 0);
    const pendentesCount = Number(obj.pendentes_count || 0);
    const percentCompleted = totalPix > 0 ? Math.round((conferidosCount / totalPix) * 100) : 0;

    return {
      id: obj.id,
      fileHash: obj.file_hash,
      fileName: obj.file_name,
      sheetName: obj.sheet_name,
      importedAt: obj.imported_at,
      totalRawRows: Number(obj.total_raw_rows),
      totalValidTransactions: Number(obj.total_valid_transactions),
      totalPix,
      conferidosCount,
      pendentesCount,
      percentCompleted,
      availableHistoricos: JSON.parse(obj.available_historicos || '[]'),
      initialSelectedHistoricos: JSON.parse(obj.initial_selected_historicos || '[]'),
      availableDias: JSON.parse(obj.available_dias || '[]'),
      selectedDia: obj.selected_dia || 'TODOS',
      selectedHistoricos: JSON.parse(obj.selected_historicos || '[]'),
      timeFilterStart: obj.time_filter_start || '',
      timeFilterEnd: obj.time_filter_end || '',
      isTimeFilterActive: Boolean(obj.is_time_filter_active),
    };
  }

  getTransactions(conferenceId: string): PixTransaction[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM transactions 
      WHERE conference_id = ? 
      ORDER BY valor_centavos ASC, row_number ASC
    `);
    stmt.bind([conferenceId]);

    const txs: PixTransaction[] = [];
    while (stmt.step()) {
      const row: any = stmt.getAsObject();
      txs.push({
        id: row.id,
        rowNumber: row.row_number,
        historico: row.historico,
        documento: row.documento,
        valor: row.valor,
        valorCentavos: row.valor_centavos,
        rawValor: row.raw_valor,
        formattedBr: row.formatted_br,
        dia: row.dia,
        horario: row.horario,
        isPix: true,
        dataLancamento: row.data_lancamento || undefined,
        dataMovimento: row.data_movimento || undefined,
        saldo: row.saldo !== null ? row.saldo : undefined,
        observacao: row.observacao || '',
      });
    }
    stmt.free();
    return txs;
  }

  getCheckedIds(conferenceId: string): Set<string> {
    if (!this.db) return new Set();

    const stmt = this.db.prepare('SELECT id FROM transactions WHERE conference_id = ? AND is_checked = 1');
    stmt.bind([conferenceId]);

    const ids = new Set<string>();
    while (stmt.step()) {
      ids.add(String(stmt.getAsObject().id));
    }
    stmt.free();
    return ids;
  }

  toggleCheck(conferenceId: string, transactionId: string): boolean {
    if (!this.db) return false;

    // Fetch current state
    const stmt = this.db.prepare('SELECT is_checked FROM transactions WHERE conference_id = ? AND id = ?');
    stmt.bind([conferenceId, transactionId]);
    if (!stmt.step()) {
      stmt.free();
      return false;
    }
    const current = stmt.getAsObject().is_checked === 1;
    stmt.free();

    const nextState = current ? 0 : 1;
    this.setMultipleChecks(conferenceId, [transactionId], nextState === 1);
    return nextState === 1;
  }

  setMultipleChecks(conferenceId: string, transactionIds: string[], checked: boolean): void {
    if (!this.db || transactionIds.length === 0) return;

    const checkedVal = checked ? 1 : 0;
    const checkedAt = checked ? new Date().toISOString() : null;

    const before = Buffer.from(this.db.export());
    let transactionOpen = false;
    let committed = false;
    try {
      this.db.run('BEGIN TRANSACTION;');
      transactionOpen = true;
      const stmt = this.db.prepare(
        'UPDATE transactions SET is_checked = ?, checked_at = ? WHERE conference_id = ? AND id = ?'
      );
      for (const id of transactionIds) {
        stmt.run([checkedVal, checkedAt, conferenceId, id]);
      }
      stmt.free();
      this.db.run('COMMIT;');
      transactionOpen = false;
      committed = true;
      this.persist();
    } catch (err) {
      if (transactionOpen) {
        try { this.db.run('ROLLBACK;'); } catch {}
      }
      if (committed && SQL) {
        try {
          this.db.close();
          this.db = new SQL.Database(before);
        } catch (restoreError) {
          console.error('Não foi possível reverter a alteração em memória após falha de persistência:', restoreError);
        }
      }
      throw err;
    }
  }

  clearConferenceMarks(conferenceId: string): void {
    if (!this.db) return;
    this.db.run('UPDATE transactions SET is_checked = 0, checked_at = NULL WHERE conference_id = ?', [
      conferenceId,
    ]);
    this.persist();
  }

  updateTransactionObservation(conferenceId: string, transactionId: string, observacao: string): void {
    if (!this.db) return;
    this.db.run(
      'UPDATE transactions SET observacao = ? WHERE conference_id = ? AND id = ?',
      [observacao, conferenceId, transactionId]
    );
    this.persist();
  }

  addTransaction(conferenceId: string, transaction: PixTransaction, isChecked = false): void {
    if (!this.db) return;
    const isCheckedVal = isChecked ? 1 : 0;
    const checkedAt = isChecked ? new Date().toISOString() : null;

    this.db.run(`
      INSERT OR REPLACE INTO transactions (
        id, conference_id, row_number, historico, documento, valor, valor_centavos,
        raw_valor, formatted_br, dia, horario, is_pix, data_lancamento, data_movimento, saldo,
        is_checked, checked_at, observacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      transaction.id,
      conferenceId,
      transaction.rowNumber,
      transaction.historico,
      transaction.documento,
      transaction.valor,
      transaction.valorCentavos,
      transaction.rawValor,
      transaction.formattedBr,
      transaction.dia,
      transaction.horario,
      1,
      transaction.dataLancamento || null,
      transaction.dataMovimento || null,
      transaction.saldo ?? null,
      isCheckedVal,
      checkedAt,
      transaction.observacao || '',
    ]);
    this.persist();
  }

  updateTransaction(conferenceId: string, transactionId: string, updates: Partial<PixTransaction>): void {
    if (!this.db) return;
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.historico !== undefined) {
      fields.push('historico = ?');
      values.push(updates.historico);
    }
    if (updates.documento !== undefined) {
      fields.push('documento = ?');
      values.push(updates.documento);
    }
    if (updates.valor !== undefined) {
      fields.push('valor = ?');
      values.push(updates.valor);
    }
    if (updates.valorCentavos !== undefined) {
      fields.push('valor_centavos = ?');
      values.push(updates.valorCentavos);
    }
    if (updates.formattedBr !== undefined) {
      fields.push('formatted_br = ?');
      values.push(updates.formattedBr);
    }
    if (updates.dia !== undefined) {
      fields.push('dia = ?');
      values.push(updates.dia);
    }
    if (updates.horario !== undefined) {
      fields.push('horario = ?');
      values.push(updates.horario);
    }
    if (updates.observacao !== undefined) {
      fields.push('observacao = ?');
      values.push(updates.observacao);
    }

    if (fields.length === 0) return;

    values.push(conferenceId, transactionId);
    this.db.run(
      `UPDATE transactions SET ${fields.join(', ')} WHERE conference_id = ? AND id = ?`,
      values
    );
    this.persist();
  }

  deleteTransaction(conferenceId: string, transactionId: string): void {
    if (!this.db) return;
    this.db.run('DELETE FROM transactions WHERE conference_id = ? AND id = ?', [
      conferenceId,
      transactionId,
    ]);
    this.persist();
  }

  updateConferenceFilters(
    conferenceId: string,
    filters: {
      selectedDia?: string;
      selectedHistoricos?: string[];
      timeFilterStart?: string;
      timeFilterEnd?: string;
      isTimeFilterActive?: boolean;
    }
  ): void {
    if (!this.db) return;

    const updates: string[] = [];
    const values: any[] = [];

    if (filters.selectedDia !== undefined) {
      updates.push('selected_dia = ?');
      values.push(filters.selectedDia);
    }
    if (filters.selectedHistoricos !== undefined) {
      updates.push('selected_historicos = ?');
      values.push(JSON.stringify(filters.selectedHistoricos));
    }
    if (filters.timeFilterStart !== undefined) {
      updates.push('time_filter_start = ?');
      values.push(filters.timeFilterStart);
    }
    if (filters.timeFilterEnd !== undefined) {
      updates.push('time_filter_end = ?');
      values.push(filters.timeFilterEnd);
    }
    if (filters.isTimeFilterActive !== undefined) {
      updates.push('is_time_filter_active = ?');
      values.push(filters.isTimeFilterActive ? 1 : 0);
    }

    if (updates.length > 0) {
      values.push(conferenceId);
      this.db.run(`UPDATE conferences SET ${updates.join(', ')} WHERE id = ?`, values);
      this.persist();
    }
  }

  deleteConference(id: string): void {
    if (!this.db) return;
    this.db.run('BEGIN TRANSACTION;');
    try {
      this.db.run('DELETE FROM transactions WHERE conference_id = ?', [id]);
      this.db.run('DELETE FROM conferences WHERE id = ?', [id]);
      this.db.run('COMMIT;');
      this.persist();
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
  }

  deleteAllConferences(): void {
    if (!this.db) return;
    this.db.run('BEGIN TRANSACTION;');
    try {
      this.db.run('DELETE FROM transactions');
      this.db.run('DELETE FROM conferences');
      this.db.run('COMMIT;');
      this.persist();
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
  }

  exportBackup(): BackupData {
    if (!this.db) throw new Error('Banco não inicializado');

    // Get settings
    const settings: Record<string, string> = {};
    const settingsRes = this.db.exec('SELECT key, value FROM app_settings');
    if (settingsRes.length > 0) {
      settingsRes[0].values.forEach((row) => {
        settings[String(row[0])] = String(row[1]);
      });
    }

    // Get conferences
    const conferences = this.getConferences();
    const backupConferences = conferences.map((conf) => {
      const txs = this.getTransactions(conf.id);
      const checkedIds = Array.from(this.getCheckedIds(conf.id));
      return {
        info: {
          id: conf.id,
          fileHash: conf.fileHash,
          fileName: conf.fileName,
          sheetName: conf.sheetName,
          importedAt: conf.importedAt,
          totalRawRows: conf.totalRawRows,
          totalValidTransactions: conf.totalValidTransactions,
          availableHistoricos: conf.availableHistoricos,
          initialSelectedHistoricos: conf.initialSelectedHistoricos,
          availableDias: conf.availableDias,
          selectedDia: conf.selectedDia,
          selectedHistoricos: conf.selectedHistoricos,
          timeFilterStart: conf.timeFilterStart,
          timeFilterEnd: conf.timeFilterEnd,
          isTimeFilterActive: conf.isTimeFilterActive,
        },
        transactions: txs,
        checkedIds,
      };
    });

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      conferences: backupConferences,
    };
  }

  restoreBackup(backup: unknown): { conferencesRestored: number; settingsRestored: number } {
    if (!this.db) throw new Error('Banco não inicializado');

    if (!backup || typeof backup !== 'object') {
      throw new Error('Arquivo de backup inválido: formato JSON corrompido ou vazio.');
    }

    const data = backup as BackupData;
    if (!data.version || !Array.isArray(data.conferences)) {
      throw new Error('Arquivo de backup incompatível: estrutura ou versão inválida.');
    }

    let conferencesRestored = 0;
    let settingsRestored = 0;

    this.db.run('BEGIN TRANSACTION;');
    try {
      // Restore settings directly without intermediate persist
      if (data.settings && typeof data.settings === 'object') {
        const stmtSettings = this.db.prepare(
          'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        );
        for (const [key, value] of Object.entries(data.settings)) {
          stmtSettings.run([key, String(value)]);
          settingsRestored++;
        }
        stmtSettings.free();
      }

      // Restore conferences
      for (const confData of data.conferences) {
        const info = confData.info;
        if (!info || !info.id || !info.fileHash) continue;

        // Check if conference ID already exists, if so delete and overwrite
        this.db.run('DELETE FROM transactions WHERE conference_id = ?', [info.id]);
        this.db.run('DELETE FROM conferences WHERE id = ?', [info.id]);

        this.db.run(
          `INSERT INTO conferences (
            id, file_hash, file_name, sheet_name, imported_at,
            total_raw_rows, total_valid_transactions,
            available_historicos, initial_selected_historicos, available_dias,
            selected_dia, selected_historicos, time_filter_start, time_filter_end, is_time_filter_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            info.id,
            info.fileHash,
            info.fileName,
            info.sheetName,
            info.importedAt,
            info.totalRawRows,
            info.totalValidTransactions,
            JSON.stringify(info.availableHistoricos || []),
            JSON.stringify(info.initialSelectedHistoricos || []),
            JSON.stringify(info.availableDias || []),
            info.selectedDia || 'TODOS',
            JSON.stringify(info.selectedHistoricos || []),
            info.timeFilterStart || '',
            info.timeFilterEnd || '',
            info.isTimeFilterActive ? 1 : 0,
          ]
        );

        const checkedSet = new Set(confData.checkedIds || []);
        const stmt = this.db.prepare(`
          INSERT INTO transactions (
            id, conference_id, row_number, historico, documento, valor, valor_centavos,
            raw_valor, formatted_br, dia, horario, is_pix, data_lancamento, data_movimento, saldo,
            is_checked, checked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const tx of confData.transactions) {
          const isChecked = checkedSet.has(tx.id) ? 1 : 0;
          stmt.run([
            tx.id,
            info.id,
            tx.rowNumber,
            tx.historico,
            tx.documento,
            tx.valor,
            tx.valorCentavos,
            tx.rawValor,
            tx.formattedBr,
            tx.dia,
            tx.horario,
            1,
            tx.dataLancamento || null,
            tx.dataMovimento || null,
            tx.saldo ?? null,
            isChecked,
            isChecked ? info.importedAt : null,
          ]);
        }
        stmt.free();
        conferencesRestored++;
      }

      this.db.run('COMMIT;');
      this.persist();
      return { conferencesRestored, settingsRestored };
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
  }
}
