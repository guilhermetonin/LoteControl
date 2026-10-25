import { SqliteDatabaseService, type ConferenceRecord, type BackupData } from './sqliteDatabase';
import type { StatementParseResult, PixTransaction } from './statementParser';

declare global {
  interface Window {
    electronAPI?: import('../../../../../electron/preload').IElectronAPI;
  }
}

// Fallback in-memory or localStorage-backed instance for browser/tests
let fallbackDb: SqliteDatabaseService | null = null;

async function getFallbackDb(): Promise<SqliteDatabaseService> {
  if (!fallbackDb) {
    fallbackDb = new SqliteDatabaseService();
    await fallbackDb.init();
  }
  return fallbackDb;
}

export const dbClient = {
  isElectron(): boolean {
    return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
  },

  async getConferences(): Promise<ConferenceRecord[]> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.getConferences();
    }
    const db = await getFallbackDb();
    return db.getConferences();
  },

  async getConference(id: string): Promise<ConferenceRecord | null> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.getConference(id);
    }
    const db = await getFallbackDb();
    return db.getConference(id);
  },

  async getTransactions(conferenceId: string): Promise<PixTransaction[]> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.getTransactions(conferenceId);
    }
    const db = await getFallbackDb();
    return db.getTransactions(conferenceId);
  },

  async getCheckedIds(conferenceId: string): Promise<Set<string>> {
    if (this.isElectron() && window.electronAPI) {
      const arr = await window.electronAPI.db.getCheckedIds(conferenceId);
      return new Set(arr);
    }
    const db = await getFallbackDb();
    return db.getCheckedIds(conferenceId);
  },

  async saveConference(
    parseResult: StatementParseResult,
    options?: { newSession?: boolean; initialCheckedIds?: Set<string> }
  ): Promise<string> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.saveConference(parseResult, {
        newSession: options?.newSession,
        initialCheckedIds: options?.initialCheckedIds ? Array.from(options.initialCheckedIds) : undefined,
      });
    }
    const db = await getFallbackDb();
    return db.saveConference(parseResult, options);
  },

  async findConferenceByHash(fileHash: string): Promise<ConferenceRecord | null> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.findConferenceByHash(fileHash);
    }
    const db = await getFallbackDb();
    return db.findConferenceByHash(fileHash);
  },

  async toggleCheck(conferenceId: string, transactionId: string): Promise<boolean> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.toggleCheck(conferenceId, transactionId);
    }
    const db = await getFallbackDb();
    return db.toggleCheck(conferenceId, transactionId);
  },

  async setMultipleChecks(conferenceId: string, transactionIds: string[], checked: boolean): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.setMultipleChecks(conferenceId, transactionIds, checked);
    }
    const db = await getFallbackDb();
    return db.setMultipleChecks(conferenceId, transactionIds, checked);
  },

  async clearConferenceMarks(conferenceId: string): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.clearConferenceMarks(conferenceId);
    }
    const db = await getFallbackDb();
    return db.clearConferenceMarks(conferenceId);
  },

  async updateTransactionObservation(conferenceId: string, transactionId: string, observacao: string): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.updateTransactionObservation(conferenceId, transactionId, observacao);
    }
    const db = await getFallbackDb();
    return db.updateTransactionObservation(conferenceId, transactionId, observacao);
  },

  async addTransaction(conferenceId: string, transaction: PixTransaction, isChecked = false): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.addTransaction(conferenceId, transaction, isChecked);
    }
    const db = await getFallbackDb();
    return db.addTransaction(conferenceId, transaction, isChecked);
  },

  async updateTransaction(conferenceId: string, transactionId: string, updates: Partial<PixTransaction>): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.updateTransaction(conferenceId, transactionId, updates);
    }
    const db = await getFallbackDb();
    return db.updateTransaction(conferenceId, transactionId, updates);
  },

  async deleteTransaction(conferenceId: string, transactionId: string): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.deleteTransaction(conferenceId, transactionId);
    }
    const db = await getFallbackDb();
    return db.deleteTransaction(conferenceId, transactionId);
  },

  async updateConferenceFilters(
    conferenceId: string,
    filters: {
      selectedDia?: string;
      selectedHistoricos?: string[];
      timeFilterStart?: string;
      timeFilterEnd?: string;
      isTimeFilterActive?: boolean;
    }
  ): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.updateConferenceFilters(conferenceId, filters);
    }
    const db = await getFallbackDb();
    return db.updateConferenceFilters(conferenceId, filters);
  },

  async deleteConference(id: string): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.deleteConference(id);
    }
    const db = await getFallbackDb();
    return db.deleteConference(id);
  },

  async deleteAllConferences(): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.deleteAllConferences();
    }
    const db = await getFallbackDb();
    return db.deleteAllConferences();
  },

  async getSetting(key: string, defaultValue = ''): Promise<string> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.getSetting(key, defaultValue);
    }
    const db = await getFallbackDb();
    return db.getSetting(key, defaultValue);
  },

  async setSetting(key: string, value: string): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.setSetting(key, value);
    }
    const db = await getFallbackDb();
    return db.setSetting(key, value);
  },

  async exportBackup(): Promise<BackupData> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.exportBackup();
    }
    const db = await getFallbackDb();
    return db.exportBackup();
  },

  async restoreBackup(backup: BackupData): Promise<{ conferencesRestored: number; settingsRestored: number }> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.restoreBackup(backup);
    }
    const db = await getFallbackDb();
    return db.restoreBackup(backup);
  },

  // Save/Open file dialogs
  async promptSaveBackup(content: string, suggestedName = 'conferencia_pix_backup.json'): Promise<boolean> {
    if (this.isElectron() && window.electronAPI) {
      const res = await window.electronAPI.dialog.showSaveDialog({
        title: 'Exportar Backup das Conferências',
        defaultPath: suggestedName,
        filters: [{ name: 'Arquivo JSON de Backup', extensions: ['json'] }],
      });
      if (res.canceled || !res.filePath) return false;
      return window.electronAPI.dialog.saveFile(res.filePath, content);
    }

    // Browser download fallback
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  },

  async promptOpenBackup(): Promise<string | null> {
    if (this.isElectron() && window.electronAPI) {
      const res = await window.electronAPI.dialog.showOpenDialog({
        title: 'Selecionar Arquivo de Backup para Restauração',
        filters: [{ name: 'Arquivo JSON de Backup', extensions: ['json'] }],
        properties: ['openFile'],
      });
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) return null;
      return window.electronAPI.dialog.readFile(res.filePaths[0]);
    }

    // In browser, this is handled by file input
    return null;
  },

  async getCloseAction(): Promise<'close' | 'tray'> {
    if (this.isElectron() && window.electronAPI?.window?.getCloseAction) {
      try {
        return await window.electronAPI.window.getCloseAction();
      } catch {}
    }
    const saved = await this.getSetting('close_button_action', 'close');
    return saved === 'tray' ? 'tray' : 'close';
  },

  async setCloseAction(action: 'close' | 'tray'): Promise<void> {
    await this.setSetting('close_button_action', action);
    if (this.isElectron() && window.electronAPI?.window?.setCloseAction) {
      try {
        await window.electronAPI.window.setCloseAction(action);
      } catch {}
    }
  },
};
