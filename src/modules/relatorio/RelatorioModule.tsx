import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle, ArrowDownUp, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3,
  Cloud, Download, FileJson, Plus, RefreshCw, Search, Settings, Settings2, Trash2, UserRoundPen, X,
} from 'lucide-react';
import { LOTERICAS } from '../protege/logic/constants.js';
import { DayFilterPopover, LotericaSelector, ToastNotification, type LotericaOption, type ToastItem } from '../../app/components/SharedMenus';
import './relatorio.css';

const companies = ['CAÇULA', 'SORTE GRANDE', 'PUPINS'];
const companyDetails = [LOTERICAS.cacula, LOTERICAS.sorteGrande, LOTERICAS.pupins];
const reportLotericaOptions: LotericaOption[] = companies.map((name, index) => ({
  id: name,
  nome: companyDetails[index].nome,
  cor: companyDetails[index].cor,
}));
const monthLabels = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
type Section = 'operacao' | 'historico' | 'sincronizacao';
type Draft = { id?: string; tipo: 'falta' | 'sobra'; dia: string; valor: string; funcionario: string; cliente: string; status: string };

function amountCents(raw: string) {
  let value = String(raw || '').replace(/R\$\s?/g, '').trim();
  if (!value) return 0;
  // Values are entered in pt-BR format. Dots grouped in triples are thousands
  // separators (3.150 means R$ 3.150,00); a comma marks decimal cents.
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}
function dateString(year: number, month: number, day: number) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
function daysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }
function valueDraft(value: any) { return (Number(value || 0)).toFixed(2).replace('.', ','); }

