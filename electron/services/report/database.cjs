const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

class PixDatabase {
  constructor(dbFilePath) {
    this.dbFilePath = dbFilePath;
    this.db = null;
    this.SQL = null;
  }

  async init() {
    const wasmPath = path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');
    this.SQL = await initSqlJs({
      locateFile: () => wasmPath
    });

    const dir = path.dirname(this.dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbFilePath)) {
      try {
        const fileBuffer = fs.readFileSync(this.dbFilePath);
        this.db = new this.SQL.Database(fileBuffer);
        console.log(`[Database] Banco SQLite carregado de: ${this.dbFilePath}`);
      } catch (err) {
        console.error('[Database] Erro ao carregar arquivo existente, criando novo:', err);
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
      console.log(`[Database] Novo banco SQLite criado em memória para: ${this.dbFilePath}`);
    }

    // 1. Cria as tabelas se não existirem
    this.initTables();
    // 2. Executa migrações estruturais para bancos legados
    this.runMigrations();
    // 3. Garante que os índices sejam criados (inclusive os dependentes de colunas migradas)
    this.initIndexes();
    // 4. Salva no disco
    this.saveToDisk();
  }

  initTables() {
    // Criação das tabelas base (se ainda não existirem)
    const schema = `
      CREATE TABLE IF NOT EXISTS pix_lancamentos (
        id TEXT PRIMARY KEY,
        loterica TEXT NOT NULL,
        ano INTEGER NOT NULL,
        mes INTEGER NOT NULL,
        dia INTEGER NOT NULL,
        data_formatada TEXT NOT NULL,
        valor REAL NOT NULL,
        tipo TEXT NOT NULL,
        funcionario TEXT NOT NULL,
        cliente TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pendente',
        observacoes TEXT DEFAULT '',
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        is_demo INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        deleted INTEGER DEFAULT 0
      );

      -- Tabela para fila persistente de sincronização
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        status TEXT DEFAULT 'pending'
      );

      -- Tabela para estados e metadados de sincronização
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- Tabela para registros em conflito
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        local_data TEXT NOT NULL,
        remote_data TEXT NOT NULL,
        resolved INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      -- Tabela para histórico persistente de versões compartilhadas
      CREATE TABLE IF NOT EXISTS sync_versions_history (
        id TEXT PRIMARY KEY,
        file_key TEXT NOT NULL,
        loterica TEXT NOT NULL,
        ano INTEGER NOT NULL,
        mes INTEGER NOT NULL,
        version_num INTEGER NOT NULL,
        version_id TEXT NOT NULL,
        base_version_id TEXT,
        created_at TEXT NOT NULL,
        device_id TEXT,
        device_name TEXT,
        user_email TEXT,
        summary TEXT,
        changes_json TEXT,
        snapshot_json TEXT NOT NULL
      );

      -- Tabela para metadados da base oficial imutável
      CREATE TABLE IF NOT EXISTS official_base_metadata (
        version_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        source_filename TEXT NOT NULL,
        sha256_hash TEXT NOT NULL,
        total_records INTEGER NOT NULL,
        total_value REAL NOT NULL,
        manifest_json TEXT NOT NULL
      );

      -- Tabela de auditoria para operações estruturais (restauração e exclusão em massa)
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        scope_description TEXT NOT NULL,
        records_affected INTEGER NOT NULL,
        backup_path TEXT,
        details_json TEXT
      );
    `;
    this.db.run(schema);
  }

