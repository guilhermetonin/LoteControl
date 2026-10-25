// @vitest-environment node
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const { hashFile, readLegacyTrayPreference, replaceDatabaseFromVerifiedSource, shouldPauseDriveForReportMigration, verifyDatabaseFile } = require('../electron/services/database-migration.cjs');
let tempRoot: string | null = null;
let SQL: any;
async function engine() {
  if (!SQL) SQL = await initSqlJs({ locateFile: (file: string) => path.resolve(__dirname, '../node_modules/sql.js/dist', file) });
  return SQL;
}
async function makeReportDatabase(filePath: string, entries: Array<[string, number]> = []) {
  const Engine = await engine(); const database = new Engine.Database();
  database.run('CREATE TABLE pix_lancamentos (id TEXT PRIMARY KEY, loterica TEXT, ano INTEGER, mes INTEGER, dia INTEGER, data_formatada TEXT, valor REAL, tipo TEXT, funcionario TEXT, cliente TEXT, status TEXT, observacoes TEXT, criado_em TEXT, atualizado_em TEXT, is_demo INTEGER, version INTEGER, deleted INTEGER);');
  database.run('CREATE TABLE sync_queue (id INTEGER); CREATE TABLE sync_versions_history (id TEXT);');
  for (const [id, value] of entries) database.run('INSERT INTO pix_lancamentos (id, loterica, ano, mes, dia, data_formatada, valor, tipo, funcionario, cliente, status, observacoes, criado_em, atualizado_em, is_demo, version, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, 'CAÇULA', 2026, 9, 1, '2026-09-01', value, 'sobra', '', '', 'pendente', '', new Date().toISOString(), new Date().toISOString(), 0, 1, 0]);
  fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, Buffer.from(database.export())); database.close();
}
afterEach(() => { if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true }); tempRoot = null; SQL = undefined; });

describe('Migração validada de banco SQLite', () => {
  it('pausa o auto-sync apenas enquanto a migração antiga exige decisão', () => {
    expect(shouldPauseDriveForReportMigration({ decision: null, legacyDatabaseFound: true, targetEmpty: true })).toBe(true);
    expect(shouldPauseDriveForReportMigration({ decision: 'use-current', legacyDatabaseFound: true, targetEmpty: true })).toBe(false);
    expect(shouldPauseDriveForReportMigration({ decision: null, legacyDatabaseFound: true, targetEmpty: false })).toBe(false);
  });

  it('recupera a preferência antiga da bandeja sem alterar o banco de origem', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-migration-tray-'));
    const Engine = await engine();
    const pix = new Engine.Database(); pix.run('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO app_settings VALUES (\'close_button_action\', \'tray\');');
    const report = new Engine.Database(); report.run('CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT); INSERT INTO sync_state VALUES (\'minimize_to_tray\', \'1\');');
    const pixPath = path.join(tempRoot, 'pix.db'); const reportPath = path.join(tempRoot, 'report.db');
    fs.writeFileSync(pixPath, Buffer.from(pix.export())); fs.writeFileSync(reportPath, Buffer.from(report.export())); pix.close(); report.close();
    expect(await readLegacyTrayPreference(pixPath, 'pix', engine)).toBe(true);
    expect(await readLegacyTrayPreference(reportPath, 'report', engine)).toBe(true);
  });

  it('valida integridade, guarda origem e destino e ativa cópia com SHA-256 idêntico', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-migration-'));
    const source = path.join(tempRoot, 'old-report.db'); const target = path.join(tempRoot, 'new', 'report.db'); const backups = path.join(tempRoot, 'backups');
    await makeReportDatabase(source, [['legacy-row', 9.25]]); await makeReportDatabase(target); const oldTargetHash = hashFile(target);
    const activate = vi.fn(async () => expect(await verifyDatabaseFile(target, 'report', engine)).toBe(hashFile(source)));
    const result = await replaceDatabaseFromVerifiedSource({ source, target, module: 'report', backupDirectory: backups, verifyFile: (file: string, module: string) => verifyDatabaseFile(file, module, engine), activate });
    expect(result.sha256).toBe(hashFile(source)); expect(hashFile(result.backup)).toBe(hashFile(source));
    expect(result.targetBackup).toBeTruthy(); expect(hashFile(result.targetBackup)).toBe(oldTargetHash); expect(activate).toHaveBeenCalledOnce();
  });

  it('restaura o destino anterior se a ativação falhar', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-migration-rollback-'));
    const source = path.join(tempRoot, 'source.db'); const target = path.join(tempRoot, 'target.db');
    await makeReportDatabase(source, [['source-row', 20]]); await makeReportDatabase(target, [['keep-row', 8]]); const targetHash = hashFile(target);
    const rollback = vi.fn(async () => {});
    await expect(replaceDatabaseFromVerifiedSource({ source, target, module: 'report', backupDirectory: path.join(tempRoot, 'backups'), verifyFile: (file: string, module: string) => verifyDatabaseFile(file, module, engine), activate: async () => { throw new Error('activation failed'); }, rollback })).rejects.toThrow('activation failed');
    expect(hashFile(target)).toBe(targetHash); expect(rollback).toHaveBeenCalledOnce();
  });

  it('rejeita arquivo inválido antes de tocar o destino', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-migration-invalid-'));
    const source = path.join(tempRoot, 'not-a-db.db'); const target = path.join(tempRoot, 'target.db');
    fs.writeFileSync(source, 'not sqlite'); await makeReportDatabase(target); const targetHash = hashFile(target);
    await expect(verifyDatabaseFile(source, 'report', engine)).rejects.toThrow(/SQLite válido/); expect(hashFile(target)).toBe(targetHash);
  });
});
