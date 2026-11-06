// @vitest-environment node
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { PixDatabase } = require('../electron/database.cjs');
let tempRoot: string | null = null;
let db: any = null;
function makeEntry(id = 'pix-stable-1') {
  return { id, loterica: 'CAÇULA', ano: 2026, mes: 9, dia: 4, data_formatada: '2026-09-04', valor: 12.34, tipo: 'sobra', funcionario: 'Conferência Pix', cliente: 'CRED PIX', status: 'pendente', observacoes: 'Origem de teste' };
}

afterEach(() => { try { db?.db?.close(); } catch {} db = null; if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true }); tempRoot = null; });

describe('Persistência do lote Pix no banco do Relatório', () => {
  it('confirma linhas no arquivo SQLite e as reabre', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-report-'));
    const databasePath = path.join(tempRoot, 'report.db'); db = new PixDatabase(databasePath); await db.init();
    expect(db.insertPixTransferBatch([makeEntry()])).toEqual({ inserted: 1, skipped: 0 });
    expect(db.getLancamentoById('pix-stable-1')).toMatchObject({ dia: 4, tipo: 'sobra', valor: 12.34 });
    db.db.close(); db = new PixDatabase(databasePath); await db.init();
    expect(db.getLancamentoById('pix-stable-1')).toMatchObject({ dia: 4, status: 'pendente' });
  });

  it('reverte o lote em memória se a gravação atômica falhar', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-report-fail-'));
    db = new PixDatabase(path.join(tempRoot, 'report.db')); await db.init();
    db.saveToDisk = () => { throw new Error('simulated disk failure'); };
    expect(() => db.insertPixTransferBatch([makeEntry()])).toThrow('simulated disk failure');
    expect(db.getLancamentoById('pix-stable-1')).toBeNull();
  });

  it('move registros de lotérica e mês mantendo os demais campos e gravando backup', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-report-move-'));
    db = new PixDatabase(path.join(tempRoot, 'report.db')); await db.init();
    db.addLancamento(makeEntry('move-me'));
    const result = db.moveLancamentos(['move-me'], 'PUPINS', 2027, 10);
    expect(result).toMatchObject({ success: true, count: 1 });
    expect(fs.existsSync(result.backupPath)).toBe(true);
    expect(db.getLancamentoById('move-me')).toMatchObject({ loterica: 'PUPINS', ano: 2027, mes: 10, dia: 4, valor: 12.34, cliente: 'CRED PIX', status: 'pendente' });
    const queuedPeriods = db.getPendingSyncQueue().map((item: any) => JSON.parse(item.payload)).map((item: any) => `${item.loterica}/${item.ano}/${item.mes}`);
    expect(queuedPeriods).toContain('CAÇULA/2026/9');
    expect(queuedPeriods).toContain('PUPINS/2027/10');
  });

  it('não cria cópia nem novos eventos se o destino já é o período atual', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-report-move-noop-'));
    db = new PixDatabase(path.join(tempRoot, 'report.db')); await db.init();
    db.addLancamento(makeEntry('already-there'));
    const queueBefore = db.getPendingSyncQueue().length;
    const result = db.moveLancamentos(['already-there'], 'CAÇULA', 2026, 9);
    expect(result).toMatchObject({ success: true, count: 0 });
    expect(result.backupPath).toBeUndefined();
    expect(db.getPendingSyncQueue()).toHaveLength(queueBefore);
    expect(db.db.exec("SELECT COUNT(*) FROM pix_lancamentos WHERE id = 'already-there'")[0].values[0][0]).toBe(1);
  });

  it('restaura o banco do backup se falhar a persistência do movimento após commit em memória', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-report-move-save-fail-'));
    const databasePath = path.join(tempRoot, 'report.db');
    db = new PixDatabase(databasePath); await db.init();
    db.addLancamento(makeEntry('move-save-failure'));
    db.saveToDisk = () => { throw new Error('simulated disk failure'); };

    expect(() => db.moveLancamentos(['move-save-failure'], 'PUPINS', 2027, 10)).toThrow('simulated disk failure');
    expect(db.getLancamentoById('move-save-failure')).toMatchObject({ loterica: 'CAÇULA', ano: 2026, mes: 9, deleted: 0 });
    expect(db.getPendingSyncQueue().map((item: any) => JSON.parse(item.payload)).filter((item: any) => item.id === 'move-save-failure' && item.loterica === 'PUPINS')).toHaveLength(0);
  });

  it('limpa apenas Seed e cria backup validado, mantendo lançamento real', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-report-seed-'));
    db = new PixDatabase(path.join(tempRoot, 'report.db')); await db.init();
    db.addLancamento(makeEntry('real-record'));
    db.addLancamento({ ...makeEntry('seed-record'), is_demo: 1 });
    const result = db.clearDemoData('CAÇULA');
    expect(result.success).toBe(true);
    expect(fs.existsSync(result.backupPath)).toBe(true);
    expect(db.getLancamentoById('real-record')).not.toBeNull();
    expect(db.getLancamentoById('seed-record')).toBeNull();
  });
});
