import { contextBridge, ipcRenderer } from 'electron';
import type { ConferenceRecord, BackupData } from '../src/modules/pix/implementation/services/sqliteDatabase';
import type { PixTransaction, StatementParseResult } from '../src/modules/pix/implementation/services/statementParser';

export interface IElectronAPI {
  isElectron: true;
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<boolean>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    setCloseAction: (action: 'close' | 'tray') => Promise<boolean>;
    getCloseAction: () => Promise<'close' | 'tray'>;
    onMaximizedChange: (callback: (value: boolean) => void) => () => void;
  };
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
  events: { onDomainChanged: (callback: (event: any) => void) => () => void; publishProtegeChanged: (key?: string) => void };
  protege: {
    getState: () => Promise<{ records: any[]; historicoImportacoes: any[] }>;
    saveState: (state: { records: any[]; historicoImportacoes: any[] }) => Promise<boolean>;
  };
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
    transferPixPending: (payload: { conferenceId: string; fileName: string; transactions: PixTransaction[]; targetLoterica: string; fallbackMonth: number; fallbackYear: number; mode: 'copy' | 'move' }) => Promise<{ success: true; inserted: number; skipped: number; mode: 'copy' | 'move' }>;
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

const on = <T,>(channel: string, callback: (value: T) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const api: IElectronAPI = {
  isElectron: true,
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    setCloseAction: (action) => ipcRenderer.invoke('shell:set-tray-setting', action === 'tray'),
    getCloseAction: async () => (await ipcRenderer.invoke('shell:get-tray-setting')) ? 'tray' : 'close',
    onMaximizedChange: (callback) => on('window:maximized-change', callback),
  },
  shell: {
    getState: () => ipcRenderer.invoke('shell:get-state'),
    openNewWindow: (module) => ipcRenderer.invoke('window:new', module),
    getMinimizeToTray: () => ipcRenderer.invoke('shell:get-tray-setting'),
    setMinimizeToTray: (enabled) => ipcRenderer.invoke('shell:set-tray-setting', enabled),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback) => on('window:maximized-change', callback),
  },
  events: {
    onDomainChanged: (callback) => on('domain:changed', callback),
    publishProtegeChanged: (key = 'storage') => ipcRenderer.send('domain:publish', { module: 'protege', key }),
  },
  protege: {
    getState: () => ipcRenderer.invoke('protege:get-state'),
    saveState: (state) => ipcRenderer.invoke('protege:save-state', state),
  },
  db: {
    getConferences: () => ipcRenderer.invoke('db:get-conferences'),
    getConference: (id) => ipcRenderer.invoke('db:get-conference', id),
    getTransactions: (id) => ipcRenderer.invoke('db:get-transactions', id),
    getCheckedIds: (id) => ipcRenderer.invoke('db:get-checked-ids', id),
    saveConference: (result, options) => ipcRenderer.invoke('db:save-conference', result, options),
    findConferenceByHash: (hash) => ipcRenderer.invoke('db:find-conference-by-hash', hash),
    toggleCheck: (conferenceId, id) => ipcRenderer.invoke('db:toggle-check', conferenceId, id),
    setMultipleChecks: (conferenceId, ids, checked) => ipcRenderer.invoke('db:set-multiple-checks', conferenceId, ids, checked),
    clearConferenceMarks: (id) => ipcRenderer.invoke('db:clear-conference-marks', id),
    updateTransactionObservation: (conferenceId, id, note) => ipcRenderer.invoke('db:update-transaction-observation', conferenceId, id, note),
    addTransaction: (conferenceId, tx, checked) => ipcRenderer.invoke('db:add-transaction', conferenceId, tx, checked),
    updateTransaction: (conferenceId, id, updates) => ipcRenderer.invoke('db:update-transaction', conferenceId, id, updates),
    deleteTransaction: (conferenceId, id) => ipcRenderer.invoke('db:delete-transaction', conferenceId, id),
    updateConferenceFilters: (id, filters) => ipcRenderer.invoke('db:update-conference-filters', id, filters),
    deleteConference: (id) => ipcRenderer.invoke('db:delete-conference', id),
    deleteAllConferences: () => ipcRenderer.invoke('db:delete-all-conferences'),
    getSetting: (key, fallback) => ipcRenderer.invoke('db:get-setting', key, fallback),
    setSetting: (key, value) => ipcRenderer.invoke('db:set-setting', key, value),
    exportBackup: () => ipcRenderer.invoke('db:export-backup'),
    restoreBackup: (backup) => ipcRenderer.invoke('db:restore-backup', backup),
  },
  dialog: {
    openStatementFile: () => ipcRenderer.invoke('dialog:open-statement-file'),
    openDataFile: (kind) => ipcRenderer.invoke('dialog:open-data-file', kind),
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:show-save-dialog', options),
    saveFile: (filePath, content) => ipcRenderer.invoke('dialog:save-file', filePath, content),
    showOpenDialog: (options) => ipcRenderer.invoke('dialog:show-open-dialog', options),
    readFile: (filePath) => ipcRenderer.invoke('dialog:read-file', filePath),
  },
  integration: {
    transferPixPending: (payload) => ipcRenderer.invoke('integration:transfer-pix-pending', payload),
  },
  report: {
    getLancamentos: (loterica, ano, mes, dia) => ipcRenderer.invoke('report:get-lancamentos', loterica, ano, mes, dia),
    getDaysWithEntries: (loterica, ano, mes) => ipcRenderer.invoke('report:get-days-with-entries', loterica, ano, mes),
    addLancamento: (entry) => ipcRenderer.invoke('report:add-lancamento', entry),
    updateLancamento: (id, updates) => ipcRenderer.invoke('report:update-lancamento', id, updates),
    toggleStatus: (id, status, notes) => ipcRenderer.invoke('report:toggle-status', id, status, notes),
    toggleStatusBatch: (items, status) => ipcRenderer.invoke('report:toggle-status-batch', items, status),
    updateObservacoes: (id, notes, status) => ipcRenderer.invoke('report:update-observacoes', id, notes, status),
    deleteLancamento: (id) => ipcRenderer.invoke('report:delete-lancamento', id),
    deleteLancamentoBatch: (ids) => ipcRenderer.invoke('report:delete-lancamento-batch', ids),
    getFuncionarios: (loterica) => ipcRenderer.invoke('report:get-funcionarios', loterica),
    renameFuncionario: (loterica, oldName, newName) => ipcRenderer.invoke('report:rename-funcionario', loterica, oldName, newName),
    getOfficialBaseInfo: () => ipcRenderer.invoke('report:get-official-base-info'),
    previewBulkDelete: (params) => ipcRenderer.invoke('report:preview-bulk-delete', params),
    executeBulkDelete: (params) => ipcRenderer.invoke('report:execute-bulk-delete', params),
    clearDemo: (loterica) => ipcRenderer.invoke('report:clear-demo', loterica),
    getSyncStatus: () => ipcRenderer.invoke('sync:get-status'),
    getSyncConfig: () => ipcRenderer.invoke('sync:get-config'),
    saveSyncConfig: (config) => ipcRenderer.invoke('sync:save-config', config),
    startSyncAuth: () => ipcRenderer.invoke('sync:start-auth'),
    disconnectSync: () => ipcRenderer.invoke('sync:disconnect'),
    syncNow: () => ipcRenderer.invoke('sync:trigger-now'),
    setSyncInterval: (seconds) => ipcRenderer.invoke('sync:set-interval', seconds),
    getConflicts: () => ipcRenderer.invoke('sync:get-conflicts'),
    resolveConflict: (id, choice) => ipcRenderer.invoke('sync:resolve-conflict', id, choice),
    getPendingUpdates: () => ipcRenderer.invoke('sync:get-pending-updates'),
    getVersionDiff: (key) => ipcRenderer.invoke('sync:get-version-diff', key),
    acceptRemote: (key) => ipcRenderer.invoke('sync:accept-remote', key),
    keepLocal: (key, reason) => ipcRenderer.invoke('sync:keep-local', key, reason),
    getVersionHistory: (loterica, ano, mes) => ipcRenderer.invoke('sync:get-history', loterica, ano, mes),
    restoreVersion: (loterica, ano, mes, id) => ipcRenderer.invoke('sync:restore-version', loterica, ano, mes, id),
    compareVersions: (firstId, secondId) => ipcRenderer.invoke('report:compare-versions', firstId, secondId),
    onSyncStatus: (callback) => on('sync:status-changed', callback),
    onRemoteUpdate: (callback) => on('sync:remote-update', callback),
  },
  migration: {
    discover: () => ipcRenderer.invoke('migration:discover'),
    selectDatabase: (module) => ipcRenderer.invoke('migration:select-database', module),
    importDatabase: (module, sourcePath) => ipcRenderer.invoke('migration:import-database', module, sourcePath),
    continueWithCurrentReport: () => ipcRenderer.invoke('migration:continue-report-with-current'),
  },
};

declare global { interface Window { electronAPI?: IElectronAPI } }
contextBridge.exposeInMainWorld('electronAPI', api);
