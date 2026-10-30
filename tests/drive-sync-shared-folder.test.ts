// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const sourcePath = path.resolve(__dirname, '../electron/drive-sync.cjs');
let tempRootA: string | null = null;
let tempRootB: string | null = null;

function loadDriveSyncClass(safeStorageMock?: any) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const module = { exports: {} as Record<string, any> };
  const safeRequire = (name: string) =>
    name === 'electron'
      ? {
          shell: { openExternal: vi.fn() },
          safeStorage: safeStorageMock || {
            isEncryptionAvailable: () => true,
            encryptString: (str: string) => Buffer.from(`enc:${str}`, 'utf8'),
            decryptString: (buf: Buffer) => buf.toString('utf8').replace(/^enc:/, ''),
          },
        }
      : require(name);
  const wrapper = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
  wrapper(safeRequire, module, module.exports, path.dirname(sourcePath), sourcePath);
  return module.exports.GoogleDriveSync;
}

function createMockDb(initialState: Record<string, any> = {}) {
  const state = { ...initialState };
  const history: any[] = [];
  return {
    getAllSyncState: () => ({ ...state }),
    getSyncState: (k: string) => state[k] || '',
    setSyncState: (k: string, v: string) => { state[k] = String(v); },
    getPendingSyncQueue: () => [],
    getPendingSyncQueueForFile: () => [],
    getUnresolvedConflicts: () => [],
    getVersionById: (id: string) => history.find(h => h.version_id === id) || null,
    saveVersionHistory: (doc: any) => { history.push(doc); },
    getDeviceIdentity: () => ({
      deviceId: state['device_id'] || 'dev_mock_1',
      deviceName: state['device_name'] || 'PC-1',
    }),
    getAllLancamentosForFile: () => [],
    applySnapshot: vi.fn(),
  };
}

function createIntegratedMockDb(initialState: Record<string, any> = {}) {
  const syncState: Record<string, string> = { ...initialState };
  const history: any[] = [];
  const entries: Map<string, any> = new Map();
  let queue: any[] = [];
  let nextQueueId = 1;

  return {
    syncState,
    history,
    entries,
    queue,
    getAllSyncState: () => ({ ...syncState }),
    getSyncState: (k: string) => syncState[k] || '',
    setSyncState: (k: string, v: string) => { syncState[k] = String(v); },
    getPendingSyncQueue: () => queue.filter(q => q.status === 'pending'),
    getPendingSyncQueueForFile: (lot: string, ano: number, mes: number) => {
      const normLot = String(lot).toUpperCase().trim();
      return queue.filter(q => {
        if (q.status !== 'pending') return false;
        try {
          const p = JSON.parse(q.payload);
          return String(p.loterica || '').toUpperCase().trim() === normLot &&
                 Number(p.ano) === Number(ano) &&
                 Number(p.mes) === Number(mes);
        } catch {
          return false;
        }
      });
    },
    enqueue: (op: string, entityId: string, payload: any) => {
      queue.push({
        id: nextQueueId++,
        operation: op,
        entity_id: entityId,
        payload: JSON.stringify(payload),
        status: 'pending',
      });
    },
    markSyncQueueItem: (id: number, status: string) => {
      const item = queue.find(q => q.id === id);
      if (item) item.status = status;
    },
    clearProcessedSyncQueue: () => {
      queue = queue.filter(q => q.status !== 'completed');
    },
    getUnresolvedConflicts: () => [],
    getVersionById: (id: string) => {
      const row = history.find(h => h.version_id === id || h.id === id || h.id === `vh_${id}`);
      if (!row) return null;
      return {
        ...row,
        snapshot: row.snapshot || row.entries || {},
      };
    },
    saveVersionHistory: (doc: any) => {
      const existingIdx = history.findIndex(h => h.version_id === doc.version_id);
      if (existingIdx >= 0) {
        history[existingIdx] = doc;
      } else {
        history.push(doc);
      }
    },
    getDeviceIdentity: () => ({
      deviceId: syncState['device_id'] || 'dev_t2',
      deviceName: syncState['device_name'] || 'Terminal-2',
    }),
    getAllLancamentosForFile: (lot: string, ano: number, mes: number, includeDeleted = true) => {
      const normLot = String(lot).toUpperCase().trim();
      return Array.from(entries.values()).filter(e => {
        const match = String(e.loterica || '').toUpperCase().trim() === normLot &&
                      Number(e.ano) === Number(ano) &&
                      Number(e.mes) === Number(mes);
        if (!match) return false;
        if (!includeDeleted && e.deleted) return false;
        return true;
      });
    },
    getLancamentoById: (id: string) => entries.get(id) || null,
    addLancamento: (entry: any) => {
      entries.set(entry.id, { ...entry });
    },
    updateLancamento: (id: string, entry: any) => {
      entries.set(id, { ...entries.get(id), ...entry });
    },
    deleteLancamento: (id: string) => {
      const existing = entries.get(id);
      if (existing) {
        entries.set(id, { ...existing, deleted: 1 });
      } else {
        entries.set(id, { id, deleted: 1 });
      }
    },
    applySnapshot: (lot: string, ano: number, mes: number, entriesMap: any) => {
      const map = Array.isArray(entriesMap)
        ? Object.fromEntries(entriesMap.map((e: any) => [e.id, e]))
        : (entriesMap || {});
      for (const [id, e] of Object.entries(map)) {
        entries.set(id, { ...(e as any) });
      }
    },
  };
}