export function RelatorioModule({ workspaceId, isActive }: { workspaceId: string; isActive: boolean }) {
  const now = new Date();
  const [company, setCompany] = useState(companies[0]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [dayFilterOpen, setDayFilterOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [employees, setEmployees] = useState<string[]>([]);
  const [officialBase, setOfficialBase] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [section, setSection] = useState<Section>('operacao');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bulk, setBulk] = useState<any>(null);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(0);
  const [firstVersion, setFirstVersion] = useState('');
  const [secondVersion, setSecondVersion] = useState('');
  const [comparison, setComparison] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<any>({ status: 'Carregando' });
  const [syncConfig, setSyncConfig] = useState<any>({ clientId: '', clientSecret: '', folderId: '', syncIntervalSec: 5, autoSync: true });
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [remoteDiff, setRemoteDiff] = useState<any>(null);
  const [renameForm, setRenameForm] = useState<{ oldName: string; newName: string } | null>(null);

  const api = window.electronAPI?.report;
  const refreshData = useCallback(async (showSpinner = true) => {
    if (!api) { setLoading(false); return; }
    if (showSpinner) setLoading(true);
    try {
      const [items, availableDays, availableEmployees, baseInfo] = await Promise.all([
        api.getLancamentos(company, year, month, dayFilter),
        api.getDaysWithEntries(company, year, month),
        api.getFuncionarios(company),
        api.getOfficialBaseInfo(),
      ]);
      setRows(items || []);
      setDays(availableDays || []);
      setEmployees(availableEmployees || []);
      setOfficialBase(baseInfo || null);
      setError('');
    } catch (reason: any) { setError(reason?.message || 'Não foi possível carregar os lançamentos.'); }
    finally { if (showSpinner) setLoading(false); }
  }, [api, company, year, month, dayFilter]);

  const refreshSync = useCallback(async () => {
    if (!api) return;
    try {
      const [status, config, pending, openConflicts] = await Promise.all([
        api.getSyncStatus(), api.getSyncConfig(), api.getPendingUpdates(), api.getConflicts(),
      ]);
      setSyncStatus(status || {});
      setSyncConfig(config || { clientId: '', clientSecret: '', folderId: '', syncIntervalSec: 5, autoSync: true });
      setPendingUpdates(pending || []);
      setConflicts(openConflicts || []);
    } catch (reason: any) { setError(reason?.message || 'Não foi possível consultar a sincronização.'); }
  }, [api]);

  useEffect(() => {
    void refreshData();
    return window.electronAPI?.events?.onDomainChanged((event) => {
      // Keep the ledger mounted while mutations and cross-window updates arrive.
      if (event.module === 'relatorio') void refreshData(false);
    });
  }, [refreshData]);

  useEffect(() => {
    void refreshSync();
    const offStatus = api?.onSyncStatus((status) => setSyncStatus(status));
    const offRemote = api?.onRemoteUpdate(() => { void refreshData(false); void refreshSync(); });
    return () => { offStatus?.(); offRemote?.(); };
  }, [api, refreshData, refreshSync]);

  useEffect(() => {
    void window.electronAPI?.shell.getState().then((state) => setMinimizeToTray(Boolean(state.minimizeToTray))).catch(() => {});
  }, []);

  useEffect(() => {
    const openReportSettings = () => { setCredentialsOpen(false); setSection('sincronizacao'); };
    window.addEventListener('lotecontrol:open-report-settings', openReportSettings);
    return () => window.removeEventListener('lotecontrol:open-report-settings', openReportSettings);
  }, []);

  useEffect(() => {
    if (!dayFilterOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement)?.closest('.rp-day-filter-wrap')) setDayFilterOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setDayFilterOpen(false); };
    window.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => { window.removeEventListener('mousedown', closeOnOutside); window.removeEventListener('keydown', closeOnEscape); };
  }, [dayFilterOpen]);

  useEffect(() => {
    if (section === 'historico') {
      void api?.getVersionHistory(company, year, month).then((items) => {
        setHistoryRows(items || []);
        setHistoryPage(0);
      }).catch((reason: any) => setError(reason?.message || 'Não foi possível carregar o histórico de versões.'));
    }
  }, [section, company, year, month, api]);

  useEffect(() => {
    if (!bulk || !api) return;
    let current = true;
    const dia = bulk.scope === 'day' ? Number(bulk.day || 1) : bulk.scope === 'filter' ? (dayFilter || 'all') : 'all';
    const params = { loterica: company, ano: year, mes: month, dia, tipo: bulk.category || 'ambos' };
    setBulk((value: any) => value ? { ...value, params, preview: null, loadingPreview: true } : value);
    void api.previewBulkDelete(params).then((preview) => {
      if (current) setBulk((value: any) => value ? { ...value, preview, loadingPreview: false } : value);
    }).catch((reason: any) => {
      if (current) {
        setBulk((value: any) => value ? { ...value, preview: null, loadingPreview: false } : value);
        setError(reason?.message || 'Não foi possível preparar a exclusão em massa.');
      }
    });
    return () => { current = false; };
  }, [api, company, year, month, dayFilter, bulk?.scope, bulk?.category, bulk?.day]);

  const sortedRows = useMemo(() => [...rows].sort((a, b) => Number(a.dia) - Number(b.dia) || Number(b.valor) - Number(a.valor)), [rows]);
  const faltas = sortedRows.filter((row) => row.tipo === 'falta');
  const sobras = sortedRows.filter((row) => row.tipo === 'sobra');
  const faltasCentavos = faltas.reduce((sum, row) => sum + Math.round(Number(row.valor || 0) * 100), 0);
  const sobrasCentavos = sobras.reduce((sum, row) => sum + Math.round(Number(row.valor || 0) * 100), 0);
  const filteredHistory = historyRows.filter((item) => `${item.summary || ''} ${item.device_name || ''} ${item.user_email || ''} ${item.version_num}`.toLowerCase().includes(historySearch.toLowerCase()));
  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / 25));
  const visibleHistory = filteredHistory.slice(historyPage * 25, historyPage * 25 + 25);

  async function action(operation: () => Promise<any>, successMessage?: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await operation();
      if (successMessage) setNotice(successMessage);
      await refreshData(false);
      return result;
    } catch (reason: any) { setError(reason?.message || String(reason)); return null; }
    finally { setBusy(false); }
  }

  function openNew(type: 'falta' | 'sobra') {
    const suggestedDay = dayFilter || (year === now.getFullYear() && month === now.getMonth() + 1 ? now.getDate() : 1);
    setDraft({ tipo: type, dia: String(Math.min(suggestedDay, daysInMonth(year, month))), valor: '', funcionario: '', cliente: '', status: 'pendente' });
  }

  function openEdit(row: any) {
    setDraft({ id: row.id, tipo: row.tipo, dia: String(row.dia), valor: valueDraft(row.valor), funcionario: row.funcionario || '', cliente: row.cliente || '', status: row.status || 'pendente' });
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !api) return;
    const dia = Number(draft.dia);
    const cents = amountCents(draft.valor);
    if (!Number.isInteger(dia) || dia < 1 || dia > daysInMonth(year, month)) { setError(`O mês selecionado tem ${daysInMonth(year, month)} dias.`); return; }
    if (!Number.isSafeInteger(cents) || cents <= 0) { setError('Informe um valor maior que zero.'); return; }
    const payload = {
      loterica: company, ano: year, mes: month, dia, data_formatada: dateString(year, month, dia),
      valor: cents / 100, tipo: draft.tipo, funcionario: draft.funcionario.trim(), cliente: draft.cliente.trim(),
      status: draft.status,
    };
    const result = await action(() => draft.id ? api.updateLancamento(draft.id, payload) : api.addLancamento(payload), draft.id ? 'Lançamento atualizado.' : 'Lançamento incluído.');
    if (result !== null) setDraft(null);
  }

  async function saveInlineEdit(row: any, values: { dia: string; valor: string; cliente: string; funcionario: string }) {
    if (!api) return false;
    const dia = Number(values.dia);
    const cents = amountCents(values.valor);
    if (!Number.isInteger(dia) || dia < 1 || dia > daysInMonth(year, month)) { setError(`O mês selecionado tem ${daysInMonth(year, month)} dias.`); return false; }
    if (!Number.isSafeInteger(cents) || cents <= 0) { setError('Informe um valor maior que zero.'); return false; }
    const result = await action(() => api.updateLancamento(row.id, {
      loterica: company, ano: year, mes: month, dia, data_formatada: dateString(year, month, dia),
      valor: cents / 100, cliente: values.cliente.trim(), funcionario: values.funcionario.trim(),
    }), 'Edição rápida salva.');
    return result !== null;
  }

  async function toggleRowStatus(row: any) {
    if (!api) return;
    const status = row.status === 'conferido' ? 'pendente' : 'conferido';
    await action(() => api.toggleStatus(row.id, status, row.observacoes || ''));
  }

  async function exportReport() {
    const base = (items: any[]) => items.map((row) => ({ Dia: row.dia, Valor: Number(row.valor), Cliente: row.cliente, Funcionário: row.funcionario, Status: row.status, Data: row.data_formatada }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(base(faltas)), 'Faltas');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(base(sobras)), 'Sobras');
    const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
    if (window.electronAPI?.dialog) {
      const save = await window.electronAPI.dialog.showSaveDialog({ title: 'Exportar Relatório', defaultPath: `Relatorio-${company}-${year}-${String(month).padStart(2, '0')}.xlsx`, filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }] });
      if (save.canceled || !save.filePath) return;
      await window.electronAPI.dialog.saveFile(save.filePath, new Uint8Array(bytes));
    } else {
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer as ArrayBuffer])); const link = document.createElement('a'); link.href = url; link.download = `Relatorio-${company}-${year}-${month}.xlsx`; link.click(); URL.revokeObjectURL(url);
    }
    setNotice('Planilha exportada com as abas Faltas e Sobras.');
  }

  function showBulkPreview(scope: 'day' | 'month' | 'filter') {
    if (!api) return;
    setBulk({ scope, category: 'ambos', day: String(dayFilter || 1), params: null, preview: null, loadingPreview: true });
  }

  async function runBulkDelete() {
    if (!bulk || !api) return;
    if (!bulk.preview) return;
    const count = bulk.preview?.count || 0;
    if (!count) { setBulk(null); return; }
    const result = await action(() => api.executeBulkDelete(bulk.params), 'Exclusão em massa registrada e sincronizada.');
    if (result) setBulk(null);
  }

  async function saveDriveConfig(event: React.FormEvent) {
    event.preventDefault();
    if (!api) return;
    const result = await action(() => api.saveSyncConfig({
      clientId: String(syncConfig.clientId || ''), clientSecret: String(syncConfig.clientSecret || ''), folderId: String(syncConfig.folderId || ''),
      syncIntervalSec: Number(syncConfig.syncIntervalSec || 5), autoSync: Boolean(syncConfig.autoSync),
    }), 'Configuração do Google Drive salva.');
    if (result) { setSyncConfig(result); await refreshSync(); }
  }

  async function importDriveCredentials() {
    if (!api || !window.electronAPI?.dialog) return;
    try {
      const file = await window.electronAPI.dialog.openDataFile('report-credentials');
      if (file.canceled || !file.data) return;
      const credentials = JSON.parse(new TextDecoder().decode(file.data));
      const oauth = credentials.installed || credentials.web || credentials;
      const clientId = String(oauth.client_id || oauth.clientId || '').trim();
      const clientSecret = String(oauth.client_secret || oauth.clientSecret || '').trim();
      if (!clientId) throw new Error('O JSON não contém um Client ID válido.');
      const folderId = String(credentials.folder_id || credentials.folderId || syncConfig.folderId || '').trim();
      const result = await api.saveSyncConfig({
        ...syncConfig,
        clientId,
        clientSecret: clientSecret || syncConfig.clientSecret || '',
        folderId,
      });
      setSyncConfig(result);
      setNotice('Credenciais do Google Cloud importadas e salvas.');
      setError('');
      await refreshSync();
    } catch (reason: any) {
      setError(reason?.message || 'Não foi possível importar as credenciais do Google Drive.');
    }
  }

  async function saveEmployeeRename(event: React.FormEvent) {
    event.preventDefault();
    if (!api || !renameForm) return;
    const oldName = renameForm.oldName.trim();
    const newName = renameForm.newName.trim();
    if (!oldName || !newName) { setError('Informe o funcionário atual e o novo nome.'); return; }
    if (oldName === newName) { setError('O novo nome deve ser diferente do atual.'); return; }
    const result = await action(() => api.renameFuncionario(company, oldName, newName), 'Funcionário renomeado nos lançamentos desta lotérica.');
    if (result !== null) setRenameForm(null);
  }

  async function clearDemoData() {
    if (!api || !window.confirm(`Remover os dados marcados como demonstração de ${company}? Lançamentos reais não serão removidos.`)) return;
    await action(() => api.clearDemo(company), 'Dados de demonstração removidos.');
  }

  async function compareVersions() {
    if (!firstVersion || !secondVersion || !api) return;
    try { setComparison(await api.compareVersions(firstVersion, secondVersion)); }
    catch (reason: any) { setError(reason?.message || 'Não foi possível comparar as versões.'); }
  }

  const activeToast: ToastItem | null = useMemo(() => {
    if (error) {
      return {
        tone: 'danger',
        text: error,
        onClose: () => setError(''),
      };
    }
    if (notice) {
      return {
        tone: 'success',
        text: notice,
        onClose: () => setNotice(''),
      };
    }
    return null;
  }, [error, notice]);

  return (
    <section className="rp-module" data-module-ready="relatorio" data-workspace-id={workspaceId}>
      <ToastNotification
        toast={activeToast}
        onDismiss={() => {
          if (error) setError('');
          else if (notice) setNotice('');
        }}
      />

      <header className="lc-top-menu rp-toolbar">
        <div className="lc-menu-row">
          <div className="lc-menu-group">
            <LotericaSelector
              options={reportLotericaOptions}
              selectedId={company}
              onSelect={(selected) => {
                setCompany(selected);
                setDayFilter(null);
              }}
            />
          </div>

          <div className="lc-menu-group rp-toolbar-actions">
            {section === 'historico' && (
              <button
                type="button"
                className="lc-btn lc-btn-outline rp-button rp-button-outline"
                onClick={() => setSection('operacao')}
              >
                <CalendarDays size={15} />
                <span>Operação</span>
              </button>
            )}
            <button
              type="button"
              className={`rp-drive-indicator ${
                String(syncStatus.status || '').toLowerCase().includes('conflito')
                  ? 'warning'
                  : syncStatus.userEmail || String(syncStatus.status || '').toLowerCase().includes('sincronizado')
                    ? 'ready'
                    : ''
              }`}
              onClick={() => setSection('sincronizacao')}
              title={`Google Drive: ${syncStatus.status || 'não configurado'}`}
              aria-label="Abrir configurações do Relatório"
            >
              <span />
            </button>
            <button
              type="button"
              className="lc-btn lc-btn-primary rp-button rp-button-primary primary"
              onClick={() => openNew('falta')}
            >
              <Plus size={16} />
              <span>Adicionar Lançamento</span>
            </button>
          </div>
        </div>

        {section !== 'historico' && (
          <div className="lc-menu-row rp-context-bar">
            <div className="lc-menu-group">
              <div className="rp-year-control">
                <button
                  type="button"
                  onClick={() => {
                    setYear((value) => value - 1);
                    setDayFilter(null);
                  }}
                  aria-label="Ano anterior"
                >
                  <ChevronLeft size={15} />
                </button>
                <strong>{year}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setYear((value) => value + 1);
                    setDayFilter(null);
                  }}
                  aria-label="Próximo ano"
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              <nav className="rp-months" aria-label="Mês do relatório">
                {monthLabels.map((name, index) => (
                  <button
                    type="button"
                    key={name}
                    className={month === index + 1 ? 'active' : ''}
                    onClick={() => {
                      setMonth(index + 1);
                      setDayFilter(null);
                    }}
                    title={name}
                  >
                    {name.slice(0, 3).toLocaleUpperCase('pt-BR')}
                  </button>
                ))}
              </nav>

              <DayFilterPopover
                selectedDay={dayFilter}
                daysWithEntries={days}
                onSelectDay={(day) => setDayFilter(day)}
                isOpen={dayFilterOpen}
                onToggleOpen={() => setDayFilterOpen((open) => !open)}
                onClose={() => setDayFilterOpen(false)}
              />
            </div>
          </div>
        )}
      </header>

      <div className="rp-content">
        {section !== 'historico' && <>
          {loading ? <div className="rp-loading"><span className="rp-spinner" />Carregando lançamentos…</div> : <div className="rp-ledgers">
            <Ledger title="PIX FALTANDO" kind="falta" entries={faltas} onEdit={openEdit} onInlineSave={saveInlineEdit} onToggleStatus={toggleRowStatus} onDelete={(row: any) => window.confirm('Excluir este lançamento? A exclusão será lógica e sincronizada.') && void action(() => api!.deleteLancamento(row.id), 'Lançamento removido.')} />
            <Ledger title="PIX SOBRANDO" kind="sobra" entries={sobras} onEdit={openEdit} onInlineSave={saveInlineEdit} onToggleStatus={toggleRowStatus} onDelete={(row: any) => window.confirm('Excluir este lançamento? A exclusão será lógica e sincronizada.') && void action(() => api!.deleteLancamento(row.id), 'Lançamento removido.')} />
          </div>}
        </>}

        {section === 'historico' && <section className="rp-history-panel">
          <div className="rp-section-heading"><div><p className="rp-eyebrow">VERSÕES IMUTÁVEIS</p><h2>Histórico e restauração</h2><span>Restaurar cria uma nova versão e preserva as anteriores.</span></div><label className="rp-search"><Search size={14} /><input value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); setHistoryPage(0); }} placeholder="Buscar resumo ou dispositivo" /></label></div>
          <div className="rp-compare-bar"><span>Comparar versões deste período</span><select value={firstVersion} onChange={(event) => setFirstVersion(event.target.value)}><option value="">Versão inicial</option>{historyRows.map((item) => <option value={item.version_id} key={`a-${item.id}`}>v{item.version_num} · {new Date(item.created_at).toLocaleString('pt-BR')}</option>)}</select><ArrowDownUp size={14} /><select value={secondVersion} onChange={(event) => setSecondVersion(event.target.value)}><option value="">Versão final</option>{historyRows.map((item) => <option value={item.version_id} key={`b-${item.id}`}>v{item.version_num} · {new Date(item.created_at).toLocaleString('pt-BR')}</option>)}</select><button type="button" className="rp-button rp-button-outline" disabled={!firstVersion || !secondVersion} onClick={() => void compareVersions()}>Comparar</button></div>
          {comparison && <div className="rp-comparison"><div><strong>v{comparison.first.version} → v{comparison.second.version}</strong><button type="button" onClick={() => setComparison(null)} aria-label="Fechar comparação"><X size={13} /></button></div><p>{comparison.added.length} adicionado(s) · {comparison.removed.length} removido(s) · {comparison.changed.length} alterado(s)</p><ul>{[...comparison.added.map((item: any) => ({ type: 'Adicionado', item })), ...comparison.removed.map((item: any) => ({ type: 'Removido', item })), ...comparison.changed.map((item: any) => ({ type: 'Alterado', item: item.after }))].slice(0, 30).map((entry: any, index: number) => <li key={`${entry.type}-${entry.item?.id}-${index}`}><b>{entry.type}</b> · Dia {entry.item?.dia} · {brl.format(entry.item?.valor || 0)} · {entry.item?.funcionario || 'Sem funcionário'}</li>)}</ul></div>}
          <div className="rp-history-list">{visibleHistory.map((item) => <article key={item.id} className="rp-version-row"><div className="rp-version-number">v{item.version_num}</div><div className="rp-version-copy"><strong>{item.summary || 'Alteração sincronizada'}</strong><span>{new Date(item.created_at).toLocaleString('pt-BR')} · {item.device_name || 'Dispositivo não identificado'}{item.user_email ? ` · ${item.user_email}` : ''}</span></div><button type="button" className="rp-button rp-button-outline" onClick={() => { if (window.confirm(`Restaurar v${item.version_num}? O Relatório criará uma nova versão com esse conteúdo.`)) void action(() => api!.restoreVersion(company, year, month, item.version_id), 'Restauração criada como nova versão.'); }}>Restaurar</button></article>)}{!visibleHistory.length && <div className="rp-empty">Nenhuma versão encontrada para este período.</div>}</div>
          <div className="rp-pagination"><span>{filteredHistory.length} versão(ões)</span><div><button type="button" disabled={!historyPage} onClick={() => setHistoryPage((page) => page - 1)} aria-label="Página anterior"><ChevronLeft size={15} /></button><span>{historyPage + 1} / {historyPageCount}</span><button type="button" disabled={historyPage + 1 >= historyPageCount} onClick={() => setHistoryPage((page) => page + 1)} aria-label="Próxima página"><ChevronRight size={15} /></button></div></div>
        </section>}

        {section === 'sincronizacao' && <>
        <div className="rp-settings-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) { setCredentialsOpen(false); setSection('operacao'); } }}><section className="rp-settings-modal" role="dialog" aria-modal="true" aria-labelledby="rp-settings-title">
          <header className="rp-settings-heading"><div className="rp-settings-title-icon"><Settings size={21} /></div><div className="rp-settings-title-copy"><h2 id="rp-settings-title">Configurações</h2><span>Google Drive, histórico e ferramentas do Relatório</span></div><button type="button" className="rp-icon-button" onClick={() => { setCredentialsOpen(false); setSection('operacao'); }} aria-label="Fechar configurações"><X size={17} /></button></header>
          <div className="rp-settings-body"><div className="rp-sync-layout">
          <section className="rp-sync-card rp-report-tools">
            <div className="rp-settings-card-heading"><Clock3 size={15} /><strong>HISTÓRICO E VERSÕES</strong></div>
            <p className="rp-settings-description">Acesse os snapshots anteriores registrados para conferência, auditoria de edições ou restauração não-destrutiva desta lotérica e mês.</p>
            <div className="rp-report-tools-actions"><button type="button" className="rp-button rp-button-outline" onClick={() => setSection('historico')}><Clock3 size={14} /> Abrir Histórico de Versões</button></div>
          </section>
          <section className="rp-sync-card rp-report-tools">
            <div className="rp-settings-card-heading export"><Download size={15} /><strong>EXPORTAÇÃO DE PLANILHA</strong></div>
            <p className="rp-settings-description">Gere um arquivo de planilha no formato Excel (.xlsx) com todos os lançamentos de PIX Faltando e PIX Sobrando da lotérica e mês selecionados.</p>
            <div className="rp-report-tools-actions"><button type="button" className="rp-button rp-button-outline export-action" onClick={() => void exportReport()}><Download size={14} /> Exportar para Excel (.xlsx)</button></div>
          </section>
          <div className="lc-setting-row">
            <div className="lc-setting-icon"><Clock3 size={17} /></div>
            <div className="lc-setting-copy">
              <strong className="rp-tray-setting-title">Minimizar para a bandeja</strong>
              <span>Ao fechar a janela (X), continuar executando em segundo plano com ícone na bandeja do sistema</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={minimizeToTray}
              className={`lc-switch ${minimizeToTray ? 'on' : ''}`}
              onClick={async () => {
                const enabled = !minimizeToTray;
                const actual = await window.electronAPI?.shell.setMinimizeToTray(enabled).catch(() => enabled) ?? enabled;
                setMinimizeToTray(actual);
                window.dispatchEvent(new CustomEvent('lotecontrol:tray-setting-changed', { detail: actual }));
              }}
            >
              <span />
            </button>
          </div>
          <section className="rp-settings-maintenance">
            <div className="rp-settings-card-heading danger"><AlertTriangle size={15} /><strong>GERENCIAMENTO DE DADOS</strong><span>ATENÇÃO</span></div>
            <p>Operações de remoção e limpeza. Todas as ações criam backup automático verificado via <code>PRAGMA integrity_check</code> antes de qualquer exclusão.</p>
            <div className="rp-maintenance-row"><span><strong>Exclusão em Massa</strong><small>Excluir múltiplos registros por dia, mês ou filtro com tombstones</small></span><button type="button" onClick={() => void showBulkPreview('month')}><Trash2 size={14} /> Abrir Exclusão em Massa…</button></div>
            <div className="rp-maintenance-row"><span><strong>Limpeza de Dados Seed</strong><small>Remove registros de teste/demonstração da lotérica ativa</small></span><button type="button" onClick={() => void clearDemoData()}>Limpar Dados Seed</button></div>
            {officialBase && <small className="rp-base-note">Base oficial preservada · {officialBase.version || officialBase.version_num || 'ativa'}</small>}
          </section>
          <section className="rp-sync-card rp-drive-card">
            <div className="rp-settings-card-heading drive"><Cloud size={15} /><strong>GOOGLE DRIVE E SINCRONIZAÇÃO</strong><span className={`rp-sync-state ${String(syncStatus.status || '').toLowerCase().includes('conflito') ? 'warning' : ''}`}><span />{syncStatus.status || 'Não configurado'}</span></div>
            <div className="rp-drive-summary"><div><span>Conta Google:</span><strong title={syncStatus.userEmail || 'Nenhuma conta conectada'}>{syncStatus.userEmail || 'Nenhuma conta conectada'}</strong></div><div><span>Última sincronização:</span><strong>{syncStatus.lastSyncTime ? new Date(syncStatus.lastSyncTime).toLocaleString('pt-BR') : 'Nunca'}</strong></div></div>
            <div className="rp-drive-queue"><span>Lançamentos pendentes na fila local:</span><strong>{syncStatus.pendingCount || 0}</strong></div>
            <div className="rp-drive-primary-actions"><button type="button" className="rp-button rp-button-primary lc-shared-action lc-shared-action-primary" onClick={() => void api?.syncNow().then(refreshSync).catch((reason: any) => setError(reason?.message || String(reason)))}><RefreshCw size={14} /> Sincronizar Agora</button><button type="button" className="rp-button rp-button-outline" onClick={() => setCredentialsOpen(true)}><Settings2 size={14} /> Configurações e Credenciais…</button></div>
            <div className="rp-sync-foot"><span>Conflitos: {syncStatus.conflictCount || 0}</span></div>
          </section>
          {(pendingUpdates.length > 0 || conflicts.length > 0) && <section className="rp-sync-card rp-sync-issues"><h3>Revisões necessárias</h3>
            {pendingUpdates.map((update: any) => <div className="rp-remote-row" key={update.fileKey}><div><strong>{update.loterica} · {update.mes}/{update.ano} · v{update.remoteVersionNum}</strong><span>{update.updatedBy?.device_name || 'Outro computador'} · {update.updatedAt ? new Date(update.updatedAt).toLocaleString('pt-BR') : ''}</span></div><button type="button" className="rp-button rp-button-outline" onClick={() => void api?.getVersionDiff(update.fileKey).then(setRemoteDiff)}><Search size={13} /> Ver diferenças</button><button type="button" className="rp-button rp-button-primary" onClick={() => window.confirm('Aplicar a versão remota? Alterações locais pendentes desse período serão substituídas pela decisão de sincronização.') && void api?.acceptRemote(update.fileKey).then(refreshSync).then(() => refreshData(false)).catch((reason: any) => setError(reason?.message || String(reason)))}>Aceitar versão remota</button><button type="button" className="rp-button rp-button-outline" onClick={() => window.confirm('Manter os dados deste computador e enviar uma nova versão ao Drive?') && void api?.keepLocal(update.fileKey, 'Versão local escolhida pelo usuário').then(refreshSync).catch((reason: any) => setError(reason?.message || String(reason)))}>Manter local</button></div>)}
            {conflicts.map((item: any) => <div className="rp-remote-row" key={item.id}><div><strong>Conflito · {item.entry_id}</strong><span>{new Date(item.created_at).toLocaleString('pt-BR')}</span></div><button type="button" className="rp-button rp-button-outline" onClick={() => void api?.resolveConflict(item.id, 'local').then(refreshSync).catch((reason: any) => setError(reason?.message || String(reason)))}>Manter local</button><button type="button" className="rp-button rp-button-outline" onClick={() => void api?.resolveConflict(item.id, 'remote').then(refreshSync).then(() => refreshData(false)).catch((reason: any) => setError(reason?.message || String(reason)))}>Usar remoto</button></div>)}
          </section>}
          {remoteDiff && <section className="rp-sync-card"><div className="rp-section-heading"><div><p className="rp-eyebrow">COMPARAÇÃO</p><h2>{remoteDiff.loterica} · {remoteDiff.mes}/{remoteDiff.ano}</h2></div><button type="button" className="rp-icon-button" onClick={() => setRemoteDiff(null)} aria-label="Fechar comparação"><X size={15} /></button></div><p className="rp-diff-summary">Versão remota v{remoteDiff.remoteVersionNum} · {remoteDiff.diff?.length || 0} diferença(s)</p><div className="rp-diff-list">{(remoteDiff.diff || []).slice(0, 100).map((item: any, index: number) => <div key={item.id || index}><span>{item.operation || item.type || 'Alteração'}</span><strong>{item.entry?.dia ? `Dia ${item.entry.dia} · ` : ''}{brl.format(item.entry?.valor || item.local?.valor || item.remote?.valor || 0)}</strong></div>)}</div></section>}
          </div></div><footer className="rp-settings-footer"><span>Banco SQLite compartilhado do Relatório</span><button type="button" className="rp-button rp-button-primary" onClick={() => { setCredentialsOpen(false); setSection('operacao'); }}>Concluído</button></footer></section></div>
          {credentialsOpen && <div className="rp-credentials-overlay" onMouseDown={(event) => event.target === event.currentTarget && setCredentialsOpen(false)}><section className="rp-entry-modal rp-credentials-modal" role="dialog" aria-modal="true" aria-labelledby="rp-credentials-title">
            <header><div><p className="rp-eyebrow">GOOGLE DRIVE</p><h2 id="rp-credentials-title">Sincronização Google Drive</h2><span>Compartilhamento de dados com a conta já configurada para o Relatório</span></div><button type="button" className="rp-icon-button" onClick={() => setCredentialsOpen(false)} aria-label="Fechar configurações e credenciais"><X size={16} /></button></header>
            <div className="rp-credentials-status"><div><span>Estado da sincronização</span><strong>{syncStatus.status || 'Não configurado'}</strong></div><div><span>Conta Google</span><strong>{syncStatus.userEmail || 'Nenhuma conta conectada'}</strong></div><div><span>Última sincronização</span><strong>{syncStatus.lastSyncTime ? new Date(syncStatus.lastSyncTime).toLocaleString('pt-BR') : 'Nunca'}</strong></div><div><span>Alterações locais pendentes</span><strong>{syncStatus.pendingCount || 0}</strong></div></div>
            <form className="rp-credentials-form" onSubmit={(event) => void saveDriveConfig(event)}>
              <div className="rp-credentials-form-heading"><strong>Credenciais OAuth 2.0 (Google Cloud)</strong><button type="button" className="rp-button rp-button-outline" onClick={() => void importDriveCredentials()}><FileJson size={14} /> Importar JSON</button></div>
              <label>Client ID<input value={syncConfig.clientId || ''} onChange={(event) => setSyncConfig({ ...syncConfig, clientId: event.target.value })} autoComplete="off" /></label>
              <label>Client Secret<input type="password" value={syncConfig.clientSecret || ''} onChange={(event) => setSyncConfig({ ...syncConfig, clientSecret: event.target.value })} autoComplete="new-password" /></label>
              <label className="span2">Identificador da Pasta Compartilhada (Folder ID)<input value={syncConfig.folderId || ''} onChange={(event) => setSyncConfig({ ...syncConfig, folderId: event.target.value })} placeholder="Cole o ID da pasta ou link compartilhado" /></label>
              <label>Intervalo de sincronização (segundos)<select value={syncConfig.syncIntervalSec || 5} onChange={(event) => setSyncConfig({ ...syncConfig, syncIntervalSec: Number(event.target.value) })}>{[5, 10, 15, 30, 60].map((seconds) => <option value={seconds} key={seconds}>{seconds} segundos{seconds === 5 ? ' (Padrão)' : ''}</option>)}</select></label>
              <label className="rp-check"><input type="checkbox" checked={Boolean(syncConfig.autoSync)} onChange={(event) => setSyncConfig({ ...syncConfig, autoSync: event.target.checked })} /> Sincronizar automaticamente</label>
              <div className="rp-credentials-actions"><button type="submit" className="rp-button rp-button-primary" disabled={busy}><Settings2 size={14} /> Salvar Dados</button><button type="button" className="rp-button rp-button-outline" onClick={() => void api?.startSyncAuth().then(refreshSync).catch((reason: any) => setError(reason?.message || String(reason)))}><Cloud size={14} /> Conectar Conta Google</button><button type="button" className="rp-button rp-button-outline" onClick={() => void api?.syncNow().then(refreshSync).catch((reason: any) => setError(reason?.message || String(reason)))}><RefreshCw size={14} /> Sincronizar Agora</button><button type="button" className="rp-button rp-button-danger" onClick={() => window.confirm('Desconectar a conta Google neste computador?') && void api?.disconnectSync().then(refreshSync)}><X size={14} /> Desconectar</button></div>
            </form>
          </section></div>}
        </>}
      </div>

      {draft && <div className="rp-overlay" onMouseDown={(event) => event.target === event.currentTarget && setDraft(null)}><form className="rp-entry-modal rp-quick-entry-modal" role="dialog" aria-modal="true" aria-labelledby="rp-entry-title" onSubmit={(event) => void saveDraft(event)}>
        <header><div><h2 id="rp-entry-title">{draft.id ? 'Editar Lançamento PIX' : 'Novo Lançamento PIX'}</h2><span>Lotérica: <strong>{company}</strong> · {monthLabels[month - 1]}/{year}</span></div><button type="button" className="rp-icon-button" onClick={() => setDraft(null)} aria-label="Fechar"><X size={16} /></button></header>
        <div className="rp-entry-type"><span>Tipo de Lançamento</span><div role="group" aria-label="Tipo de lançamento"><button type="button" className={draft.tipo === 'falta' ? 'missing selected' : ''} aria-pressed={draft.tipo === 'falta'} onClick={() => setDraft({ ...draft, tipo: 'falta' })}>PIX FALTANDO</button><button type="button" className={draft.tipo === 'sobra' ? 'surplus selected' : ''} aria-pressed={draft.tipo === 'sobra'} onClick={() => setDraft({ ...draft, tipo: 'sobra' })}>PIX SOBRANDO</button></div></div>
        <div className="rp-entry-form rp-quick-entry-form"><label>Dia (1 a {daysInMonth(year, month)})<span className="rp-day-input"><input type="number" min="1" max={daysInMonth(year, month)} value={draft.dia} onChange={(event) => setDraft({ ...draft, dia: event.target.value })} required /><button type="button" onClick={() => setDraft({ ...draft, dia: String(Math.min(new Date().getDate(), daysInMonth(year, month))) })}>Hoje</button></span></label><label>Valor (R$)<input autoFocus inputMode="decimal" placeholder="R$ 10 ou 10,50" value={draft.valor} onChange={(event) => setDraft({ ...draft, valor: event.target.value })} required /></label><label>Funcionário<input list={`employees-${workspaceId}`} value={draft.funcionario} onChange={(event) => setDraft({ ...draft, funcionario: event.target.value })} /><datalist id={`employees-${workspaceId}`}>{employees.map((name) => <option value={name} key={name} />)}</datalist></label><label>Cliente / Descrição (Opcional)<input value={draft.cliente} onChange={(event) => setDraft({ ...draft, cliente: event.target.value })} /></label></div>
        <footer className="rp-quick-entry-footer"><button type="button" className="rp-button rp-button-outline" onClick={() => setDraft(null)}>Cancelar</button><button type="submit" className="rp-button rp-button-primary lc-shared-action lc-shared-action-primary" disabled={busy}>{busy ? 'Salvando…' : 'Lançar Registro'}</button></footer>
      </form></div>}

      {renameForm && <div className="rp-overlay" onMouseDown={(event) => event.target === event.currentTarget && setRenameForm(null)}><form className="rp-entry-modal rp-confirm-modal" role="dialog" aria-modal="true" onSubmit={(event) => void saveEmployeeRename(event)}>
        <header><div><p className="rp-eyebrow">CADASTRO DE EQUIPE</p><h2>Renomear funcionário</h2></div><button type="button" className="rp-icon-button" onClick={() => setRenameForm(null)} aria-label="Fechar"><X size={16} /></button></header>
        <div className="rp-entry-form"><label className="span2">Nome atual<select value={renameForm.oldName} onChange={(event) => setRenameForm({ ...renameForm, oldName: event.target.value })}>{employees.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label className="span2">Novo nome<input autoFocus value={renameForm.newName} onChange={(event) => setRenameForm({ ...renameForm, newName: event.target.value })} required /></label></div>
        <footer><span>O nome será atualizado nos lançamentos de {company}.</span><button type="button" className="rp-button rp-button-outline" onClick={() => setRenameForm(null)}>Cancelar</button><button type="submit" className="rp-button rp-button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Renomear'}</button></footer>
      </form></div>}

      {bulk && <div className="rp-overlay rp-bulk-delete-overlay" onMouseDown={(event) => event.target === event.currentTarget && setBulk(null)}><section className="rp-entry-modal rp-bulk-delete-modal" role="dialog" aria-modal="true" aria-labelledby="rp-bulk-title">
        <header><div><p className="rp-eyebrow">EXCLUSÃO SEGURA</p><h2 id="rp-bulk-title">Exclusão em Massa de Lançamentos</h2><span>Lotérica selecionada: <strong>{company}</strong></span></div><button type="button" className="rp-icon-button" onClick={() => setBulk(null)} aria-label="Fechar"><X size={16} /></button></header>
        <div className="rp-bulk-config">
          <strong>1. Escolha o escopo da exclusão:</strong>
          <div className="rp-bulk-scopes" role="radiogroup" aria-label="Escopo da exclusão">
            {([['day', 'Dia específico'], ['month', 'Mês inteiro'], ['filter', 'Filtro ativo']] as const).map(([scope, label]) => <label key={scope} className={bulk.scope === scope ? 'selected' : ''}><input type="radio" name="bulk-scope" value={scope} checked={bulk.scope === scope} onChange={() => setBulk({ ...bulk, scope })} />{label}</label>)}
          </div>
          {bulk.scope === 'day' && <label className="rp-bulk-day">Dia a excluir:<input type="number" min="1" max={daysInMonth(year, month)} value={bulk.day} onChange={(event) => setBulk({ ...bulk, day: event.target.value })} /><span>no mês de {monthLabels[month - 1]}/{year}</span></label>}
          <label className="rp-bulk-category"><strong>2. Categorias afetadas:</strong><select value={bulk.category} onChange={(event) => setBulk({ ...bulk, category: event.target.value })}><option value="ambos">Ambas (PIX Faltando e PIX Sobrando)</option><option value="falta">Somente PIX Faltando</option><option value="sobra">Somente PIX Sobrando</option></select></label>
          <div className="rp-bulk-preview"><div><strong>PRÉVIA DA OPERAÇÃO:</strong><b>{company} — {monthLabels[month - 1]}/{year}{bulk.scope === 'day' ? ` (Dia ${String(bulk.day).padStart(2, '0')})` : bulk.scope === 'filter' && dayFilter ? ` (Dia ${String(dayFilter).padStart(2, '0')})` : ''}</b></div>{bulk.loadingPreview ? <span>Calculando prévia…</span> : bulk.preview ? <><div><span>Lançamentos a remover:</span><strong>{bulk.preview.count} lançamento(s)</strong></div><div><span>Soma total dos valores:</span><strong className="total">{brl.format(bulk.preview.totalValor || 0)}</strong></div></> : <span>Não foi possível carregar a prévia.</span>}</div>
          <div className="rp-bulk-safety"><strong>🛡 Blindagem de Dados e Sincronização:</strong><span>1. Um backup datado e verificado do banco de dados será criado automaticamente antes da exclusão.</span><span>2. A exclusão usa tombstones sincronizáveis para impedir que os registros apagados reapareçam no outro computador.</span><span>3. A Base Oficial Imutável permanece protegida.</span></div>
        </div>
        <footer><button type="button" className="rp-button rp-button-outline" onClick={() => setBulk(null)}>Cancelar</button><button type="button" className="rp-button rp-button-danger" disabled={busy || bulk.loadingPreview || !bulk.preview?.count} onClick={() => void runBulkDelete()}><Trash2 size={14} />{busy ? 'Excluindo…' : 'Confirmar Exclusão em Massa'}</button></footer>
      </section></div>}
    </section>
  );
}

