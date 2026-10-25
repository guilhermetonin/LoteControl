// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const sourcePath = path.resolve(__dirname, '../electron/drive-sync.cjs');
let tempRoot: string | null = null;

function loadDriveSyncClass(safeStorageMock?: any) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const module = { exports: {} as Record<string, any> };
  const safeRequire = (name: string) =>
    name === 'electron'
      ? {
          shell: { openExternal: vi.fn() },
          safeStorage: safeStorageMock || { isEncryptionAvailable: () => false },
        }
      : require(name);
  const wrapper = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
  wrapper(safeRequire, module, module.exports, path.dirname(sourcePath), sourcePath);
  return module.exports.GoogleDriveSync;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe('ciclo de vida dos temporizadores e criptografia do Google Drive', () => {
  it('cancela a sincronização inicial, a periódica e o debounce ao pausar o serviço', async () => {
    vi.useFakeTimers();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-drive-timers-'));
    const GoogleDriveSync = loadDriveSyncClass();
    const db = {
      getAllSyncState: () => ({ sync_interval_sec: '5' }),
      getPendingSyncQueue: () => [],
      getUnresolvedConflicts: () => [],
    };
    const service = new GoogleDriveSync(db, { userDataPath: tempRoot });
    service.sync = vi.fn(async () => ({ status: 'ok' }));

    service.startAutoSync();
    service.triggerDebouncedSync();
    expect(vi.getTimerCount()).toBe(3);

    service.stopAutoSync();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);

    expect(service.sync).not.toHaveBeenCalled();
    expect(service.periodicTimer).toBeNull();
    expect(service.initialSyncTimer).toBeNull();
    expect(service.debounceTimer).toBeNull();
  });

  it('prioriza o Client Secret válido do SQLite sem disparar erro de descriptografia em arquivo corrompido e autorrepara o arquivo', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-drive-secret-'));
    const validCipherBase64 = Buffer.from('valid-secret-payload', 'utf8').toString('base64');
    const corruptedCipherBase64 = Buffer.from('corrupted-secret-payload', 'utf8').toString('base64');

    const safeStorageMock = {
      isEncryptionAvailable: () => true,
      encryptString: (plain: string) => Buffer.from(`enc:${plain}`, 'utf8'),
      decryptString: (buf: Buffer) => {
        const str = buf.toString('utf8');
        if (str === 'valid-secret-payload' || str.startsWith('enc:')) {
          return str.replace(/^enc:/, '') === 'valid-secret-payload' ? 'GOCSPX-valid-secret' : str.replace(/^enc:/, '');
        }
        throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
      },
    };

    fs.writeFileSync(
      path.join(tempRoot, 'google-drive-config.json'),
      JSON.stringify({
        client_id: 'client-123',
        client_secret_enc: `safe:${corruptedCipherBase64}`,
        folder_id: 'folder-abc',
      }),
      'utf8'
    );

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const GoogleDriveSync = loadDriveSyncClass(safeStorageMock);
    const db = {
      getAllSyncState: () => ({
        client_id: 'client-123',
        client_secret: `safe:${validCipherBase64}`,
        folder_id: 'folder-abc',
      }),
      setSyncState: vi.fn(),
      getPendingSyncQueue: () => [],
      getUnresolvedConflicts: () => [],
    };

    const service = new GoogleDriveSync(db, { userDataPath: tempRoot });
    const cfg = service.getConfig();

    expect(cfg.clientSecret).toBe('GOCSPX-valid-secret');
    expect(errorSpy).not.toHaveBeenCalled();

    const repairedFile = JSON.parse(fs.readFileSync(path.join(tempRoot, 'google-drive-config.json'), 'utf8'));
    expect(service.canDecryptProtectedSecret(repairedFile.client_secret_enc)).toBe(true);
  });

  it('registra erro de descriptografia apenas uma vez quando o segredo é ilegível e sinaliza aviso no status', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-drive-unreadable-'));
    const corruptedCipherBase64 = Buffer.from('unreadable-payload', 'utf8').toString('base64');

    const safeStorageMock = {
      isEncryptionAvailable: () => true,
      encryptString: (plain: string) => Buffer.from(plain, 'utf8'),
      decryptString: () => {
        throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
      },
    };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const GoogleDriveSync = loadDriveSyncClass(safeStorageMock);
    const db = {
      getAllSyncState: () => ({
        client_id: 'client-123',
        client_secret: `safe:${corruptedCipherBase64}`,
        folder_id: 'folder-abc',
      }),
      getSyncState: () => '',
      getPendingSyncQueue: () => [],
      getUnresolvedConflicts: () => [],
    };

    const service = new GoogleDriveSync(db, { userDataPath: tempRoot });
    service.getConfig();
    service.getConfig();
    const status = service.getStatusInfo();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(status.credentialWarning).toContain('não pôde ser descriptografado');
  });
});