function setupMockService(GoogleDriveSyncClass: any, db: any, remoteStore: { files: any[] }, tempRoot: string) {
  const service = new GoogleDriveSyncClass(db, { userDataPath: tempRoot });
  service.getConfig = () => ({
    folderId: '1ZCX-eIumIZwOon6rnRtpoVHg4nEKCw8c',
    clientId: 'client-id-123',
    clientSecret: 'client-secret-123',
    userEmail: 'operador@gmail.com',
  });
  service.getStoredTokens = () => ({
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    user_email: 'operador@gmail.com',
  });
  service.getValidAccessToken = async () => 'mock-access-token';
  service.validateFolderAccess = async () => ({ valid: true, folderId: '1ZCX-eIumIZwOon6rnRtpoVHg4nEKCw8c' });
  service.getOrCreateRootFolder = async () => '1ZCX-eIumIZwOon6rnRtpoVHg4nEKCw8c';
  service.getOrCreateFolder = async (parent: string, name: string) => `folder-${name}`;

  service.listAllRemoteFilesRecursive = async () => {
    return remoteStore.files.map(f => ({
      id: f.id,
      name: f.name,
      file: f,
    }));
  };

  service.downloadFileContent = async (fileId: string) => {
    const f = remoteStore.files.find(item => item.id === fileId);
    return f ? f.content : null;
  };

  service.uploadJsonMultipart = async (parentFolderId: string, fileName: string, contentObj: any) => {
    const newFile = {
      id: `file_${contentObj.version_id}`,
      name: fileName,
      content: contentObj,
    };
    remoteStore.files.push(newFile);
    return { id: newFile.id, name: fileName };
  };

  service.createFileInFolder = async (parentFolderId: string, fileName: string, contentObj: any) => {
    const newFile = {
      id: `file_${contentObj.version_id}`,
      name: fileName,
      content: contentObj,
    };
    remoteStore.files.push(newFile);
    return { id: newFile.id, name: fileName };
  };

  return service;
}