export function Ledger({ title, kind, entries, onEdit, onInlineSave, onToggleStatus, onDelete }: any) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'valor' | 'cliente' | 'funcionario' } | null>(null);
  const [cellDraft, setCellDraft] = useState('');
  const savingCell = useRef(false);
  const activeCell = useRef<{ id: string; field: 'valor' | 'cliente' | 'funcionario' } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ row: any; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', keydown); };
  }, [contextMenu]);
  const groupedEntries = useMemo(() => {
    const groups = new Map<number, any[]>();
    entries.forEach((entry: any) => { const day = Number(entry.dia) || 0; groups.set(day, [...(groups.get(day) || []), entry]); });
    return [...groups.entries()].sort(([left], [right]) => left - right);
  }, [entries]);

  function beginInlineEdit(row: any, field: 'valor' | 'cliente' | 'funcionario' = 'cliente') {
    savingCell.current = false;
    const nextCell = { id: row.id, field };
    activeCell.current = nextCell;
    setEditingCell(nextCell);
    setCellDraft(field === 'valor' ? valueDraft(row.valor) : String(row[field] || ''));
  }

  function cancelInlineEdit() {
    savingCell.current = false;
    activeCell.current = null;
    setEditingCell(null);
    setCellDraft('');
  }

  function finishInlineEdit(id: string, field: 'valor' | 'cliente' | 'funcionario') {
    if (activeCell.current?.id !== id || activeCell.current.field !== field) return;
    activeCell.current = null;
    setEditingCell(null);
    setCellDraft('');
  }

  async function commitInlineEdit(row: any, field: 'valor' | 'cliente' | 'funcionario', nextCell?: { id: string; field: 'valor' | 'cliente' | 'funcionario' }) {
    if (!editingCell || !onInlineSave || savingCell.current) return;
    const values = {
      dia: String(row.dia),
      valor: field === 'valor' ? cellDraft : valueDraft(row.valor),
      cliente: field === 'cliente' ? cellDraft : String(row.cliente || ''),
      funcionario: field === 'funcionario' ? cellDraft : String(row.funcionario || ''),
    };
    const unchanged = field === 'valor'
      ? amountCents(values.valor) === Math.round(Number(row.valor || 0) * 100)
      : values[field] === String(row[field] || '');
    if (unchanged) { finishInlineEdit(row.id, field); return; }
    savingCell.current = true;
    const saved = await onInlineSave(row, values);
    savingCell.current = false;
    if (!saved) return;
    finishInlineEdit(row.id, field);
    if (nextCell) {
      window.setTimeout(() => {
        const cells = Array.from(document.querySelectorAll<HTMLElement>(`.rp-ledger.${kind} td[data-inline-id]`));
        cells.find((cell) => cell.dataset.inlineId === nextCell.id && cell.dataset.inlineField === nextCell.field)?.click();
      }, 0);
    }
  }

  function renderEditableCell(row: any, field: 'valor' | 'cliente' | 'funcionario', label: string, content: React.ReactNode) {
    const editing = editingCell?.id === row.id && editingCell?.field === field;
    const title = `Clique para editar ${label}`;
    return <td
      className={`${field === 'valor' ? 'rp-money-cell' : ''} ${field === 'cliente' ? 'rp-description-cell' : ''} ${field === 'funcionario' ? 'rp-employee-cell' : ''} rp-cell-editable ${editing ? 'rp-cell-editing' : ''}`}
      data-inline-id={row.id}
      data-inline-field={field}
      title={title}
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${field === 'valor' ? brl.format(row.valor) : row[field] || 'vazio'}. ${title}`}
      onClick={() => { if (!editing) beginInlineEdit(row, field); }}
      onKeyDown={(event) => { if (!editing && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); beginInlineEdit(row, field); } }}
    >{editing ? <input
      autoFocus
      className={`rp-inline-input ${field === 'valor' ? 'short' : ''}`}
      aria-label={label}
      inputMode={field === 'valor' ? 'decimal' : undefined}
      value={cellDraft}
      onChange={(event) => setCellDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => void commitInlineEdit(row, field)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); cancelInlineEdit(); return; }
        if (event.key === 'Enter') { event.preventDefault(); void commitInlineEdit(row, field); return; }
        if (event.key === 'Tab') {
          event.preventDefault();
          const allCells = Array.from(document.querySelectorAll<HTMLElement>(`.rp-ledger.${kind} td[data-inline-id]`));
          const index = allCells.findIndex((cell) => cell.dataset.inlineId === row.id && cell.dataset.inlineField === field);
          const direction = event.shiftKey ? -1 : 1;
          const target = allCells[index + direction];
          const nextCell = target?.dataset.inlineId && target.dataset.inlineField
            ? { id: target.dataset.inlineId, field: target.dataset.inlineField as 'valor' | 'cliente' | 'funcionario' }
            : undefined;
          void commitInlineEdit(row, field, nextCell);
        }
      }}
    /> : content}</td>;
  }

  return <section className={`rp-ledger ${kind}`}>
    <header><div className="rp-ledger-heading"><div><span className="rp-ledger-mark" /><h2>{title}</h2></div><p>{kind === 'falta' ? 'Diferenças não localizadas no caixa / pendências' : 'Valores a mais recebidos no PIX / sem comprovante'}</p></div><div className="rp-ledger-total"><span>{kind === 'falta' ? 'Total faltando' : 'Total sobrando'}</span><strong>{brl.format(entries.reduce((sum: number, row: any) => sum + Number(row.valor || 0), 0))}</strong></div></header>
    <div className="rp-ledger-scroll"><table><colgroup><col className="rp-col-value" /><col className="rp-col-description" /><col className="rp-col-employee" /><col className="rp-col-action" /></colgroup><tbody>{groupedEntries.map(([day, dayEntries]) => <React.Fragment key={day}>
      <tr className="rp-day-group"><td colSpan={4}><div><span>🗓️ DIA {String(day).padStart(2, '0')}</span><small>SUBTOTAL: <strong>{brl.format(dayEntries.reduce((sum: number, row: any) => sum + Number(row.valor || 0), 0))}</strong></small></div></td></tr>
      <tr className="rp-group-head"><th>VALOR</th><th>DESCRIÇÃO</th><th>FUNCIONÁRIO</th><th aria-label="Conferência"></th></tr>
      {dayEntries.map((row: any) => <tr key={row.id} className={row.status === 'conferido' ? 'is-conferido' : undefined} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ row, x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 190) }); }} title="Clique com o botão direito para ver as ações">
        {renderEditableCell(row, 'valor', 'Valor', brl.format(row.valor))}
        {renderEditableCell(row, 'cliente', 'Descrição', row.cliente || '—')}
        {renderEditableCell(row, 'funcionario', 'Funcionário', row.funcionario || '—')}
        <td><label className="rp-check-action" title={row.status === 'conferido' ? 'Desmarcar conferência' : 'Marcar como conferido'}><input type="checkbox" checked={row.status === 'conferido'} onChange={() => void onToggleStatus?.(row)} aria-label={row.status === 'conferido' ? 'Reabrir lançamento' : 'Marcar como conferido'} /></label></td>
      </tr>)}</React.Fragment>)}</tbody></table>
      {!entries.length && <div className="rp-empty">Nenhum lançamento {kind === 'falta' ? 'faltando' : 'sobrando'} neste filtro.</div>}
    </div>
    {contextMenu && <div className="rp-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onClick={(event) => event.stopPropagation()}><strong>{brl.format(contextMenu.row.valor)} · Dia {String(contextMenu.row.dia).padStart(2, '0')}</strong><button type="button" onClick={() => { setContextMenu(null); onEdit(contextMenu.row); }}>Editar lançamento</button><button type="button" className="danger" onClick={() => { setContextMenu(null); onDelete(contextMenu.row); }}>Excluir lançamento</button></div>}
  </section>;
}
