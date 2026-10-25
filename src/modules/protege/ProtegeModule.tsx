import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { ArrowRight, Calendar, CheckCircle2, Clock, ExternalLink, FileClock, FileSpreadsheet, FileUp, FilterX, History, Layers, Trash2, User, X } from 'lucide-react';
import { LOTERICAS, formatarMoeda } from './logic/constants.js';
import { parseExcelBuffer } from './logic/parser.js';
import { ProtegeStore } from './logic/store.js';
import { DayFilterPopover, LotericaSelector, ToastNotification, type LotericaOption, type ToastItem } from '../../app/components/SharedMenus';
import './protege.css';

const STORE_KEY = 'checkProtege_state_v1';
const lotericaOrder: Array<keyof typeof LOTERICAS> = ['cacula', 'sorteGrande', 'pupins'];
const lotericaOptions: LotericaOption[] = lotericaOrder.map((key) => ({
  id: key,
  nome: LOTERICAS[key].nome,
  cor: LOTERICAS[key].cor,
  slug: key,
}));

const denominations = [
  ['n1', 1],
  ['n2', 2],
  ['n5', 5],
  ['n10', 10],
  ['n20', 20],
  ['n50', 50],
  ['n100', 100],
  ['n200', 200],
] as const;

function getSharedState() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}

function reloadSharedRecords(store: any, externalData?: any) {
  const shared = externalData || getSharedState();
  if (Array.isArray(shared.records) && shared.records.length > 0) {
    store.recordsMap = new Map(
      shared.records
        .filter((record: any) => record?.id)
        .map((record: any) => [
          record.id,
          record.lotericaKey === 'sorte-grande' ? { ...record, lotericaKey: 'sorteGrande' } : record,
        ])
    );
  } else if (externalData && Array.isArray(externalData.records)) {
    store.recordsMap = new Map();
  }

  if (Array.isArray(shared.historicoImportacoes) && shared.historicoImportacoes.length > 0) {
    store.historicoImportacoes = shared.historicoImportacoes.map((item: any) => ({
      ...item,
      identifiedLotericas: (item.identifiedLotericas || []).map((company: any) =>
        company.key === 'sorte-grande' ? { ...company, key: 'sorteGrande' } : company
      ),
    }));
  } else if (externalData && Array.isArray(externalData.historicoImportacoes)) {
    store.historicoImportacoes = [];
  }

  if (typeof store.ensureHistoryFromRecords === 'function') {
    store.ensureHistoryFromRecords();
  }

  if (
    shared.filtroImportacaoId &&
    store.historicoImportacoes.some((item: any) => item.id === shared.filtroImportacaoId)
  ) {
    store.filtroImportacaoId = shared.filtroImportacaoId;
  } else if (
    store.filtroImportacaoId &&
    !store.historicoImportacoes.some((item: any) => item.id === store.filtroImportacaoId)
  ) {
    store.filtroImportacaoId = null;
  }
}

function getBytesBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function ProtegeModule({ workspaceId }: { workspaceId: string; isActive: boolean }) {
  const storeRef = useRef<any>(null);
  if (!storeRef.current) storeRef.current = new ProtegeStore();
  const store = storeRef.current;
  const [, redraw] = useReducer((value) => value + 1, 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    const syncFromElectron = async () => {
      if (!window.electronAPI?.protege?.getState) return;
      try {
        const persisted = await window.electronAPI.protege.getState();
        if (!mounted || !persisted) return;
        const localRecCount = store.recordsMap.size;
        const localHistCount = (store.historicoImportacoes || []).length;
        const remoteRecCount = Array.isArray(persisted.records) ? persisted.records.length : 0;
        const remoteHistCount = Array.isArray(persisted.historicoImportacoes) ? persisted.historicoImportacoes.length : 0;

        if (remoteRecCount > localRecCount || remoteHistCount > localHistCount) {
          reloadSharedRecords(store, {
            ...getSharedState(),
            records: remoteRecCount >= localRecCount ? persisted.records : Array.from(store.recordsMap.values()),
            historicoImportacoes: remoteHistCount >= localHistCount ? persisted.historicoImportacoes : store.historicoImportacoes,
          });
          store.saveToStorage();
          redraw();
        } else if (localRecCount > remoteRecCount || localHistCount > remoteHistCount) {
          store.saveToStorage();
        }
      } catch {}
    };

    void syncFromElectron();

    const unsubscribe = store.subscribe(() => redraw());
    const refresh = () => {
      reloadSharedRecords(store);
      redraw();
    };
    const localChange = () => {
      refresh();
      window.electronAPI?.events.publishProtegeChanged('storage');
    };
    const remoteChange = (event: any) => {
      if (event.module === 'protege') {
        refresh();
        void syncFromElectron();
      }
    };
    window.addEventListener('lotecontrol:protege-storage-change', localChange);
    const unsubscribeDomain = window.electronAPI?.events.onDomainChanged(remoteChange);
    return () => {
      mounted = false;
      unsubscribe();
      unsubscribeDomain?.();
      window.removeEventListener('lotecontrol:protege-storage-change', localChange);
    };
  }, [store]);

  const rows = store.getFilteredRecords();
  const users = store.getAvailableUsers();
  const daysWithEntries: number[] = typeof store.getDaysWithEntries === 'function' ? store.getDaysWithEntries() : [];
  const history = store.historicoImportacoes || [];
  const filterActive = Boolean(store.filtroUsuario || store.filtroData || store.filtroImportacaoId);

  const selectedDayNumber = useMemo(() => {
    if (!store.filtroData) return null;
    const num = parseInt(String(store.filtroData).split('/')[0], 10);
    return Number.isNaN(num) ? null : num;
  }, [store.filtroData]);

  const set = (fn: () => void) => {
    fn();
    redraw();
  };
  store.filtroEvento = 'all';
  store.filtroUsuarioTexto = '';

  async function importFile(fileName: string, bytes: Uint8Array) {
    setBusy(true);
    setMessage('');
    try {
      if (fileName.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        const result = store.importBackupData(parsed);
        setMessage(`Dados Protege importados: ${result.importedCount} novos, ${result.duplicateCount} duplicados.`);
        setShowHistory(false);
      } else {
        const parsed = parseExcelBuffer(getBytesBuffer(bytes), XLSX);
        if (!parsed.success) throw new Error(parsed.error || 'A planilha não contém registros válidos.');
        const result = store.importParsedResult(parsed, fileName);
        setMessage(
          `Importação concluída: ${result.importadosCount} novos, ${result.duplicadosCount} duplicados e ${result.ignoradosCount} linhas ignoradas.${
            result.unknownCNPJs?.length ? ` CNPJs não reconhecidos: ${result.unknownCNPJs.join(', ')}.` : ''
          }`
        );
        setShowHistory(false);
      }
    } catch (error: any) {
      setMessage(`Não foi possível importar: ${error?.message || error}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function openImport() {
    if (window.electronAPI?.dialog?.openDataFile) {
      const result = await window.electronAPI.dialog.openDataFile('protege');
      if (!result.canceled && result.data && result.fileName) await importFile(result.fileName, result.data);
    } else fileRef.current?.click();
  }

  function deleteHistoryImport(item: any) {
    if (
      !window.confirm(
        `Excluir “${item.fileName || 'Importação sem nome'}” do histórico e remover os registros que pertencem somente a esse arquivo?`
      )
    )
      return;
    const result = store.deleteImportHistory(item.id);
    setMessage(`Importação removida. ${result.deletedRecords} registro(s) exclusivo(s) excluído(s).`);
    redraw();
  }

  function clearImportHistory() {
    if (
      !window.confirm(
        'Limpar o histórico de importações e excluir os registros rastreados por ele? Registros sem vínculo com importações serão preservados.'
      )
    )
      return;
    const result = store.clearImportHistory();
    setMessage(`Histórico limpo. ${result.deletedRecords} registro(s) rastreado(s) excluído(s).`);
    redraw();
  }

  const currency = useMemo(() => (value: number) => formatarMoeda(value), []);

  const activeToast: ToastItem | null = useMemo(() => {
    if (message) {
      const isError = message.startsWith('Não foi') || message.startsWith('Erro');
      return {
        tone: isError ? 'danger' : 'success',
        text: message,
        onClose: () => setMessage(''),
      };
    }
    if (store.filtroImportacaoId) {
      const entry = store.getImportHistoryEntry(store.filtroImportacaoId);
      return {
        tone: 'info',
        text: `Exibindo apenas os registros da importação selecionada no histórico${entry?.fileName ? ` (${entry.fileName})` : ''}.`,
        actionLabel: 'Mostrar todos',
        onAction: () => set(() => store.setFiltroImportacao(null)),
        onClose: () => set(() => store.setFiltroImportacao(null)),
      };
    }
    return null;
  }, [message, store.filtroImportacaoId]);

  return (
    <section className="pc-module" data-module-ready="protege" data-workspace-id={workspaceId}>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void file.arrayBuffer().then((buffer) => importFile(file.name, new Uint8Array(buffer)));
        }}
      />

      <ToastNotification
        toast={activeToast}
        onDismiss={message ? () => setMessage('') : undefined}
      />

      {/* Shared Standardized Top Menu */}
      <header className="lc-top-menu pc-toolbar">
        <div className="lc-menu-row">
          <div className="lc-menu-group">
            <LotericaSelector
              options={lotericaOptions}
              selectedId={showHistory ? '' : store.lotericaAtiva}
              onSelect={(key) => {
                setShowHistory(false);
                set(() => store.setLoterica(key));
              }}
            />
          </div>

          <div className="lc-menu-group pc-toolbar-actions">
            <button
              type="button"
              className={`lc-btn pc-button ${showHistory ? 'lc-btn-soft-active pc-button-active' : 'lc-btn-outline'}`}
              onClick={() => setShowHistory((prev) => !prev)}
            >
              <History size={16} />
              <span>Histórico</span>
              <span className="pc-count">{history.length}</span>
            </button>
            <button
              type="button"
              className="lc-btn lc-btn-primary pc-button pc-button-primary"
              onClick={() => void openImport()}
              disabled={busy}
            >
              <FileUp size={16} />
              <span>{busy ? 'Lendo…' : 'Importar Planilha'}</span>
            </button>
          </div>
        </div>

        {!showHistory && (
          <div className="lc-menu-row pc-filters-row">
            <div className="lc-menu-group">
              <div className="rp-months pc-user-strip" role="group" aria-label="Selecionar usuário">
                <span className="pc-user-strip-label">
                  <User size={13} />
                  <span>Usuário</span>
                </span>
                <button
                  type="button"
                  className={!store.filtroUsuario ? 'active' : ''}
                  onClick={() => set(() => store.setFiltroUsuario(null))}
                >
                  Todos
                </button>
                {users.map((user: string) => (
                  <button
                    type="button"
                    key={user}
                    className={store.filtroUsuario === user ? 'active' : ''}
                    onClick={() => set(() => store.setFiltroUsuario(user))}
                  >
                    {user}
                  </button>
                ))}
              </div>

              <DayFilterPopover
                selectedDay={selectedDayNumber}
                daysWithEntries={daysWithEntries}
                onSelectDay={(day) => set(() => store.setFiltroData(day === null ? null : String(day)))}
                isOpen={dayMenuOpen}
                onToggleOpen={() => setDayMenuOpen((open) => !open)}
                onClose={() => setDayMenuOpen(false)}
                allDaysLabel="Todos os dias"
              />

              {filterActive && (
                <button
                  type="button"
                  className="lc-btn lc-btn-outline lc-btn-sm pc-clear-filters-btn"
                  onClick={() => set(() => store.clearAllFilters())}
                >
                  <FilterX size={14} />
                  <span>Limpar filtros</span>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="pc-content">
        {showHistory ? (
          <div className="max-w-6xl mx-auto px-4 py-6 bg-white w-full">
            {/* Top Header (Identical to Pix HistoryView) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-200 gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-[#12385f] tracking-tight flex items-center gap-2.5">
                  <Layers className="w-6 h-6 text-[#12385f]" />
                  Histórico de Importações
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Reabra uma planilha importada anteriormente para consultar os registros da Protege.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clearImportHistory}
                    className="lc-btn lc-btn-danger"
                  >
                    <Trash2 size={15} />
                    <span>Limpar Histórico</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="lc-btn lc-btn-primary"
                >
                  <span>Voltar à Planilha Ativa</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>

            {/* History Cards List (Identical to Pix HistoryView) */}
            {history.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-[#e8f1fa] border border-[#c7d9ec] flex items-center justify-center text-[#12385f] mx-auto mb-3">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Nenhuma planilha no histórico</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Quando você importar uma planilha da Protege, ela será registrada automaticamente no histórico local.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {history.map((item: any) => {
                  const date = new Date(item.importedAt);
                  const formattedDate = Number.isNaN(date.getTime())
                    ? 'Data não informada'
                    : date.toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                  const identified = item.identifiedLotericas || [];
                  const lotericasLabel =
                    identified.length > 0
                      ? identified
                          .map(
                            (company: any) =>
                              company.nome ||
                              LOTERICAS[company.key as keyof typeof LOTERICAS]?.nome ||
                              company.key
                          )
                          .join(', ')
                      : 'Todas as lotéricas';
                  const isItemActive = store.filtroImportacaoId === item.id;
                  const totalCount = (item.recordIds || []).length;
                  const novosCount = item.importadosCount ?? totalCount;
                  const duplicadosCount = item.duplicadosCount || 0;
                  const ignoradosCount = item.ignoradosCount || 0;

                  return (
                    <div
                      key={item.id}
                      className={`pix-history-card bg-white rounded-xl border transition-all ${
                        isItemActive
                          ? 'border-blue-400 ring-2 ring-blue-800/10'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* File info */}
                      <div className="pix-history-card-meta">
                        <div className="w-11 h-11 rounded-xl bg-[#e8f1fa] border border-[#c7d9ec] text-[#12385f] flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-5 h-5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4
                              className="text-sm font-bold text-slate-900 truncate"
                              title={item.fileName || 'Importação sem nome'}
                            >
                              {item.fileName || 'Importação sem nome'}
                            </h4>
                            {isItemActive && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f1fa] text-[#12385f] border border-[#c7d9ec]">
                                Sessão Ativa
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 mt-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1 font-medium">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {formattedDate}
                            </span>
                            <span>•</span>
                            <span className="text-slate-600 font-semibold">
                              Lotérica: {lotericasLabel}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pix-history-actions">
                        <button
                          type="button"
                          onClick={() => {
                            set(() => store.setFiltroImportacao(isItemActive ? null : item.id));
                            setShowHistory(false);
                          }}
                          className="pix-history-open cursor-pointer"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>{isItemActive ? 'Mostrar todos' : 'Abrir importação'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteHistoryImport(item)}
                          className="pix-history-delete"
                          title="Excluir esta planilha do histórico"
                          aria-label={`Excluir ${item.fileName || 'importação'} do histórico`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Metrics Badges */}
                      <div className="pix-history-metrics grid grid-cols-4 items-center gap-3 sm:gap-5 shrink-0">
                        <div className="text-center">
                          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                            Total Protege
                          </div>
                          <div className="text-lg font-black text-[#12385f] mt-0.5">
                            {totalCount}
                          </div>
                        </div>

                        <div className="text-center">
                          <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Novos
                          </div>
                          <div className="text-lg font-black text-emerald-700 mt-0.5">
                            {novosCount}
                          </div>
                        </div>

                        <div className="text-center">
                          <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Duplicados
                          </div>
                          <div className="text-lg font-black text-amber-700 mt-0.5">
                            {duplicadosCount}
                          </div>
                        </div>

                        <div className="text-center">
                          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                            Ignorados
                          </div>
                          <div className="text-lg font-black text-slate-600 mt-0.5">
                            {ignoradosCount}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="pc-table-card">
            <div className="pc-table-scroll">
              <table className="pc-table">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Horário</th>
                    <th>Usuário</th>
                    <th>Cofre</th>
                    <th className="numeric">Valor Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record: any) => (
                    <tr
                      key={record.id}
                      onClick={() => setSelectedRecord(record)}
                      tabIndex={0}
                      onKeyDown={(event) => event.key === 'Enter' && setSelectedRecord(record)}
                    >
                      <td>{record.dataOnly || String(record.data || '').split(' ')[0] || '—'}</td>
                      <td>{String(record.data || '').match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0] || '—'}</td>
                      <td>
                        <span className="pc-user-badge">{record.usuario || '—'}</span>
                      </td>
                      <td>{record.cofre || '—'}</td>
                      <td className="numeric pc-value">{currency(record.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <div className="pc-empty">
                  <FileClock size={20} />
                  <span>
                    {store.recordsMap.size
                      ? 'Nenhum registro corresponde aos filtros.'
                      : 'Importe uma planilha para começar.'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedRecord && (
        <div
          className="pc-overlay"
          onMouseDown={(event) => event.target === event.currentTarget && setSelectedRecord(null)}
        >
          <section
            className="pc-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pc-detail-title"
          >
            <header>
              <div>
                <p className="pc-eyebrow">DETALHE DO REGISTRO</p>
                <h2 id="pc-detail-title">
                  {selectedRecord.lotericaNome} · {selectedRecord.dataOnly}
                </h2>
              </div>
              <button
                className="pc-close"
                type="button"
                onClick={() => setSelectedRecord(null)}
                aria-label="Fechar"
              >
                <X size={17} />
              </button>
            </header>
            <div className="pc-detail-grid">
              <div>
                <span>Transação</span>
                <strong>{selectedRecord.transacao}</strong>
              </div>
              <div>
                <span>Evento</span>
                <strong>{selectedRecord.evento}</strong>
              </div>
              <div>
                <span>Cofre</span>
                <strong>{selectedRecord.cofre}</strong>
              </div>
              <div>
                <span>Usuário</span>
                <strong>{selectedRecord.usuario}</strong>
              </div>
              <div>
                <span>Data Transação</span>
                <strong>{selectedRecord.dataTransacao || '—'}</strong>
              </div>
              <div>
                <span>Data Integração</span>
                <strong>{selectedRecord.dataIntegracao || '—'}</strong>
              </div>
              <div>
                <span>Quantidade de cédulas</span>
                <strong>{selectedRecord.cedulas || 0}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{currency(selectedRecord.total)}</strong>
              </div>
            </div>
            <h3>Composição de cédulas</h3>
            <div className="pc-denominations">
              {denominations.map(([key, value]) => (
                <div key={key}>
                  <span>
                    {value.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  <strong>{selectedRecord.notas?.[key] || 0}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
