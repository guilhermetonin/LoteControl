// @vitest-environment node
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const sourcePath = path.resolve(__dirname, '../electron/drive-sync.cjs');
let tempRoot: string | null = null;

function loadDriveSyncClass(safeStorageMock?: any, shellMock?: any) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const module = { exports: {} as Record<string, any> };
  const safeRequire = (name: string) =>
    name === 'electron'
      ? {
          shell: shellMock || { openExternal: vi.fn() },
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

  it('lê as credenciais instaladas do JSON local e as mantém disponíveis após nova inicialização', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-drive-json-config-'));
    const credentialsPath = path.join(tempRoot, 'google-drive-config.json');
    fs.writeFileSync(credentialsPath, JSON.stringify({
      installed: { client_id: 'imported-desktop.apps.googleusercontent.com', client_secret: 'local-json-secret' },
      folder_id: 'shared-folder-id',
      scope: 'https://www.googleapis.com/auth/drive',
    }), 'utf8');
    const db = { getAllSyncState: () => ({}), getSyncState: () => '' };
    const GoogleDriveSync = loadDriveSyncClass();

    const firstLoad = new GoogleDriveSync(db, { userDataPath: tempRoot }).getConfig();
    const afterRestart = new GoogleDriveSync(db, { userDataPath: tempRoot }).getConfig();
    for (const config of [firstLoad, afterRestart]) {
      expect(config.clientId).toBe('imported-desktop.apps.googleusercontent.com');
      expect(config.clientSecret).toBe('local-json-secret');
      expect(config.folderId).toBe('shared-folder-id');
      expect(config.scope).toBe('https://www.googleapis.com/auth/drive');
    }
  });

  it('troca authorization code com credenciais importadas, PKCE e persiste os tokens retornados', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-drive-json-exchange-'));
    fs.writeFileSync(path.join(tempRoot, 'google-drive-config.json'), JSON.stringify({
      installed: { client_id: 'imported-desktop.apps.googleusercontent.com', client_secret: 'local-json-secret' },
      folder_id: 'shared-folder-id',
    }), 'utf8');
    const state: Record<string, string> = {};
    const db = {
      getAllSyncState: () => state,
      getSyncState: (key: string) => state[key] || '',
      setSyncState: (key: string, value: string) => { state[key] = value; },
      getPendingSyncQueue: () => [],
      getUnresolvedConflicts: () => [],
    };
    const GoogleDriveSync = loadDriveSyncClass();
    const service = new GoogleDriveSync(db, { userDataPath: tempRoot });
    let requestBody = '';
    service.fetchWithTimeout = vi.fn(async (_url: string, request: any) => {
      requestBody = request.body;
      return { ok: true, json: async () => ({ access_token: 'received-access-token', refresh_token: 'received-refresh-token', expires_in: 3600 }) };
    });

    const tokens = await service.exchangeCodeForTokens('one-time-code', 'original-code-verifier', 'http://127.0.0.1/callback');
    const form = new URLSearchParams(requestBody);
    expect(form.get('client_id')).toBe('imported-desktop.apps.googleusercontent.com');
    expect(form.get('client_secret')).toBe('local-json-secret');
    expect(form.get('code')).toBe('one-time-code');
    expect(form.get('code_verifier')).toBe('original-code-verifier');
    expect(tokens).toMatchObject({ access_token: 'received-access-token', refresh_token: 'received-refresh-token' });

    service.saveTokens({ ...tokens, user_email: 'oauth-test@example.test', user_name: 'OAuth Test' });
    expect(service.getStoredTokens()).toMatchObject({ access_token: 'received-access-token', refresh_token: 'received-refresh-token' });
    expect(state.user_email).toBe('oauth-test@example.test');
  });

  it('renova tokens com o mesmo Client ID e Client Secret importados sem perder refresh token ou perfil', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-drive-json-refresh-'));
    fs.writeFileSync(path.join(tempRoot, 'google-drive-config.json'), JSON.stringify({
      installed: { client_id: 'imported-desktop.apps.googleusercontent.com', client_secret: 'local-json-secret' },
    }), 'utf8');
    const state: Record<string, string> = {};
    const db = {
      getAllSyncState: () => state,
      getSyncState: (key: string) => state[key] || '',
      setSyncState: (key: string, value: string) => { state[key] = value; },
    };
    const GoogleDriveSync = loadDriveSyncClass();
    const service = new GoogleDriveSync(db, { userDataPath: tempRoot });
    service.saveTokens({ access_token: 'expired-token', refresh_token: 'stored-refresh-token', expires_at: 1, user_email: 'kept@example.test', user_name: 'Kept User' });
    let requestBody = '';
    service.fetchWithTimeout = vi.fn(async (_url: string, request: any) => {
      requestBody = request.body;
      return { ok: true, json: async () => ({ access_token: 'renewed-access-token', expires_in: 3600 }) };
    });

    const token = await service.getValidAccessToken();
    const form = new URLSearchParams(requestBody);
    expect(form.get('client_id')).toBe('imported-desktop.apps.googleusercontent.com');
    expect(form.get('client_secret')).toBe('local-json-secret');
    expect(form.get('refresh_token')).toBe('stored-refresh-token');
    expect(token).toBe('renewed-access-token');
    expect(service.getStoredTokens()).toMatchObject({
      access_token: 'renewed-access-token',
      refresh_token: 'stored-refresh-token',
      user_email: 'kept@example.test',
      user_name: 'Kept User',
    });
  });

  it('completa o callback OAuth com PKCE S256 usando as credenciais locais importadas', async () => {
    vi.useFakeTimers();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-drive-json-pkce-flow-'));
    fs.writeFileSync(path.join(tempRoot, 'google-drive-config.json'), JSON.stringify({
      installed: { client_id: 'imported-desktop.apps.googleusercontent.com', client_secret: 'local-json-secret' },
      folder_id: 'shared-folder-id',
    }), 'utf8');
    const shellMock = { openExternal: vi.fn() };
    const state: Record<string, string> = {};
    const db = {
      getAllSyncState: () => state,
      getSyncState: (key: string) => state[key] || '',
      setSyncState: (key: string, value: string) => { state[key] = value; },
      getPendingSyncQueue: () => [],
      getUnresolvedConflicts: () => [],
    };
    const GoogleDriveSync = loadDriveSyncClass(undefined, shellMock);
    const service = new GoogleDriveSync(db, { userDataPath: tempRoot });
    let exchangeBody = '';
    service.fetchWithTimeout = vi.fn(async (_url: string, request: any) => {
      exchangeBody = request.body;
      return { ok: true, json: async () => ({ access_token: 'callback-access-token', refresh_token: 'callback-refresh-token', expires_in: 3600 }) };
    });
    service.fetchUserInfo = vi.fn(async () => ({ email: 'authorized@example.test', name: 'Authorized User' }));

    const authPromise = service.startOAuthFlow();
    await vi.waitFor(() => expect(shellMock.openExternal).toHaveBeenCalledOnce());
    const authUrl = new URL(shellMock.openExternal.mock.calls[0][0]);
    expect(authUrl.searchParams.get('client_id')).toBe('imported-desktop.apps.googleusercontent.com');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    const redirectUri = new URL(authUrl.searchParams.get('redirect_uri')!);
    const callback = new URL(`${redirectUri.origin}/oauth2callback`);
    callback.searchParams.set('code', 'callback-one-time-code');
    callback.searchParams.set('state', authUrl.searchParams.get('state')!);
    await new Promise<void>((resolve, reject) => {
      const request = http.get(callback, (response) => { response.resume(); response.on('end', resolve); });
      request.on('error', reject);
    });
    await expect(authPromise).resolves.toMatchObject({ success: true, email: 'authorized@example.test' });

    const form = new URLSearchParams(exchangeBody);
    expect(form.get('client_id')).toBe('imported-desktop.apps.googleusercontent.com');
    expect(form.get('client_secret')).toBe('local-json-secret');
    expect(form.get('code')).toBe('callback-one-time-code');
    expect(crypto.createHash('sha256').update(form.get('code_verifier') || '').digest('base64url')).toBe(authUrl.searchParams.get('code_challenge'));
    expect(service.getStoredTokens()).toMatchObject({
      access_token: 'callback-access-token',
      refresh_token: 'callback-refresh-token',
      user_email: 'authorized@example.test',
    });
    await vi.runOnlyPendingTimersAsync();
  });
});
