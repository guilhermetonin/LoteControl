const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function verifyDatabaseFile(filePath, module, getSqlEngine) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 100 || buffer.subarray(0, 16).toString('binary') !== 'SQLite format 3\u0000') throw new Error('O arquivo escolhido não possui cabeçalho SQLite válido.');
  const Engine = await getSqlEngine();
  const db = new Engine.Database(buffer);
  try {
    const quickCheck = db.exec('PRAGMA quick_check;');
    if (quickCheck[0]?.values?.[0]?.[0] !== 'ok') throw new Error('A verificação de integridade SQLite falhou.');
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const names = new Set((tables[0]?.values || []).map((row) => String(row[0])));
    const required = module === 'pix' ? ['conferences', 'transactions'] : ['pix_lancamentos', 'sync_queue', 'sync_versions_history'];
    if (!required.every((name) => names.has(name))) throw new Error('O arquivo SQLite não contém as tabelas esperadas deste módulo.');
  } finally { db.close(); }
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function readLegacyTrayPreference(filePath, module, getSqlEngine) {
  const table = module === 'pix' ? 'app_settings' : 'sync_state';
  const key = module === 'pix' ? 'close_button_action' : 'minimize_to_tray';
  const Engine = await getSqlEngine();
  const db = new Engine.Database(fs.readFileSync(filePath));
  try {
    const result = db.exec(`SELECT value FROM ${table} WHERE key = ?`, [key]);
    const raw = result[0]?.values?.[0]?.[0];
    if (raw == null) return null;
    if (module === 'pix') return String(raw).toLowerCase() === 'tray';
    if (String(raw) === '1') return true;
    if (String(raw) === '0') return false;
    return null;
  } catch {
    return null;
  } finally { db.close(); }
}

function shouldPauseDriveForReportMigration({ decision, legacyDatabaseFound, targetEmpty }) {
  return !decision && Boolean(legacyDatabaseFound) && Boolean(targetEmpty);
}

async function replaceDatabaseFromVerifiedSource({ source, target, module, backupDirectory, verifyFile, activate, rollback }) {
  const absoluteSource = path.resolve(source);
  const absoluteTarget = path.resolve(target);
  if (absoluteSource.toLowerCase() === absoluteTarget.toLowerCase()) throw new Error('A origem e o destino da migração são o mesmo arquivo.');
  const sha256 = await verifyFile(absoluteSource, module);
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });
  const suffix = new Date().toISOString().replace(/[:.]/g, '-') + `-${process.pid}`;
  const sourceBackup = path.join(backupDirectory, `${module}-origem-${suffix}.db`);
  const targetBackup = path.join(backupDirectory, `${module}-destino-vazio-${suffix}.db`);
  const staged = `${absoluteTarget}.migration-${process.pid}.tmp`;
  const previous = `${absoluteTarget}.pre-migration-${process.pid}`;
  let targetMoved = false;
  let installed = false;

  fs.copyFileSync(absoluteSource, sourceBackup, fs.constants.COPYFILE_EXCL);
  if (hashFile(sourceBackup) !== sha256 || await verifyFile(sourceBackup, module) !== sha256) throw new Error('O backup da origem não passou na verificação SHA-256; o destino não foi alterado.');
  try {
    fs.copyFileSync(absoluteSource, staged, fs.constants.COPYFILE_EXCL);
    if (await verifyFile(staged, module) !== sha256) throw new Error('A cópia temporária não passou na verificação; o destino não foi alterado.');
    if (fs.existsSync(absoluteTarget)) {
      fs.copyFileSync(absoluteTarget, targetBackup, fs.constants.COPYFILE_EXCL);
      if (hashFile(targetBackup) !== hashFile(absoluteTarget)) throw new Error('O backup do destino não passou na verificação; o destino não foi alterado.');
      fs.renameSync(absoluteTarget, previous);
      targetMoved = true;
    }
    fs.renameSync(staged, absoluteTarget);
    installed = true;
    if (await verifyFile(absoluteTarget, module) !== sha256) throw new Error('O banco instalado não passou na verificação; a migração será revertida.');
    await activate();
    if (targetMoved && fs.existsSync(previous)) fs.unlinkSync(previous);
    return { copied: absoluteTarget, backup: sourceBackup, targetBackup: fs.existsSync(targetBackup) ? targetBackup : null, sha256 };
  } catch (error) {
    try { if (fs.existsSync(staged)) fs.unlinkSync(staged); } catch {}
    try {
      if (targetMoved && fs.existsSync(previous)) {
        if (fs.existsSync(absoluteTarget)) fs.unlinkSync(absoluteTarget);
        fs.renameSync(previous, absoluteTarget);
      } else if (installed && fs.existsSync(absoluteTarget)) {
        fs.unlinkSync(absoluteTarget);
      }
    } catch (restoreError) { throw new Error(`Migração falhou e o arquivo anterior permaneceu em ${targetBackup || previous}: ${restoreError.message}`); }
    try { await rollback?.(); } catch (rollbackError) { throw new Error(`A migração foi revertida, mas não foi possível reabrir o banco anterior: ${rollbackError.message}`); }
    throw error;
  } finally { try { if (fs.existsSync(staged)) fs.unlinkSync(staged); } catch {} }
}

module.exports = { hashFile, readLegacyTrayPreference, replaceDatabaseFromVerifiedSource, shouldPauseDriveForReportMigration, verifyDatabaseFile };
