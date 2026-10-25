process.noDeprecation = true;
const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const { SqliteDatabaseService } = require('./services/pix/sqliteDatabase.ts');
const { transferPendingToReport } = require('./pix-transfer.cjs');
const { readLegacyTrayPreference, replaceDatabaseFromVerifiedSource, shouldPauseDriveForReportMigration, verifyDatabaseFile } = require('./services/database-migration.cjs');

app.setName('LoteControl');
if (process.env.LOTE_CONTROL_TEST_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.LOTE_CONTROL_TEST_USER_DATA));
}

const appDataPath = app.getPath('appData');
const userDataPath = app.getPath('userData');
const databaseDirectory = path.join(userDataPath, 'database');
const pixDatabasePath = process.env.LOTE_CONTROL_TEST_PIX_DATABASE || path.join(databaseDirectory, 'conferencia_pix.db');
const reportDatabasePath = process.env.LOTE_CONTROL_TEST_REPORT_DATABASE || path.join(databaseDirectory, 'pix_lotericas.db');
const protegeDatabasePath = process.env.LOTE_CONTROL_TEST_PROTEGE_DATABASE || path.join(databaseDirectory, 'protege.db');
const protegeStatePath = process.env.LOTE_CONTROL_TEST_PROTEGE_STATE || path.join(databaseDirectory, 'protege_state.json');
const settingsPath = path.join(userDataPath, 'settings.json');
const migrationBackupDirectory = path.join(userDataPath, 'migrations', 'backups');
const legacyDriveDataPath = path.join(appDataPath, 'controle-pix-lotericas');
const APP_ROOT = app.getAppPath();
const isSmokeTest = process.env.LOTE_CONTROL_SMOKE_TEST === '1';

let mainWindow = null;
const windows = new Map();
let tray = null;
let reportDb = null;
let driveSync = null;
let pixDb = null;
let protegeDb = null;
let isQuitting = false;
let traySettingExplicitlyChanged = false;
let settings = { theme: 'light', minimizeToTray: false, minimizeToTrayConfigured: false, reportMigrationDecision: null };
let reportMigrationDecisionPending = false;
let reportMigrationInProgress = false;
let SQL = null;
const approvedReadPaths = new Set();
const approvedSavePaths = new Set();
const approvedMigrationPaths = new Set();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on('second-instance', () => showMainWindow());

function writeJsonAtomically(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
}

function readSettings() {
  try {
    const value = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings = {
      theme: 'light',
      minimizeToTray: value.minimizeToTray === true,
      minimizeToTrayConfigured: value.minimizeToTrayConfigured === true,
      reportMigrationDecision: value.reportMigrationDecision === 'imported' || value.reportMigrationDecision === 'use-current' ? value.reportMigrationDecision : null,
    };
    if (value.theme === 'dark') persistSettings();
    traySettingExplicitlyChanged = settings.minimizeToTrayConfigured;
  } catch {
    settings = { theme: 'light', minimizeToTray: false, minimizeToTrayConfigured: false, reportMigrationDecision: null };
    traySettingExplicitlyChanged = false;
  }
}

function persistSettings() {
  writeJsonAtomically(settingsPath, settings);
}

function snappyDecompress(buf) {
  let pos = 0;
  let ulen = 0, shift = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    ulen |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  if (ulen <= 0 || ulen > 32 * 1024 * 1024) throw new Error('Invalid snappy length');
  const out = Buffer.alloc(ulen);
  let outPos = 0;
  while (pos < buf.length && outPos < ulen) {
    const tag = buf[pos++];
    const type = tag & 0x03;
    if (type === 0) {
      let len = (tag >> 2) + 1;
      if (len > 60) {
        const extraBytes = len - 60;
        len = 0;
        for (let i = 0; i < extraBytes; i++) len |= buf[pos++] << (8 * i);
        len += 1;
      }
      buf.copy(out, outPos, pos, pos + len);
      pos += len;
      outPos += len;
    } else {
      let len = 0, offset = 0;
      if (type === 1) {
        len = ((tag >> 2) & 0x07) + 4;
        offset = ((tag & 0xe0) << 3) | buf[pos++];
      } else if (type === 2) {
        len = (tag >> 2) + 1;
        offset = buf.readUInt16LE(pos);
        pos += 2;
      } else {
        len = (tag >> 2) + 1;
        offset = buf.readUInt32LE(pos);
        pos += 4;
      }
      if (offset <= 0 || outPos - offset < 0) throw new Error('Invalid offset');
      for (let i = 0; i < len; i++) {
        out[outPos] = out[outPos - offset];
        outPos++;
      }
    }
  }
  return out;
}

function extractProtegeJsonFromText(text) {
  const results = [];
  let idx = 0;
  while ((idx = text.indexOf('{"records":', idx)) !== -1) {
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = idx; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }
    }
    if (end !== -1) {
      try {
        const parsed = JSON.parse(text.slice(idx, end));
        if (Array.isArray(parsed.records)) results.push(parsed);
      } catch {}
    }
    idx += 11;
  }
  return results;
}

function recoverProtegeStateFromLevelDb() {
  if (process.env.LOTE_CONTROL_TEST_USER_DATA) return null;
  const candidateDirs = [
    path.join(userDataPath, 'Local Storage', 'leveldb'),
    path.join(appDataPath, 'Electron', 'Local Storage', 'leveldb'),
  ];
  let bestState = null;
  let bestScore = 0;

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.ldb') || f.endsWith('.log')); } catch { continue; }
    for (const file of files) {
      try {
        const buf = fs.readFileSync(path.join(dir, file));
        const candidates = [...extractProtegeJsonFromText(buf.toString('utf8'))];
        if (file.endsWith('.ldb') && buf.length >= 48) {
          for (let pos = 0; pos < buf.length - 48; ) {
            const type = buf[pos + 4];
            if (type === 1) {
              try {
                const dec = snappyDecompress(buf.subarray(pos));
                if (dec.length > 50 && dec.includes(Buffer.from('records'))) {
                  candidates.push(...extractProtegeJsonFromText(dec.toString('utf8')));
                }
              } catch {}
            }
            pos++;
          }
        }
        for (const state of candidates) {
          const recCount = Array.isArray(state.records) ? state.records.length : 0;
          const histCount = Array.isArray(state.historicoImportacoes) ? state.historicoImportacoes.length : 0;
          const score = recCount * 10 + histCount * 100;
          if (score > bestScore) {
            bestScore = score;
            bestState = state;
          }
        }
      } catch {}
    }
  }
  return bestState;
}