  runMigrations() {
    // Garante criação das tabelas adicionais para bancos legados
    try {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS official_base_metadata (
          version_id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          source_filename TEXT NOT NULL,
          sha256_hash TEXT NOT NULL,
          total_records INTEGER NOT NULL,
          total_value REAL NOT NULL,
          manifest_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          action TEXT NOT NULL,
          scope_description TEXT NOT NULL,
          records_affected INTEGER NOT NULL,
          backup_path TEXT,
          details_json TEXT
        );
      `);
    } catch {}

    // Verifica e adiciona colunas em pix_lancamentos de forma segura e idempotente
    try {
      const res = this.db.exec("PRAGMA table_info(pix_lancamentos)");
      if (res && res[0]) {
        const columns = res[0].values.map(v => v[1]);

        if (!columns.includes('cliente')) {
          this.db.run("ALTER TABLE pix_lancamentos ADD COLUMN cliente TEXT DEFAULT '';");
        }
        if (!columns.includes('status')) {
          this.db.run("ALTER TABLE pix_lancamentos ADD COLUMN status TEXT DEFAULT 'pendente';");
        }
        if (!columns.includes('observacoes')) {
          this.db.run("ALTER TABLE pix_lancamentos ADD COLUMN observacoes TEXT DEFAULT '';");
        }
        if (!columns.includes('atualizado_em')) {
          this.db.run("ALTER TABLE pix_lancamentos ADD COLUMN atualizado_em TEXT DEFAULT '';");
          this.db.run("UPDATE pix_lancamentos SET atualizado_em = criado_em WHERE atualizado_em IS NULL OR atualizado_em = '';");
        }
        if (!columns.includes('is_demo')) {
          this.db.run("ALTER TABLE pix_lancamentos ADD COLUMN is_demo INTEGER DEFAULT 0;");
        }
        if (!columns.includes('version')) {
          this.db.run("ALTER TABLE pix_lancamentos ADD COLUMN version INTEGER DEFAULT 1;");
          this.db.run("UPDATE pix_lancamentos SET version = 1 WHERE version IS NULL;");
        }
        if (!columns.includes('deleted')) {
          this.db.run("ALTER TABLE pix_lancamentos ADD COLUMN deleted INTEGER DEFAULT 0;");
          this.db.run("UPDATE pix_lancamentos SET deleted = 0 WHERE deleted IS NULL;");
        }
      }

      // Garante criação da tabela de histórico de versões caso o banco seja legado
      this.db.run(`
        CREATE TABLE IF NOT EXISTS sync_versions_history (
          id TEXT PRIMARY KEY,
          file_key TEXT NOT NULL,
          loterica TEXT NOT NULL,
          ano INTEGER NOT NULL,
          mes INTEGER NOT NULL,
          version_num INTEGER NOT NULL,
          version_id TEXT NOT NULL,
          base_version_id TEXT,
          created_at TEXT NOT NULL,
          device_id TEXT,
          device_name TEXT,
          user_email TEXT,
          summary TEXT,
          changes_json TEXT,
          snapshot_json TEXT NOT NULL
        );
      `);
    } catch (err) {
      console.error('[Database] Erro na execução de migrações:', err);
      throw err;
    }
  }

  initIndexes() {
    // Cria índices somente após garantir que todas as colunas existem
    try {
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_pix_filter ON pix_lancamentos (loterica, ano, mes, dia);
        CREATE INDEX IF NOT EXISTS idx_pix_tipo ON pix_lancamentos (tipo);
        CREATE INDEX IF NOT EXISTS idx_pix_status ON pix_lancamentos (status);
        CREATE INDEX IF NOT EXISTS idx_pix_deleted ON pix_lancamentos (deleted);
        CREATE INDEX IF NOT EXISTS idx_versions_history ON sync_versions_history (file_key, version_num);
      `);
    } catch (err) {
      console.error('[Database] Erro ao criar índices:', err);
      throw err;
    }
  }

  saveToDisk() {
    try {
      if (!this.db || !this.dbFilePath) return;
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbFilePath, buffer);
    } catch (err) {
      console.error('[Database] Erro ao salvar arquivo SQLite no disco:', err);
      throw err;
    }
  }

  // --- FILA DE SINCRONIZAÇÃO PERSISTENTE ---
  enqueueSync(operation, entityId, payload) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sync_queue (operation, entity_id, payload, created_at, attempts, status)
        VALUES (:operation, :entity_id, :payload, :created_at, 0, 'pending')
      `);
      stmt.run({
        ':operation': operation,
        ':entity_id': entityId,
        ':payload': JSON.stringify(payload),
        ':created_at': new Date().toISOString()
      });
      stmt.free();
    } catch (err) {
      console.error('[Database] Erro ao enfileirar para sincronização:', err);
    }
  }

  getPendingSyncQueue() {
    const stmt = this.db.prepare(`
      SELECT id, operation, entity_id, payload, created_at, attempts, last_error, status
      FROM sync_queue
      WHERE status = 'pending'
      ORDER BY id ASC
    `);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  markSyncQueueItem(id, status, error = null) {
    const stmt = this.db.prepare(`
      UPDATE sync_queue
      SET status = :status, last_error = :error, attempts = attempts + 1
      WHERE id = :id
    `);
    stmt.run({
      ':id': id,
      ':status': status,
      ':error': error
    });
    stmt.free();
    this.saveToDisk();
  }

  clearProcessedSyncQueue() {
    this.db.run("DELETE FROM sync_queue WHERE status = 'completed';");
    this.saveToDisk();
  }

  // --- ESTADO DE SINCRONIZAÇÃO ---
  getSyncState(key) {
    const stmt = this.db.prepare("SELECT value FROM sync_state WHERE key = :key");
    stmt.bind({ ':key': key });
    let val = null;
    if (stmt.step()) {
      val = stmt.getAsObject().value;
    }
    stmt.free();
    return val;
  }

  setSyncState(key, value) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_state (key, value) VALUES (:key, :value)
      ON CONFLICT(key) DO UPDATE SET value = :value
    `);
    stmt.run({ ':key': key, ':value': String(value) });
    stmt.free();
    this.saveToDisk();
  }

  getAllSyncState() {
    const stmt = this.db.prepare("SELECT key, value FROM sync_state");
    const state = {};
    while (stmt.step()) {
      const row = stmt.getAsObject();
      state[row.key] = row.value;
    }
    stmt.free();
    return state;
  }

  // --- CONFLITOS DE SINCRONIZAÇÃO ---
  addConflict(entryId, localData, remoteData) {
    const id = `conflict_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const stmt = this.db.prepare(`
      INSERT INTO sync_conflicts (id, entry_id, local_data, remote_data, resolved, created_at)
      VALUES (:id, :entry_id, :local_data, :remote_data, 0, :created_at)
    `);
    stmt.run({
      ':id': id,
      ':entry_id': entryId,
      ':local_data': JSON.stringify(localData),
      ':remote_data': JSON.stringify(remoteData),
      ':created_at': new Date().toISOString()
    });
    stmt.free();
    this.saveToDisk();
    return id;
  }

  getUnresolvedConflicts() {
    const stmt = this.db.prepare(`
      SELECT id, entry_id, local_data, remote_data, created_at
      FROM sync_conflicts
      WHERE resolved = 0
      ORDER BY created_at DESC
    `);
    const results = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        ...row,
        local_data: JSON.parse(row.local_data),
        remote_data: JSON.parse(row.remote_data)
      });
    }
    stmt.free();
    return results;
  }

  resolveConflict(conflictId, chosenVersion) {
    const stmt = this.db.prepare("SELECT * FROM sync_conflicts WHERE id = :id");
    stmt.bind({ ':id': conflictId });
    if (!stmt.step()) {
      stmt.free();
      throw new Error("Conflito não encontrado.");
    }
    const conflict = stmt.getAsObject();
    stmt.free();

    const dataToApply = chosenVersion === 'local' ? JSON.parse(conflict.local_data) : JSON.parse(conflict.remote_data);

    // Aplica a versão escolhida
    this.updateLancamento(conflict.entry_id, dataToApply);

    // Se aceitou a versão remota, o registro local já está reconciliado com o Drive:
    if (chosenVersion === 'remote') {
      const qStmt = this.db.prepare("UPDATE sync_queue SET status = 'completed' WHERE entity_id = :entity_id");
      qStmt.run({ ':entity_id': conflict.entry_id });
      qStmt.free();
    }

    // Marca como resolvido
    const markStmt = this.db.prepare("UPDATE sync_conflicts SET resolved = 1 WHERE id = :id");
    markStmt.run({ ':id': conflictId });
    markStmt.free();
    this.saveToDisk();
    return true;
  }

  // --- CONSULTAS PRINCIPAIS DE LANÇAMENTOS ---
  getLancamentos(loterica, ano, mes, dayFilter = null) {
    let sql = `
      SELECT 
        id, loterica, ano, mes, dia, data_formatada, valor, tipo, 
        funcionario, cliente, status, observacoes, criado_em, atualizado_em,
        is_demo, version
      FROM pix_lancamentos
      WHERE loterica = :loterica AND ano = :ano AND mes = :mes AND (deleted = 0 OR deleted IS NULL)
    `;

    if (dayFilter && Number(dayFilter) > 0) {
      sql += ` AND dia = :dia`;
    }

    sql += ` ORDER BY dia ASC, valor DESC, id ASC`;

    const stmt = this.db.prepare(sql);
    const params = {
      ':loterica': loterica,
      ':ano': Number(ano),
      ':mes': Number(mes)
    };
    if (dayFilter && Number(dayFilter) > 0) {
      params[':dia'] = Number(dayFilter);
    }

    stmt.bind(params);

    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  getDaysWithEntries(loterica, ano, mes) {
    const stmt = this.db.prepare(`
      SELECT DISTINCT dia 
      FROM pix_lancamentos 
      WHERE loterica = :loterica AND ano = :ano AND mes = :mes AND (deleted = 0 OR deleted IS NULL)
      ORDER BY dia ASC
    `);
    stmt.bind({
      ':loterica': loterica,
      ':ano': Number(ano),
      ':mes': Number(mes)
    });
    const days = [];
    while (stmt.step()) {
      days.push(stmt.getAsObject().dia);
    }
    stmt.free();
    return days;
  }

  addLancamento(entry, options = {}) {
    const id = entry.id || `pix_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const isDemo = entry.is_demo ? 1 : 0;
    const version = entry.version || 1;
    const isDeleted = entry.deleted ? 1 : 0;

    // Normaliza valor para precisão de centavos
    const valorFloat = Math.round(Number(entry.valor) * 100) / 100;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO pix_lancamentos (
        id, loterica, ano, mes, dia, data_formatada, valor, tipo,
        funcionario, cliente, status, observacoes, criado_em, atualizado_em,
        is_demo, version, deleted
      ) VALUES (
        :id, :loterica, :ano, :mes, :dia, :data_formatada, :valor, :tipo,
        :funcionario, :cliente, :status, :observacoes, :criado_em, :atualizado_em,
        :is_demo, :version, :deleted
      )
    `);

    stmt.run({
      ':id': id,
      ':loterica': String(entry.loterica || 'CAÇULA').toUpperCase().trim(),
      ':ano': Number(entry.ano),
      ':mes': Number(entry.mes),
      ':dia': Number(entry.dia),
      ':data_formatada': String(entry.data_formatada || `${entry.ano}-${String(entry.mes).padStart(2, '0')}-${String(entry.dia).padStart(2, '0')}`),
      ':valor': valorFloat,
      ':tipo': String(entry.tipo).toLowerCase().trim(),
      ':funcionario': String(entry.funcionario || '').trim(),
      ':cliente': String(entry.cliente || '').trim(),
      ':status': String(entry.status || 'pendente').toLowerCase().trim(),
      ':observacoes': String(entry.observacoes || '').trim(),
      ':criado_em': entry.criado_em || now,
      ':atualizado_em': entry.atualizado_em || now,
      ':is_demo': isDemo,
      ':version': version,
      ':deleted': isDeleted
    });
    stmt.free();

    const inserted = this.getLancamentoById(id);

    // Enfileira sincronização se não for demo e não vier do sync remoto
    if (!isDemo && !options.fromSync) {
      this.enqueueSync(isDeleted ? 'DELETE' : 'INSERT', id, inserted);
    }

    this.saveToDisk();
    return inserted;
  }

  getLancamentoById(id) {
    const stmt = this.db.prepare('SELECT * FROM pix_lancamentos WHERE id = :id');
    stmt.bind({ ':id': id });
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  }

  updateLancamento(id, updates, options = {}) {
    const existing = this.getLancamentoById(id);
    if (!existing) {
      throw new Error(`Lançamento com ID ${id} não encontrado.`);
    }

    const now = new Date().toISOString();
    const newVersion = options.fromSync && updates.version !== undefined
      ? Number(updates.version)
      : (existing.version || 1) + 1;
    const valorFloat = updates.valor !== undefined 
      ? Math.round(Number(updates.valor) * 100) / 100 
      : existing.valor;

    const isDeleted = updates.deleted !== undefined ? (updates.deleted ? 1 : 0) : (existing.deleted ? 1 : 0);

    const updated = {
      ...existing,
      ...updates,
      valor: valorFloat,
      version: newVersion,
      deleted: isDeleted,
      atualizado_em: options.fromSync && updates.atualizado_em ? updates.atualizado_em : now
    };

    const stmt = this.db.prepare(`
      UPDATE pix_lancamentos SET
        loterica = :loterica,
        ano = :ano,
        mes = :mes,
        dia = :dia,
        data_formatada = :data_formatada,
        valor = :valor,
        tipo = :tipo,
        funcionario = :funcionario,
        cliente = :cliente,
        status = :status,
        observacoes = :observacoes,
        version = :version,
        deleted = :deleted,
        atualizado_em = :atualizado_em
      WHERE id = :id
    `);

    stmt.run({
      ':id': id,
      ':loterica': String(updated.loterica).toUpperCase().trim(),
      ':ano': Number(updated.ano),
      ':mes': Number(updated.mes),
      ':dia': Number(updated.dia),
      ':data_formatada': String(updated.data_formatada || `${updated.ano}-${String(updated.mes).padStart(2, '0')}-${String(updated.dia).padStart(2, '0')}`),
      ':valor': valorFloat,
      ':tipo': String(updated.tipo).toLowerCase().trim(),
      ':funcionario': String(updated.funcionario || '').trim(),
      ':cliente': String(updated.cliente || '').trim(),
      ':status': String(updated.status || 'pendente').toLowerCase().trim(),
      ':observacoes': String(updated.observacoes || '').trim(),
      ':version': newVersion,
      ':deleted': isDeleted,
      ':atualizado_em': updated.atualizado_em
    });
    stmt.free();

    const result = this.getLancamentoById(id);

    if (!existing.is_demo && !options.fromSync) {
      this.enqueueSync(isDeleted ? 'DELETE' : 'UPDATE', id, result);
    }

    this.saveToDisk();
    return result;
  }

  // MÉTODO CRÍTICO: Corrige o erro "db.updateObservacoes is not a function" (PARTE 1)
  updateObservacoes(id, observacoes, status, options = {}) {
    const existing = this.getLancamentoById(id);
    if (!existing) {
      throw new Error(`Lançamento com ID ${id} não encontrado.`);
    }

    const targetObs = observacoes !== undefined ? String(observacoes).trim() : (existing.observacoes || '');
    const targetStatus = status !== undefined ? String(status).toLowerCase().trim() : existing.status;
    const now = new Date().toISOString();
    const newVersion = options.fromSync && options.version !== undefined
      ? Number(options.version)
      : (existing.version || 1) + 1;

    const stmt = this.db.prepare(`
      UPDATE pix_lancamentos SET
        status = :status,
        observacoes = :observacoes,
        version = :version,
        atualizado_em = :atualizado_em
      WHERE id = :id
    `);

    stmt.run({
      ':id': id,
      ':status': targetStatus,
      ':observacoes': targetObs,
      ':version': newVersion,
      ':atualizado_em': now
    });
    stmt.free();

    const result = this.getLancamentoById(id);

    if (!existing.is_demo && !options.fromSync) {
      this.enqueueSync('UPDATE', id, result);
    }

    this.saveToDisk();
    return result;
  }

  toggleStatus(id, newStatus, observacoes, options = {}) {
    const existing = this.getLancamentoById(id);
    if (!existing) {
      throw new Error(`Lançamento com ID ${id} não encontrado.`);
    }

    const targetStatus = newStatus || (existing.status === 'conferido' ? 'pendente' : 'conferido');
    const targetObs = observacoes !== undefined ? observacoes : (existing.observacoes || '');
    const now = new Date().toISOString();
    const newVersion = options.fromSync && options.version !== undefined
      ? Number(options.version)
      : (existing.version || 1) + 1;

    const stmt = this.db.prepare(`
      UPDATE pix_lancamentos SET
        status = :status,
        observacoes = :observacoes,
        version = :version,
        atualizado_em = :atualizado_em
      WHERE id = :id
    `);

    stmt.run({
      ':id': id,
      ':status': targetStatus,
      ':observacoes': targetObs,
      ':version': newVersion,
      ':atualizado_em': now
    });
    stmt.free();

    const result = this.getLancamentoById(id);

    if (!existing.is_demo && !options.fromSync) {
      this.enqueueSync('UPDATE', id, result);
    }

    this.saveToDisk();
    return result;
  }

  deleteLancamento(id, options = {}) {
    const existing = this.getLancamentoById(id);
    if (!existing) return false;

    const now = new Date().toISOString();
    const newVersion = options.fromSync && options.version !== undefined
      ? Number(options.version)
      : (existing.version || 1) + 1;

    // Soft delete (tombstone) para sincronização não ressuscitar registros excluídos
    const stmt = this.db.prepare(`
      UPDATE pix_lancamentos SET
        deleted = 1,
        version = :version,
        atualizado_em = :atualizado_em
      WHERE id = :id
    `);
    stmt.run({
      ':id': id,
      ':version': newVersion,
      ':atualizado_em': now
    });
    stmt.free();

    if (!existing.is_demo && !options.fromSync) {
      this.enqueueSync('DELETE', id, { ...existing, deleted: 1, version: newVersion, atualizado_em: now });
    }

    this.saveToDisk();
    return true;
  }

  // --- HISTÓRICO DE VERSÕES E IDENTIDADE DE DISPOSITIVO ---
  getDeviceIdentity() {
    let deviceId = this.getSyncState('device_id');
    let deviceName = this.getSyncState('device_name');
    if (!deviceId) {
      deviceId = `pc_${os.hostname().toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${Math.random().toString(36).substring(2, 8)}`;
      this.setSyncState('device_id', deviceId);
    }
    if (!deviceName) {
      deviceName = os.hostname() || 'Computador';
      this.setSyncState('device_name', deviceName);
    }
    return { deviceId, deviceName };
  }

  getPendingSyncQueueForFile(loterica, ano, mes) {
    const all = this.getPendingSyncQueue();
    const normLoterica = String(loterica || '').toUpperCase().trim();
    return all.filter(item => {
      try {
        const p = JSON.parse(item.payload);
        return String(p.loterica || '').toUpperCase().trim() === normLoterica &&
               Number(p.ano) === Number(ano) &&
               Number(p.mes) === Number(mes);
      } catch {
        return false;
      }
    });
  }

  getAllLancamentosForFile(loterica, ano, mes, includeDeleted = true) {
    let sql = `
      SELECT id, loterica, ano, mes, dia, data_formatada, valor, tipo, 
             funcionario, cliente, status, observacoes, criado_em, atualizado_em,
             is_demo, version, deleted
      FROM pix_lancamentos
      WHERE loterica = :loterica AND ano = :ano AND mes = :mes
    `;
    if (!includeDeleted) {
      sql += ` AND (deleted = 0 OR deleted IS NULL)`;
    }
    sql += ` ORDER BY dia ASC, valor DESC, id ASC`;
    const stmt = this.db.prepare(sql);
    stmt.bind({
      ':loterica': String(loterica || '').toUpperCase().trim(),
      ':ano': Number(ano),
      ':mes': Number(mes)
    });
    const list = [];
    while (stmt.step()) {
      list.push(stmt.getAsObject());
    }
    stmt.free();
    return list;
  }

  saveVersionHistory(rec) {
    const id = rec.id || `vh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sync_versions_history (
        id, file_key, loterica, ano, mes, version_num, version_id,
        base_version_id, created_at, device_id, device_name, user_email,
        summary, changes_json, snapshot_json
      ) VALUES (
        :id, :file_key, :loterica, :ano, :mes, :version_num, :version_id,
        :base_version_id, :created_at, :device_id, :device_name, :user_email,
        :summary, :changes_json, :snapshot_json
      )
    `);
    stmt.run({
      ':id': id,
      ':file_key': rec.file_key,
      ':loterica': rec.loterica,
      ':ano': Number(rec.ano),
      ':mes': Number(rec.mes),
      ':version_num': Number(rec.version_num),
      ':version_id': rec.version_id,
      ':base_version_id': rec.base_version_id || null,
      ':created_at': rec.created_at || new Date().toISOString(),
      ':device_id': rec.device_id || '',
      ':device_name': rec.device_name || '',
      ':user_email': rec.user_email || '',
      ':summary': rec.summary || '',
      ':changes_json': typeof rec.changes === 'string' ? rec.changes : JSON.stringify(rec.changes || []),
      ':snapshot_json': typeof rec.snapshot === 'string' ? rec.snapshot : JSON.stringify(rec.snapshot || {})
    });
    stmt.free();
    this.saveToDisk();
    return id;
  }

  getVersionHistory(loterica, ano, mes) {
    const stmt = this.db.prepare(`
      SELECT id, file_key, loterica, ano, mes, version_num, version_id,
             base_version_id, created_at, device_id, device_name, user_email,
             summary, changes_json
      FROM sync_versions_history
      WHERE loterica = :loterica AND ano = :ano AND mes = :mes
      ORDER BY version_num DESC
    `);
    stmt.bind({
      ':loterica': String(loterica || '').toUpperCase().trim(),
      ':ano': Number(ano),
      ':mes': Number(mes)
    });
    const list = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      try {
        row.changes = JSON.parse(row.changes_json);
      } catch {
        row.changes = [];
      }
      delete row.changes_json;
      list.push(row);
    }
    stmt.free();
    return list;
  }

  getVersionById(versionId) {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_versions_history
      WHERE version_id = :vid OR id = :vid
    `);
    stmt.bind({ ':vid': versionId });
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    try {
      row.changes = JSON.parse(row.changes_json);
    } catch {
      row.changes = [];
    }
    try {
      row.snapshot = JSON.parse(row.snapshot_json);
    } catch {
      row.snapshot = {};
    }
    return row;
  }

  applySnapshot(loterica, ano, mes, entriesMap, options = {}) {
    const normLoterica = String(loterica || '').toUpperCase().trim();
    const nAno = Number(ano);
    const nMes = Number(mes);
    const entries = Array.isArray(entriesMap) ? entriesMap : Object.values(entriesMap || {});

    for (const entry of entries) {
      const existing = this.getLancamentoById(entry.id);
      const entryData = {
        ...entry,
        loterica: normLoterica,
        ano: nAno,
        mes: nMes
      };
      if (!existing) {
        this.addLancamento(entryData, { fromSync: options.fromSync !== false });
      } else {
        this.updateLancamento(entry.id, entryData, { fromSync: options.fromSync !== false });
      }
    }
    this.saveToDisk();
    return true;
  }

  getDistinctFuncionarios(loterica) {
    const stmt = this.db.prepare(`
      SELECT DISTINCT funcionario 
      FROM pix_lancamentos 
      WHERE loterica = :loterica AND funcionario != '' AND (deleted = 0 OR deleted IS NULL)
      ORDER BY funcionario COLLATE NOCASE ASC
    `);
    stmt.bind({ ':loterica': loterica });
    const list = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (row.funcionario) list.push(row.funcionario);
    }
    stmt.free();
    return list;
  }

  renameFuncionario(loterica, oldName, newName) {
    const trimmedOld = String(oldName || '').trim();
    const trimmedNew = String(newName || '').trim();
    if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return false;

    const stmt = this.db.prepare(`
      UPDATE pix_lancamentos 
      SET funcionario = :newName, atualizado_em = :now
      WHERE loterica = :loterica AND funcionario = :oldName AND (deleted = 0 OR deleted IS NULL)
    `);
    const now = new Date().toISOString();
    stmt.run({
      ':newName': trimmedNew,
      ':oldName': trimmedOld,
      ':loterica': loterica,
      ':now': now
    });
    stmt.free();
    this.saveToDisk();
    return true;
  }

  // Limpeza explícita e segura de dados de demonstração (PARTE 8)
  clearDemoData(loterica = null) {
    let sql = "DELETE FROM pix_lancamentos WHERE is_demo = 1";
    const params = {};
    if (loterica) {
      sql += " AND loterica = :loterica";
      params[':loterica'] = loterica;
    }
    const stmt = this.db.prepare(sql);
    stmt.run(params);
    stmt.free();
    this.saveToDisk();
    return true;
  }

  // --- BASE OFICIAL IMUTÁVEL E RESTAURAÇÃO (OBJETIVO 3 & 4) ---
  getOfficialBaseInfo() {
    try {
      const stmt = this.db.prepare("SELECT * FROM official_base_metadata ORDER BY created_at DESC LIMIT 1;");
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return JSON.parse(row.manifest_json);
      }
      stmt.free();
    } catch {}

    const manifestPath = path.join(path.dirname(this.dbFilePath), 'official_base/official_base_manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {}
    }
    return null;
  }

  getOperationalStats() {
    const res = this.db.exec(`
      SELECT loterica, count(*) as total,
             SUM(CASE WHEN tipo = 'falta' THEN 1 ELSE 0 END) as faltas,
             SUM(CASE WHEN tipo = 'sobra' THEN 1 ELSE 0 END) as sobras,
             SUM(CASE WHEN status = 'conferido' THEN 1 ELSE 0 END) as conferidos,
             SUM(CASE WHEN status != 'conferido' THEN 1 ELSE 0 END) as pendentes
      FROM pix_lancamentos
      WHERE (deleted = 0 OR deleted IS NULL)
      GROUP BY loterica
      ORDER BY loterica;
    `);

    const byLoterica = {};
    let total = 0;
    const byStatus = { conferido: 0, pendente: 0 };

    if (res && res[0]) {
      for (const row of res[0].values) {
        const lot = row[0];
        const count = Number(row[1]);
        byLoterica[lot] = {
          total: count,
          faltas: Number(row[2]),
          sobras: Number(row[3]),
          conferidos: Number(row[4]),
          pendentes: Number(row[5])
        };
        total += count;
        byStatus.conferido += Number(row[4]);
        byStatus.pendente += Number(row[5]);
      }
    }
    return { total, byLoterica, byStatus };
  }

  // --- EXCLUSÃO EM MASSA SEGURA COM AUDITORIA E BACKUP (OBJETIVO 5) ---
  previewBulkDelete({ loterica, ano, mes, dia, tipo }) {
    if (!loterica) throw new Error('A lotérica deve ser informada explicitamente para exclusão em massa.');
    if (!ano || !mes) throw new Error('O ano e mês devem ser informados explicitamente.');

    let query = `
      SELECT id, dia, valor, tipo, funcionario, cliente, status
      FROM pix_lancamentos
      WHERE loterica = :loterica
        AND ano = :ano
        AND mes = :mes
        AND (deleted = 0 OR deleted IS NULL)
    `;
    const params = {
      ':loterica': loterica,
      ':ano': Number(ano),
      ':mes': Number(mes)
    };

    if (dia !== undefined && dia !== null && dia !== 'all' && dia !== '') {
      query += " AND dia = :dia";
      params[':dia'] = Number(dia);
    }

    if (tipo && tipo !== 'ambos' && tipo !== 'all') {
      query += " AND tipo = :tipo";
      params[':tipo'] = tipo;
    }

    const stmt = this.db.prepare(query);
    stmt.bind(params);
    const matched = [];
    let sumCents = 0;

    while (stmt.step()) {
      const row = stmt.getAsObject();
      matched.push(row);
      sumCents += Math.round(Number(row.valor || 0) * 100);
    }
    stmt.free();

    return {
      count: matched.length,
      totalValor: sumCents / 100,
      scope: {
        loterica,
        ano: Number(ano),
        mes: Number(mes),
        dia: (dia && dia !== 'all') ? Number(dia) : 'todos',
        tipo: (tipo && tipo !== 'all') ? tipo : 'ambos'
      },
      sampleEntries: matched.slice(0, 5)
    };
  }

  executeBulkDelete({ loterica, ano, mes, dia, tipo }, options = {}) {
    const preview = this.previewBulkDelete({ loterica, ano, mes, dia, tipo });
    if (preview.count === 0) {
      return { success: true, count: 0, totalValor: 0, message: 'Nenhum lançamento encontrado no escopo informado.' };
    }

    // 1. Gera backup verificado antes da exclusão
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.dirname(this.dbFilePath);
    const backupPath = path.join(backupDir, `pix_lotericas.db.bak_bulk_del_${timestamp}`);
    const currentBuf = this.db.export();
    fs.writeFileSync(backupPath, Buffer.from(currentBuf));

    // Validação com PRAGMA integrity_check
    const backupDb = new this.SQL.Database(fs.readFileSync(backupPath));
    const chk = backupDb.exec("PRAGMA integrity_check;");
    const ok = chk && chk[0] && chk[0].values[0][0] === 'ok';
    backupDb.close();
    if (!ok) {
      throw new Error('Falha na validação do backup prévio. Exclusão em massa cancelada por segurança.');
    }

    // 2. Execução transacional
    try {
      this.db.run("BEGIN TRANSACTION;");

      let fetchQuery = `
        SELECT id, valor, tipo, dia, funcionario, cliente, version
        FROM pix_lancamentos
        WHERE loterica = :loterica
          AND ano = :ano
          AND mes = :mes
          AND (deleted = 0 OR deleted IS NULL)
      `;
      const params = {
        ':loterica': loterica,
        ':ano': Number(ano),
        ':mes': Number(mes)
      };

      if (dia !== undefined && dia !== null && dia !== 'all' && dia !== '') {
        fetchQuery += " AND dia = :dia";
        params[':dia'] = Number(dia);
      }

      if (tipo && tipo !== 'ambos' && tipo !== 'all') {
        fetchQuery += " AND tipo = :tipo";
        params[':tipo'] = tipo;
      }

      const fetchStmt = this.db.prepare(fetchQuery);
      fetchStmt.bind(params);
      const toDelete = [];
      while (fetchStmt.step()) {
        toDelete.push(fetchStmt.getAsObject());
      }
      fetchStmt.free();

      const nowIso = new Date().toISOString();
      const updateStmt = this.db.prepare(`
        UPDATE pix_lancamentos SET
          deleted = 1,
          version = :version,
          atualizado_em = :atualizado_em
        WHERE id = :id;
      `);

      for (const item of toDelete) {
        const newVersion = (Number(item.version) || 1) + 1;
        updateStmt.run({
          ':id': item.id,
          ':version': newVersion,
          ':atualizado_em': nowIso
        });

        // Enfileira exclusão para sincronização via tombstone
        if (!options.fromSync) {
          this.enqueueSync('DELETE', item.id, {
            ...item,
            loterica,
            ano: Number(ano),
            mes: Number(mes),
            deleted: 1,
            version: newVersion,
            atualizado_em: nowIso
          });
        }
      }
      updateStmt.free();

      // Registra no audit_log
      const scopeDesc = `Exclusão em massa: ${loterica} - ${mes}/${ano} (Dia: ${preview.scope.dia}, Tipo: ${preview.scope.tipo})`;
      const auditStmt = this.db.prepare(`
        INSERT INTO audit_log (
          timestamp, action, scope_description, records_affected, backup_path, details_json
        ) VALUES (
          :timestamp, :action, :scope_description, :records_affected, :backup_path, :details_json
        );
      `);
      auditStmt.run({
        ':timestamp': nowIso,
        ':action': 'BULK_DELETE',
        ':scope_description': scopeDesc,
        ':records_affected': toDelete.length,
        ':backup_path': backupPath,
        ':details_json': JSON.stringify(preview.scope)
      });
      auditStmt.free();

      this.db.run("COMMIT;");
      this.saveToDisk();

      return {
        success: true,
        count: toDelete.length,
        totalValor: preview.totalValor,
        backupPath,
        scope: preview.scope
      };

    } catch (err) {
      try { this.db.run("ROLLBACK;"); } catch {}
      throw err;
    }
  }

  close() {
    if (this.db) {
      this.saveToDisk();
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = { PixDatabase };
