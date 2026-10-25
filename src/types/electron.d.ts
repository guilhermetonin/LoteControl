import type { ConferenceRecord, BackupData } from '../modules/pix/implementation/services/sqliteDatabase';
import type { PixTransaction, StatementParseResult } from '../modules/pix/implementation/services/statementParser';

export type DomainChange = { module: 'pix' | 'protege' | 'relatorio'; key?: string; at: string };

export interface LoteElectronAPI {
  isElectron: true;
  shell: {
    getState: () => Promise<{ theme: 'light'; minimizeToTray: boolean; reportMigrationDecisionPending: boolean; initialModule: 'dashboard' | 'protege' | 'pix' | 'relatorio' }>;
    openNewWindow: (module: 'dashboard' | 'protege' | 'pix' | 'relatorio') => Promise<{ opened: boolean; reason?: string }>;
    getMinimizeToTray: () => Promise<boolean>;
    setMinimizeToTray: (enabled: boolean) => Promise<boolean>;
    minimize: () => Promise<void>;
    maximize: () => Promise<boolean>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (callback: (value: boolean) => void) => () => void;
  };
  events: { onDomainChanged: (callback: (event: DomainChange) => void) => () => void; publishProtegeChanged: (key?: string) => void };
  db: {
    getConferences: () => Promise<ConferenceRecord[]>;
    getConference: (id: string) => Promise<ConferenceRecord | null>;
    getTransactions: (id: string) => Promise<PixTransaction[]>;
    getCheckedIds: (id: string) => Promise<string[]>;
    saveConference: (result: StatementParseResult, options?: { newSession?: boolean; initialCheckedIds?: string[] }) => Promise<string>;
    findConferenceByHash: (hash: string) => Promise<ConferenceRecord | null>;
    toggleCheck: (conferenceId: string, txId: string) => Promise<boolean>;
    setMultipleChecks: (conferenceId: string, ids: string[], checked: boolean) => Promise<void>;
    clearConferenceMarks: (conferenceId: string) => Promise<void>;
    updateTransactionObservation: (conferenceId: string, txId: string, note: string) => Promise<void>;
    addTransaction: (conferenceId: string, tx: PixTransaction, checked?: boolean) => Promise<void>;
    updateTransaction: (conferenceId: string, txId: string, updates: Partial<PixTransaction>) => Promise<void>;
    deleteTransaction: (conferenceId: string, txId: string) => Promise<void>;
    updateConferenceFilters: (conferenceId: string, filters: Record<string, unknown>) => Promise<void>;
    deleteConference: (id: string) => Promise<void>;
    deleteAllConferences: () => Promise<void>;
    getSetting: (key: string, fallback?: string) => Promise<string>;
    setSetting: (key: string, value: string) => Promise<void>;
    exportBackup: () => Promise<BackupData>;
    restoreBackup: (backup: BackupData) => Promise<{ conferencesRestored: number; settingsRestored: number }>;
  };
  dialog: {
    openStatementFile: () => Promise<{ canceled: boolean; fileName?: string; data?: Uint8Array; error?: string }>;
    openDataFile: (kind: 'protege' | 'pix' | 'report-credentials') => Promise<{ canceled: boolean; fileName?: string; data?: Uint8Array }>;
    showSaveDialog: (options: Record<string, unknown>) => Promise<{ canceled: boolean; filePath?: string }>;
    saveFile: (filePath: string, content: string | Uint8Array) => Promise<boolean>;
    showOpenDialog: (options: Record<string, unknown>) => Promise<{ canceled: boolean; filePaths: string[] }>;
    readFile: (filePath: string) => Promise<string>;
  };
  integration: {
    transferPixPending: (payload: {
      conferenceId: string; fileName: string; transactions: PixTransaction[]; targetLoterica: string;
      fallbackMonth: number; fallbackYear: number; mode: 'copy' | 'move';
    }) => Promise<{ success: true; inserted: number; skipped: number; mode: 'copy' | 'move' }>;
  };
  report: {
    getLancamentos: (loterica: string, ano: number, mes: number, dia?: number | null) => Promise<any[]>;
    getDaysWithEntries: (loterica: string, ano: number, mes: number) => Promise<number[]>;
    addLancamento: (entry: Record<string, unknown>) => Promise<any>;
    updateLancamento: (id: string, updates: Record<string, unknown>) => Promise<any>;
    toggleStatus: (id: string, status: string, notes?: string) => Promise<any>;
    toggleStatusBatch: (items: any[], status: string) => Promise<any>;
    updateObservacoes: (id: string, notes: string, status?: string) => Promise<any>;
    deleteLancamento: (id: string) => Promise<boolean>;
    deleteLancamentoBatch: (ids: string[]) => Promise<any>;
    getFuncionarios: (loterica: string) => Promise<string[]>;
    renameFuncionario: (loterica: string, oldName: string, newName: string) => Promise<any>;
    getOfficialBaseInfo: () => Promise<any>;
    previewBulkDelete: (params: Record<string, unknown>) => Promise<any>;
    executeBulkDelete: (params: Record<string, unknown>) => Promise<any>;
    clearDemo: (loterica: string) => Promise<any>;
    getSyncStatus: () => Promise<any>;
    getSyncConfig: () => Promise<any>;
    saveSyncConfig: (config: Record<string, unknown>) => Promise<any>;
    startSyncAuth: () => Promise<any>;
    disconnectSync: () => Promise<any>;
    syncNow: () => Promise<any>;
    setSyncInterval: (seconds: number) => Promise<any>;
    getConflicts: () => Promise<any[]>;
    resolveConflict: (id: string, choice: string) => Promise<any>;
    getPendingUpdates: () => Promise<any[]>;
    getVersionDiff: (key: string) => Promise<any>;
    acceptRemote: (key: string) => Promise<any>;
    keepLocal: (key: string, reason: string) => Promise<any>;
    getVersionHistory: (loterica: string, ano: number, mes: number) => Promise<any[]>;
    restoreVersion: (loterica: string, ano: number, mes: number, id: string) => Promise<any>;
    compareVersions: (firstId: string, secondId: string) => Promise<any>;
    onSyncStatus: (callback: (status: any) => void) => () => void;
    onRemoteUpdate: (callback: (update: any) => void) => () => void;
  };
  migration: {
    discover: () => Promise<{ pix: string[]; report: string[]; reportMigrationDecisionPending: boolean }>;
    selectDatabase: (module: 'pix' | 'report') => Promise<{ canceled: boolean; filePath?: string }>;
    importDatabase: (module: 'pix' | 'report', sourcePath: string) => Promise<{ copied: string; backup: string; sha256: string }>;
    continueWithCurrentReport: () => Promise<{ success: boolean; alreadyResolved?: boolean }>;
  };
}

