process.noDeprecation = true;
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { shell, safeStorage } = require('electron');

class GoogleDriveSync {
  constructor(db, options = {}) {
    this.db = db;
    this.userDataPath = options.userDataPath || __dirname;
    this.configPath = path.join(this.userDataPath, 'google-drive-config.json');

    this.isSyncing = false;
    this.periodicTimer = null;
    this.initialSyncTimer = null;
    this.debounceTimer = null;
    this.status = 'Não configurado';
    this.lastError = null;

    // Cache de atualizações remotas pendentes de decisão do usuário
    this.pendingRemoteUpdates = {};

    // Callbacks para notificar o renderizador sobre alterações de estado
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onRemoteUpdate = options.onRemoteUpdate || (() => {});

    // Confirmação explícita de correspondência remota (evita falso "Sincronizado")
    this.isRemoteConfirmed = false;
    this.unreadableSecrets = new Set();
    this.unreadableTokens = new Set();
    this.credentialWarning = null;
  }

  extractFolderId(input) {
    if (!input) return '';
    const trimmed = input.trim();
    // Extrai o ID caso o usuário cole a URL completa do Google Drive
    const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return trimmed;
  }

  isSafeStorageAvailable() {
    try { return Boolean(safeStorage && safeStorage.isEncryptionAvailable()); }
    catch { return false; }
  }

  encodeClientSecret(secret) {
    const value = String(secret || '').trim();
    if (!value) return '';
    if (!this.isSafeStorageAvailable()) {
      throw new Error('O armazenamento seguro do sistema operacional está indisponível; o Client Secret não foi gravado em texto simples.');
    }
    return `safe:${safeStorage.encryptString(value).toString('base64')}`;
  }

  canDecryptProtectedSecret(value) {
    const stored = String(value || '');
    if (!stored.startsWith('safe:')) return Boolean(stored);
    if (!this.isSafeStorageAvailable()) return false;
    try {
      return Boolean(safeStorage.decryptString(Buffer.from(stored.slice(5), 'base64')));
    } catch {
      return false;
    }
  }

  decodeClientSecret(value) {
    const stored = String(value || '');
    if (!stored) return '';
    if (!stored.startsWith('safe:')) return stored; // aceita a configuração legada para uma migração transparente
    if (!this.isSafeStorageAvailable()) return '';
    try { return safeStorage.decryptString(Buffer.from(stored.slice(5), 'base64')); }
    catch (error) {
      if (!this.unreadableSecrets.has(stored)) {
        this.unreadableSecrets.add(stored);
        console.error('[DriveSync] Não foi possível descriptografar o Client Secret protegido:', error.message);
      }
      return '';
    }
  }

