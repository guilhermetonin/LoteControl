// ==========================================================================
// CheckProtege - Store: Gerenciamento de Estado, Filtros e Persistência
// ==========================================================================

import { LOTERICAS, extrairAno } from './constants.js';

const STORAGE_KEY = 'checkProtege_state_v1';

export class ProtegeStore {
  constructor(initialData = null) {
    this.lotericaAtiva = 'cacula';
    this.recordsMap = new Map(); // id -> record
    this.filtroUsuario = null; // null ou string exata do usuário ('2', '5', etc.)
    this.filtroUsuarioTexto = ''; // busca digitada
    this.filtroData = null; // null ou string da data ('01/10', '01/10/2026')
    this.filtroEvento = 'all'; // 'all', 'Depósito', 'Coleta'
    this.filtroImportacaoId = null;
    this.historicoImportacoes = [];
    this._activeImportCache = null;
    this.lastImportResult = null;
    this.subscribers = new Set();

    if (initialData) {
      this.loadFromData(initialData);
    } else {
      this.loadFromStorage();
    }
  }

  /**
   * Inscreve um callback para ser chamado quando o estado mudar
   */
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  notify() {
    this.saveToStorage();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lotecontrol:protege-storage-change'));
    }
    for (const fn of this.subscribers) {
      try {
        fn(this);
      } catch (err) {
        console.error('Erro em subscriber do store:', err);
      }
    }
  }

  /**
   * Carrega dados do LocalStorage
   */
  loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.loadFromData(data);
      }
    } catch (err) {
      console.warn('Erro ao carregar do LocalStorage:', err);
    }
  }

  loadFromData(data) {
    if (!data) return;
    const activeCompany = data.lotericaAtiva === 'sorte-grande' ? 'sorteGrande' : data.lotericaAtiva;
    if (activeCompany && LOTERICAS[activeCompany]) {
      this.lotericaAtiva = activeCompany;
    }
    if (Array.isArray(data.records)) {
      this.recordsMap.clear();
      data.records.forEach(r => {
        if (r && r.id) {
          this.recordsMap.set(r.id, r.lotericaKey === 'sorte-grande' ? { ...r, lotericaKey: 'sorteGrande' } : r);
        }
      });
    }
    this.historicoImportacoes = Array.isArray(data.historicoImportacoes)
      ? data.historicoImportacoes.filter(item => item && item.id && Array.isArray(item.recordIds)).map(item => ({
        ...item,
        identifiedLotericas: (item.identifiedLotericas || []).map(company => company.key === 'sorte-grande' ? { ...company, key: 'sorteGrande' } : company)
      }))
      : [];
    this.ensureHistoryFromRecords();
    this.filtroImportacaoId = data.filtroImportacaoId && this.historicoImportacoes.some(item => item.id === data.filtroImportacaoId)
      ? data.filtroImportacaoId
      : null;
  }

  ensureHistoryFromRecords() {
    if (this.recordsMap.size === 0) return;
    const trackedIds = new Set(
      (this.historicoImportacoes || []).flatMap(item => Array.isArray(item.recordIds) ? item.recordIds : [])
    );
    const untrackedByCompany = new Map();
    for (const record of this.recordsMap.values()) {
      if (!record || !record.id || trackedIds.has(record.id)) continue;
      const key = record.lotericaKey === 'sorte-grande' ? 'sorteGrande' : (record.lotericaKey || 'cacula');
      if (!untrackedByCompany.has(key)) untrackedByCompany.set(key, []);
      untrackedByCompany.get(key).push(record);
    }
    for (const [lotKey, recs] of untrackedByCompany.entries()) {
      if (!recs.length) continue;
      const company = LOTERICAS[lotKey];
      const fileSlug = lotKey === 'sorteGrande' ? 'sorte-grande' : lotKey;
      let latestTs = 0;
      for (const r of recs) {
        const dPart = String(r.dataIntegracao || r.dataTransacao || r.data || '').split(' ')[0];
        const parts = dPart.split('/');
        if (parts.length === 3) {
          const ts = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
          if (!Number.isNaN(ts) && ts > latestTs) latestTs = ts;
        }
      }
      this.historicoImportacoes.push({
        id: `import_recovered_${lotKey}`,
        fileName: `${fileSlug}.xlsx`,
        importedAt: latestTs > 0 ? new Date(latestTs).toISOString() : new Date().toISOString(),
        recordIds: recs.map(r => r.id),
        importadosCount: recs.length,
        duplicadosCount: 0,
        ignoradosCount: 0,
        identifiedLotericas: company ? [{ key: lotKey, nome: company.nome }] : [{ key: lotKey, nome: lotKey }]
      });
    }
  }

  /**
   * Salva estado no LocalStorage e no processo principal do Electron
   */
  saveToStorage() {
    const data = {
      lotericaAtiva: this.lotericaAtiva,
      records: Array.from(this.recordsMap.values()),
      historicoImportacoes: this.historicoImportacoes,
      filtroImportacaoId: this.filtroImportacaoId,
    };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (err) {
        console.warn('Erro ao salvar no LocalStorage:', err);
      }
    }
    if (typeof window !== 'undefined' && window.electronAPI?.protege?.saveState) {
      void window.electronAPI.protege.saveState(data).catch(() => {});
    }
  }

  importBackupData(data) {
    if (!data || !Array.isArray(data.records)) {
      throw new Error('O arquivo não contém uma lista de registros Protege válida.');
    }
    const beforeCount = this.recordsMap.size;
    let importedCount = 0;
    let duplicateCount = 0;
    for (const record of data.records) {
      if (!record || !record.id || !record.lotericaKey || !record.transacao) continue;
      if (this.recordsMap.has(record.id)) duplicateCount++;
      else { this.recordsMap.set(record.id, record); importedCount++; }
    }
    const knownHistory = new Set(this.historicoImportacoes.map((item) => item.id));
    const importedHistory = Array.isArray(data.historicoImportacoes) ? data.historicoImportacoes : [];
    for (const item of importedHistory) {
      if (item?.id && Array.isArray(item.recordIds) && !knownHistory.has(item.id)) {
        this.historicoImportacoes.push(item);
        knownHistory.add(item.id);
      }
    }
    if (!importedCount && !data.records.length && !beforeCount) {
      throw new Error('O arquivo não contém registros para importar.');
    }
    this.notify();
    return { importedCount, duplicateCount, totalCount: this.recordsMap.size };
  }

  /**
   * Importa registros processados pelo parser
   */
  importParsedResult(parsed, fileName = '') {
    if (!parsed || !parsed.records) {
      return {
        importadosCount: 0,
        duplicadosCount: 0,
        ignoradosCount: parsed ? parsed.ignoredRowsCount : 0,
        identifiedLotericas: [],
        unknownCNPJs: []
      };
    }

    let importadosCount = 0;
    let duplicadosCount = 0;

    for (const record of parsed.records) {
      if (this.recordsMap.has(record.id)) {
        duplicadosCount++;
      } else {
        this.recordsMap.set(record.id, record);
        importadosCount++;
      }
    }

    // Se identificou apenas uma lotérica no arquivo e ela possui registros, troca para ela automaticamente
    if (parsed.identifiedLotericas && parsed.identifiedLotericas.length === 1) {
      this.lotericaAtiva = parsed.identifiedLotericas[0].key;
      // Reseta filtros para visualização completa
      this.filtroUsuario = null;
      this.filtroData = null;
      this.filtroUsuarioTexto = '';
    }

    const result = {
      importadosCount,
      duplicadosCount,
      ignoradosCount: parsed.ignoredRowsCount || 0,
      totalLinhas: parsed.totalRowsInFile || 0,
      identifiedLotericas: parsed.identifiedLotericas || [],
      unknownCNPJs: parsed.unknownCNPJs || [],
      hasMultipleCompanies: parsed.hasMultipleCompanies
    };

    const historyId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.historicoImportacoes.unshift({
      id: historyId,
      fileName: String(fileName || parsed.fileName || 'Importação sem nome').slice(0, 240),
      importedAt: new Date().toISOString(),
      recordIds: Array.from(new Set(parsed.records.map(record => record && record.id).filter(Boolean))),
      importadosCount,
      duplicadosCount,
      ignoradosCount: result.ignoradosCount,
      identifiedLotericas: (parsed.identifiedLotericas || []).map(item => ({
        key: item.key,
        nome: item.nome
      }))
    });

    this.lastImportResult = result;
    this.notify();
    return result;
  }

  getImportHistoryEntry(id) {
    return this.historicoImportacoes.find(item => item.id === id) || null;
  }

  deleteImportHistory(id) {
    const entry = this.getImportHistoryEntry(id);
    if (!entry) return { deletedRecords: 0 };
    this.historicoImportacoes = this.historicoImportacoes.filter(item => item.id !== id);
    const stillReferenced = new Set(this.historicoImportacoes.flatMap(item => item.recordIds || []));
    let deletedRecords = 0;
    for (const recordId of entry.recordIds || []) {
      if (!stillReferenced.has(recordId) && this.recordsMap.delete(recordId)) deletedRecords++;
    }
    if (this.filtroImportacaoId === id) this.filtroImportacaoId = null;
    this._activeImportCache = null;
    this.notify();
    return { deletedRecords };
  }

  clearImportHistory() {
    const trackedIds = new Set(this.historicoImportacoes.flatMap(item => item.recordIds || []));
    this.historicoImportacoes = [];
    let deletedRecords = 0;
    for (const recordId of trackedIds) if (this.recordsMap.delete(recordId)) deletedRecords++;
    this.filtroImportacaoId = null;
    this._activeImportCache = null;
    this.notify();
    return { deletedRecords };
  }

  setFiltroImportacao(id) {
    const entry = id ? this.getImportHistoryEntry(id) : null;
    this.filtroImportacaoId = entry ? entry.id : null;
    this._activeImportCache = null;
    this.filtroUsuario = null;
    this.filtroUsuarioTexto = '';
    this.filtroData = null;
    this.filtroEvento = 'all';
    if (entry?.identifiedLotericas?.length === 1 && LOTERICAS[entry.identifiedLotericas[0].key]) {
      this.lotericaAtiva = entry.identifiedLotericas[0].key;
    }
    this.notify();
  }

  /**
   * Troca a lotérica ativa
   */
  setLoterica(lotericaKey) {
    if (this.lotericaAtiva === lotericaKey) return;
    this.lotericaAtiva = lotericaKey;
    // Ao trocar de lotérica, limpa os filtros ativos para evitar incompatibilidade
    this.filtroUsuario = null;
    this.filtroUsuarioTexto = '';
    this.filtroData = null;
    this.filtroImportacaoId = null;
    this.notify();
  }

  /**
   * Define o filtro de usuário via badge (clique no retângulo)
   */
  setFiltroUsuario(usuario) {
    if (usuario === 'all' || usuario === null || usuario === undefined) {
      this.filtroUsuario = null;
    } else {
      this.filtroUsuario = String(usuario).trim();
    }
    this.notify();
  }

  /**
   * Define a busca digitada de usuário
   */
  setFiltroUsuarioTexto(texto) {
    this.filtroUsuarioTexto = String(texto || '').trim();
    // Se digitou exatamente o número de um usuário, sincroniza o badge
    if (this.filtroUsuarioTexto) {
      const avail = this.getAvailableUsers();
      if (avail.includes(this.filtroUsuarioTexto)) {
        this.filtroUsuario = this.filtroUsuarioTexto;
      }
    }
    this.notify();
  }

  /**
   * Define o filtro de data via badge (clique no retângulo)
   */
  setFiltroData(dataVal) {
    if (dataVal === 'all' || dataVal === null || dataVal === undefined) {
      this.filtroData = null;
    } else {
      this.filtroData = String(dataVal).trim();
    }
    this.notify();
  }

  /**
   * Define o filtro de evento ('all', 'Depósito', 'Coleta')
   */
  setFiltroEvento(evento) {
    this.filtroEvento = evento || 'all';
    this.notify();
  }

  /**
   * Limpa somente o filtro de data, preservando o de usuário
   */
  clearFiltroData() {
    this.filtroData = null;
    this.notify();
  }

  /**
   * Limpa somente o filtro de usuário, preservando o de data
   */
  clearFiltroUsuario() {
    this.filtroUsuario = null;
    this.filtroUsuarioTexto = '';
    this.notify();
  }

  /**
   * Limpa todos os filtros da lotérica atual
   */
  clearAllFilters() {
    this.filtroUsuario = null;
    this.filtroUsuarioTexto = '';
    this.filtroData = null;
    this.filtroEvento = 'all';
    this.filtroImportacaoId = null;
    this.notify();
  }

  isInActiveImport(record) {
    if (!this.filtroImportacaoId) return true;
    if (this._activeImportCache?.id !== this.filtroImportacaoId) {
      const entry = this.getImportHistoryEntry(this.filtroImportacaoId);
      this._activeImportCache = {
        id: this.filtroImportacaoId,
        recordIds: new Set(entry ? entry.recordIds : [])
      };
    }
    return this._activeImportCache.recordIds.has(record.id);
  }

  /**
   * Retorna os registros da lotérica ativa sem filtros
   */
  getRecordsForActiveLoterica() {
    const list = [];
    for (const record of this.recordsMap.values()) {
      if (record.lotericaKey === this.lotericaAtiva) {
        list.push(record);
      }
    }
    return list;
  }

  /**
   * Retorna os badges de usuários disponíveis para a lotérica ativa, ordenados numericamente
   */
  getAvailableUsers() {
    const usersSet = new Set();
    for (const record of this.recordsMap.values()) {
      if (record.lotericaKey === this.lotericaAtiva && record.usuario) {
        if (!this.isInActiveImport(record)) continue;
        usersSet.add(record.usuario);
      }
    }
    // Ordenação numérica: 1, 2, 4, 5, 6, 7, 10, 12, 3007
    return Array.from(usersSet).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return String(a).localeCompare(String(b));
    });
  }

  /**
   * Retorna os badges de datas disponíveis para a lotérica ativa,
   * ordenados cronologicamente da mais recente para a mais antiga.
   */
  getAvailableDates() {
    const records = this.getRecordsForActiveLoterica().filter(record => this.isInActiveImport(record));
    if (records.length === 0) return [];

    // Checa se existem anos diferentes no conjunto
    const anos = new Set();
    const mapDatas = new Map(); // key -> { diaMes, dataOnly, dataIso, timestamp, label }

    records.forEach(r => {
      const ano = extrairAno(r.dataOnly);
      if (ano) anos.add(ano);

      const key = r.dataOnly; // '01/10/2026'
      if (!mapDatas.has(key)) {
        // Converte DD/MM/AAAA para timestamp para ordenação exata
        const partes = key.split('/');
        let ts = 0;
        if (partes.length === 3) {
          ts = new Date(parseInt(partes[2], 10), parseInt(partes[1], 10) - 1, parseInt(partes[0], 10)).getTime();
        }
        mapDatas.set(key, {
          dataOnly: key,
          diaMes: r.diaMes, // '01/10'
          timestamp: ts,
          label: r.diaMes
        });
      }
    });

    const temAnosDiferentes = anos.size > 1;

    // Se houver anos diferentes, diferencia no label para evitar ambiguidade (ex: 01/10/25 vs 01/10/26)
    const datasArray = Array.from(mapDatas.values()).map(item => {
      if (temAnosDiferentes) {
        const anoStr = item.dataOnly.split('/')[2];
        const anoCurto = anoStr ? anoStr.slice(-2) : '';
        return {
          ...item,
          label: `${item.diaMes}/${anoCurto}`
        };
      }
      return item;
    });

    // Ordenação cronológica: da mais recente para a mais antiga (descendente)
    datasArray.sort((a, b) => b.timestamp - a.timestamp);

    return datasArray;
  }

  /**
   * Retorna os números dos dias (1..31) que possuem lançamentos na lotérica ativa
   */
  getDaysWithEntries() {
    const days = new Set();
    const records = this.getRecordsForActiveLoterica().filter(record => this.isInActiveImport(record));
    for (const record of records) {
      if (this.filtroUsuario !== null && record.usuario !== this.filtroUsuario) continue;
      const dStr = String(record.dataOnly || record.diaMes || record.data || '').split('/')[0];
      const dayNum = parseInt(dStr, 10);
      if (!Number.isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
        days.add(dayNum);
      }
    }
    return Array.from(days).sort((a, b) => a - b);
  }

  /**
   * Retorna os registros que atendem simultaneamente a TODOS os filtros ativos
   */
  getFilteredRecords() {
    const list = [];

    for (const record of this.recordsMap.values()) {
      // 1. Filtro de Lotérica
      if (record.lotericaKey !== this.lotericaAtiva) {
        continue;
      }

      // 1b. Histórico de importações selecionado
      if (!this.isInActiveImport(record)) {
        continue;
      }

      // 2. Filtro de Usuário via Badge (Identificação EXATA obrigatória: '5' !== '15')
      if (this.filtroUsuario !== null) {
        if (record.usuario !== this.filtroUsuario) {
          continue;
        }
      }

      // 3. Filtro de Usuário via Pesquisa Digitada
      if (this.filtroUsuarioTexto) {
        // Se a busca digitada é um número e o usuário não coincide exatamente
        const termo = this.filtroUsuarioTexto.trim();
        if (termo && record.usuario !== termo && !record.usuario.includes(termo)) {
          continue;
        }
      }

      // 4. Filtro de Data via Seletor de Dia (1..31) ou Data completa (DD/MM ou DD/MM/AAAA)
      if (this.filtroData !== null) {
        const filterStr = String(this.filtroData).trim();
        if (/^\d{1,2}$/.test(filterStr)) {
          const dayNum = parseInt(filterStr, 10);
          const recDay = parseInt(String(record.dataOnly || record.diaMes || record.data || '').split('/')[0], 10);
          if (recDay !== dayNum) {
            continue;
          }
        } else if (
          record.diaMes !== filterStr &&
          record.dataOnly !== filterStr &&
          !String(record.data || '').startsWith(filterStr)
        ) {
          continue;
        }
      }

      // 5. Filtro de Evento (Depósito ou Coleta)
      if (this.filtroEvento !== 'all') {
        const evNorm = (record.evento || '').toLowerCase();
        const filtNorm = this.filtroEvento.toLowerCase();
        if (!evNorm.includes(filtNorm)) {
          continue;
        }
      }

      list.push(record);
    }

    // Ordenação padrão: data/hora decrescente
    list.sort((a, b) => {
      // Converte data "DD/MM/AAAA HH:mm:ss" para timestamp
      const parseTs = str => {
        if (!str) return 0;
        const [dPart, tPart] = str.split(' ');
        if (!dPart) return 0;
        const [d, m, y] = dPart.split('/');
        const [hh = 0, mm = 0, ss = 0] = (tPart || '').split(':');
        return new Date(y, m - 1, d, hh, mm, ss).getTime();
      };
      return parseTs(b.data) - parseTs(a.data);
    });

    return list;
  }

  /**
   * Estatísticas calculadas em tempo real com base nos filtros ativos
   */
  getStats() {
    const filtered = this.getFilteredRecords();
    const allForLoterica = this.getRecordsForActiveLoterica();

    let totalCentavos = 0;
    let depositosCentavos = 0;
    let coletasCentavos = 0;
    let depositosCount = 0;
    let coletasCount = 0;
    let totalCedulas = 0;

    for (const r of filtered) {
      const cents = r.totalCentavos || Math.round(r.total * 100);
      totalCentavos += cents;
      totalCedulas += r.cedulas || 0;

      const ev = (r.evento || '').toLowerCase();
      if (ev.includes('dep')) {
        depositosCentavos += cents;
        depositosCount++;
      } else if (ev.includes('col')) {
        coletasCentavos += cents;
        coletasCount++;
      }
    }

    return {
      filteredCount: filtered.length,
      filteredTotal: totalCentavos / 100,
      filteredDepositos: depositosCentavos / 100,
      filteredColetas: coletasCentavos / 100,
      depositosCount,
      coletasCount,
      totalCedulas,
      totalLotericaCount: allForLoterica.length
    };
  }

  /**
   * Conta de registros por lotérica
   */
  getLotericaCounts() {
    const counts = {
      cacula: 0,
      sorteGrande: 0,
      pupins: 0,
      desconhecida: 0
    };
    for (const record of this.recordsMap.values()) {
      if (counts[record.lotericaKey] !== undefined) {
        counts[record.lotericaKey]++;
      } else {
        counts.desconhecida++;
      }
    }
    return counts;
  }

  /**
   * Limpa todos os dados da lotérica ativa
   */
  clearActiveLotericaData() {
    for (const [id, record] of this.recordsMap.entries()) {
      if (record.lotericaKey === this.lotericaAtiva) {
        this.recordsMap.delete(id);
      }
    }
    this.clearAllFilters();
  }

  /**
   * Limpa todo o banco de dados
   */
  clearAllData() {
    this.recordsMap.clear();
    this.clearAllFilters();
  }
}