describe('Suporte a múltiplas contas Google e pastas compartilhadas', () => {
  let GoogleDriveSync: any;
  const SHARED_FOLDER_ID = '1ZCX-eIumIZwOon6rnRtpoVHg4nEKCw8c';

  beforeEach(() => {
    tempRootA = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-multi-a-'));
    tempRootB = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-multi-b-'));
    GoogleDriveSync = loadDriveSyncClass();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempRootA) fs.rmSync(tempRootA, { recursive: true, force: true });
    if (tempRootB) fs.rmSync(tempRootB, { recursive: true, force: true });
    tempRootA = null;
    tempRootB = null;
  });

  it('extrai o ID da pasta a partir de URL completa ou ID puro e rejeita root', () => {
    const service = new GoogleDriveSync(createMockDb(), { userDataPath: tempRootA });
    
    // URL de compartilhamento do Google Drive
    expect(service.extractFolderId(`https://drive.google.com/drive/folders/${SHARED_FOLDER_ID}`)).toBe(SHARED_FOLDER_ID);
    // URL com parâmetros
    expect(service.extractFolderId(`https://drive.google.com/drive/folders/${SHARED_FOLDER_ID}?usp=sharing`)).toBe(SHARED_FOLDER_ID);
    expect(service.extractFolderId(`https://drive.google.com/open?id=${SHARED_FOLDER_ID}`)).toBe(SHARED_FOLDER_ID);
    // ID puro com aspas ou espaços
    expect(service.extractFolderId(`  "${SHARED_FOLDER_ID}"  `)).toBe(SHARED_FOLDER_ID);
    expect(service.extractFolderId(SHARED_FOLDER_ID)).toBe(SHARED_FOLDER_ID);
    expect(service.extractFolderId('')).toBe('');
  });

  it('valida permissões na pasta compartilhada: aprova Editor e rejeita Leitor, Lixeira ou Root', async () => {
    const db = createMockDb();
    const service = new GoogleDriveSync(db, { userDataPath: tempRootA });
    service.getValidAccessToken = vi.fn().mockResolvedValue('mock-token-user-b');

    // 1. Rejeita 'root'
    await expect(service.validateFolderAccess('root')).rejects.toThrow(/não pode ser a raiz/i);

    // 2. Rejeita HTTP 404 (não compartilhada ou não encontrada)
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 404,
      ok: false,
      json: async () => ({ error: { message: 'File not found' } }),
    } as any);
    await expect(service.validateFolderAccess(SHARED_FOLDER_ID)).rejects.toThrow(/não encontrada/i);

    // 3. Rejeita HTTP 403 (permissão negada)
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 403,
      ok: false,
      json: async () => ({ error: { message: 'Forbidden' } }),
    } as any);
    await expect(service.validateFolderAccess(SHARED_FOLDER_ID)).rejects.toThrow(/permissão/i);

    // 4. Rejeita pasta na lixeira
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        id: SHARED_FOLDER_ID,
        name: 'Dados_Controle_PIX',
        mimeType: 'application/vnd.google-apps.folder',
        trashed: true,
        capabilities: { canAddChildren: true },
      }),
    } as any);
    await expect(service.validateFolderAccess(SHARED_FOLDER_ID)).rejects.toThrow(/lixeira/i);

    // 5. Rejeita conta com permissão apenas de Leitor (canAddChildren = false)
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        id: SHARED_FOLDER_ID,
        name: 'Dados_Controle_PIX',
        mimeType: 'application/vnd.google-apps.folder',
        trashed: false,
        capabilities: { canAddChildren: false },
      }),
    } as any);
    await expect(service.validateFolderAccess(SHARED_FOLDER_ID)).rejects.toThrow(/permissão de leitura/i);

    // 6. Aprova pasta compartilhada com permissão de Editor (canAddChildren = true)
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        id: SHARED_FOLDER_ID,
        name: 'Dados_Controle_PIX',
        mimeType: 'application/vnd.google-apps.folder',
        trashed: false,
        capabilities: { canAddChildren: true },
        shared: true,
        owners: [{ emailAddress: 'gtoninlab@gmail.com' }],
      }),
    } as any);
    const res = await service.validateFolderAccess(SHARED_FOLDER_ID);
    expect(res.valid).toBe(true);
    expect(res.folderId).toBe(SHARED_FOLDER_ID);
  });

  it('previne duplicação de pastas concorrentes convergindo para a pasta canônica mais antiga', async () => {
    const db = createMockDb();
    const service = new GoogleDriveSync(db, { userDataPath: tempRootA });

    // Simula que a busca encontra duas pastas duplicadas criadas por corridas anteriores
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: [
          { id: 'folder-newer', name: 'historico', createdTime: '2026-10-29T20:00:00Z' },
          { id: 'folder-older', name: 'historico', createdTime: '2026-10-29T19:00:00Z' },
        ],
      }),
    } as any);

    const folderId = await service.getOrCreateFolder('parent-1', 'historico', 'token-123');
    // Deve selecionar deterministicamente a mais antiga
    expect(folderId).toBe('folder-older');

    // Segunda chamada para o mesmo pai e nome usa o cache em memória sem nova requisição HTTP
    const cachedFolderId = await service.getOrCreateFolder('parent-1', 'historico', 'token-123');
    expect(cachedFolderId).toBe('folder-older');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('trata falha de permissão HTTP 403 na exclusão de snapshots pertencentes a outro usuário sem interromper o serviço', async () => {
    const db = createMockDb();
    const service = new GoogleDriveSync(db, { userDataPath: tempRootA });
    
    // Lista 3 snapshots remotos
    service.listAllRemoteFilesRecursive = vi.fn().mockResolvedValue([
      { id: 'file-1', name: 'snap_CACULA_2026_10_v1_aaa.json' },
      { id: 'file-2', name: 'snap_CACULA_2026_10_v2_bbb.json' },
      { id: 'file-3', name: 'snap_CACULA_2026_10_v3_ccc.json' },
    ]);

    // identifyPrunableSnapshots marca v1_aaa como elegível para remoção
    service.identifyPrunableSnapshots = vi.fn().mockReturnValue({
      prunable: [{ version_id: 'v1_aaa', version_num: 1 }],
      kept: [{ version_id: 'v2_bbb', version_num: 2 }, { version_id: 'v3_ccc', version_num: 3 }],
      protectedIds: ['v2_bbb', 'v3_ccc'],
    });

    service.downloadFileContent = vi.fn().mockResolvedValue({
      version_id: 'v1_aaa',
      version_num: 1,
      entries: {},
    });

    // Simula que a exclusão falha com 403 Forbidden (arquivo pertence a gtoninlab@gmail.com)
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 403,
      ok: false,
      json: async () => ({ error: { message: 'Insufficient permissions for file' } }),
    } as any);

    const result = await service.pruneRemoteSnapshots(SHARED_FOLDER_ID, 'CACULA', 2026, 10, 'token-user-b', { dryRun: false });

    // O arquivo não deve ser declarado como excluído
    expect(result.deletedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.failed[0].version_id).toBe('v1_aaa');
    expect(result.failed[0].reason).toContain('Permissão insuficiente');
  });

  it('armazena tokens de forma independente entre duas instalações e registra autoria de cada conta', () => {
    // Instalação A (Terminal 1 - Central)
    const dbA = createMockDb();
    const serviceA = new GoogleDriveSync(dbA, { userDataPath: tempRootA });
    serviceA.saveTokens({
      access_token: 'token-a',
      refresh_token: 'refresh-a',
      user_email: 'gtoninlab@gmail.com',
      user_name: 'Administrador Central',
    });

    // Instalação B (Terminal 2 - Operador)
    const dbB = createMockDb();
    const serviceB = new GoogleDriveSync(dbB, { userDataPath: tempRootB });
    serviceB.saveTokens({
      access_token: 'token-b',
      refresh_token: 'refresh-b',
      user_email: 'operador@gmail.com',
      user_name: 'Operador Loja',
    });

    // Tokens e e-mails devem ser isolados
    expect(serviceA.getStoredTokens().user_email).toBe('gtoninlab@gmail.com');
    expect(serviceB.getStoredTokens().user_email).toBe('operador@gmail.com');
    expect(serviceA.getConfig().userEmail).toBe('gtoninlab@gmail.com');
    expect(serviceB.getConfig().userEmail).toBe('operador@gmail.com');

    // Desconectar no Terminal B não afeta o Terminal A
    serviceB.clearTokens();
    expect(serviceB.getStoredTokens()).toBeNull();
    expect(serviceA.getStoredTokens().user_email).toBe('gtoninlab@gmail.com');
  });

  it('reconcilia alterações simultâneas entre duas contas: merge automático em alterações disjuntas', () => {
    const service = new GoogleDriveSync(createMockDb(), { userDataPath: tempRootA });

    const baseEntries = {
      'tx-1': { id: 'tx-1', valor: 100, status: 'pendente', dia: 1, loterica: 'CAÇULA' },
    };

    // Conta A alterou tx-1 para 'conferido'
    const entriesA = {
      'tx-1': { id: 'tx-1', valor: 100, status: 'conferido', dia: 1, loterica: 'CAÇULA' },
    };

    // Conta B inseriu um novo lançamento tx-2
    const entriesB = {
      'tx-1': { id: 'tx-1', valor: 100, status: 'pendente', dia: 1, loterica: 'CAÇULA' },
      'tx-2': { id: 'tx-2', valor: 250, status: 'pendente', dia: 2, loterica: 'CAÇULA' },
    };

    const mergeResult = service.threeWayMerge(baseEntries, entriesA, entriesB);

    expect(mergeResult.hasConflict).toBe(false);
    expect(mergeResult.mergedEntries['tx-1'].status).toBe('conferido');
    expect(mergeResult.mergedEntries['tx-2'].valor).toBe(250);
  });

  it('identifica conflito real quando ambas as contas alteram o mesmo registro de forma divergente', () => {
    const service = new GoogleDriveSync(createMockDb(), { userDataPath: tempRootA });

    const baseEntries = {
      'tx-1': { id: 'tx-1', valor: 100, status: 'pendente', dia: 1, loterica: 'CAÇULA' },
    };

    // Conta A alterou o valor para 150
    const entriesA = {
      'tx-1': { id: 'tx-1', valor: 150, status: 'pendente', dia: 1, loterica: 'CAÇULA' },
    };

    // Conta B alterou o valor para 200
    const entriesB = {
      'tx-1': { id: 'tx-1', valor: 200, status: 'pendente', dia: 1, loterica: 'CAÇULA' },
    };

    const mergeResult = service.threeWayMerge(baseEntries, entriesA, entriesB);

    expect(mergeResult.hasConflict).toBe(true);
    expect(mergeResult.conflicts.length).toBe(1);
    expect(mergeResult.conflicts[0].id).toBe('tx-1');
  });

  describe('Cenário A - Sincronização e Reconciliação (Testes 1 a 6)', () => {
    it('Cenário 1: alterações independentes em registros diferentes (T1 altera SOBRA, T2 altera FALTA) mesclam automaticamente sem conflito', async () => {
      const db = createIntegratedMockDb({
        last_version_id_CAÇULA_2026_10: 'v1_t1',
        last_version_num_CAÇULA_2026_10: '1',
      });

      const v1Entries = {
        'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, tipo: 'sobra', valor: 10, status: 'pendente' },
        'falta-1': { id: 'falta-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, tipo: 'falta', valor: 20, status: 'pendente' },
      };

      db.saveVersionHistory({ version_id: 'v1_t1', version_num: 1, snapshot: v1Entries });
      db.applySnapshot('CAÇULA', 2026, 10, v1Entries);

      // T2 altera localmente falta-1 para 25
      db.updateLancamento('falta-1', { valor: 25 });
      db.enqueue('UPDATE', 'falta-1', { id: 'falta-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, tipo: 'falta', valor: 25 });

      // Remoto v2 publicado por T1 onde sobra-1 foi alterado para 15
      const remoteStore = {
        files: [
          {
            id: 'f_v1',
            name: 'snap_CAÇULA_2026_10_v1_t1.json',
            content: { version_id: 'v1_t1', version_num: 1, entries: v1Entries },
          },
          {
            id: 'f_v2',
            name: 'snap_CAÇULA_2026_10_v2_t1.json',
            content: {
              version_id: 'v2_t1',
              version_num: 2,
              parent_version_ids: ['v1_t1'],
              entries: {
                'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, tipo: 'sobra', valor: 15, status: 'pendente' },
                'falta-1': { id: 'falta-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, tipo: 'falta', valor: 20, status: 'pendente' },
              },
            },
          },
        ],
      };

      const service = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA!);
      const syncResult = await service.sync();

      // Sem conflito falso
      expect(syncResult.status).toBe('Sincronizado');
      expect(Object.keys(service.pendingRemoteUpdates).length).toBe(0);
      expect(db.getPendingSyncQueue().length).toBe(0);

      // Ambos os registros preservados com seus respectivos novos valores no SQLite local
      expect(db.getLancamentoById('sobra-1')?.valor).toBe(15);
      expect(db.getLancamentoById('falta-1')?.valor).toBe(25);

      // Snapshot v3 publicado no Drive contendo a mesclagem de ambos
      expect(remoteStore.files.length).toBe(3);
      const latestPublished = remoteStore.files[2].content;
      expect(latestPublished.entries['sobra-1'].valor).toBe(15);
      expect(latestPublished.entries['falta-1'].valor).toBe(25);
    });

    it('Cenário 2: alterações divergentes no mesmo registro identificam conflito real e não sobrescrevem', async () => {
      const db = createIntegratedMockDb({
        last_version_id_CAÇULA_2026_10: 'v1_t1',
        last_version_num_CAÇULA_2026_10: '1',
      });

      const v1Entries = {
        'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, tipo: 'sobra', valor: 10, status: 'pendente' },
      };

      db.saveVersionHistory({ version_id: 'v1_t1', version_num: 1, snapshot: v1Entries });
      db.applySnapshot('CAÇULA', 2026, 10, v1Entries);

      // T2 altera localmente sobra-1 para 18
      db.updateLancamento('sobra-1', { valor: 18 });
      db.enqueue('UPDATE', 'sobra-1', { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, tipo: 'sobra', valor: 18 });

      // Remoto v2 alterou sobra-1 para 15
      const remoteStore = {
        files: [
          {
            id: 'f_v1',
            name: 'snap_CAÇULA_2026_10_v1_t1.json',
            content: { version_id: 'v1_t1', version_num: 1, entries: v1Entries },
          },
          {
            id: 'f_v2',
            name: 'snap_CAÇULA_2026_10_v2_t1.json',
            content: {
              version_id: 'v2_t1',
              version_num: 2,
              parent_version_ids: ['v1_t1'],
              entries: {
                'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, tipo: 'sobra', valor: 15, status: 'pendente' },
              },
            },
          },
        ],
      };

      const service = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA!);
      const syncResult = await service.sync();

      // Detecta conflito real
      expect(syncResult.status).toBe('Conflito');
      const conflictKey = service.getFileKey('CAÇULA', 2026, 10);
      expect(service.pendingRemoteUpdates[conflictKey]?.hasConflict).toBe(true);

      // Não descarta a fila local pendente
      expect(db.getPendingSyncQueue().length).toBe(1);
      // Não cria snapshot novo de forma cega
      expect(remoteStore.files.length).toBe(2);
    });

    it('Cenário 3: alteração local vs exclusão remota identifica conflito real', async () => {
      const db = createIntegratedMockDb({
        last_version_id_CAÇULA_2026_10: 'v1_t1',
        last_version_num_CAÇULA_2026_10: '1',
      });

      const v1Entries = {
        'item-1': { id: 'item-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 100, deleted: 0 },
      };

      db.saveVersionHistory({ version_id: 'v1_t1', version_num: 1, snapshot: v1Entries });
      db.applySnapshot('CAÇULA', 2026, 10, v1Entries);

      // T2 altera localmente
      db.updateLancamento('item-1', { valor: 120 });
      db.enqueue('UPDATE', 'item-1', { id: 'item-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 120, deleted: 0 });

      // Remoto v2 excluiu item-1
      const remoteStore = {
        files: [
          {
            id: 'f_v1',
            name: 'snap_CAÇULA_2026_10_v1_t1.json',
            content: { version_id: 'v1_t1', version_num: 1, entries: v1Entries },
          },
          {
            id: 'f_v2',
            name: 'snap_CAÇULA_2026_10_v2_t1.json',
            content: {
              version_id: 'v2_t1',
              version_num: 2,
              parent_version_ids: ['v1_t1'],
              entries: {
                'item-1': { id: 'item-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 100, deleted: 1 },
              },
            },
          },
        ],
      };

      const service = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA!);
      await service.sync();

      const conflictKey = service.getFileKey('CAÇULA', 2026, 10);
      expect(service.pendingRemoteUpdates[conflictKey]?.hasConflict).toBe(true);
    });

    it('Cenário 4: exclusão local vs alteração remota identifica conflito real', async () => {
      const db = createIntegratedMockDb({
        last_version_id_CAÇULA_2026_10: 'v1_t1',
        last_version_num_CAÇULA_2026_10: '1',
      });

      const v1Entries = {
        'item-1': { id: 'item-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 100, deleted: 0 },
      };

      db.saveVersionHistory({ version_id: 'v1_t1', version_num: 1, snapshot: v1Entries });
      db.applySnapshot('CAÇULA', 2026, 10, v1Entries);

      // T2 exclui localmente
      db.deleteLancamento('item-1');
      db.enqueue('DELETE', 'item-1', { id: 'item-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 100, deleted: 1 });

      // Remoto v2 alterou item-1 para 130
      const remoteStore = {
        files: [
          {
            id: 'f_v1',
            name: 'snap_CAÇULA_2026_10_v1_t1.json',
            content: { version_id: 'v1_t1', version_num: 1, entries: v1Entries },
          },
          {
            id: 'f_v2',
            name: 'snap_CAÇULA_2026_10_v2_t1.json',
            content: {
              version_id: 'v2_t1',
              version_num: 2,
              parent_version_ids: ['v1_t1'],
              entries: {
                'item-1': { id: 'item-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 130, deleted: 0 },
              },
            },
          },
        ],
      };

      const service = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA!);
      await service.sync();

      const conflictKey = service.getFileKey('CAÇULA', 2026, 10);
      expect(service.pendingRemoteUpdates[conflictKey]?.hasConflict).toBe(true);
    });

    it('Cenário 5: inserções independentes (T1 cria registro A, T2 cria registro B) mesclam sem conflito', async () => {
      const db = createIntegratedMockDb({
        last_version_id_CAÇULA_2026_10: 'v1_t1',
        last_version_num_CAÇULA_2026_10: '1',
      });

      const v1Entries = {};
      db.saveVersionHistory({ version_id: 'v1_t1', version_num: 1, snapshot: v1Entries });

      // T2 cria registro B
      db.addLancamento({ id: 'item-b', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 2, valor: 75 });
      db.enqueue('INSERT', 'item-b', { id: 'item-b', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 2, valor: 75 });

      // Remoto v2 tem registro A criado por T1
      const remoteStore = {
        files: [
          {
            id: 'f_v1',
            name: 'snap_CAÇULA_2026_10_v1_t1.json',
            content: { version_id: 'v1_t1', version_num: 1, entries: v1Entries },
          },
          {
            id: 'f_v2',
            name: 'snap_CAÇULA_2026_10_v2_t1.json',
            content: {
              version_id: 'v2_t1',
              version_num: 2,
              parent_version_ids: ['v1_t1'],
              entries: {
                'item-a': { id: 'item-a', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 50 },
              },
            },
          },
        ],
      };

      const service = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA!);
      await service.sync();

      expect(Object.keys(service.pendingRemoteUpdates).length).toBe(0);
      expect(db.getLancamentoById('item-a')?.valor).toBe(50);
      expect(db.getLancamentoById('item-b')?.valor).toBe(75);

      const latestRemote = remoteStore.files[remoteStore.files.length - 1].content;
      expect(latestRemote.entries['item-a']?.valor).toBe(50);
      expect(latestRemote.entries['item-b']?.valor).toBe(75);
    });

    it('Cenário 6: sincronização repetida subsequente é idempotente e não duplica registros ou snapshots', async () => {
      const db = createIntegratedMockDb({
        last_version_id_CAÇULA_2026_10: 'v1_t1',
        last_version_num_CAÇULA_2026_10: '1',
      });

      const v1Entries = {
        'item-1': { id: 'item-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 100 },
      };

      db.saveVersionHistory({ version_id: 'v1_t1', version_num: 1, snapshot: v1Entries });
      db.applySnapshot('CAÇULA', 2026, 10, v1Entries);

      const remoteStore = {
        files: [
          {
            id: 'f_v1',
            name: 'snap_CAÇULA_2026_10_v1_t1.json',
            content: { version_id: 'v1_t1', version_num: 1, entries: v1Entries },
          },
        ],
      };

      const service = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA!);

      // Primeira sincronização: já está atualizado
      await service.sync();
      const filesCount1 = remoteStore.files.length;
      const entriesCount1 = Array.from(db.entries.values()).length;

      // Segunda sincronização imediata
      await service.sync();
      const filesCount2 = remoteStore.files.length;
      const entriesCount2 = Array.from(db.entries.values()).length;

      expect(filesCount1).toBe(1);
      expect(filesCount2).toBe(1);
      expect(entriesCount1).toBe(1);
      expect(entriesCount2).toBe(1);
    });
  });

  describe('Cenário B - Resolução Definitiva de Conflitos e Prevenção de Regressão', () => {
    it('Cenário A: aceitar versão remota em bifurcação DAG fecha o fork no Drive, permite novas alterações locais e não reabre o conflito antigo', async () => {
      const db = createIntegratedMockDb({
        last_version_id_CAÇULA_2026_10: 'v1_base',
        last_version_num_CAÇULA_2026_10: '1',
      });

      const v1Entries = {
        'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 100, status: 'pendente' },
      };
      db.saveVersionHistory({ version_id: 'v1_base', version_num: 1, snapshot: v1Entries });
      db.applySnapshot('CAÇULA', 2026, 10, v1Entries);

      // Bifurcação no Drive: Head A (T1) alterou valor para 150, Head B (T2) alterou valor para 200
      const remoteStore = {
        files: [
          {
            id: 'f_base',
            name: 'snap_CAÇULA_2026_10_v1_base.json',
            content: { version_id: 'v1_base', version_num: 1, entries: v1Entries },
          },
          {
            id: 'f_headA',
            name: 'snap_CAÇULA_2026_10_v2_headA.json',
            content: {
              version_id: 'v2_headA',
              version_num: 2,
              base_version_id: 'v1_base',
              parent_version_ids: ['v1_base'],
              entries: {
                'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 150, status: 'pendente' },
              },
            },
          },
          {
            id: 'f_headB',
            name: 'snap_CAÇULA_2026_10_v2_headB.json',
            content: {
              version_id: 'v2_headB',
              version_num: 2,
              base_version_id: 'v1_base',
              parent_version_ids: ['v1_base'],
              entries: {
                'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 200, status: 'pendente' },
              },
            },
          },
        ],
      };

      const service = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA);

      // 1. Sincronização detecta o conflito de bifurcação
      const sync1 = await service.sync();
      expect(sync1.status).toBe('Conflito');
      const conflictKey = service.getFileKey('CAÇULA', 2026, 10);
      expect(service.pendingRemoteUpdates[conflictKey]?.hasConflict).toBe(true);

      // 2. Usuário escolhe aceitar versão remota
      const resolveRes = await service.acceptRemoteVersion(conflictKey);
      expect(resolveRes.success).toBe(true);
      expect(service.pendingRemoteUpdates[conflictKey]).toBeUndefined();
      expect(db.getLancamentoById('sobra-1')?.valor).toBe(150);

      // O snapshot de merge foi publicado no Drive unindo headA e headB
      const latestFile = remoteStore.files[remoteStore.files.length - 1].content;
      expect(latestFile.parent_version_ids).toEqual(expect.arrayContaining(['v2_headA', 'v2_headB']));

      // 3. Usuário faz uma NOVA alteração local (altera valor para 250)
      db.updateLancamento('sobra-1', { valor: 250 });
      db.enqueue('UPDATE', 'sobra-1', { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 250 });

      // 4. Nova sincronização não deve reabrir o conflito antigo e deve enviar a nova alteração com sucesso
      const sync2 = await service.sync();
      expect(sync2.status).toBe('Sincronizado');
      expect(service.pendingRemoteUpdates[conflictKey]).toBeUndefined();
      expect(db.getPendingSyncQueue().length).toBe(0);

      // Novo snapshot foi publicado com o novo valor 250
      const finalPublished = remoteStore.files[remoteStore.files.length - 1].content;
      expect(finalPublished.entries['sobra-1']?.valor).toBe(250);
      expect(db.getLancamentoById('sobra-1')?.valor).toBe(250);
    });

    it('Cenário B: manter versão local em bifurcação publica novo snapshot via files.create (sem erro File not found) e resolve definitivamente', async () => {
      const db = createIntegratedMockDb({
        last_version_id_CAÇULA_2026_10: 'v1_base',
        last_version_num_CAÇULA_2026_10: '1',
      });

      const v1Entries = {
        'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 100, status: 'pendente' },
      };
      db.saveVersionHistory({ version_id: 'v1_base', version_num: 1, snapshot: v1Entries });
      db.applySnapshot('CAÇULA', 2026, 10, v1Entries);

      // Bifurcação no Drive entre Head A e Head B
      const remoteStore = {
        files: [
          {
            id: 'f_base',
            name: 'snap_CAÇULA_2026_10_v1_base.json',
            content: { version_id: 'v1_base', version_num: 1, entries: v1Entries },
          },
          {
            id: 'f_headA',
            name: 'snap_CAÇULA_2026_10_v2_headA.json',
            content: {
              version_id: 'v2_headA',
              version_num: 2,
              base_version_id: 'v1_base',
              parent_version_ids: ['v1_base'],
              entries: {
                'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 150, status: 'pendente' },
              },
            },
          },
          {
            id: 'f_headB',
            name: 'snap_CAÇULA_2026_10_v2_headB.json',
            content: {
              version_id: 'v2_headB',
              version_num: 2,
              base_version_id: 'v1_base',
              parent_version_ids: ['v1_base'],
              entries: {
                'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 200, status: 'pendente' },
              },
            },
          },
        ],
      };

      const service = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA);
      await service.sync();

      const conflictKey = service.getFileKey('CAÇULA', 2026, 10);
      expect(service.pendingRemoteUpdates[conflictKey]?.hasConflict).toBe(true);

      // T1 ajusta seu valor local que deseja manter para 180
      db.updateLancamento('sobra-1', { valor: 180 });

      // Executa keepLocalVersion: não deve tentar PATCH nem falhar com "File not found"
      const keepRes = await service.keepLocalVersion(conflictKey, 'Versão local mantida pelo operador');
      expect(keepRes.success).toBe(true);
      expect(service.pendingRemoteUpdates[conflictKey]).toBeUndefined();

      // O snapshot publicado contém os pais de ambas as cabeças
      const published = remoteStore.files[remoteStore.files.length - 1].content;
      expect(published.entries['sobra-1'].valor).toBe(180);
      expect(published.parent_version_ids).toEqual(expect.arrayContaining(['v2_headA', 'v2_headB']));

      // Próximo sync está limpo
      const syncAfter = await service.sync();
      expect(syncAfter.status).toBe('Sincronizado');
      expect(service.pendingRemoteUpdates[conflictKey]).toBeUndefined();
    });

    it('Cenário C: snapshot inexistente gera tratamento de erro controlado com diagnóstico claro sem corromper estado', async () => {
      const db = createIntegratedMockDb({
        last_version_id_CAÇULA_2026_10: 'v1_base',
      });
      db.applySnapshot('CAÇULA', 2026, 10, {
        'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 100 },
      });

      const remoteStore = { files: [] };
      const service = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA);

      const conflictKey = service.getFileKey('CAÇULA', 2026, 10);
      service.pendingRemoteUpdates[conflictKey] = {
        fileKey: conflictKey,
        fileId: 'non_existent_file_id',
        remoteVersionId: 'v_ghost_999',
        remoteVersionNum: 999,
        loterica: 'CAÇULA',
        ano: 2026,
        mes: 10,
        hasConflict: true,
      };

      // Deve falhar de forma controlada sem estourar unhandled rejection
      await expect(service.acceptRemoteVersion(conflictKey)).rejects.toThrow(/Não foi possível obter o documento remoto do Drive/);

      // Dados locais e pendência permanecem intactos e recuperáveis
      expect(db.getLancamentoById('sobra-1')?.valor).toBe(100);
      expect(service.pendingRemoteUpdates[conflictKey]).toBeDefined();
    });

    it('Cenário D: reinicialização preserva convergência do conflito resolvido e sincroniza novas alterações perfeitamente', async () => {
      const db = createIntegratedMockDb({
        last_version_id_CAÇULA_2026_10: 'v1_base',
      });
      const v1Entries = {
        'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 100 },
      };
      db.saveVersionHistory({ version_id: 'v1_base', version_num: 1, snapshot: v1Entries });
      db.applySnapshot('CAÇULA', 2026, 10, v1Entries);

      const remoteStore = {
        files: [
          {
            id: 'f_base',
            name: 'snap_CAÇULA_2026_10_v1_base.json',
            content: { version_id: 'v1_base', version_num: 1, entries: v1Entries },
          },
          {
            id: 'f_headA',
            name: 'snap_CAÇULA_2026_10_v2_headA.json',
            content: {
              version_id: 'v2_headA',
              version_num: 2,
              parent_version_ids: ['v1_base'],
              entries: { 'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 150 } },
            },
          },
          {
            id: 'f_headB',
            name: 'snap_CAÇULA_2026_10_v2_headB.json',
            content: {
              version_id: 'v2_headB',
              version_num: 2,
              parent_version_ids: ['v1_base'],
              entries: { 'sobra-1': { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 200 } },
            },
          },
        ],
      };

      const service1 = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA);
      await service1.sync();
      const conflictKey = service1.getFileKey('CAÇULA', 2026, 10);
      await service1.acceptRemoteVersion(conflictKey);

      // Simula reinicialização do aplicativo: nova instância de serviço com o mesmo db e remoteStore
      const serviceRestarted = setupMockService(GoogleDriveSync, db, remoteStore, tempRootA);
      const syncAfterRestart = await serviceRestarted.sync();

      // Conflito resolvido NÃO reaparece
      expect(syncAfterRestart.status).toBe('Sincronizado');
      expect(serviceRestarted.pendingRemoteUpdates[conflictKey]).toBeUndefined();

      // Nova alteração pós-restart
      db.updateLancamento('sobra-1', { valor: 300 });
      db.enqueue('UPDATE', 'sobra-1', { id: 'sobra-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 1, valor: 300 });

      const syncNew = await serviceRestarted.sync();
      expect(syncNew.status).toBe('Sincronizado');
      expect(db.getLancamentoById('sobra-1')?.valor).toBe(300);
      const finalSnap = remoteStore.files[remoteStore.files.length - 1].content;
      expect(finalSnap.entries['sobra-1'].valor).toBe(300);
    });
  });
});