  // --- CONFIGURAÇÃO E CREDENCIAIS ---
  getConfig() {
    const stateConfig = this.db ? this.db.getAllSyncState() : {};
    const rawStateSecret = stateConfig.client_secret || '';
    const dbSecret = rawStateSecret ? this.decodeClientSecret(rawStateSecret) : '';

    let fileConfig = {};
    let rawFileSecret = '';
    const candidatePaths = [this.configPath];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (raw.installed) {
            rawFileSecret = raw.client_secret_enc || raw.installed.client_secret || '';
            fileConfig = {
              client_id: raw.installed.client_id || '',
              folder_id: raw.folder_id || '',
              scope: raw.scope || '',
              sync_interval_sec: raw.sync_interval_sec
            };
          } else {
            rawFileSecret = raw.client_secret_enc || raw.client_secret || '';
            fileConfig = { ...fileConfig, ...raw };
          }
          break;
        } catch (e) {
          console.warn('[DriveSync] Erro ao ler arquivo de configuração:', p, e.message);
        }
      }
    }

    let clientSecret = dbSecret;
    if (!clientSecret && rawFileSecret) {
      clientSecret = this.decodeClientSecret(rawFileSecret);
      if (clientSecret && this.db && this.isSafeStorageAvailable()) {
        try {
          this.db.setSyncState('client_secret', this.encodeClientSecret(clientSecret));
        } catch {}
      }
    } else if (clientSecret && rawFileSecret && String(rawFileSecret).startsWith('safe:') && !this.canDecryptProtectedSecret(rawFileSecret) && this.isSafeStorageAvailable()) {
      try {
        const repaired = {
          client_id: stateConfig.client_id || fileConfig.client_id || '',
          client_secret_enc: this.encodeClientSecret(clientSecret),
          folder_id: this.extractFolderId(stateConfig.folder_id || fileConfig.folder_id || ''),
          scope: stateConfig.oauth_scope || fileConfig.scope || 'https://www.googleapis.com/auth/drive',
          sync_interval_sec: parseInt(stateConfig.sync_interval_sec || fileConfig.sync_interval_sec || '5', 10) || 5
        };
        fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
        fs.writeFileSync(this.configPath, JSON.stringify(repaired, null, 2), 'utf8');
      } catch {}
    }

    if (clientSecret) {
      this.credentialWarning = null;
    } else if ((rawStateSecret && String(rawStateSecret).startsWith('safe:')) || (rawFileSecret && String(rawFileSecret).startsWith('safe:'))) {
      this.credentialWarning = 'O Client Secret salvo anteriormente não pôde ser descriptografado neste ambiente. Reimporte o JSON OAuth ou informe novamente o Client Secret nas configurações.';
    } else {
      this.credentialWarning = null;
    }

    return {
      clientId: stateConfig.client_id || fileConfig.client_id || '',
      clientSecret: clientSecret || '',
      folderId: this.extractFolderId(stateConfig.folder_id || fileConfig.folder_id || ''),
      scope: stateConfig.oauth_scope || fileConfig.scope || 'https://www.googleapis.com/auth/drive',
      userEmail: stateConfig.user_email || '',
      userName: stateConfig.user_name || '',
      lastSyncTime: stateConfig.last_sync_time || null,
      autoSync: stateConfig.auto_sync !== 'false',
      syncIntervalSec: parseInt(stateConfig.sync_interval_sec || fileConfig.sync_interval_sec || '5', 10) || 5
    };
  }

  saveConfig(newConfig) {
    if (newConfig.clientId !== undefined) this.db.setSyncState('client_id', newConfig.clientId.trim());
    if (newConfig.clientSecret !== undefined) {
      const encoded = this.encodeClientSecret(newConfig.clientSecret);
      this.db.setSyncState('client_secret', encoded);
      this.unreadableSecrets.clear();
      this.credentialWarning = null;
    }
    if (newConfig.folderId !== undefined) {
      const cleanFolderId = this.extractFolderId(newConfig.folderId);
      this.db.setSyncState('folder_id', cleanFolderId);
    }
    if (newConfig.scope !== undefined) this.db.setSyncState('oauth_scope', newConfig.scope.trim());
    if (newConfig.autoSync !== undefined) this.db.setSyncState('auto_sync', String(newConfig.autoSync));
    if (newConfig.syncIntervalSec !== undefined) this.db.setSyncState('sync_interval_sec', String(newConfig.syncIntervalSec));

    const current = this.getConfig();
    // Salva também no arquivo local se for válido
    try {
      const clientSecret = newConfig.clientSecret !== undefined ? newConfig.clientSecret.trim() : current.clientSecret;
      const cfgToPersist = {
        client_id: newConfig.clientId !== undefined ? newConfig.clientId.trim() : current.clientId,
        client_secret_enc: clientSecret ? this.encodeClientSecret(clientSecret) : '',
        folder_id: newConfig.folderId !== undefined ? this.extractFolderId(newConfig.folderId) : current.folderId,
        scope: newConfig.scope !== undefined ? newConfig.scope.trim() : current.scope,
        sync_interval_sec: newConfig.syncIntervalSec !== undefined ? Number(newConfig.syncIntervalSec) : current.syncIntervalSec
      };
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(cfgToPersist, null, 2), 'utf8');
    } catch (e) {
      console.warn('[DriveSync] Não foi possível salvar em google-drive-config.json:', e.message);
    }

    this.updateStatus();
    return current;
  }

  setSyncInterval(seconds) {
    const sec = Math.max(5, Math.min(300, parseInt(seconds, 10) || 5));
    this.saveConfig({ syncIntervalSec: sec });
    this.syncIntervalMs = sec * 1000;
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = setInterval(() => {
        this.sync().catch(err => console.warn('[DriveSync] Aviso na sincronização periódica:', err.message));
      }, this.syncIntervalMs);
    }
    return { success: true, syncIntervalSec: sec };
  }

  // Criptografia segura de tokens via safeStorage do Electron
  getStoredTokens() {
    const encTokens = this.db.getSyncState('oauth_tokens_enc');
    if (!encTokens) return null;
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encTokens, 'base64');
        const decrypted = safeStorage.decryptString(buffer);
        return JSON.parse(decrypted);
      } else {
        // Fallback para ambiente de desenvolvimento sem DPAPI
        const buffer = Buffer.from(encTokens, 'base64');
        return JSON.parse(buffer.toString('utf8'));
      }
    } catch (err) {
      if (!this.unreadableTokens.has(encTokens)) {
        this.unreadableTokens.add(encTokens);
        console.error('[DriveSync] Erro ao descriptografar tokens:', err.message || err);
      }
      return null;
    }
  }

  saveTokens(tokens) {
    try {
      const jsonStr = JSON.stringify(tokens);
      let encTokens = '';
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(jsonStr);
        encTokens = buffer.toString('base64');
      } else {
        encTokens = Buffer.from(jsonStr, 'utf8').toString('base64');
      }
      this.db.setSyncState('oauth_tokens_enc', encTokens);
      this.unreadableTokens.clear();
      if (tokens.user_email) this.db.setSyncState('user_email', tokens.user_email);
      if (tokens.user_name) this.db.setSyncState('user_name', tokens.user_name);
    } catch (err) {
      console.error('[DriveSync] Erro ao salvar tokens criptografados:', err);
    }
  }

  clearTokens() {
    this.db.setSyncState('oauth_tokens_enc', '');
    this.db.setSyncState('user_email', '');
    this.db.setSyncState('user_name', '');
    this.unreadableTokens.clear();
    this.status = 'Não configurado';
    this.notifyStatus();
  }

  // --- FLUXO OFICIAL OAUTH 2.0 COM PKCE E NAVEGADOR DO SISTEMA ---
  async startOAuthFlow() {
    const config = this.getConfig();
    if (!config.clientId) {
      throw new Error('Client ID do Google Cloud não configurado. Por favor, informe nas configurações.');
    }

    return new Promise((resolve, reject) => {
      // 1. Gera parâmetros PKCE
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      const state = crypto.randomBytes(16).toString('hex');
      let redirectUri = '';

      // 2. Inicia servidor HTTP efêmero local para receber o redirecionamento
      const server = http.createServer(async (req, res) => {
        try {
          const reqUrl = url.parse(req.url, true);

          if (reqUrl.pathname === '/favicon.ico') {
            res.writeHead(204);
            res.end();
            return;
          }

          if (reqUrl.pathname === '/oauth2callback' || reqUrl.pathname === '/') {
            const query = reqUrl.query;

            if (query.error) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`<h2>Erro de autorização do Google: ${query.error}</h2><p>Você pode fechar esta aba.</p>`);
              server.close();
              reject(new Error(`Autorização cancelada ou recusada: ${query.error}`));
              return;
            }

            if (query.state !== state) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<h2>Falha de segurança: state inválido</h2>');
              server.close();
              reject(new Error('State CSRF inválido'));
              return;
            }

            const authCode = query.code;

            // Troca o código por tokens
            const tokens = await this.exchangeCodeForTokens(authCode, codeVerifier, redirectUri);

            // Obtém perfil do usuário logado
            const userInfo = await this.fetchUserInfo(tokens.access_token);
            tokens.user_email = userInfo.email || '';
            tokens.user_name = userInfo.name || '';

            this.saveTokens(tokens);

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f8fafc;">
                  <h2 style="color: #16a34a;">✓ Conta Google Conectada com Sucesso!</h2>
                  <p>A conta <strong>${userInfo.email || ''}</strong> foi autorizada.</p>
                  <p>Você já pode fechar esta janela e voltar ao aplicativo Controle de PIX.</p>
                </body>
              </html>
            `);

            server.close();
            this.updateStatus();
            resolve({ success: true, email: userInfo.email });
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h2>Erro interno ao processar autorização: ${err.message}</h2>`);
          server.close();
          reject(err);
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

        // URL de autorização OAuth 2.0 Google
        const scopes = [
          config.scope || 'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile'
        ];

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(config.clientId)}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(scopes.join(' '))}&` +
          `code_challenge=${encodeURIComponent(codeChallenge)}&` +
          `code_challenge_method=S256&` +
          `state=${encodeURIComponent(state)}&` +
          `access_type=offline&` +
          `prompt=consent`;

        // Abre no navegador do sistema operacional
        shell.openExternal(authUrl);
      });

      // Timeout após 3 minutos
      setTimeout(() => {
        try {
          server.close();
          reject(new Error('Tempo limite de autorização excedido.'));
        } catch (e) {}
      }, 180000);
    });
  }

  async exchangeCodeForTokens(code, codeVerifier, redirectUri) {
    const config = this.getConfig();
    const tokenUrl = 'https://oauth2.googleapis.com/token';

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error_description || data.error || 'Falha ao trocar código OAuth por token.');
    }

    data.expires_at = Date.now() + (data.expires_in * 1000);
    return data;
  }

  async fetchUserInfo(accessToken) {
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.warn('[DriveSync] Aviso ao obter informações de perfil:', e.message);
    }
    return {};
  }

  async getValidAccessToken() {
    let tokens = this.getStoredTokens();
    if (!tokens || !tokens.access_token) return null;

    // Se estiver a menos de 60 segundos de expirar, atualiza via refresh_token
    if (tokens.expires_at && Date.now() > (tokens.expires_at - 60000)) {
      if (!tokens.refresh_token) {
        throw new Error('Token expirado e sem refresh_token. Reconecte a conta Google.');
      }
      tokens = await this.refreshAccessToken(tokens.refresh_token);
    }

    return tokens.access_token;
  }

  async refreshAccessToken(refreshToken) {
    const config = this.getConfig();
    const tokenUrl = 'https://oauth2.googleapis.com/token';

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await resp.json();
    if (!resp.ok) {
      if (data.error === 'invalid_grant' || (data.error_description && data.error_description.includes('Token has been expired or revoked'))) {
        throw new Error('invalid_grant: A autorização da conta Google expirou ou foi revogada. Faça uma nova autorização clicando em Reconectar Conta Google.');
      }
      throw new Error(data.error_description || data.error || 'Erro ao renovar token de acesso.');
    }

    const currentTokens = this.getStoredTokens() || {};
    const updated = {
      ...currentTokens,
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in * 1000)
    };
    if (data.refresh_token) updated.refresh_token = data.refresh_token;

    this.saveTokens(updated);
    return updated;
  }

  // --- VALIDAÇÃO DE ACESSO À PASTA COMPARTILHADA DO GOOGLE DRIVE ---
  async validateFolderAccess(folderId) {
    const accessToken = await this.getValidAccessToken();
    if (!accessToken) throw new Error('Não autenticado com o Google.');

    const cleanFolderId = (folderId || '').trim();
    if (!cleanFolderId) throw new Error('Identificador da pasta do Google Drive não informado.');

    // Consulta metadados e permissões da pasta via API
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${cleanFolderId}?fields=id,name,mimeType,capabilities,shared,owners`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (resp.status === 404) {
      throw new Error('Pasta não encontrada no Google Drive ou a conta conectada não possui permissão para acessá-la.');
    }

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error?.message || `Erro ao acessar pasta (Status ${resp.status})`);
    }

    const folderData = await resp.json();
    if (folderData.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error('O identificador informado não corresponde a uma pasta do Google Drive.');
    }

    // Verifica permissão de escrita
    if (folderData.capabilities && !folderData.capabilities.canAddChildren) {
      throw new Error('A conta conectada possui apenas permissão de leitura nesta pasta. Solicite permissão de editor ao proprietário da pasta.');
    }

    return {
      valid: true,
      folderName: folderData.name,
      folderId: folderData.id
    };
  }

  // --- UTILITÁRIOS DE CHAVE E NOME DE ARQUIVOS ---
  normalizeLotericaName(rawName) {
    if (!rawName || typeof rawName !== 'string') return '';
    const clean = rawName.replace(/_/g, ' ').replace(/\s+/g, ' ').toUpperCase().trim();
    // Equivalência de acentuação exclusivamente para CAÇULA / CACULA
    if (clean === 'CACULA' || clean === 'CAÇULA') return 'CAÇULA';
    return clean;
  }

  getFileKey(loterica, ano, mes) {
    const canonical = this.normalizeLotericaName(loterica);
    const norm = canonical.replace(/\s+/g, '_');
    return `${norm}_${Number(ano)}_${Number(mes)}`;
  }

  getFileName(loterica, ano, mes) {
    const key = this.getFileKey(loterica, ano, mes);
    return `pix_data_${key}.json`;
  }

  getSnapshotFileName(loterica, ano, mes, versionId) {
    const key = this.getFileKey(loterica, ano, mes);
    return `pix_snap_${key}_${versionId}.json`;
  }

  // --- NOMENCLATURA PADRONIZADA LIMPA E ESTRUTURA DE PASTAS (OBJETIVOS 4 & 5) ---
  getCleanLotericaName(rawName) {
    const canonical = this.normalizeLotericaName(rawName);
    return canonical.replace(/Ç/g, 'C').replace(/\s+/g, '_');
  }

  getStandardDataFileName(loterica, ano, mes) {
    const cleanLot = this.getCleanLotericaName(loterica);
    return `dados_${cleanLot}_${Number(ano)}_${Number(mes)}.json`;
  }

  getStandardSnapshotFileName(loterica, ano, mes, versionId) {
    const cleanLot = this.getCleanLotericaName(loterica);
    return `snap_${cleanLot}_${Number(ano)}_${Number(mes)}_${versionId}.json`;
  }

  getStructuredFolderPath(loterica, ano, mes, isHistory = false) {
    const cleanLot = this.getCleanLotericaName(loterica);
    // folderId is already the Dados_Controle_PIX root; don't create a duplicate level.
    const parts = [cleanLot, String(ano), String(mes).padStart(2, '0')];
    if (isHistory) parts.push('historico');
    return parts;
  }

  getStructuredRelativePath(loterica, ano, mes, fileName, isHistory = false) {
    const folderParts = this.getStructuredFolderPath(loterica, ano, mes, isHistory);
    return `${folderParts.join('/')}/${fileName}`;
  }

  parseFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') return null;
    const cleanName = fileName.trim();

    // 1. Tenta formato de snapshot imutável: pix_snap_<LOTERICA>_<ANO>_<MES>_<VERSION_ID>.json
    // Também aceita nomenclatura normalizada curta: snap_<LOTERICA>_<ANO>_<MES>_<VERSION_ID>.json
    const snapMatch = cleanName.match(/^(?:pix_snap|snap)_([A-Za-z0-9\u00C0-\u00FF]+(?:[ _][A-Za-z0-9\u00C0-\u00FF]+)*)_(\d{4})_(\d{1,2})_(v_?[A-Za-z0-9\u00C0-\u00FF_.-]+)\.json$/i);
    if (snapMatch) {
      const rawLoterica = snapMatch[1];
      const loterica = this.normalizeLotericaName(rawLoterica);
      if (!loterica) return null;
      const ano = parseInt(snapMatch[2], 10);
      const mes = parseInt(snapMatch[3], 10);
      const versionId = snapMatch[4];

      if (isNaN(ano) || ano < 2000 || ano > 2100) return null;
      if (isNaN(mes) || mes < 1 || mes > 12) return null;

      return {
        isSnapshot: true,
        type: 'immutable',
        loterica,
        ano,
        mes,
        versionId,
        fileKey: this.getFileKey(loterica, ano, mes)
      };
    }

    // 2. Tenta formato legado compatível: pix_data_<LOTERICA>_<ANO>_<MES>.json
    // Também aceita nomenclatura normalizada curta: dados_<LOTERICA>_<ANO>_<MES>.json
    const legacyMatch = cleanName.match(/^(?:pix_data|dados)_([A-Za-z0-9\u00C0-\u00FF]+(?:[ _][A-Za-z0-9\u00C0-\u00FF]+)*)_(\d{4})_(\d{1,2})\.json$/i);
    if (legacyMatch) {
      const rawLoterica = legacyMatch[1];
      const loterica = this.normalizeLotericaName(rawLoterica);
      if (!loterica) return null;
      const ano = parseInt(legacyMatch[2], 10);
      const mes = parseInt(legacyMatch[3], 10);

      if (isNaN(ano) || ano < 2000 || ano > 2100) return null;
      if (isNaN(mes) || mes < 1 || mes > 12) return null;

      return {
        isSnapshot: false,
        type: 'legacy',
        loterica,
        ano,
        mes,
        versionId: null,
        fileKey: this.getFileKey(loterica, ano, mes)
      };
    }

    return null;
  }

  // --- MOTOR DE ANCESTRALIDADE E GRAFO DE SNAPSHOTS (DAG) ---
  buildSnapshotDAG(snapshotsList = [], legacyDoc = null) {
    const snapshotsMap = {};
    const parentsOf = {};
    const childrenOf = {};

    const list = [...snapshotsList];

    // Se houver um documento legado e nenhum snapshot imutável, o legado é a raiz do grafo
    if (list.length === 0 && legacyDoc && legacyDoc.entries) {
      const rootId = legacyDoc.version_id || 'v_root_legacy';
      list.push({
        version_id: rootId,
        version_num: Number(legacyDoc.version_num || 1),
        base_version_id: null,
        parent_version_ids: [],
        created_at: legacyDoc.updated_at || new Date().toISOString(),
        updated_at: legacyDoc.updated_at || new Date().toISOString(),
        updated_by: legacyDoc.updated_by || { device_name: 'Legado' },
        summary: legacyDoc.summary || 'Versão inicial legada',
        entries: legacyDoc.entries || {}
      });
    }

    for (const s of list) {
      if (!s || !s.version_id) continue;
      snapshotsMap[s.version_id] = s;
      if (!childrenOf[s.version_id]) childrenOf[s.version_id] = [];

      let parents = [];
      if (Array.isArray(s.parent_version_ids) && s.parent_version_ids.length > 0) {
        parents = s.parent_version_ids.filter(Boolean);
      } else if (s.base_version_id) {
        parents = [s.base_version_id];
      }
      parentsOf[s.version_id] = parents;

      for (const p of parents) {
        if (!childrenOf[p]) childrenOf[p] = [];
        childrenOf[p].push(s.version_id);
      }
    }

    // Unificação de nós gêmeos (Twin Merges concorrentes com mesmos pais e mesmo conteúdo)
    const allNodeIds = Object.keys(snapshotsMap);
    const subsumedTwinIds = new Set();

    for (let i = 0; i < allNodeIds.length; i++) {
      const idA = allNodeIds[i];
      const nodeA = snapshotsMap[idA];
      const pA = parentsOf[idA] || [];
      if (pA.length === 0) continue;

      for (let j = i + 1; j < allNodeIds.length; j++) {
        const idB = allNodeIds[j];
        const nodeB = snapshotsMap[idB];
        const pB = parentsOf[idB] || [];
        if (pA.length !== pB.length) continue;

        const sameParents = pA.every(p => pB.includes(p));
        if (sameParents && this.areEntriesEquivalent(nodeA.entries, nodeB.entries)) {
          // idA e idB são nós gêmeos! Unifica os filhos de ambos
          const combinedChildren = [...new Set([...(childrenOf[idA] || []), ...(childrenOf[idB] || [])])];
          childrenOf[idA] = combinedChildren;
          childrenOf[idB] = combinedChildren;

          // Escolhe o canônico determinísticamente (menor version_id lexicográfico)
          const canonicalId = idA < idB ? idA : idB;
          const subsumedId = idA < idB ? idB : idA;
          subsumedTwinIds.add(subsumedId);
        }
      }
    }

    // Identifica todos os nós Folha / Heads (nós que não são pais de nenhum outro nó e não foram subsumidos)
    let heads = allNodeIds
      .filter(id => !subsumedTwinIds.has(id) && (!childrenOf[id] || childrenOf[id].length === 0))
      .map(id => snapshotsMap[id]);

    // Ordena as cabeças por número de versão decrescente e timestamp
    heads.sort((a, b) => (b.version_num || 0) - (a.version_num || 0) || String(b.created_at).localeCompare(String(a.created_at)));

    return {
      snapshotsMap,
      parentsOf,
      childrenOf,
      heads,
      subsumedTwinIds,
      converged: heads.length === 1,
      head: heads[0] || null
    };
  }

  // Compara equivalência de conteúdo entre dois conjuntos de lançamentos
  areEntriesEquivalent(entriesA = {}, entriesB = {}) {
    if (!entriesA || !entriesB) return entriesA === entriesB;
    const keysA = Object.keys(entriesA);
    const keysB = Object.keys(entriesB);
    if (keysA.length !== keysB.length) return false;

    for (const k of keysA) {
      const itemA = entriesA[k];
      const itemB = entriesB[k];
      if (!itemB) return false;
      if (Number(itemA.valor) !== Number(itemB.valor)) return false;
      if (Boolean(itemA.deleted) !== Boolean(itemB.deleted)) return false;
      if (String(itemA.tipo || '') !== String(itemB.tipo || '')) return false;
      if (Number(itemA.dia || 0) !== Number(itemB.dia || 0)) return false;
      if (String(itemA.funcionario || '').trim() !== String(itemB.funcionario || '').trim()) return false;
      if (String(itemA.cliente || '').trim() !== String(itemB.cliente || '').trim()) return false;
      if (String(itemA.status || '') !== String(itemB.status || '')) return false;
    }
    return true;
  }

  findCommonAncestor(headA, headB, snapshotsMap, parentsOf) {
    if (!headA || !headB) return null;
    if (headA.version_id === headB.version_id) return headA;

    // Coleta todos os ancestrais de headA (inclusive headA)
    const ancestorsA = new Set();
    const queueA = [headA.version_id];
    while (queueA.length > 0) {
      const curr = queueA.shift();
      if (!ancestorsA.has(curr)) {
        ancestorsA.add(curr);
        const parents = parentsOf[curr] || [];
        for (const p of parents) queueA.push(p);
      }
    }

    // Busca o ancestral mais recente de headB que também seja ancestral de headA
    const queueB = [headB.version_id];
    const visitedB = new Set();
    while (queueB.length > 0) {
      const curr = queueB.shift();
      if (ancestorsA.has(curr) && curr !== headA.version_id && curr !== headB.version_id) {
        return snapshotsMap[curr] || null;
      }
      if (!visitedB.has(curr)) {
        visitedB.add(curr);
        const parents = parentsOf[curr] || [];
        for (const p of parents) queueB.push(p);
      }
    }

    return null;
  }

  // --- POLÍTICA DE RETENÇÃO E PRUNING SEGURO DE HISTÓRICO (OBJETIVO 5) ---
  identifyPrunableSnapshots(snapshotsList = [], options = {}) {
    const minRetention = options.minRetention !== undefined ? options.minRetention : 50;
    const gracePeriodMs = options.gracePeriodMs !== undefined ? options.gracePeriodMs : (48 * 3600 * 1000); // 48h
    const now = options.now !== undefined ? options.now : Date.now();

    if (!Array.isArray(snapshotsList) || snapshotsList.length <= minRetention) {
      return {
        prunable: [],
        kept: snapshotsList || [],
        protectedIds: (snapshotsList || []).map(s => s.version_id).filter(Boolean)
      };
    }

    const dag = this.buildSnapshotDAG(snapshotsList);
    const protectedIds = new Set();

    // 1. Proteger todas as cabeças ativas (heads)
    for (const h of dag.heads) {
      if (h && h.version_id) protectedIds.add(h.version_id);
    }

    // 2. Proteger nós subsumidos (twin merges)
    if (dag.subsumedTwinIds) {
      for (const id of dag.subsumedTwinIds) protectedIds.add(id);
    }

    // 3. Proteger ancestrais comuns mais recentes (LCA) entre qualquer par de cabeças em caso de bifurcação
    if (dag.heads.length > 1) {
      for (let i = 0; i < dag.heads.length; i++) {
        for (let j = i + 1; j < dag.heads.length; j++) {
          const lca = this.findCommonAncestor(dag.heads[i], dag.heads[j], dag.snapshotsMap, dag.parentsOf);
          if (lca && lca.version_id) protectedIds.add(lca.version_id);
        }
      }
    }

    // 4. Proteger a janela mais recente de minRetention versões ordenadas por version_num decrescente
    const sorted = [...snapshotsList].sort((a, b) => {
      const vA = Number(a.version_num || 0);
      const vB = Number(b.version_num || 0);
      if (vA !== vB) return vB - vA;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

    const recentWindow = sorted.slice(0, minRetention);
    for (const s of recentWindow) {
      if (s && s.version_id) protectedIds.add(s.version_id);
    }

    // 5. Proteger snapshots dentro do período de tolerância/carência ou marcados como restore point
    for (const s of snapshotsList) {
      if (!s || !s.version_id) continue;
      if (s.is_restore_point || s.pinned) {
        protectedIds.add(s.version_id);
      }
      if (s.created_at) {
        const time = new Date(s.created_at).getTime();
        if (!isNaN(time) && (now - time) < gracePeriodMs) {
          protectedIds.add(s.version_id);
        }
      }
    }

    // 6. Proteger ancestrais diretos da janela recente para manter continuidade do histórico
    for (const s of recentWindow) {
      if (!s || !s.version_id) continue;
      const parents = dag.parentsOf[s.version_id] || [];
      for (const p of parents) {
        if (p) protectedIds.add(p);
      }
    }

    const prunable = [];
    const kept = [];

    for (const s of snapshotsList) {
      if (!s || !s.version_id) continue;
      if (protectedIds.has(s.version_id)) {
        kept.push(s);
      } else {
        prunable.push(s);
      }
    }

    return {
      prunable,
      kept,
      protectedIds: Array.from(protectedIds)
    };
  }

  async pruneRemoteSnapshots(folderId, loterica, ano, mes, accessToken, options = {}) {
    const dryRun = options.dryRun !== false; // Padrão seguro: dry-run ativado!
    const key = this.getFileKey(loterica, ano, mes);
    const remoteFiles = await this.listAllRemoteFilesRecursive(folderId, accessToken);

    const snapshotFiles = remoteFiles.filter(f => {
      const p = this.parseFileName(f.name);
      return p && p.isSnapshot && p.fileKey === key;
    });

    const snapshotsList = [];
    const fileByVersionId = {};

    for (const f of snapshotFiles) {
      const content = await this.downloadFileContent(f.id, accessToken);
      if (content && content.version_id) {
        snapshotsList.push(content);
        fileByVersionId[content.version_id] = f;
      }
    }

    const analysis = this.identifyPrunableSnapshots(snapshotsList, options);
    const toDelete = analysis.prunable.map(s => ({
      version_id: s.version_id,
      version_num: s.version_num,
      file: fileByVersionId[s.version_id]
    })).filter(item => item.file);

    const deleted = [];
    if (!dryRun) {
      for (const item of toDelete) {
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${item.file.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (resp.ok) {
          deleted.push(item);
        }
      }
    }

    return {
      dryRun,
      totalSnapshots: snapshotsList.length,
      keptCount: analysis.kept.length,
      prunableCount: toDelete.length,
      deletedCount: deleted.length,
      prunable: toDelete.map(d => ({
        version_id: d.version_id,
        version_num: d.version_num,
        fileName: d.file.name,
        fileId: d.file.id
      }))
    };
  }

  // --- RECONCILIAÇÃO TRILATERAL (3-WAY MERGE) DE CABEÇAS CONCORRENTES ---
  threeWayMerge(baseEntries, headAEntries, headBEntries) {
    const baseMap = baseEntries || {};
    const aMap = headAEntries || {};
    const bMap = headBEntries || {};

    const allIds = new Set([
      ...Object.keys(baseMap),
      ...Object.keys(aMap),
      ...Object.keys(bMap)
    ]);

    const merged = {};
    const conflicts = [];

    const isSameEntry = (e1, e2) => {
      if (!e1 && !e2) return true;
      if (!e1 || !e2) return false;
      return (
        Math.round(Number(e1.valor) * 100) === Math.round(Number(e2.valor) * 100) &&
        String(e1.tipo || '').toLowerCase().trim() === String(e2.tipo || '').toLowerCase().trim() &&
        Number(e1.dia) === Number(e2.dia) &&
        String(e1.funcionario || '').trim() === String(e2.funcionario || '').trim() &&
        String(e1.cliente || '').trim() === String(e2.cliente || '').trim() &&
        String(e1.status || '').toLowerCase().trim() === String(e2.status || '').toLowerCase().trim() &&
        String(e1.observacoes || '').trim() === String(e2.observacoes || '').trim() &&
        Boolean(e1.deleted) === Boolean(e2.deleted)
      );
    };

    for (const id of allIds) {
      const base = baseMap[id];
      const a = aMap[id];
      const b = bMap[id];

      // 1. Ambos os lados têm o mesmo valor / estado
      if (isSameEntry(a, b)) {
        if (a) merged[id] = { ...a };
        continue;
      }

      // 2. Head A alterou, Head B não tocou em relação à base
      if (isSameEntry(b, base) && !isSameEntry(a, base)) {
        if (a) merged[id] = { ...a };
        continue;
      }

      // 3. Head B alterou, Head A não tocou em relação à base
      if (isSameEntry(a, base) && !isSameEntry(b, base)) {
        if (b) merged[id] = { ...b };
        continue;
      }

      // 4. Adicionado em A somente (não existe na base nem em B)
      if (a && !base && !b) {
        merged[id] = { ...a };
        continue;
      }

      // 5. Adicionado em B somente (não existe na base nem em A)
      if (b && !base && !a) {
        merged[id] = { ...b };
        continue;
      }

      // 6. Excluído em A, intocado em B
      if ((!a || a.deleted) && isSameEntry(b, base)) {
        if (a) merged[id] = { ...a, deleted: 1 };
        continue;
      }

      // 7. Excluído em B, intocado em A
      if ((!b || b.deleted) && isSameEntry(a, base)) {
        if (b) merged[id] = { ...b, deleted: 1 };
        continue;
      }

      // 8. CONFLITO REAL: Ambos os lados alteraram o mesmo registro de forma diferente em relação à base!
      conflicts.push({
        id,
        base: base || null,
        entryA: a || null,
        entryB: b || null
      });

      // Preserva a informação de ambos mantendo provisoriamente a de A no mapa mesclado
      if (a) merged[id] = { ...a };
      else if (b) merged[id] = { ...b };
    }

    return {
      mergedEntries: merged,
      conflicts,
      hasConflict: conflicts.length > 0
    };
  }

  // --- PUBLICAÇÃO DE SNAPSHOT IMUTÁVEL (files.create) ---
  async publishSnapshot({
    loterica,
    ano,
    mes,
    versionNum,
    versionId,
    baseVersionId,
    parentVersionIds = [],
    summaryText,
    entriesMap,
    accessToken,
    folderId,
    remoteFilesList = []
  }) {
    const key = this.getFileKey(loterica, ano, mes);
    const snapFileName = this.getStandardSnapshotFileName(loterica, ano, mes, versionId);
    const legacySnapFileName = this.getSnapshotFileName(loterica, ano, mes, versionId);
    const identity = this.db.getDeviceIdentity();
    const config = this.getConfig();

    const snapshotDoc = {
      schema_version: 3,
      snapshot_type: 'immutable_version',
      loterica,
      ano: Number(ano),
      mes: Number(mes),
      version_num: versionNum,
      version_id: versionId,
      base_version_id: baseVersionId || null,
      parent_version_ids: Array.isArray(parentVersionIds) && parentVersionIds.length > 0
        ? parentVersionIds
        : (baseVersionId ? [baseVersionId] : []),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: {
        device_id: identity.deviceId,
        device_name: identity.deviceName,
        user_email: config.userEmail || ''
      },
      summary: summaryText,
      entries: entriesMap,
      history: [
        {
          version_num: versionNum,
          version_id: versionId,
          updated_at: new Date().toISOString(),
          updated_by: {
            device_name: identity.deviceName,
            user_email: config.userEmail || ''
          },
          summary: summaryText,
          changes_count: Object.keys(entriesMap).length
        }
      ]
    };

    // Determina pasta de destino estruturada (historico) se disponível
    let targetFolderId = folderId;
    try {
      const cleanLot = this.getCleanLotericaName(loterica);
      const mesPad = String(mes).padStart(2, '0');
      targetFolderId = await this.resolveStructuredFolderId(folderId, [cleanLot, String(ano), mesPad, 'historico'], accessToken);
    } catch {
      targetFolderId = folderId;
    }

    // IDEMPOTÊNCIA: Se o arquivo já existe no Drive (ex: repetição por falha de rede), não duplica
    let fileResult = remoteFilesList.find(f => f.name === snapFileName || f.name === legacySnapFileName);
    if (!fileResult) {
      fileResult = await this.createFileInFolder(targetFolderId, snapFileName, snapshotDoc, accessToken);
    }

    // Salva no SQLite local
    this.db.saveVersionHistory({
      id: `vh_${versionId}`,
      file_key: key,
      loterica,
      ano: Number(ano),
      mes: Number(mes),
      version_num: versionNum,
      version_id: versionId,
      base_version_id: baseVersionId || null,
      created_at: snapshotDoc.created_at,
      device_id: identity.deviceId,
      device_name: identity.deviceName,
      user_email: config.userEmail || '',
      summary: summaryText,
      changes: { parent_version_ids: snapshotDoc.parent_version_ids },
      snapshot: entriesMap
    });

    this.db.setSyncState(`last_version_id_${key}`, versionId);
    this.db.setSyncState(`last_version_num_${key}`, versionNum);
    delete this.pendingRemoteUpdates[key];

    return { fileResult, snapshotDoc };
  }

  // --- MOTOR DE COMPARAÇÃO (DIFF) DETALHADO CAMPO A CAMPO ---
  computeDiff(localEntriesList, remoteEntriesMap) {
    const localMap = {};
    for (const e of localEntriesList) {
      localMap[e.id] = e;
    }

    const remoteMap = remoteEntriesMap || {};
    const added = [];
    const updated = [];
    const deleted = [];
    const fieldDiffs = {};

    const allIds = new Set([...Object.keys(localMap), ...Object.keys(remoteMap)]);

    for (const id of allIds) {
      const local = localMap[id];
      const remote = remoteMap[id];

      if (!local && remote) {
        if (!remote.deleted) {
          added.push(remote);
        }
      } else if (local && !remote) {
        // Registro existe somente no local
      } else if (local && remote) {
        if (!local.deleted && remote.deleted) {
          deleted.push({ ...remote, localEntry: local });
        } else if (local.deleted && !remote.deleted) {
          // Excluído no local mas ativo no remoto
        } else if (!local.deleted && !remote.deleted) {
          const diffs = [];
          if (Math.round(Number(local.valor) * 100) !== Math.round(Number(remote.valor) * 100)) {
            diffs.push({ field: 'valor', label: 'Valor', localVal: local.valor, remoteVal: remote.valor });
          }
          if (String(local.tipo || '').toLowerCase() !== String(remote.tipo || '').toLowerCase()) {
            diffs.push({ field: 'tipo', label: 'Tipo', localVal: local.tipo, remoteVal: remote.tipo });
          }
          if (Number(local.dia) !== Number(remote.dia)) {
            diffs.push({ field: 'dia', label: 'Dia', localVal: local.dia, remoteVal: remote.dia });
          }
          if (String(local.funcionario || '').trim() !== String(remote.funcionario || '').trim()) {
            diffs.push({ field: 'funcionario', label: 'Funcionário', localVal: local.funcionario, remoteVal: remote.funcionario });
          }
          if (String(local.cliente || '').trim() !== String(remote.cliente || '').trim()) {
            diffs.push({ field: 'cliente', label: 'Cliente', localVal: local.cliente, remoteVal: remote.cliente });
          }
          if (String(local.status || '').toLowerCase().trim() !== String(remote.status || '').toLowerCase().trim()) {
            diffs.push({ field: 'status', label: 'Status', localVal: local.status, remoteVal: remote.status });
          }
          if (String(local.observacoes || '').trim() !== String(remote.observacoes || '').trim()) {
            diffs.push({ field: 'observacoes', label: 'Observações', localVal: local.observacoes, remoteVal: remote.observacoes });
          }

          if (diffs.length > 0) {
            updated.push({ id, local, remote, diffs });
            fieldDiffs[id] = diffs;
          }
        }
      }
    }

    const totalChanges = added.length + updated.length + deleted.length;
    const parts = [];
    if (added.length > 0) parts.push(`${added.length} novo(s)`);
    if (updated.length > 0) parts.push(`${updated.length} alteração(ões)`);
    if (deleted.length > 0) parts.push(`${deleted.length} exclusão(ões)`);
    const summary = parts.length > 0 ? parts.join(', ') : 'Nenhuma alteração detectada';

    return {
      added,
      updated,
      deleted,
      fieldDiffs,
      totalChanges,
      summary
    };
  }

  // --- SINCRONIZAÇÃO COMPLETA: PULL INTELIGENTE + MERGE + PUSH ---
  async sync(options = {}) {
    if (this.isSyncing) {
      console.log('[DriveSync] Sincronização já em andamento. Aguardando conclusão.');
      return { status: 'already_running' };
    }

    const config = this.getConfig();
    const tokens = this.getStoredTokens();

    if (!tokens || !tokens.access_token || !config.folderId) {
      this.status = 'Não configurado';
      this.notifyStatus();
      return { status: 'not_configured' };
    }

    this.isSyncing = true;
    this.status = 'Sincronizando';
    this.notifyStatus();

    try {
      const accessToken = await this.getValidAccessToken();
      const folderId = config.folderId.trim();

      // 1. Valida permissão na pasta
      const folderInfo = await this.validateFolderAccess(folderId);
      if (this.normalizeLotericaName(folderInfo.folderName) === 'DADOS CONTROLE PIX') {
        await this.flattenDuplicateDataRoot(folderId, accessToken);
      }

      // 2. Busca lista de arquivos remotos da pasta (recursivamente para encontrar estrutura organizada)
      const remoteFiles = await this.listAllRemoteFilesRecursive(folderId, accessToken);

      let pulledCount = 0;
      let conflictCount = 0;
      let pushedCount = 0;

      // 3. PULL INTELIGENTE E RECONCILIAÇÃO POR DAG DE SNAPSHOTS IMUTÁVEIS
      const filesByKey = {};
      for (const file of remoteFiles) {
        const fileInfo = this.parseFileName(file.name);
        if (!fileInfo) continue;
        const key = fileInfo.fileKey;
        if (!filesByKey[key]) filesByKey[key] = [];
        filesByKey[key].push({ file, fileInfo });
      }

      // Garante que chaves com alterações locais pendentes também sejam avaliadas
      const pendingQueue = this.db.getPendingSyncQueue();
      for (const q of pendingQueue) {
        try {
          const payload = JSON.parse(q.payload);
          const key = this.getFileKey(payload.loterica, payload.ano, payload.mes);
          if (!filesByKey[key]) filesByKey[key] = [];
        } catch {}
      }

      const dagsByKey = {};

      for (const key of Object.keys(filesByKey)) {
        const fileGroup = filesByKey[key];
        const snapFiles = fileGroup.filter(f => f.fileInfo.isSnapshot);
        const legacyFile = fileGroup.find(f => !f.fileInfo.isSnapshot);

        let loterica = '', ano = 0, mes = 0;
        if (fileGroup.length > 0) {
          loterica = fileGroup[0].fileInfo.loterica;
          ano = fileGroup[0].fileInfo.ano;
          mes = fileGroup[0].fileInfo.mes;
        } else {
          const parts = key.split('_');
          mes = Number(parts.pop());
          ano = Number(parts.pop());
          loterica = this.normalizeLotericaName(parts.join('_'));
        }

        const snapshotsList = [];

        // Carrega os snapshots imutáveis (usa cache SQLite sempre que possível para evitar downloads desnecessários)
        for (const sf of snapFiles) {
          const versionId = sf.fileInfo.versionId;
          let snapDoc = this.db.getVersionById(versionId);

          if (!snapDoc || !snapDoc.snapshot) {
            snapDoc = await this.downloadFileContent(sf.file.id, accessToken);
            if (snapDoc && snapDoc.entries) {
              this.db.saveVersionHistory({
                id: `vh_${snapDoc.version_id}`,
                file_key: key,
                loterica,
                ano,
                mes,
                version_num: Number(snapDoc.version_num || 1),
                version_id: snapDoc.version_id,
                base_version_id: snapDoc.base_version_id || null,
                created_at: snapDoc.created_at || snapDoc.updated_at || new Date().toISOString(),
                device_id: snapDoc.updated_by?.device_id || '',
                device_name: snapDoc.updated_by?.device_name || 'Outro Computador',
                user_email: snapDoc.updated_by?.user_email || '',
                summary: snapDoc.summary || '',
                changes: { parent_version_ids: snapDoc.parent_version_ids || [] },
                snapshot: snapDoc.entries
              });
            }
          } else {
            snapDoc = {
              version_id: snapDoc.version_id,
              version_num: Number(snapDoc.version_num || 1),
              base_version_id: snapDoc.base_version_id,
              parent_version_ids: snapDoc.changes?.parent_version_ids || (snapDoc.base_version_id ? [snapDoc.base_version_id] : []),
              created_at: snapDoc.created_at,
              updated_at: snapDoc.created_at,
              updated_by: {
                device_id: snapDoc.device_id,
                device_name: snapDoc.device_name,
                user_email: snapDoc.user_email
              },
              summary: snapDoc.summary,
              entries: snapDoc.snapshot
            };
          }

          if (snapDoc && snapDoc.entries) {
            snapshotsList.push(snapDoc);
          }
        }

        // Se não houver snapshots imutáveis mas existir arquivo legado compatível (pix_data_...):
        let legacyDoc = null;
        if (snapshotsList.length === 0 && legacyFile) {
          legacyDoc = await this.downloadFileContent(legacyFile.file.id, accessToken);
        }

        // Constrói o DAG de snapshots
        const dag = this.buildSnapshotDAG(snapshotsList, legacyDoc);
        dagsByKey[key] = dag;

        const lastAppliedVersionId = this.db.getSyncState(`last_version_id_${key}`);
        const localPending = this.db.getPendingSyncQueueForFile(loterica, ano, mes);

        if (dag.heads.length === 0) continue;

        // CENÁRIO A: DAG possui exatamente 1 Head (Convergido)
        if (dag.converged) {
          const remoteHead = dag.head;
          const isUpToDate = remoteHead.version_id === lastAppliedVersionId ||
                             (dag.subsumedTwinIds && dag.subsumedTwinIds.has(lastAppliedVersionId));

          if (!isUpToDate) {
            if (localPending.length === 0) {
              // Nenhuma alteração pendente local: Fast-Forward limpo para o remoteHead
              this.db.applySnapshot(loterica, ano, mes, remoteHead.entries, { fromSync: true });
              this.db.setSyncState(`last_version_id_${key}`, remoteHead.version_id);
              this.db.setSyncState(`last_version_num_${key}`, remoteHead.version_num);
              delete this.pendingRemoteUpdates[key];

              this.onRemoteUpdate({
                type: 'applied',
                fileKey: key,
                loterica,
                ano,
                mes,
                versionNum: remoteHead.version_num,
                updatedBy: remoteHead.updated_by || { device_name: 'Outro Computador' },
                summary: remoteHead.summary || 'Versão convergida aplicada'
              });
              pulledCount++;
            } else {
              // Há pendências locais: verifica compatibilidade de registros
              const currentLocalEntries = this.db.getAllLancamentosForFile(loterica, ano, mes, true);
              const diffWithRemote = this.computeDiff(currentLocalEntries, remoteHead.entries);
              const pendingIds = new Set(localPending.map(p => {
                try { return JSON.parse(p.payload).id; } catch { return null; }
              }).filter(Boolean));

              const hasConflict = diffWithRemote.updated.some(u => pendingIds.has(u.id)) ||
                                  diffWithRemote.deleted.some(d => pendingIds.has(d.id));

              if (hasConflict) {
                this.pendingRemoteUpdates[key] = {
                  fileKey: key,
                  fileId: remoteHead.fileId || remoteHead._fileId || remoteHead.version_id,
                  loterica,
                  ano,
                  mes,
                  remoteVersionNum: remoteHead.version_num,
                  remoteVersionId: remoteHead.version_id,
                  updatedBy: remoteHead.updated_by || { device_name: 'Outro Computador' },
                  updatedAt: remoteHead.updated_at,
                  summary: diffWithRemote.summary,
                  diff: diffWithRemote,
                  hasConflict: true
                };
                conflictCount++;
                this.onRemoteUpdate({
                  type: 'conflict',
                  fileKey: key,
                  loterica,
                  ano,
                  mes,
                  remoteVersionNum: remoteHead.version_num,
                  updatedBy: remoteHead.updated_by || { device_name: 'Outro Computador' },
                  summary: diffWithRemote.summary,
                  diff: diffWithRemote
                });
              } else {
                // Alterações disjuntas: aplica registros remotos não pendentes localmente
                for (const [rid, rentry] of Object.entries(remoteHead.entries)) {
                  if (!pendingIds.has(rid)) {
                    if (rentry.deleted) {
                      this.db.deleteLancamento(rid, { fromSync: true, version: rentry.version });
                    } else {
                      const exists = this.db.getLancamentoById(rid);
                      if (!exists) {
                        this.db.addLancamento({ ...rentry, is_demo: 0 }, { fromSync: true });
                      } else {
                        this.db.updateLancamento(rid, rentry, { fromSync: true, version: rentry.version });
                      }
                    }
                  }
                }
                pulledCount++;
              }
            }
          } else {
            // Se o SQLite local estava apontando para o twin subsumido, atualiza o estado para o canônico
            if (lastAppliedVersionId && lastAppliedVersionId !== remoteHead.version_id) {
              this.db.setSyncState(`last_version_id_${key}`, remoteHead.version_id);
              this.db.setSyncState(`last_version_num_${key}`, remoteHead.version_num);
            }
            if (localPending.length === 0) {
              delete this.pendingRemoteUpdates[key];
            }
          }
        } else {
          // CENÁRIO B: DAG possui MÚLTIPLAS Cabeças (BIFURCAÇÃO / FORK DETECTADO!)
          console.warn(`[DriveSync] Bifurcação detectada para ${key}: ${dag.heads.length} cabeças remotas.`);

          const headA = dag.heads[0];
          const headB = dag.heads[1];
          const baseAncestor = this.findCommonAncestor(headA, headB, dag.snapshotsMap, dag.parentsOf);
          const baseEntries = baseAncestor?.entries || {};

          const mergeResult = this.threeWayMerge(baseEntries, headA.entries, headB.entries);

          if (!mergeResult.hasConflict) {
            // Prevenção estrita de merge duplicado: verifica se já existe algum snapshot no grafo
            // cujos pais já incluem todas as cabeças divergentes
            const existingMerge = snapshotsList.find(s => {
              const pList = Array.isArray(s.parent_version_ids) ? s.parent_version_ids : (s.changes?.parent_version_ids || []);
              return dag.heads.every(h => pList.includes(h.version_id));
            });
            if (existingMerge) {
              console.log(`[DriveSync] Snapshot de merge já existente (${existingMerge.version_id}) para as cabeças concorrentes. Ignorando criação duplicada.`);
              dagsByKey[key] = this.buildSnapshotDAG([...snapshotsList]);
              delete this.pendingRemoteUpdates[key];
              continue;
            }

            // Alterações independentes / disjuntas em cada máquina: FUSÃO AUTOMÁTICA!
            console.log(`[DriveSync] Fusão automática de cabeças concorrentes para ${key}.`);
            this.db.applySnapshot(loterica, ano, mes, mergeResult.mergedEntries, { fromSync: true });

            const nextVersionNum = Math.max(headA.version_num, headB.version_num) + 1;
            const identity = this.db.getDeviceIdentity();
            const newVersionId = `v_${key}_${nextVersionNum}_${Date.now()}_${identity.deviceId}`;
            const summaryText = `Fusão automática de ramificações concorrentes (v${headA.version_num} ${headA.updated_by?.device_name || ''} + v${headB.version_num} ${headB.updated_by?.device_name || ''})`;

            const publishRes = await this.publishSnapshot({
              loterica,
              ano,
              mes,
              versionNum: nextVersionNum,
              versionId: newVersionId,
              baseVersionId: headA.version_id,
              parentVersionIds: dag.heads.map(h => h.version_id),
              summaryText,
              entriesMap: mergeResult.mergedEntries,
              accessToken,
              folderId,
              remoteFilesList: remoteFiles
            });

            dagsByKey[key] = this.buildSnapshotDAG([...snapshotsList, publishRes.snapshotDoc]);
            delete this.pendingRemoteUpdates[key];
            pulledCount++;
            pushedCount++;

            this.onRemoteUpdate({
              type: 'applied',
              fileKey: key,
              loterica,
              ano,
              mes,
              versionNum: nextVersionNum,
              updatedBy: { device_name: identity.deviceName },
              summary: summaryText
            });
          } else {
            // CONFLITO REAL NO MESMO REGISTRO ENTRE DUAS CABEÇAS!
            console.warn(`[DriveSync] Conflito concorrente real entre cabeças para ${key}. Aguardando decisão do usuário.`);
            const diffSummary = `${mergeResult.conflicts.length} conflito(s) simultâneo(s) no mesmo registro`;

            this.pendingRemoteUpdates[key] = {
              fileKey: key,
              fileId: headA.fileId || headA._fileId || headA.version_id,
              loterica,
              ano,
              mes,
              remoteVersionNum: Math.max(headA.version_num, headB.version_num),
              remoteVersionId: headA.version_id,
              updatedBy: headA.updated_by || { device_name: 'Ramificação Remota' },
              updatedAt: headA.updated_at,
              summary: diffSummary,
              diff: {
                conflicts: mergeResult.conflicts,
                headA,
                headB,
                summary: diffSummary
              },
              hasConflict: true
            };
            conflictCount++;
            this.onRemoteUpdate({
              type: 'conflict',
              fileKey: key,
              loterica,
              ano,
              mes,
              remoteVersionNum: Math.max(headA.version_num, headB.version_num),
              updatedBy: headA.updated_by || { device_name: 'Ramificação Remota' },
              summary: diffSummary,
              diff: this.pendingRemoteUpdates[key].diff
            });
          }
        }
      }

      // 4. PUSH: Envia alterações locais pendentes criando novos snapshots imutáveis via files.create
      const pendingQueueToPush = this.db.getPendingSyncQueue();

      if (pendingQueueToPush.length > 0) {
        const groupedByFile = {};
        for (const item of pendingQueueToPush) {
          try {
            const payload = JSON.parse(item.payload);
            const loterica = String(payload.loterica || 'CAÇULA').toUpperCase().trim();
            const ano = payload.ano;
            const mes = payload.mes;
            const fileKey = this.getFileKey(loterica, ano, mes);

            if (!groupedByFile[fileKey]) {
              groupedByFile[fileKey] = {
                loterica,
                ano,
                mes,
                fileKey,
                items: []
              };
            }
            groupedByFile[fileKey].items.push(item);
          } catch (e) {
            console.error('[DriveSync] Payload inválido na fila:', e);
            this.db.markSyncQueueItem(item.id, 'failed', e.message);
          }
        }

        for (const key of Object.keys(groupedByFile)) {
          if (this.pendingRemoteUpdates[key] && this.pendingRemoteUpdates[key].hasConflict) {
            console.log(`[DriveSync] Arquivo ${key} aguardando resolução de conflito pelo usuário.`);
            continue;
          }

          const group = groupedByFile[key];
          const dag = dagsByKey[key] || { heads: [] };
          const currentHead = dag.head || null;

          const lastAppliedVersionNum = Number(this.db.getSyncState(`last_version_num_${key}`) || 0);
          const currentRemoteNum = currentHead ? Number(currentHead.version_num || 0) : 0;
          const nextVersionNum = Math.max(lastAppliedVersionNum, currentRemoteNum) + 1;

          const identity = this.db.getDeviceIdentity();
          const newVersionId = `v_${key}_${nextVersionNum}_${Date.now()}_${identity.deviceId}`;

          const allEntriesList = this.db.getAllLancamentosForFile(group.loterica, group.ano, group.mes, true);
          const entriesMap = {};
          for (const e of allEntriesList) {
            entriesMap[e.id] = {
              ...e,
              valor: Math.round(Number(e.valor) * 100) / 100
            };
          }

          const summaryText = `${group.items.length} alteração(ões) sincronizada(s)`;
          const parentVersionIds = currentHead ? [currentHead.version_id] : [];
          const baseVersionId = currentHead ? currentHead.version_id : null;

          await this.publishSnapshot({
            loterica: group.loterica,
            ano: group.ano,
            mes: group.mes,
            versionNum: nextVersionNum,
            versionId: newVersionId,
            baseVersionId,
            parentVersionIds,
            summaryText,
            entriesMap,
            accessToken,
            folderId,
            remoteFilesList: remoteFiles
          });

          for (const qItem of group.items) {
            this.db.markSyncQueueItem(qItem.id, 'completed');
            pushedCount++;
          }
        }

        this.db.clearProcessedSyncQueue();
      }

      // 5. Sucesso e atualização de status
      const nowIso = new Date().toISOString();
      this.db.setSyncState('last_sync_time', nowIso);
      this.lastError = null;

      const unresolvedConflicts = this.db.getUnresolvedConflicts();
      const hasPendingUpdates = Object.keys(this.pendingRemoteUpdates).length > 0;
      const remainingPending = this.db.getPendingSyncQueue().length;

      if (unresolvedConflicts.length > 0 || hasPendingUpdates) {
        this.status = 'Conflito';
        this.isRemoteConfirmed = false;
      } else if (remainingPending > 0) {
        this.status = 'Sincronização pendente';
        this.isRemoteConfirmed = false;
      } else {
        this.status = 'Sincronizado';
        this.isRemoteConfirmed = true;

        // 5.1. Retenção automática de snapshots quando sincronizado (preserva min 50, cabeças, LCA e carência de 48h)
        try {
          for (const key of Object.keys(filesByKey)) {
            const fileGroup = filesByKey[key];
            const snapFiles = (fileGroup || []).filter(f => f.fileInfo && f.fileInfo.isSnapshot);
            if (snapFiles.length > 50) {
              const [lot, a, m] = key.split('_');
              console.log(`[DriveSync] Retenção automática: ${snapFiles.length} snapshots encontrados para ${key}. Executando poda segura...`);
              await this.pruneRemoteSnapshots(folderId, lot, Number(a), Number(m), accessToken, {
                dryRun: false,
                minRetention: 50,
                gracePeriodMs: 48 * 3600 * 1000
              });
            }
          }
        } catch (retentionErr) {
          console.warn('[DriveSync] Aviso na retenção automática de snapshots (não impeditivo):', retentionErr.message);
        }
      }

      this.notifyStatus();

      return {
        success: true,
        status: this.status,
        lastSyncTime: nowIso,
        pulledCount,
        pushedCount,
        conflictCount
      };

    } catch (err) {
      this.isRemoteConfirmed = false;
      console.error('[DriveSync] Erro na sincronização:', err);
      this.lastError = err.message;

      const isAuthError = err.message.includes('invalid_grant') || 
                          err.message.includes('Token expirado') || 
                          err.message.includes('Não autenticado') || 
                          err.message.includes('Status 401') ||
                          err.message.includes('invalid_token') ||
                          err.message.includes('unauthorized_client');

      if (isAuthError) {
        this.status = 'Autorização expirada';
        this.lastError = 'A autorização da conta Google expirou ou foi revogada. Todos os dados locais e alterações pendentes foram preservados no SQLite. Clique em "Reconectar Conta Google" para renovar o acesso.';
      } else if (err.message.includes('fetch') || err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
        this.status = 'Offline';
      } else {
        this.status = 'Erro de sincronização';
      }

      this.notifyStatus();
      return {
        success: false,
        status: this.status,
        error: this.lastError
      };
    } finally {
      this.isSyncing = false;
    }
  }

  // --- RECONCILIAÇÃO DE ENTRADAS COM PREVENÇÃO DE FALSOS CONFLITOS ---
  mergeRemoteEntries(remoteEntries, options = {}) {
    let applied = 0;
    let conflicts = 0;

    for (const id of Object.keys(remoteEntries)) {
      const remote = remoteEntries[id];
      const local = this.db.getLancamentoById(id);

      if (!local) {
        if (!remote.deleted) {
          this.db.addLancamento({
            ...remote,
            is_demo: 0
          }, { fromSync: true });
          applied++;
        }
      } else {
        const pendingQueue = this.db.getPendingSyncQueue();
        const pendingItem = pendingQueue.find(q => q.entity_id === id);

        if (pendingItem) {
          // Prevenção de falso conflito em exclusões locais:
          // Se o registro foi excluído localmente e o remoto ainda tem a versão original não modificada,
          // não é conflito: trata-se apenas da deleção local aguardando envio para o Drive.
          if (local.deleted && !remote.deleted) {
            const remoteVersion = remote.version || 1;
            const localVersion = local.version || 1;
            const remoteWasModified = (remoteVersion >= localVersion && remoteVersion > 1) ||
              (remote.atualizado_em && local.criado_em && new Date(remote.atualizado_em).getTime() > new Date(local.criado_em).getTime() + 1000);

            if (!remoteWasModified) {
              continue;
            }
          }

          const differs = (
            Math.round(Number(local.valor) * 100) !== Math.round(Number(remote.valor) * 100) ||
            String(local.status || '') !== String(remote.status || '') ||
            String(local.tipo || '') !== String(remote.tipo || '') ||
            String(local.observacoes || '') !== String(remote.observacoes || '') ||
            String(local.funcionario || '') !== String(remote.funcionario || '') ||
            String(local.cliente || '') !== String(remote.cliente || '') ||
            Boolean(local.deleted) !== Boolean(remote.deleted)
          );

          if (differs) {
            const localVersion = local.version || 1;
            const remoteVersion = remote.version || 1;
            const localDate = new Date(local.atualizado_em || local.criado_em).getTime();
            const remoteDate = new Date(remote.atualizado_em || remote.criado_em).getTime();

            // Só é conflito de concorrência se o remoto TAMBÉM tiver sido modificado concorrentemente (remoteVersion >= localVersion)
            // Se remoteVersion < localVersion, o remoto é apenas a versão antiga intocada pelo outro nó
            const remoteWasConcurrentlyModified = remoteVersion >= localVersion && (remoteVersion > 1 || remoteDate > localDate);

            if (remoteWasConcurrentlyModified) {
              this.db.addConflict(id, local, remote);
              conflicts++;
              continue;
            } else {
              // Local possui alteração pendente mais nova: mantém pendência local sem conflito
              continue;
            }
          }
        }

        const localVersion = local.version || 1;
        const remoteVersion = remote.version || 1;
        const localDate = new Date(local.atualizado_em || local.criado_em).getTime();
        const remoteDate = new Date(remote.atualizado_em || remote.criado_em).getTime();

        if (remoteVersion > localVersion || remoteDate > localDate) {
          if (remote.deleted) {
            this.db.deleteLancamento(id, { fromSync: true, version: remoteVersion });
          } else {
            this.db.updateLancamento(id, remote, { fromSync: true, version: remoteVersion });
          }
          applied++;
        }
      }
    }

    return { applied, conflicts };
  }

  // --- AÇÕES DO USUÁRIO NA NOTIFICAÇÃO E NA TELA DE COMPARAÇÃO ---
  async getPendingRemoteUpdates() {
    return Object.values(this.pendingRemoteUpdates);
  }

  async getVersionDiff(fileKey) {
    const update = this.pendingRemoteUpdates[fileKey];
    if (!update) return null;

    const localEntries = this.db.getAllLancamentosForFile(update.loterica, update.ano, update.mes, true);
    return {
      fileKey,
      loterica: update.loterica,
      ano: update.ano,
      mes: update.mes,
      remoteVersionNum: update.remoteVersionNum,
      updatedBy: update.updatedBy,
      updatedAt: update.updatedAt,
      diff: update.diff,
      localEntries
    };
  }

  // Aceita a versão remota: aplica o snapshot ao SQLite local e limpa a fila pendente daquele arquivo
  async acceptRemoteVersion(fileKey) {
    const update = this.pendingRemoteUpdates[fileKey];
    if (!update) throw new Error('Atualização remota não encontrada para esta chave.');

    let remoteDoc = null;
    // 1. Tenta obter o snapshot a partir do SQLite (já armazenado em saveVersionHistory durante o sync)
    if (update.remoteVersionId) {
      const hist = this.db.getVersionById(update.remoteVersionId);
      if (hist && hist.snapshot) {
        remoteDoc = {
          version_num: hist.version_num,
          version_id: hist.version_id,
          base_version_id: hist.base_version_id,
          entries: hist.snapshot
        };
      }
    }

    // 2. Se não estiver no SQLite ou faltar entries, busca do Drive
    if (!remoteDoc || !remoteDoc.entries) {
      const accessToken = await this.getValidAccessToken();
      if (accessToken && update.fileId) {
        remoteDoc = await this.downloadFileContent(update.fileId, accessToken);
      }
    }

    if (!remoteDoc || !remoteDoc.entries) {
      throw new Error('Não foi possível obter o documento remoto do Drive.');
    }

    // Aplica o snapshot completo ao SQLite local
    this.db.applySnapshot(update.loterica, update.ano, update.mes, remoteDoc.entries, { fromSync: true });

    // Descarta alterações locais pendentes daquele arquivo
    const localPending = this.db.getPendingSyncQueueForFile(update.loterica, update.ano, update.mes);
    for (const p of localPending) {
      this.db.markSyncQueueItem(p.id, 'completed');
    }
    this.db.clearProcessedSyncQueue();

    // Atualiza controle de versão
    this.db.setSyncState(`last_version_id_${fileKey}`, update.remoteVersionId);
    this.db.setSyncState(`last_version_num_${fileKey}`, update.remoteVersionNum);

    // Grava histórico
    this.db.saveVersionHistory({
      id: `vh_${update.remoteVersionId}`,
      file_key: fileKey,
      loterica: update.loterica,
      ano: update.ano,
      mes: update.mes,
      version_num: update.remoteVersionNum,
      version_id: update.remoteVersionId,
      base_version_id: remoteDoc.base_version_id || null,
      created_at: new Date().toISOString(),
      device_id: update.updatedBy?.device_id || '',
      device_name: update.updatedBy?.device_name || 'Remoto',
      user_email: update.updatedBy?.user_email || '',
      summary: `Versão remota v${update.remoteVersionNum} aceita pelo usuário`,
      changes: update.diff,
      snapshot: remoteDoc.entries
    });

    delete this.pendingRemoteUpdates[fileKey];
    this.isRemoteConfirmed = true;
    this.updateStatus();

    return {
      success: true,
      message: `Versão remota aceita com sucesso para ${update.loterica} (${update.mes}/${update.ano}).`
    };
  }

  // Mantém a versão local: cria uma nova versão sequencial e envia ao Drive
  async keepLocalVersion(fileKey, reason = 'Versão local mantida pelo usuário') {
    const update = this.pendingRemoteUpdates[fileKey];
    if (!update) throw new Error('Atualização não encontrada.');

    const accessToken = await this.getValidAccessToken();
    const config = this.getConfig();
    const identity = this.db.getDeviceIdentity();

    const nextVersionNum = update.remoteVersionNum + 1;
    const newVersionId = `v_${fileKey}_${nextVersionNum}_${Date.now()}`;
    const allEntriesList = this.db.getAllLancamentosForFile(update.loterica, update.ano, update.mes, true);
    const entriesMap = {};
    for (const e of allEntriesList) {
      entriesMap[e.id] = { ...e, valor: Math.round(Number(e.valor) * 100) / 100 };
    }

    const documentV2 = {
      schema_version: 2,
      loterica: update.loterica,
      ano: update.ano,
      mes: update.mes,
      version_num: nextVersionNum,
      version_id: newVersionId,
      base_version_id: update.remoteVersionId,
      updated_at: new Date().toISOString(),
      updated_by: {
        device_id: identity.deviceId,
        device_name: identity.deviceName,
        user_email: config.userEmail || ''
      },
      summary: reason,
      entries: entriesMap,
      history: [
        {
          version_num: nextVersionNum,
          version_id: newVersionId,
          updated_at: new Date().toISOString(),
          updated_by: {
            device_name: identity.deviceName,
            user_email: config.userEmail || ''
          },
          summary: reason,
          changes_count: allEntriesList.length
        }
      ]
    };

    await this.updateFileContent(update.fileId, documentV2, accessToken);

    // Marca itens pendentes locais como completed
    const localPending = this.db.getPendingSyncQueueForFile(update.loterica, update.ano, update.mes);
    for (const p of localPending) {
      this.db.markSyncQueueItem(p.id, 'completed');
    }
    this.db.clearProcessedSyncQueue();

    this.db.setSyncState(`last_version_id_${fileKey}`, newVersionId);
    this.db.setSyncState(`last_version_num_${fileKey}`, nextVersionNum);

    this.db.saveVersionHistory({
      id: `vh_${newVersionId}`,
      file_key: fileKey,
      loterica: update.loterica,
      ano: update.ano,
      mes: update.mes,
      version_num: nextVersionNum,
      version_id: newVersionId,
      base_version_id: update.remoteVersionId,
      created_at: documentV2.updated_at,
      device_id: identity.deviceId,
      device_name: identity.deviceName,
      user_email: config.userEmail || '',
      summary: reason,
      changes: { action: 'keep_local' },
      snapshot: entriesMap
    });

    delete this.pendingRemoteUpdates[fileKey];
    this.isRemoteConfirmed = true;
    this.updateStatus();

    return {
      success: true,
      message: `Versão local gravada como v${nextVersionNum} no Google Drive.`
    };
  }

  // --- HISTÓRICO DE VERSÕES E RESTAURAÇÃO NÃO DESTRUTIVA ---
  async getVersionHistory(loterica, ano, mes) {
    const localHistory = this.db.getVersionHistory(loterica, ano, mes);

    // Se estiver conectado, tenta também buscar histórico do arquivo no Drive para complementar
    try {
      const config = this.getConfig();
      const accessToken = await this.getValidAccessToken();
      if (accessToken && config.folderId) {
        const fileName = this.getFileName(loterica, ano, mes);
        const remoteFiles = await this.listAllRemoteFilesRecursive(config.folderId, accessToken);
        const file = remoteFiles.find(f => f.name === fileName);
        if (file) {
          const doc = await this.downloadFileContent(file.id, accessToken);
          if (doc && doc.history) {
            // Incorpora versões remotas que ainda não estejam salvas localmente
            for (const h of doc.history) {
              const exists = localHistory.some(lh => lh.version_num === h.version_num || lh.version_id === h.version_id);
              if (!exists) {
                localHistory.push({
                  file_key: this.getFileKey(loterica, ano, mes),
                  loterica,
                  ano,
                  mes,
                  version_num: h.version_num,
                  version_id: h.version_id,
                  created_at: h.updated_at,
                  device_name: h.updated_by?.device_name || '',
                  user_email: h.updated_by?.user_email || '',
                  summary: h.summary || 'Versão do histórico'
                });
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[DriveSync] Aviso ao consultar histórico remoto:', e.message);
    }

    localHistory.sort((a, b) => b.version_num - a.version_num);
    return localHistory;
  }

  // Restaura uma versão histórica sem perder o histórico (cria uma nova versão vN+1 com o snapshot restaurado)
  async restoreHistoricalVersion(loterica, ano, mes, versionId) {
    const fileKey = this.getFileKey(loterica, ano, mes);
    let versionRecord = this.db.getVersionById(versionId);

    const config = this.getConfig();
    let currentRemoteDoc = null;
    let existingFileId = null;

    // Busca o documento remoto atual do Drive para inspecionar versão máxima e concorrência
    try {
      const accessToken = await this.getValidAccessToken();
      if (accessToken && config.folderId) {
        const remoteFiles = await this.listAllRemoteFilesRecursive(config.folderId, accessToken);
        const relevant = remoteFiles
          .map(f => ({ file: f, parsed: this.parseFileName(f.name) }))
          .filter(x => x.parsed && x.parsed.fileKey === fileKey);

        const snapshots = [];
        let legacyFile = null;
        for (const item of relevant) {
          if (item.parsed.isSnapshot) {
            const doc = await this.downloadFileContent(item.file.id, accessToken);
            if (doc) snapshots.push(doc);
          } else {
            legacyFile = item.file;
          }
        }
        let legacyDoc = null;
        if (legacyFile) {
          existingFileId = legacyFile.id;
          legacyDoc = await this.downloadFileContent(legacyFile.id, accessToken);
        }
        const dag = this.buildSnapshotDAG(snapshots, legacyDoc);
        if (dag.head) {
          currentRemoteDoc = dag.head;
        } else if (legacyDoc) {
          currentRemoteDoc = legacyDoc;
        }
      }
    } catch (e) {
      console.warn('[DriveSync] Aviso ao verificar arquivo remoto antes de restaurar:', e.message);
    }

    // Se não encontrou o snapshot no SQLite local, busca no arquivo remoto
    if (!versionRecord || !versionRecord.snapshot || Object.keys(versionRecord.snapshot).length === 0) {
      if (currentRemoteDoc && currentRemoteDoc.version_id === versionId) {
        versionRecord = {
          version_num: currentRemoteDoc.version_num,
          version_id: currentRemoteDoc.version_id,
          snapshot: currentRemoteDoc.entries
        };
      }
    }

    if (!versionRecord || !versionRecord.snapshot) {
      throw new Error(`Dados da versão ${versionId} não encontrados para restauração.`);
    }

    // Aplica o snapshot restaurado no banco local
    this.db.applySnapshot(loterica, ano, mes, versionRecord.snapshot, { fromSync: true });

    // Determina o próximo número de versão sequencial considerando o maior entre local e remoto no Drive
    const localNum = Number(this.db.getSyncState(`last_version_num_${fileKey}`) || versionRecord.version_num || 1);
    const remoteNum = currentRemoteDoc ? Number(currentRemoteDoc.version_num || 0) : 0;
    const nextVersionNum = Math.max(localNum, remoteNum) + 1;
    const newVersionId = `v_${fileKey}_${nextVersionNum}_${Date.now()}`;
    const baseVersionId = currentRemoteDoc ? currentRemoteDoc.version_id : versionId;
    const identity = this.db.getDeviceIdentity();
    const summaryText = `Restauração da versão v${versionRecord.version_num} realizada em ${new Date().toLocaleDateString('pt-BR')}`;

    // Documento no Drive com a nova versão
    const documentV2 = {
      schema_version: 2,
      loterica,
      ano: Number(ano),
      mes: Number(mes),
      version_num: nextVersionNum,
      version_id: newVersionId,
      base_version_id: baseVersionId,
      updated_at: new Date().toISOString(),
      updated_by: {
        device_id: identity.deviceId,
        device_name: identity.deviceName,
        user_email: config.userEmail || ''
      },
      summary: summaryText,
      entries: versionRecord.snapshot,
      history: [
        {
          version_num: nextVersionNum,
          version_id: newVersionId,
          updated_at: new Date().toISOString(),
          updated_by: {
            device_name: identity.deviceName,
            user_email: config.userEmail || ''
          },
          summary: summaryText,
          changes_count: Object.keys(versionRecord.snapshot).length
        },
        ...(currentRemoteDoc?.history || []).slice(0, 19)
      ]
    };

    // Envia ao Drive se houver conexão
    let publishedRemotely = false;
    try {
      const accessToken = await this.getValidAccessToken();
      if (accessToken && config.folderId) {
        // Publica snapshot imutável no Drive
        await this.publishSnapshot({
          loterica,
          ano,
          mes,
          versionNum: nextVersionNum,
          versionId: newVersionId,
          baseVersionId,
          parentVersionIds: currentRemoteDoc?.version_id ? [currentRemoteDoc.version_id] : [],
          summaryText,
          entriesMap: versionRecord.snapshot,
          accessToken,
          folderId: config.folderId
        });
        publishedRemotely = true;

        // Atualiza arquivo legado para manter compatibilidade com versões antigas se existir
        if (existingFileId) {
          try {
            await this.updateFileContent(existingFileId, documentV2, accessToken);
          } catch (legErr) {
            console.warn('[DriveSync] Aviso ao atualizar arquivo legado compatível:', legErr.message);
          }
        }
      }
    } catch (e) {
      console.warn('[DriveSync] Aviso ao subir versão restaurada ao Drive:', e.message);
    }

    // Se não publicou remotamente (ex: offline), salva no SQLite local
    if (!publishedRemotely) {
      this.db.saveVersionHistory({
        id: `vh_${newVersionId}`,
        file_key: fileKey,
        loterica,
        ano: Number(ano),
        mes: Number(mes),
        version_num: nextVersionNum,
        version_id: newVersionId,
        base_version_id: baseVersionId,
        created_at: documentV2.updated_at,
        device_id: identity.deviceId,
        device_name: identity.deviceName,
        user_email: config.userEmail || '',
        summary: summaryText,
        changes: { restoredFrom: versionId, oldVersionNum: versionRecord.version_num },
        snapshot: versionRecord.snapshot
      });

      this.db.setSyncState(`last_version_id_${fileKey}`, newVersionId);
      this.db.setSyncState(`last_version_num_${fileKey}`, nextVersionNum);
    }

    this.isRemoteConfirmed = true;
    this.updateStatus();

    return {
      success: true,
      newVersionNum: nextVersionNum,
      message: `Versão restaurada com sucesso! Gerada nova versão v${nextVersionNum}.`
    };
  }

  // --- REQUISIÇÕES DRIVE API ---
  async listRemoteFiles(folderId, accessToken) {
    let allFiles = [];
    let pageToken = null;

    do {
      const q = `'${folderId}' in parents and trashed = false`;
      let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Falha ao listar arquivos no Drive.');
      }

      const data = await resp.json();
      if (data.files && Array.isArray(data.files)) {
        allFiles = allFiles.concat(data.files);
      }
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    return allFiles;
  }

  async listAllRemoteFilesRecursive(folderId, accessToken, maxDepth = 8) {
    const queue = [{ id: folderId, path: '', depth: 0 }];
    const allFiles = [];

    while (queue.length > 0) {
      const current = queue.shift();
      let filesInFolder = [];
      try {
        filesInFolder = await this.listRemoteFiles(current.id, accessToken);
      } catch (e) {
        console.warn(`[DriveSync] Não foi possível listar pasta ${current.id}:`, e.message);
        continue;
      }

      for (const f of filesInFolder) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (current.depth < maxDepth) {
            queue.push({
              id: f.id,
              path: current.path ? `${current.path}/${f.name}` : f.name,
              depth: current.depth + 1
            });
          }
        } else {
          f.folderPath = current.path;
          f.parentFolderId = current.id;
          allFiles.push(f);
        }
      }
    }

    return allFiles;
  }

  async getOrCreateFolder(parentFolderId, folderName, accessToken) {
    const safeName = folderName.replace(/'/g, "\\'");
    const q = `'${parentFolderId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) throw new Error(`Falha ao buscar pasta "${folderName}" no Drive.`);
    const data = await resp.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        parents: [parentFolderId],
        mimeType: 'application/vnd.google-apps.folder'
      })
    });
    if (!createResp.ok) throw new Error(`Falha ao criar pasta "${folderName}" no Drive.`);
    const created = await createResp.json();
    return created.id;
  }

  async moveRemoteItem(itemId, sourceParentId, targetParentId, accessToken) {
    const query = new URLSearchParams({
      addParents: targetParentId,
      removeParents: sourceParentId,
      supportsAllDrives: 'true',
      fields: 'id,parents'
    });
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?${query}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || 'Não foi possível mover um item para fora da pasta duplicada do Drive.');
    }
  }

  async deleteRemoteItem(itemId, accessToken) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?supportsAllDrives=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || 'Não foi possível remover o item vazio da estrutura duplicada do Drive.');
    }
  }

  async mergeRemoteFolderContents(sourceFolderId, targetFolderId, accessToken) {
    const sourceItems = await this.listRemoteFiles(sourceFolderId, accessToken);
    for (const item of sourceItems) {
      const targetItems = await this.listRemoteFiles(targetFolderId, accessToken);
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        const matchingFolder = targetItems.find((candidate) => candidate.mimeType === item.mimeType && candidate.name === item.name);
        if (matchingFolder) {
          await this.mergeRemoteFolderContents(item.id, matchingFolder.id, accessToken);
          if ((await this.listRemoteFiles(item.id, accessToken)).length === 0) await this.deleteRemoteItem(item.id, accessToken);
        } else {
          await this.moveRemoteItem(item.id, sourceFolderId, targetFolderId, accessToken);
        }
        continue;
      }

      const matchingFile = targetItems.find((candidate) => candidate.mimeType !== 'application/vnd.google-apps.folder' && candidate.name === item.name);
      if (matchingFile) {
        if (item.md5Checksum && matchingFile.md5Checksum && item.md5Checksum === matchingFile.md5Checksum) {
          await this.deleteRemoteItem(item.id, accessToken);
          continue;
        }
        throw new Error(`A pasta duplicada contém um arquivo “${item.name}” diferente de outro arquivo no destino; ele foi mantido intacto para evitar perda de dados.`);
      }
      await this.moveRemoteItem(item.id, sourceFolderId, targetFolderId, accessToken);
    }
  }

  async flattenDuplicateDataRoot(rootFolderId, accessToken) {
    const rootItems = await this.listRemoteFiles(rootFolderId, accessToken);
    const duplicateRoots = rootItems.filter((item) => item.mimeType === 'application/vnd.google-apps.folder' && item.name === 'Dados_Controle_PIX');
    for (const duplicateRoot of duplicateRoots) {
      await this.mergeRemoteFolderContents(duplicateRoot.id, rootFolderId, accessToken);
      if ((await this.listRemoteFiles(duplicateRoot.id, accessToken)).length === 0) await this.deleteRemoteItem(duplicateRoot.id, accessToken);
    }
  }

  async resolveStructuredFolderId(rootFolderId, pathParts = [], accessToken) {
    let currentId = rootFolderId;
    for (const part of pathParts) {
      currentId = await this.getOrCreateFolder(currentId, part, accessToken);
    }
    return currentId;
  }

  async downloadFileContent(fileId, accessToken) {
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resp.ok) return null;
    try {
      const data = await resp.json();
      if (data && typeof data === 'object') {
        const etag = resp.headers.get('etag');
        if (etag) {
          Object.defineProperty(data, '_etag', {
            value: etag,
            writable: true,
            enumerable: false,
            configurable: true
          });
        }
      }
      return data;
    } catch {
      return null;
    }
  }

  async createFileInFolder(folderId, fileName, contentObj, accessToken) {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json'
    };

    const multipartRequestBody =
      "--" + boundary + "\r\n" +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(contentObj) +
      closeDelim;

    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Erro ao criar arquivo no Drive.');
    }
    return await resp.json();
  }

  async updateFileContent(fileId, contentObj, accessToken, options = {}) {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8'
    };
    if (options && options.etag) {
      headers['If-Match'] = options.etag;
    }

    const resp = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(contentObj)
    });

    if (resp.status === 412) {
      const err = new Error('Concorrência detectada: o arquivo foi alterado remotamente no Drive antes do upload (HTTP 412 Precondition Failed).');
      err.code = 'PRECONDITION_FAILED';
      err.status = 412;
      throw err;
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erro ao atualizar arquivo no Drive (HTTP ${resp.status}).`);
    }
    return await resp.json();
  }

  // --- CICLO DE SINCRONIZAÇÃO AUTOMÁTICA ---
  startAutoSync() {
    this.stopAutoSync();

    // 1. Sincronização inicial ao iniciar a aplicação
    this.initialSyncTimer = setTimeout(() => {
      this.initialSyncTimer = null;
      this.sync().catch(err => console.warn('[DriveSync] Aviso na sincronização inicial:', err.message));
    }, 2000);

    // 2. Verificação periódica padrão de 5 segundos (ou configurada pelo usuário)
    const currentCfg = this.getConfig();
    const intervalSec = currentCfg.syncIntervalSec || 5;
    this.syncIntervalMs = intervalSec * 1000;
    this.periodicTimer = setInterval(() => {
      this.sync().catch(err => console.warn('[DriveSync] Aviso na sincronização periódica:', err.message));
    }, this.syncIntervalMs);
  }

  stopAutoSync() {
    if (this.initialSyncTimer) {
      clearTimeout(this.initialSyncTimer);
      this.initialSyncTimer = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  // Gatilho debounced para alterações locais
  triggerDebouncedSync() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.status = 'Sincronização pendente';
    this.notifyStatus();

    this.debounceTimer = setTimeout(() => {
      this.sync().catch(err => console.warn('[DriveSync] Aviso no sync debounced:', err.message));
    }, 3000); // 3 segundos de debounce para digitação
  }

  updateStatus() {
    const tokens = this.getStoredTokens();
    const config = this.getConfig();

    if (!tokens || !tokens.access_token || !config.folderId) {
      this.status = 'Não configurado';
    } else {
      const pending = this.db.getPendingSyncQueue().length;
      const conflicts = this.db.getUnresolvedConflicts().length;
      const remoteUpdates = Object.keys(this.pendingRemoteUpdates).length;

      if (conflicts > 0 || remoteUpdates > 0) {
        this.status = 'Conflito';
      } else if (pending > 0) {
        this.status = 'Sincronização pendente';
      } else if (this.isRemoteConfirmed) {
        this.status = 'Sincronizado';
      } else if (config.lastSyncTime) {
        this.status = 'Verificação pendente';
      } else {
        this.status = 'Pronto para sincronizar';
      }
    }
    this.notifyStatus();
  }

  notifyStatus() {
    const statusData = this.getStatusInfo();
    this.onStatusChange(statusData);
  }

  getStatusInfo() {
    const config = this.getConfig();
    const pendingCount = this.db ? this.db.getPendingSyncQueue().length : 0;
    const conflicts = this.db ? this.db.getUnresolvedConflicts() : [];
    const pendingUpdates = Object.values(this.pendingRemoteUpdates || {});

    return {
      status: this.status,
      userEmail: config.userEmail,
      userName: config.userName,
      folderId: config.folderId,
      lastSyncTime: config.lastSyncTime,
      pendingCount: pendingCount,
      conflictCount: conflicts.length + pendingUpdates.length,
      conflicts: conflicts,
      pendingRemoteUpdates: pendingUpdates,
      lastError: this.lastError || this.credentialWarning,
      credentialWarning: this.credentialWarning
    };
  }
}

module.exports = { GoogleDriveSync };
