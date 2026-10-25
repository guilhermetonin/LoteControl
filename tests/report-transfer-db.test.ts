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
});