function persistProtegeSqliteDb() {
  if (!protegeDb) return;
  fs.mkdirSync(path.dirname(protegeDatabasePath), { recursive: true });
  const data = protegeDb.export();
  const tempPath = `${protegeDatabasePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, Buffer.from(data));
    fs.renameSync(tempPath, protegeDatabasePath);
  } catch (error) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
}

function writeStateToProtegeSqlite(state) {
  if (!protegeDb || !state) return;
  const records = Array.isArray(state.records) ? state.records : [];
  const imports = Array.isArray(state.historicoImportacoes) ? state.historicoImportacoes : [];
  protegeDb.run('BEGIN TRANSACTION;');
  try {
    protegeDb.run('DELETE FROM protege_records;');
    const recStmt = protegeDb.prepare('INSERT OR REPLACE INTO protege_records (id, loterica_key, data_only, payload_json) VALUES (?, ?, ?, ?)');
    for (const rec of records) {
      if (!rec?.id) continue;
      recStmt.run([String(rec.id), String(rec.lotericaKey || ''), String(rec.dataOnly || ''), JSON.stringify(rec)]);
    }
    recStmt.free();

    protegeDb.run('DELETE FROM protege_imports;');
    const impStmt = protegeDb.prepare('INSERT OR REPLACE INTO protege_imports (id, imported_at, file_name, payload_json) VALUES (?, ?, ?, ?)');
    for (const imp of imports) {
      if (!imp?.id) continue;
      impStmt.run([String(imp.id), String(imp.importedAt || ''), String(imp.fileName || ''), JSON.stringify(imp)]);
    }
    impStmt.free();
    protegeDb.run('COMMIT;');
    persistProtegeSqliteDb();
  } catch (err) {
    try { protegeDb.run('ROLLBACK;'); } catch {}
  }
}

function readStateFromProtegeSqlite() {
  if (!protegeDb) return null;
  try {
    const records = [];
    const recRes = protegeDb.exec('SELECT payload_json FROM protege_records');
    if (recRes[0]?.values) {
      for (const row of recRes[0].values) {
        try { records.push(JSON.parse(String(row[0]))); } catch {}
      }
    }
    const historicoImportacoes = [];
    const impRes = protegeDb.exec('SELECT payload_json FROM protege_imports ORDER BY imported_at DESC');
    if (impRes[0]?.values) {
      for (const row of impRes[0].values) {
        try { historicoImportacoes.push(JSON.parse(String(row[0]))); } catch {}
      }
    }
    return { records, historicoImportacoes };
  } catch {
    return null;
  }
}

async function initializeProtegeDatabase() {
  const sqlEngine = await getSqlEngine();
  if (fs.existsSync(protegeDatabasePath)) {
    try {
      const buffer = fs.readFileSync(protegeDatabasePath);
      protegeDb = new sqlEngine.Database(buffer);
    } catch {
      protegeDb = new sqlEngine.Database();
    }
  } else {
    protegeDb = new sqlEngine.Database();
  }
  protegeDb.run(`
    CREATE TABLE IF NOT EXISTS protege_records (
      id TEXT PRIMARY KEY,
      loterica_key TEXT,
      data_only TEXT,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS protege_imports (
      id TEXT PRIMARY KEY,
      imported_at TEXT,
      file_name TEXT,
      payload_json TEXT NOT NULL
    );
  `);

  const dbState = readStateFromProtegeSqlite() || { records: [], historicoImportacoes: [] };
  const fileState = readProtegeStateFromFiles();
  if (
    fileState.records.length > dbState.records.length ||
    fileState.historicoImportacoes.length > dbState.historicoImportacoes.length
  ) {
    const merged = {
      records: fileState.records.length >= dbState.records.length ? fileState.records : dbState.records,
      historicoImportacoes:
        fileState.historicoImportacoes.length >= dbState.historicoImportacoes.length
          ? fileState.historicoImportacoes
          : dbState.historicoImportacoes,
    };
    writeStateToProtegeSqlite(merged);
    try { writeJsonAtomically(protegeStatePath, merged); } catch {}
  } else if (!fs.existsSync(protegeDatabasePath)) {
    persistProtegeSqliteDb();
  }
}

function readProtegeStateFromFiles() {
  let current = null;
  if (fs.existsSync(protegeStatePath)) {
    try {
      current = JSON.parse(fs.readFileSync(protegeStatePath, 'utf8'));
    } catch {}
  }
  const hasRecords = Array.isArray(current?.records) && current.records.length > 0;
  const hasHistory = Array.isArray(current?.historicoImportacoes) && current.historicoImportacoes.length > 0;
  if (!hasRecords || !hasHistory) {
    const recovered = recoverProtegeStateFromLevelDb();
    if (recovered) {
      const recLen = Array.isArray(recovered.records) ? recovered.records.length : 0;
      const curLen = Array.isArray(current?.records) ? current.records.length : 0;
      const recHistLen = Array.isArray(recovered.historicoImportacoes) ? recovered.historicoImportacoes.length : 0;
      const curHistLen = Array.isArray(current?.historicoImportacoes) ? current.historicoImportacoes.length : 0;
      if (recLen > curLen || recHistLen > curHistLen) {
        current = {
          records: recLen >= curLen ? recovered.records : current.records,
          historicoImportacoes: recHistLen >= curHistLen ? recovered.historicoImportacoes : (current?.historicoImportacoes || []),
        };
        try { writeJsonAtomically(protegeStatePath, current); } catch {}
      }
    }
  }
  return current || { records: [], historicoImportacoes: [] };
}

function readProtegeState() {
  const sqliteState = readStateFromProtegeSqlite();
  const fileState = readProtegeStateFromFiles();
  if (!sqliteState) return fileState;
  if (
    fileState.records.length > sqliteState.records.length ||
    fileState.historicoImportacoes.length > sqliteState.historicoImportacoes.length
  ) {
    const merged = {
      records: fileState.records.length >= sqliteState.records.length ? fileState.records : sqliteState.records,
      historicoImportacoes:
        fileState.historicoImportacoes.length >= sqliteState.historicoImportacoes.length
          ? fileState.historicoImportacoes
          : sqliteState.historicoImportacoes,
    };
    writeStateToProtegeSqlite(merged);
    return merged;
  }
  return sqliteState;
}

function saveProtegeState(state) {
  if (!state || typeof state !== 'object') return false;
  const normalized = {
    records: Array.isArray(state.records) ? state.records : [],
    historicoImportacoes: Array.isArray(state.historicoImportacoes) ? state.historicoImportacoes : [],
  };
  writeStateToProtegeSqlite(normalized);
  writeJsonAtomically(protegeStatePath, normalized);
  return true;
}

function notifyDomainChanged(module, key) {
  for (const window of windows.keys()) if (!window.isDestroyed()) window.webContents.send('domain:changed', { module, key, at: new Date().toISOString() });
}

function notifySyncStatus(status) {
  for (const window of windows.keys()) if (!window.isDestroyed()) window.webContents.send('sync:status-changed', status);
}

function createOrUpdateTray() {
  if (!settings.minimizeToTray) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  const imagePath = path.join(APP_ROOT, 'assets', 'icon-app.png');
  let image = nativeImage.createFromPath(imagePath);
  if (!image.isEmpty()) image = image.resize({ width: 24, height: 24 });
  tray = new Tray(image);
  tray.setToolTip('LoteControl');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir LoteControl', click: () => showMainWindow() },
    { label: 'Sincronizar Relatório agora', click: () => { if (!reportMigrationInProgress && !reportMigrationDecisionPending) driveSync?.sync({ manual: true }).catch((error) => console.warn('[Drive] Falha na sincronização manual:', error.message)); } },
    { type: 'separator' },
    { label: 'Encerrar', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = Array.from(windows.keys()).filter((window) => !window.isDestroyed()).at(-1) || null;
    if (!mainWindow) { createWindow('dashboard'); return; }
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function closeWindowToTrayOrQuit(event, window) {
  if (!window || windows.size > 1 || isQuitting) return;
  if (settings.minimizeToTray) {
    event.preventDefault();
    window.hide();
  } else isQuitting = true;
}

function currentWindow(event) { return BrowserWindow.fromWebContents(event?.sender) || null; }
function broadcastToWindows(channel, value) { for (const window of windows.keys()) if (!window.isDestroyed()) window.webContents.send(channel, value); }

async function initializeReportService() {
  const { PixDatabase } = require(path.join(APP_ROOT, 'electron', 'database.cjs'));
  const { GoogleDriveSync } = require(path.join(APP_ROOT, 'electron', 'drive-sync.cjs'));
  reportDb = new PixDatabase(reportDatabasePath);
  await reportDb.init();
  driveSync = new GoogleDriveSync(reportDb, {
    userDataPath,
    onStatusChange: notifySyncStatus,
    onRemoteUpdate: (update) => {
      broadcastToWindows('sync:remote-update', update);
      notifyDomainChanged('relatorio', update?.fileKey || 'remote');
    },
  });
  importLegacyReportSyncConfiguration();
  const legacyReportFound = !process.env.LOTE_CONTROL_TEST_USER_DATA && legacyDatabaseCandidates('report').some((candidate) => fs.existsSync(candidate));
  const legacyDriveConfigFound = !process.env.LOTE_CONTROL_TEST_USER_DATA && fs.existsSync(path.join(legacyDriveDataPath, 'google-drive-config.json'));
  reportMigrationDecisionPending = process.env.LOTE_CONTROL_DISABLE_DRIVE_SYNC !== '1'
    && shouldPauseDriveForReportMigration({ decision: settings.reportMigrationDecision, legacyDatabaseFound: legacyReportFound || legacyDriveConfigFound, targetEmpty: targetIsEmpty('report') });
  if (process.env.LOTE_CONTROL_DISABLE_DRIVE_SYNC !== '1' && !reportMigrationDecisionPending && !reportMigrationInProgress) driveSync.startAutoSync();
}

async function initializeDatabases() {
  fs.mkdirSync(databaseDirectory, { recursive: true });
  pixDb = new SqliteDatabaseService();
  await pixDb.init(pixDatabasePath);
  await initializeProtegeDatabase();
  await initializeReportService();

  if (!fs.existsSync(settingsPath)) {
    const oldTray = reportDb.getSyncState('minimize_to_tray') === '1'
      || pixDb.getSetting('close_button_action', 'close') === 'tray';
    settings.minimizeToTray = oldTray;
    persistSettings();
  }
  createOrUpdateTray();
}

function requirePixDb() {
  if (!pixDb) throw new Error('O banco do Pix ainda não está disponível.');
  return pixDb;
}

function requireReportDb() {
  if (!reportDb) throw new Error('O banco do Relatório ainda não está disponível.');
  return reportDb;
}

async function changed(module, key, operation) {
  const result = await operation();
  notifyDomainChanged(module, key);
  return result;
}

function legacyDatabaseCandidates(module) {
  const roaming = appDataPath;
  if (module === 'pix') {
    return [
      path.join(roaming, 'conferencia-pix-caixa', 'database', 'conferencia_pix.db'),
      path.join(roaming, 'Electron', 'database', 'conferencia_pix.db'),
      path.join(roaming, 'CheckPix', 'database', 'conferencia_pix.db'),
    ];
  }
  return [
    path.join(roaming, 'controle-pix-lotericas', 'database', 'pix_lotericas.db'),
    path.join(roaming, 'controle-pix-lotericas', 'pix_lotericas.db'),
    path.join(roaming, 'Electron', 'database', 'pix_lotericas.db'),
    path.join(app.getPath('documents'), 'LoteControl', 'Projects', 'RelatorioPix', 'database', 'pix_lotericas.db'),
  ];
}

function importLegacyReportSyncConfiguration() {
  if (!driveSync || process.env.LOTE_CONTROL_TEST_USER_DATA) return false;
  const current = driveSync.getConfig();
  if (current?.clientId && current?.clientSecret && current?.folderId) {
    // Repara eventual arquivo legado corrompido se já temos o segredo válido no banco atual
    const legacyConfigFile = path.join(legacyDriveDataPath, 'google-drive-config.json');
    if (fs.existsSync(legacyConfigFile) && driveSync.isSafeStorageAvailable()) {
      try {
        const raw = JSON.parse(fs.readFileSync(legacyConfigFile, 'utf8'));
        const existingEnc = raw.client_secret_enc || raw.client_secret || '';
        if (existingEnc && String(existingEnc).startsWith('safe:') && !driveSync.canDecryptProtectedSecret(existingEnc)) {
          raw.client_secret_enc = driveSync.encodeClientSecret(current.clientSecret);
          delete raw.client_secret;
          fs.writeFileSync(legacyConfigFile, JSON.stringify(raw, null, 2), 'utf8');
        }
      } catch {}
    }
    return false;
  }

  const candidatePaths = new Set([path.join(legacyDriveDataPath, 'google-drive-config.json')]);
  for (const databasePath of legacyDatabaseCandidates('report')) {
    candidatePaths.add(path.join(path.dirname(path.dirname(databasePath)), 'google-drive-config.json'));
  }

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) continue;
    try {
      const file = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
      const oauth = file.installed || file.web || file;
      const clientId = String(oauth.client_id || oauth.clientId || '').trim();
      const rawSecret = String(file.client_secret_enc || oauth.client_secret || oauth.clientSecret || '').trim();
      const clientSecret = driveSync.canDecryptProtectedSecret(rawSecret) ? driveSync.decodeClientSecret(rawSecret) : '';
      const folderId = String(file.folder_id || file.folderId || current.folderId || '').trim();
      if (!clientId || (!clientSecret && !current.clientSecret) || !folderId) continue;

      driveSync.saveConfig({
        clientId: current.clientId || clientId,
        clientSecret: current.clientSecret || clientSecret,
        folderId,
        scope: file.scope || current.scope,
        syncIntervalSec: Number(file.sync_interval_sec || current.syncIntervalSec || 5),
        autoSync: current.autoSync,
      });
      console.info('[DriveSync] Configuração local legada do Relatório importada com armazenamento seguro.');
      return true;
    } catch (error) {
      console.warn('[DriveSync] Não foi possível importar a configuração legada do Relatório:', error.message);
    }
  }
  return false;
}

function resolveWasmPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'sql-wasm.wasm'),
    path.join(APP_ROOT, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(APP_ROOT, 'dist-electron', 'sql-wasm.wasm'),
    path.join(__dirname, 'sql-wasm.wasm'),
  ];
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || path.join(APP_ROOT, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
}

async function getSqlEngine() {
  if (!SQL) {
    const wasmPath = resolveWasmPath();
    SQL = await initSqlJs({ locateFile: () => wasmPath });
  }
  return SQL;
}

function countRows(db, table) {
  const result = db.exec(`SELECT COUNT(*) FROM ${table}`);
  return Number(result[0]?.values?.[0]?.[0] || 0);
}

function targetIsEmpty(module) {
  if (module === 'pix') {
    const database = requirePixDb();
    const conferenceCount = database.getConferences().length;
    const settingsCount = Number(database.db?.exec('SELECT COUNT(*) FROM app_settings')?.[0]?.values?.[0]?.[0] || 0);
    const transactionCount = Number(database.db?.exec('SELECT COUNT(*) FROM transactions')?.[0]?.values?.[0]?.[0] || 0);
    return conferenceCount === 0 && settingsCount === 0 && transactionCount === 0;
  }
  const db = requireReportDb().db;
  const importantTables = ['pix_lancamentos', 'sync_queue', 'sync_state', 'sync_conflicts', 'sync_versions_history', 'official_base_metadata', 'audit_log'];
  return importantTables.every((table) => countRows(db, table) === 0);
}

async function importLegacyDatabase(module, sourcePath, { allowSelectedPath = false } = {}) {
  if (module !== 'pix' && module !== 'report') throw new Error('Módulo de migração inválido.');
  if (module === 'report' && reportMigrationInProgress) throw new Error('Já existe uma migração do Relatório em andamento. Aguarde sua conclusão.');
  const allowed = legacyDatabaseCandidates(module).filter((candidate) => fs.existsSync(candidate)).map((candidate) => path.resolve(candidate));
  const source = path.resolve(String(sourcePath || ''));
  if (!allowed.includes(source) && !allowSelectedPath) throw new Error('Selecione um banco localizado em uma das fontes legadas reconhecidas.');
  if (!targetIsEmpty(module)) throw new Error('A migração foi bloqueada porque o banco novo já contém dados. Faça backup e escolha uma migração planejada.');
  const target = module === 'pix' ? pixDatabasePath : reportDatabasePath;
  if (source.toLowerCase() === path.resolve(target).toLowerCase()) throw new Error('A origem e o destino da migração são o mesmo arquivo.');
  const legacyTrayPreference = await readLegacyTrayPreference(source, module, getSqlEngine);
  let resumeReportAutoSync = false;
  if (module === 'report') {
    if (reportMigrationInProgress) throw new Error('Já existe uma migração do Relatório em andamento. Aguarde sua conclusão.');
    if (driveSync?.isSyncing) throw new Error('A sincronização do Relatório está em andamento. Aguarde terminar e tente a migração novamente.');
    resumeReportAutoSync = Boolean(driveSync?.periodicTimer);
    driveSync?.stopAutoSync();
    if (!targetIsEmpty('report')) {
      if (resumeReportAutoSync && !reportMigrationDecisionPending && process.env.LOTE_CONTROL_DISABLE_DRIVE_SYNC !== '1') driveSync?.startAutoSync();
      throw new Error('A migração foi bloqueada porque o banco novo deixou de estar vazio. Nenhum dado foi substituído.');
    }
    reportMigrationInProgress = true;
  }

  const closeCurrent = () => {
    if (module === 'pix') {
      pixDb?.close();
      pixDb = null;
      return;
    }
    driveSync?.stopAutoSync();
    reportDb?.saveToDisk();
    reportDb?.db?.close();
    driveSync = null;
    reportDb = null;
  };
  const activate = async () => {
    if (module === 'pix') {
      const next = new SqliteDatabaseService();
      await next.init(pixDatabasePath);
      pixDb = next;
    } else await initializeReportService();
  };
  const rollback = async () => {
    try {
      if (module === 'pix') pixDb?.close();
      else { driveSync?.stopAutoSync(); reportDb?.db?.close(); }
    } catch {}
    pixDb = null; reportDb = null; driveSync = null;
    if (module === 'pix') { pixDb = new SqliteDatabaseService(); await pixDb.init(pixDatabasePath); }
    else await initializeReportService();
  };
  try {
    closeCurrent();
    let migrated;
    try {
      migrated = await replaceDatabaseFromVerifiedSource({ source, target, module, backupDirectory: migrationBackupDirectory, verifyFile: (filePath, kind) => verifyDatabaseFile(filePath, kind, getSqlEngine), activate, rollback });
    } catch (error) {
      if (!pixDb && !reportDb) {
        try { await rollback(); } catch (reopenError) { console.error('[Migração] Falha ao reabrir o banco anterior:', reopenError); }
      }
      throw error;
    }
    if (legacyTrayPreference === true && !traySettingExplicitlyChanged) {
      settings.minimizeToTray = true;
      persistSettings();
      createOrUpdateTray();
    }
    if (module === 'report') {
      settings.reportMigrationDecision = 'imported';
      persistSettings();
      reportMigrationDecisionPending = false;
      if (process.env.LOTE_CONTROL_DISABLE_DRIVE_SYNC !== '1' && driveSync && !driveSync.periodicTimer) driveSync.startAutoSync();
    }
    notifyDomainChanged(module === 'pix' ? 'pix' : 'relatorio', 'migration');
    return migrated;
  } finally {
    if (module === 'report') {
      reportMigrationInProgress = false;
      if (resumeReportAutoSync && !reportMigrationDecisionPending && process.env.LOTE_CONTROL_DISABLE_DRIVE_SYNC !== '1' && driveSync && !driveSync.periodicTimer) {
        driveSync.startAutoSync();
      }
    }
  }
}

function createWindow(initialModule = 'dashboard') {
  Menu.setApplicationMenu(null);
  const iconPath = path.join(APP_ROOT, 'assets', 'icon-app.png');
  const icon = nativeImage.createFromPath(iconPath);
  const window = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1000,
    minHeight: 680,
    frame: false,
    title: 'LoteControl',
    icon: icon.isEmpty() ? undefined : icon,
    backgroundColor: '#ffffff',
    show: !isSmokeTest,
    webPreferences: {
      preload: path.join(APP_ROOT, 'dist-electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  windows.set(window, { id: crypto.randomUUID(), initialModule });
  mainWindow = window;
  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(path.join(APP_ROOT, 'dist', 'index.html'));
  window.on('focus', () => { mainWindow = window; });
  window.on('maximize', () => window.webContents.send('window:maximized-change', true));
  window.on('unmaximize', () => window.webContents.send('window:maximized-change', false));
  window.on('close', (event) => closeWindowToTrayOrQuit(event, window));
  window.on('closed', () => {
    windows.delete(window);
    if (mainWindow === window) mainWindow = Array.from(windows.keys()).filter((item) => !item.isDestroyed()).at(-1) || null;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (isSmokeTest && windows.size === 1) runSmokeFlow(window);
  return window;
}

async function runSmokeFlow(window) {
  let exitCode = 1;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('A interface não carregou em 30 segundos.')), 30000);
      window.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
      window.webContents.once('did-fail-load', (_event, code, message) => { clearTimeout(timer); reject(new Error(`${code}: ${message}`)); });
    });
    const passed = await window.webContents.executeJavaScript(`(async () => {
      const waitFor = async (selector) => {
        const until = Date.now() + 15000;
        while (Date.now() < until) {
          const node = document.querySelector(selector);
          if (node) return node;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('Tempo esgotado: ' + selector);
      };
      const openModule = async (moduleName) => {
        (await waitFor('[data-module-nav="' + moduleName + '"]')).click();
        await waitFor('[data-module-ready="' + moduleName + '"]');
      };
      for (const moduleName of ['protege', 'pix', 'relatorio']) {
        await openModule(moduleName);
        if (moduleName === 'pix') {
          const pixRoot = document.querySelector('[data-module-ready="pix"]');
          if (pixRoot?.innerText.includes('Quer testar rapidamente') || pixRoot?.innerText.includes('Sem Fórmulas Manuais')) throw new Error('A tela inicial do Pix ainda exibe cartões explicativos.');
        }
      }
      if (document.querySelectorAll('.lc-module-nav [data-module-nav]').length !== 3 || document.querySelector('.lc-module-nav [aria-label="Dashboard"]')) throw new Error('A navegação deve exibir apenas os três módulos, sem botão Dashboard.');
      if (document.querySelector('.lc-sidebar') || document.querySelectorAll('.lc-top-actions button').length !== 4) throw new Error('O shell ainda exibe navegação lateral ou controles de janela duplicados.');
      const topActions = [...document.querySelectorAll('.lc-top-actions button')].map((button) => button.getAttribute('aria-label'));
      if (topActions.join('|') !== 'Configurações|Minimizar|Maximizar|Fechar') throw new Error('A ordem dos quatro controles superiores está incorreta.');
      const reportBadges = document.querySelectorAll('[data-module-ready="relatorio"] .rp-company-tabs button').length;
      if (reportBadges !== 3) throw new Error('Os botões rápidos de lotérica não apareceram no Relatório.');
      const dayFilter = document.querySelector('[data-module-ready="relatorio"] .rp-day-filter');
      if (!dayFilter || dayFilter.tagName !== 'BUTTON') throw new Error('O filtro de dia do Relatório não usa o seletor visual original.');
      await openModule('pix');
      document.querySelector('.lc-settings-control')?.click();
      await waitFor('[data-pix-settings-open="true"]');
      if (document.querySelector('.lc-modal-backdrop') || document.querySelectorAll('[role="dialog"]').length !== 1 || document.querySelector('.pix-settings-panel')?.innerText.includes('Migrar dados existentes')) throw new Error('As configurações do Pix estão duplicadas ou ainda mostram migração.');
      document.querySelector('.pix-settings-panel [aria-label="Fechar painel"]')?.click();
      await openModule('protege');
      document.querySelector('.lc-settings-control')?.click();
      await waitFor('.lc-settings-modal');
      if (document.querySelector('.lc-settings-modal')?.innerText.includes('Migrar dados existentes')) throw new Error('A configuração geral ainda mostra migração.');
      document.querySelector('.lc-settings-modal [aria-label="Fechar configurações"]')?.click();
      return true;
    })()`);
    if (!passed) throw new Error('Fluxo de módulos não confirmou a conclusão.');
    const initialServices = { pixDb, reportDb, driveSync };
    const lightOnly = await window.webContents.executeJavaScript("document.documentElement.dataset.theme === 'light' && !document.querySelector('[data-theme-toggle]')");
    if (!lightOnly) throw new Error('A interface não iniciou exclusivamente no tema claro.');
    const openResult = await window.webContents.executeJavaScript("window.electronAPI.shell.openNewWindow('protege')");
    if (!openResult?.opened) throw new Error('A ação Nova janela não abriu outra janela.');
    const second = Array.from(windows.keys()).find((item) => item !== window);
    if (!second) throw new Error('O processo principal não registrou a nova janela.');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('A segunda janela não carregou.')), 20000);
      second.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
    });
    const secondReady = await second.webContents.executeJavaScript(`(async () => { const until=Date.now()+10000; while(Date.now()<until){ if(document.querySelector('[data-module-ready="protege"]')) return true; await new Promise(r=>setTimeout(r,100)); } return false; })()`);
    if (!secondReady || windows.size !== 2) throw new Error('A segunda janela não iniciou no Protege.');
    if (initialServices.pixDb !== pixDb || initialServices.reportDb !== reportDb || initialServices.driveSync !== driveSync) throw new Error('A segunda janela recriou serviços compartilhados.');
    const armChangeListener = (target) => target.webContents.executeJavaScript(`window.__smokeChange = new Promise((resolve) => { let off; const timer=setTimeout(()=>{off?.();resolve(null)},5000); off=window.electronAPI.events.onDomainChanged((change)=>{if(change.module==='protege'&&change.key==='smoke-update'){clearTimeout(timer);off();resolve(change)}}) }); true`);
    await Promise.all([armChangeListener(window), armChangeListener(second)]);
    await second.webContents.executeJavaScript("window.electronAPI.events.publishProtegeChanged('smoke-update')");
    const received = await Promise.all([window, second].map((target) => target.webContents.executeJavaScript('window.__smokeChange')));
    if (received.some((item) => item?.key !== 'smoke-update')) throw new Error('A atualização compartilhada não chegou a todas as janelas.');
    second.close();
    await new Promise((resolve) => second.once('closed', resolve));
    if (windows.size !== 1 || window.isDestroyed()) throw new Error('Fechar a segunda janela afetou a primeira.');
    console.log('LOTE_CONTROL_SMOKE_OK: módulos, tema claro, criação/fechamento de janela, evento Protege entre janelas e serviços compartilhados.');
    exitCode = 0;
  } catch (error) {
    console.error('LOTE_CONTROL_SMOKE_FAIL:', error.stack || error.message || error);
  } finally {
    app.exit(exitCode);
  }
}

function registerPixHandlers() {
  const db = () => requirePixDb();
  ipcMain.handle('db:get-conferences', () => db().getConferences());
  ipcMain.handle('db:get-conference', (_event, id) => db().getConference(String(id)));
  ipcMain.handle('db:get-transactions', (_event, id) => db().getTransactions(String(id)));
  ipcMain.handle('db:get-checked-ids', (_event, id) => Array.from(db().getCheckedIds(String(id))));
  ipcMain.handle('db:save-conference', (_event, result, options = {}) => changed('pix', result?.fileHash, () => db().saveConference(result, {
    newSession: options.newSession,
    initialCheckedIds: options.initialCheckedIds ? new Set(options.initialCheckedIds) : undefined,
  })));
  ipcMain.handle('db:find-conference-by-hash', (_event, hash) => db().findConferenceByHash(String(hash)));
  ipcMain.handle('db:toggle-check', (_event, conferenceId, id) => changed('pix', String(conferenceId), () => db().toggleCheck(String(conferenceId), String(id))));
  ipcMain.handle('db:set-multiple-checks', (_event, conferenceId, ids, checked) => changed('pix', String(conferenceId), () => db().setMultipleChecks(String(conferenceId), ids.map(String), Boolean(checked))));
  ipcMain.handle('db:clear-conference-marks', (_event, id) => changed('pix', String(id), () => db().clearConferenceMarks(String(id))));
  ipcMain.handle('db:update-transaction-observation', (_event, conferenceId, id, note) => changed('pix', String(conferenceId), () => db().updateTransactionObservation(String(conferenceId), String(id), String(note))));
  ipcMain.handle('db:add-transaction', (_event, conferenceId, tx, checked) => changed('pix', String(conferenceId), () => db().addTransaction(String(conferenceId), tx, Boolean(checked))));
  ipcMain.handle('db:update-transaction', (_event, conferenceId, id, updates) => changed('pix', String(conferenceId), () => db().updateTransaction(String(conferenceId), String(id), updates)));
  ipcMain.handle('db:delete-transaction', (_event, conferenceId, id) => changed('pix', String(conferenceId), () => db().deleteTransaction(String(conferenceId), String(id))));
  ipcMain.handle('db:update-conference-filters', (_event, id, filters) => db().updateConferenceFilters(String(id), filters));
  ipcMain.handle('db:delete-conference', (_event, id) => changed('pix', String(id), () => db().deleteConference(String(id))));
  ipcMain.handle('db:delete-all-conferences', () => changed('pix', 'all', () => db().deleteAllConferences()));
  ipcMain.handle('db:get-setting', (_event, key, fallback) => db().getSetting(String(key), String(fallback ?? '')));
  ipcMain.handle('db:set-setting', (_event, key, value) => db().setSetting(String(key), String(value)));
  ipcMain.handle('db:export-backup', () => db().exportBackup());
  ipcMain.handle('db:restore-backup', (_event, backup) => changed('pix', 'restore', () => db().restoreBackup(backup)));
  ipcMain.handle('dialog:open-statement-file', async (event) => {
    const result = await dialog.showOpenDialog(currentWindow(event), {
      title: 'Selecionar extrato da Caixa', buttonLabel: 'Importar extrato', properties: ['openFile'],
      filters: [{ name: 'Extratos Caixa', extensions: ['xlsx', 'xls', 'csv'] }, { name: 'Todos os arquivos', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filePath = result.filePaths[0];
    try { return { canceled: false, fileName: path.basename(filePath), data: fs.readFileSync(filePath) }; }
    catch (error) { return { canceled: false, error: `Não foi possível ler o extrato: ${error.message}` }; }
  });
}

function registerReportHandlers() {
  const db = () => requireReportDb();
  const sync = () => { if (!driveSync) throw new Error('A sincronização do Relatório não está disponível.'); return driveSync; };
  const reportMutation = (key, operation) => changed('relatorio', key, async () => {
    if (reportMigrationInProgress) throw new Error('A migração do banco do Relatório está em andamento. Aguarde sua conclusão.');
    if (reportMigrationDecisionPending) throw new Error('Escolha qual banco do Relatório usar antes de alterar os dados ou iniciar a sincronização.');
    const result = await operation();
    sync().triggerDebouncedSync();
    return result;
  });
  ipcMain.handle('report:get-lancamentos', (_event, loterica, year, month, day) => db().getLancamentos(String(loterica), Number(year), Number(month), day == null ? null : Number(day)));
  ipcMain.handle('report:get-days-with-entries', (_event, loterica, year, month) => db().getDaysWithEntries(String(loterica), Number(year), Number(month)));
  ipcMain.handle('report:add-lancamento', (_event, entry) => reportMutation(entry?.id, () => db().addLancamento(entry)));
  ipcMain.handle('report:update-lancamento', (_event, id, updates) => reportMutation(id, () => db().updateLancamento(String(id), updates)));
  ipcMain.handle('report:toggle-status', (_event, id, status, notes) => reportMutation(id, () => db().toggleStatus(String(id), String(status), String(notes || ''))));
  ipcMain.handle('report:update-observacoes', (_event, id, notes, status) => reportMutation(id, () => db().updateObservacoes(String(id), String(notes), status)));
  ipcMain.handle('report:delete-lancamento', (_event, id) => reportMutation(id, () => db().deleteLancamento(String(id))));
  ipcMain.handle('report:get-funcionarios', (_event, loterica) => db().getDistinctFuncionarios(String(loterica)));
  ipcMain.handle('report:rename-funcionario', (_event, loterica, oldName, newName) => reportMutation('funcionarios', () => db().renameFuncionario(String(loterica), String(oldName), String(newName))));
  ipcMain.handle('report:get-official-base-info', () => db().getOfficialBaseInfo());
  ipcMain.handle('report:preview-bulk-delete', (_event, params) => db().previewBulkDelete(params));
  ipcMain.handle('report:execute-bulk-delete', (_event, params) => reportMutation('bulk-delete', () => db().executeBulkDelete(params)));
  ipcMain.handle('report:clear-demo', (_event, loterica) => reportMutation('demo', () => db().clearDemoData(String(loterica))));
  ipcMain.handle('report:compare-versions', (_event, firstId, secondId) => {
    const first = db().getVersionById(String(firstId));
    const second = db().getVersionById(String(secondId));
    if (!first || !second) throw new Error('Uma das versões selecionadas não está disponível neste computador.');
    if (first.file_key !== second.file_key) throw new Error('Só é possível comparar versões do mesmo relatório mensal.');
    const normalize = (snapshot) => Array.isArray(snapshot) ? Object.fromEntries(snapshot.map((entry) => [entry.id, entry])) : (snapshot || {});
    const before = normalize(first.snapshot);
    const after = normalize(second.snapshot);
    const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
    const added = [], removed = [], changedEntries = [];
    for (const id of ids) {
      if (!(id in before)) added.push(after[id]);
      else if (!(id in after)) removed.push(before[id]);
      else if (JSON.stringify(before[id]) !== JSON.stringify(after[id])) changedEntries.push({ before: before[id], after: after[id] });
    }
    return { first: { id: first.version_id, version: first.version_num, createdAt: first.created_at }, second: { id: second.version_id, version: second.version_num, createdAt: second.created_at }, added, removed, changed: changedEntries };
  });

  ipcMain.handle('sync:get-status', () => sync().getStatusInfo());
  ipcMain.handle('sync:get-config', () => sync().getConfig());
  ipcMain.handle('sync:save-config', (_event, config) => {
    if (reportMigrationInProgress) throw new Error('A migração do banco do Relatório está em andamento.');
    const result = sync().saveConfig(config);
    if (config?.autoSync === false) sync().stopAutoSync();
    else if (config?.autoSync === true && !reportMigrationDecisionPending) sync().startAutoSync();
    return result;
  });
  ipcMain.handle('sync:start-auth', () => { if (reportMigrationInProgress) throw new Error('A migração do banco do Relatório está em andamento.'); return sync().startOAuthFlow(); });
  ipcMain.handle('sync:disconnect', () => { if (reportMigrationInProgress) throw new Error('A migração do banco do Relatório está em andamento.'); sync().clearTokens(); return { success: true }; });
  ipcMain.handle('sync:trigger-now', () => {
    if (reportMigrationInProgress) throw new Error('A migração do banco do Relatório está em andamento.');
    if (reportMigrationDecisionPending) throw new Error('Escolha qual banco do Relatório usar antes de iniciar a sincronização.');
    return sync().sync({ manual: true });
  });
  ipcMain.handle('sync:set-interval', (_event, seconds) => { if (reportMigrationInProgress) throw new Error('A migração do banco do Relatório está em andamento.'); return sync().setSyncInterval(Number(seconds)); });
  ipcMain.handle('sync:get-conflicts', () => db().getUnresolvedConflicts());
  ipcMain.handle('sync:resolve-conflict', (_event, id, choice) => reportMutation(id, () => db().resolveConflict(String(id), String(choice))));
  ipcMain.handle('sync:get-pending-updates', () => sync().getPendingRemoteUpdates());
  ipcMain.handle('sync:get-version-diff', (_event, key) => sync().getVersionDiff(String(key)));
  ipcMain.handle('sync:accept-remote', (_event, key) => reportMutation(key, () => sync().acceptRemoteVersion(String(key))));
  ipcMain.handle('sync:keep-local', (_event, key, reason) => reportMutation(key, () => sync().keepLocalVersion(String(key), String(reason || 'Versão local mantida pelo usuário'))));
  ipcMain.handle('sync:get-history', (_event, loterica, year, month) => sync().getVersionHistory(String(loterica), Number(year), Number(month)));
  ipcMain.handle('sync:restore-version', (_event, loterica, year, month, id) => reportMutation('restore-version', () => sync().restoreHistoricalVersion(String(loterica), Number(year), Number(month), String(id))));
}

function registerShellHandlers() {
  ipcMain.handle('shell:get-state', (event) => ({ theme: 'light', minimizeToTray: settings.minimizeToTray, reportMigrationDecisionPending, initialModule: windows.get(currentWindow(event))?.initialModule || 'dashboard' }));
  ipcMain.handle('window:new', (event, module) => {
    const allowed = ['dashboard', 'protege', 'pix', 'relatorio'];
    const initialModule = allowed.includes(module) ? module : 'dashboard';
    if (initialModule === 'relatorio' && reportMigrationDecisionPending) return { opened: false, reason: 'report-migration-pending' };
    const window = createWindow(initialModule);
    window.show(); window.focus();
    return { opened: true };
  });
  ipcMain.handle('shell:get-tray-setting', () => settings.minimizeToTray);
  ipcMain.handle('shell:set-tray-setting', (_event, enabled) => {
    traySettingExplicitlyChanged = true;
    settings.minimizeToTrayConfigured = true;
    settings.minimizeToTray = Boolean(enabled);
    persistSettings();
    createOrUpdateTray();
    return settings.minimizeToTray;
  });
  ipcMain.handle('window:minimize', (event) => currentWindow(event)?.minimize());
  ipcMain.handle('window:maximize', (event) => {
    const window = currentWindow(event);
    if (!window) return false;
    if (window.isMaximized()) window.unmaximize(); else window.maximize();
    return window.isMaximized();
  });
  ipcMain.handle('window:close', (event) => currentWindow(event)?.close());
  ipcMain.handle('window:is-maximized', (event) => Boolean(currentWindow(event)?.isMaximized()));
  ipcMain.on('domain:publish', (event, payload) => {
    if (!currentWindow(event) || payload?.module !== 'protege') return;
    notifyDomainChanged('protege', String(payload.key || 'storage'));
  });
  ipcMain.handle('protege:get-state', () => readProtegeState());
  ipcMain.handle('protege:save-state', (_event, state) => {
    const saved = saveProtegeState(state);
    notifyDomainChanged('protege', 'storage');
    return saved;
  });
  ipcMain.handle('dialog:show-save-dialog', async (_event, options) => {
    const result = await dialog.showSaveDialog(currentWindow(_event), options);
    if (!result.canceled && result.filePath) approvedSavePaths.add(path.resolve(result.filePath));
    return result;
  });
  ipcMain.handle('dialog:save-file', (_event, filePath, content) => {
    const target = path.resolve(String(filePath || ''));
    if (!approvedSavePaths.has(target)) throw new Error('Escolha o destino do arquivo pela janela Salvar antes de gravar.');
    approvedSavePaths.delete(target);
    const temp = `${target}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(temp, typeof content === 'string' ? content : Buffer.from(content));
      fs.renameSync(temp, target);
      return true;
    } catch (error) {
      try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
      throw error;
    }
  });
  ipcMain.handle('dialog:show-open-dialog', async (_event, options) => {
    const result = await dialog.showOpenDialog(currentWindow(_event), options);
    if (!result.canceled) result.filePaths.forEach((filePath) => approvedReadPaths.add(path.resolve(filePath)));
    return result;
  });
  ipcMain.handle('dialog:read-file', (_event, filePath) => {
    const target = path.resolve(String(filePath || ''));
    if (!approvedReadPaths.has(target)) throw new Error('Selecione o arquivo pela janela Abrir antes de lê-lo.');
    approvedReadPaths.delete(target);
    return fs.readFileSync(target, 'utf8');
  });
  ipcMain.handle('dialog:open-data-file', async (_event, kind) => {
    const filters = kind === 'protege'
      ? [{ name: 'Planilhas e exportação Protege', extensions: ['xlsx', 'xls', 'csv', 'json'] }]
      : kind === 'report-credentials'
        ? [{ name: 'Credenciais OAuth do Google', extensions: ['json'] }]
        : [{ name: 'Extratos Caixa', extensions: ['xlsx', 'xls', 'csv'] }];
    const result = await dialog.showOpenDialog(currentWindow(_event), { title: 'Selecionar arquivo', properties: ['openFile'], filters });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filePath = result.filePaths[0];
    return { canceled: false, fileName: path.basename(filePath), data: fs.readFileSync(filePath) };
  });
  ipcMain.handle('migration:discover', () => ({
    pix: legacyDatabaseCandidates('pix').filter((item) => fs.existsSync(item)),
    report: legacyDatabaseCandidates('report').filter((item) => fs.existsSync(item)),
    reportMigrationDecisionPending,
  }));
  ipcMain.handle('migration:select-database', async (_event, module) => {
    if (module !== 'pix' && module !== 'report') throw new Error('Módulo de migração inválido.');
    const result = await dialog.showOpenDialog(currentWindow(_event), {
      title: `Escolher banco SQLite do módulo ${module === 'pix' ? 'Pix' : 'Relatório'}`,
      properties: ['openFile'],
      filters: [{ name: 'Banco SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filePath = path.resolve(result.filePaths[0]);
    approvedMigrationPaths.add(filePath);
    return { canceled: false, filePath };
  });
  ipcMain.handle('migration:import-database', (_event, module, sourcePath) => {
    const selected = path.resolve(String(sourcePath || ''));
    const known = legacyDatabaseCandidates(module).some((candidate) => path.resolve(candidate) === selected && fs.existsSync(candidate));
    if (!known && !approvedMigrationPaths.has(selected)) throw new Error('Escolha o banco SQLite pela janela de migração antes de importar.');
    approvedMigrationPaths.delete(selected);
    return importLegacyDatabase(module, selected, { allowSelectedPath: true });
  });
  ipcMain.handle('migration:continue-report-with-current', () => {
    if (reportMigrationInProgress) throw new Error('A migração do Relatório está em andamento. Aguarde sua conclusão.');
    if (!reportMigrationDecisionPending) return { success: true, alreadyResolved: true };
    settings.reportMigrationDecision = 'use-current';
    reportMigrationDecisionPending = false;
    persistSettings();
    if (process.env.LOTE_CONTROL_DISABLE_DRIVE_SYNC !== '1') driveSync?.startAutoSync();
    return { success: true };
  });
}

function registerIntegrationHandler() {
  ipcMain.handle('integration:transfer-pix-pending', async (event, payload) => {
    if (!currentWindow(event)) throw new Error('A transferência foi solicitada por uma janela não autorizada.');
    if (reportMigrationInProgress) throw new Error('A migração do Relatório está em andamento. Aguarde sua conclusão.');
    if (reportMigrationDecisionPending) throw new Error('Escolha qual banco do Relatório usar antes de transferir lançamentos do Pix.');
    const result = transferPendingToReport({ reportDb: requireReportDb(), driveSync, payload });
    notifyDomainChanged('relatorio', 'pix-transfer');
    return result;
  });
}

readSettings();
if (hasSingleInstanceLock) app.whenReady().then(async () => {
  try {
    await initializeDatabases();
    registerPixHandlers();
    registerReportHandlers();
    registerShellHandlers();
    registerIntegrationHandler();
    createWindow('dashboard');
    app.on('activate', () => {
      if (!mainWindow) createWindow('dashboard');
      else showMainWindow();
    });
  } catch (error) {
    console.error('[LoteControl] Falha ao iniciar:', error.stack || error);
    dialog.showErrorBox('Falha ao iniciar o LoteControl', error.stack || error.message || String(error));
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  tray?.destroy();
  tray = null;
  driveSync?.stopAutoSync();
  try { reportDb?.saveToDisk(); reportDb?.db?.close(); } catch (error) { console.error('[Relatório] Falha ao fechar banco:', error); }
  try { pixDb?.close(); } catch (error) { console.error('[Pix] Falha ao fechar banco:', error); }
});

app.on('window-all-closed', () => {
  if (!settings.minimizeToTray && process.platform !== 'darwin') app.quit();
});
