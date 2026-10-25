import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle, ArrowDownUp, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3,
  Cloud, Download, FileJson, FileSpreadsheet, Plus, RefreshCw, Search, Settings, Settings2, Trash2, Upload, UserRoundPen, X,
} from 'lucide-react';
import { LOTERICAS } from '../protege/logic/constants.js';
import { DayFilterPopover, LotericaSelector, ToastNotification, type LotericaOption, type ToastItem } from '../../app/components/SharedMenus';
import { useRelatorioTableSelection } from './useRelatorioTableSelection';
import { useRelatorioVirtualTable } from './useRelatorioVirtualTable';
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

const PADRAO_COLUNAS = ['Loterica', 'Ano', 'Mes', 'Categoria', 'Dia', 'Descricao', 'Funcionaria', 'Valor', 'Conferido'];

const INSTRUCOES_ROWS = [
  { Coluna: 'A', Campo: 'Loterica', Obrigatório: 'Sim', 'Valores aceitos': 'CAÇULA, SORTE GRANDE ou PUPINS', Descrição: 'Nome da lotérica cadastrada no sistema.' },
  { Coluna: 'B', Campo: 'Ano', Obrigatório: 'Sim', 'Valores aceitos': 'Ano com 4 dígitos (ex: 2026)', Descrição: 'Ano do lançamento.' },
  { Coluna: 'C', Campo: 'Mes', Obrigatório: 'Sim', 'Valores aceitos': '1 a 12', Descrição: 'Mês numérico do lançamento.' },
  { Coluna: 'D', Campo: 'Categoria', Obrigatório: 'Sim', 'Valores aceitos': 'FALTANDO ou SOBRANDO', Descrição: 'Categoria do PIX.' },
  { Coluna: 'E', Campo: 'Dia', Obrigatório: 'Sim', 'Valores aceitos': '1 a 31 (conforme o mês)', Descrição: 'Dia do lançamento no mês informado.' },
  { Coluna: 'F', Campo: 'Descricao', Obrigatório: 'Não', 'Valores aceitos': 'Texto livre', Descrição: 'Cliente ou descrição do lançamento exibida na tabela.' },
  { Coluna: 'G', Campo: 'Funcionaria', Obrigatório: 'Não', 'Valores aceitos': 'Texto livre', Descrição: 'Nome da funcionária responsável.' },
  { Coluna: 'H', Campo: 'Valor', Obrigatório: 'Sim', 'Valores aceitos': 'Número maior que zero (ex: 150.00)', Descrição: 'Valor numérico do lançamento (sem "R$").' },
  { Coluna: 'I', Campo: 'Conferido', Obrigatório: 'Sim', 'Valores aceitos': 'TRUE ou FALSE', Descrição: 'Estado da conferência: marcado ou desmarcado.' },
];

const EXEMPLO_ROWS = [
  { Loterica: 'CAÇULA', Ano: 2026, Mes: 10, Categoria: 'FALTANDO', Dia: 5, Descricao: 'João Silva - Diferença de caixa', Funcionaria: 'Ana', Valor: 150.00, Conferido: 'TRUE' },
  { Loterica: 'CAÇULA', Ano: 2026, Mes: 10, Categoria: 'SOBRANDO', Dia: 5, Descricao: 'Maria Santos - Depósito PIX', Funcionaria: 'Beatriz', Valor: 85.50, Conferido: 'FALSE' },
  { Loterica: 'SORTE GRANDE', Ano: 2026, Mes: 10, Categoria: 'FALTANDO', Dia: 12, Descricao: 'Comprovante não localizado', Funcionaria: 'Camila', Valor: 200.00, Conferido: 'FALSE' },
  { Loterica: 'PUPINS', Ano: 2026, Mes: 10, Categoria: 'SOBRANDO', Dia: 18, Descricao: 'Fernanda Costa - Avulso PIX', Funcionaria: 'Daniela', Valor: 50.00, Conferido: 'TRUE' },
];

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
  const [importModal, setImportModal] = useState<{
    fileName: string;
    validRows: Array<{
      lineNum: number;
      loterica: string;
      ano: number;
      mes: number;
      dia: number;
      tipo: 'falta' | 'sobra';
      data_formatada: string;
      valor: number;
      funcionario: string;
      cliente: string;
      observacoes: string;
      status: 'conferido' | 'pendente';
    }>;
    errors: string[];
    duplicates: { lineNum: number; details: string }[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

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

  const { faltas, sobras, faltasCentavos, sobrasCentavos } = useMemo(() => {
    const f: any[] = [];
    const s: any[] = [];
    let fc = 0;
    let sc = 0;
    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i];
      const cents = Math.round(Number(row.valor || 0) * 100);
      if (row.tipo === 'sobra') {
        s.push(row);
        sc += cents;
      } else {
        f.push(row);
        fc += cents;
      }
    }
    return { faltas: f, sobras: s, faltasCentavos: fc, sobrasCentavos: sc };
  }, [sortedRows]);

  const filteredHistory = historyRows.filter((item) => `${item.summary || ''} ${item.device_name || ''} ${item.user_email || ''} ${item.version_num}`.toLowerCase().includes(historySearch.toLowerCase()));
  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / 25));
  const visibleHistory = filteredHistory.slice(historyPage * 25, historyPage * 25 + 25);

  const action = useCallback(async (operation: () => Promise<any>, successMessage?: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await operation();
      if (successMessage) setNotice(successMessage);
      await refreshData(false);
      return result;
    } catch (reason: any) { setError(reason?.message || String(reason)); return null; }
    finally { setBusy(false); }
  }, [refreshData]);

  const openNew = useCallback((type: 'falta' | 'sobra') => {
    const suggestedDay = dayFilter || (year === now.getFullYear() && month === now.getMonth() + 1 ? now.getDate() : 1);
    setDraft({ tipo: type, dia: String(Math.min(suggestedDay, daysInMonth(year, month))), valor: '', funcionario: '', cliente: '', status: 'pendente' });
  }, [dayFilter, year, month]);

  const openEdit = useCallback((row: any) => {
    setDraft({ id: row.id, tipo: row.tipo, dia: String(row.dia), valor: valueDraft(row.valor), funcionario: row.funcionario || '', cliente: row.cliente || '', status: row.status || 'pendente' });
  }, []);

  const saveDraft = useCallback(async (event: React.FormEvent) => {
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
  }, [draft, api, company, year, month, action]);

  const saveInlineEdit = useCallback(async (row: any, values: { dia: string; valor: string; cliente: string; funcionario: string }) => {
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
  }, [api, company, year, month, action]);

  const toggleRowStatus = useCallback(async (row: any) => {
    if (!api) return;
    const status = row.status === 'conferido' ? 'pendente' : 'conferido';
    await action(() => api.toggleStatus(row.id, status, row.observacoes || ''));
  }, [api, action]);

  const handleMarkAsConferido = useCallback(async (target: any | any[]) => {
    const items = Array.isArray(target) ? target : [target];
    if (!api || items.length === 0) return;
    const pendingItems = items.filter((item) => item.status !== 'conferido');
    if (pendingItems.length === 0) return;
    const count = pendingItems.length;
    await action(async () => {
      for (const item of pendingItems) {
        await api.toggleStatus(item.id, 'conferido', item.observacoes || '');
      }
    }, count === 1 ? 'Lançamento marcado como conferido.' : `${count} lançamentos marcados como conferidos.`);
  }, [api, action]);

  const handleDelete = useCallback(async (target: any | any[]) => {
    const items = Array.isArray(target) ? target : [target];
    if (!api || items.length === 0) return;
    const count = items.length;
    await action(async () => {
      for (const item of items) {
        await api.deleteLancamento(item.id);
      }
    }, count === 1 ? 'Lançamento removido.' : `${count} lançamentos removidos.`);
  }, [api, action]);

  async function exportReport() {
    const hasRecords = sortedRows.length > 0;
    const book = XLSX.utils.book_new();

    if (!hasRecords) {
      // Quando não há registros: gerar modelo padronizado pronto para preenchimento
      const wsLancamentos = XLSX.utils.aoa_to_sheet([PADRAO_COLUNAS]);
      XLSX.utils.book_append_sheet(book, wsLancamentos, 'Lançamentos');

      const wsInstrucoes = XLSX.utils.json_to_sheet(INSTRUCOES_ROWS);
      XLSX.utils.book_append_sheet(book, wsInstrucoes, 'Instruções');

      const wsExemplo = XLSX.utils.json_to_sheet(EXEMPLO_ROWS);
      XLSX.utils.book_append_sheet(book, wsExemplo, 'Exemplo');

      const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
      const defaultPath = 'Modelo-Importacao-Relatorio.xlsx';

      if (window.electronAPI?.dialog) {
        const save = await window.electronAPI.dialog.showSaveDialog({
          title: 'Salvar Modelo de Planilha',
          defaultPath,
          filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }],
        });
        if (save.canceled || !save.filePath) return;
        await window.electronAPI.dialog.saveFile(save.filePath, new Uint8Array(bytes));
      } else {
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer as ArrayBuffer]));
        const link = document.createElement('a');
        link.href = url;
        link.download = defaultPath;
        link.click();
        URL.revokeObjectURL(url);
      }
      setNotice('Modelo de planilha padronizado gerado com as abas Lançamentos, Instruções e Exemplo.');
      return;
    }

    // Quando há registros: exportar os dados reais utilizando os cabeçalhos padronizados
    const allItems = sortedRows.map((row) => ({
      Loterica: company,
      Ano: year,
      Mes: month,
      Categoria: row.tipo === 'sobra' ? 'SOBRANDO' : 'FALTANDO',
      Dia: Number(row.dia),
      Descricao: row.cliente || '',
      Funcionaria: row.funcionario || '',
      Valor: Number(row.valor || 0),
      Conferido: row.status === 'conferido' ? 'TRUE' : 'FALSE',
    }));

    const wsLancamentos = XLSX.utils.json_to_sheet(allItems, { header: PADRAO_COLUNAS });
    XLSX.utils.book_append_sheet(book, wsLancamentos, 'Lançamentos');

    const wsInstrucoes = XLSX.utils.json_to_sheet(INSTRUCOES_ROWS);
    XLSX.utils.book_append_sheet(book, wsInstrucoes, 'Instruções');

    const wsExemplo = XLSX.utils.json_to_sheet(EXEMPLO_ROWS);
    XLSX.utils.book_append_sheet(book, wsExemplo, 'Exemplo');

    const baseLegacy = (items: any[]) => items.map((row) => ({ Dia: row.dia, Valor: Number(row.valor), Cliente: row.cliente, Funcionário: row.funcionario, Status: row.status, Data: row.data_formatada }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(baseLegacy(faltas)), 'Faltas');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(baseLegacy(sobras)), 'Sobras');

    const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
    const defaultPath = `Relatorio-${company}-${year}-${String(month).padStart(2, '0')}.xlsx`;

    if (window.electronAPI?.dialog) {
      const save = await window.electronAPI.dialog.showSaveDialog({
        title: 'Exportar Relatório',
        defaultPath,
        filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }],
      });
      if (save.canceled || !save.filePath) return;
      await window.electronAPI.dialog.saveFile(save.filePath, new Uint8Array(bytes));
    } else {
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer as ArrayBuffer]));
      const link = document.createElement('a');
      link.href = url;
      link.download = defaultPath;
      link.click();
      URL.revokeObjectURL(url);
    }
    setNotice('Planilha exportada com sucesso.');
  }

  async function parseAndPreviewFile(file: File) {
    setBusy(true);
    setError('');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      // Localiza exclusivamente a aba "Lançamentos" (insensível a maiúsculas e acentos)
      const targetSheetName = workbook.SheetNames.find((name) => {
        const normalized = name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return normalized === 'lancamentos';
      });

      if (!targetSheetName) {
        setImportModal({
          fileName: file.name,
          validRows: [],
          errors: ['A planilha selecionada não possui a aba "Lançamentos". O arquivo deve conter uma aba chamada "Lançamentos" com os dados a serem importados.'],
          duplicates: [],
        });
        return;
      }

      const worksheet = workbook.Sheets[targetSheetName];
      const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });

      if (rawRows.length === 0) {
        setImportModal({
          fileName: file.name,
          validRows: [],
          errors: ['A aba "Lançamentos" está completamente vazia.'],
          duplicates: [],
        });
        return;
      }

      const headerRow = rawRows[0] || [];
      const normalizeCol = (str: any) => String(str || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const colMap = new Map<string, number>();
      headerRow.forEach((h: any, idx: number) => {
        colMap.set(normalizeCol(h), idx);
      });

      const findCol = (...names: string[]) => {
        for (const name of names) {
          const idx = colMap.get(normalizeCol(name));
          if (idx !== undefined) return idx;
        }
        return -1;
      };

      const lotIdx = findCol('loterica');
      const anoIdx = findCol('ano');
      const mesIdx = findCol('mes');
      const catIdx = findCol('categoria', 'tipo');
      const diaIdx = findCol('dia');
      const cliIdx = findCol('cliente');
      const descIdx = findCol('descricao', 'observacao', 'observacoes');
      const funcIdx = findCol('funcionaria', 'funcionario');
      const valIdx = findCol('valor');
      const confIdx = findCol('conferido', 'status');

      const missingCols: string[] = [];
      if (lotIdx === -1) missingCols.push('Loterica');
      if (anoIdx === -1) missingCols.push('Ano');
      if (mesIdx === -1) missingCols.push('Mes');
      if (catIdx === -1) missingCols.push('Categoria');
      if (diaIdx === -1) missingCols.push('Dia');
      if (valIdx === -1) missingCols.push('Valor');
      if (confIdx === -1) missingCols.push('Conferido');

      if (missingCols.length > 0) {
        setImportModal({
          fileName: file.name,
          validRows: [],
          errors: [`Cabeçalho inválido na aba "Lançamentos". Colunas obrigatórias ausentes: ${missingCols.join(', ')}.`],
          duplicates: [],
        });
        return;
      }

      const errors: string[] = [];
      const validRows: Array<{
        lineNum: number;
        loterica: string;
        ano: number;
        mes: number;
        dia: number;
        tipo: 'falta' | 'sobra';
        data_formatada: string;
        valor: number;
        funcionario: string;
        cliente: string;
        observacoes: string;
        status: 'conferido' | 'pendente';
      }> = [];

      for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.every((c: any) => String(c || '').trim() === '')) {
          continue; // ignora linhas em branco
        }
        const lineNum = i + 1;

        // 1. Lotérica
        const rawLot = String(row[lotIdx] || '').trim();
        const normLot = rawLot.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        let matchedLot: string | null = null;
        if (normLot === 'CACULA' || normLot === 'CAÇULA') matchedLot = 'CAÇULA';
        else if (normLot === 'SORTE GRANDE') matchedLot = 'SORTE GRANDE';
        else if (normLot === 'PUPINS') matchedLot = 'PUPINS';
        else {
          errors.push(`Linha ${lineNum}: Lotérica "${rawLot}" não reconhecida. As lotéricas aceitas são: CAÇULA, SORTE GRANDE ou PUPINS.`);
        }

        // 2. Ano
        const anoNum = Number(row[anoIdx]);
        if (!Number.isInteger(anoNum) || anoNum < 1900 || anoNum > 2100) {
          errors.push(`Linha ${lineNum}: Ano "${row[anoIdx]}" inválido. Deve ser um ano com 4 dígitos (ex: 2026).`);
        }

        // 3. Mês
        const mesNum = Number(row[mesIdx]);
        if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
          errors.push(`Linha ${lineNum}: Mês "${row[mesIdx]}" inválido. Deve ser um número entre 1 e 12.`);
        }

        // 4. Categoria
        const rawCat = String(row[catIdx] || '').trim().toUpperCase();
        let matchedTipo: 'falta' | 'sobra' | null = null;
        if (rawCat === 'FALTANDO' || rawCat === 'FALTA') matchedTipo = 'falta';
        else if (rawCat === 'SOBRANDO' || rawCat === 'SOBRA') matchedTipo = 'sobra';
        else {
          errors.push(`Linha ${lineNum}: Categoria "${rawCat}" inválida. Deve ser FALTANDO ou SOBRANDO.`);
        }

        // 5. Dia
        const diaNum = Number(row[diaIdx]);
        const validYearMonth = Number.isInteger(anoNum) && anoNum >= 1900 && anoNum <= 2100 && Number.isInteger(mesNum) && mesNum >= 1 && mesNum <= 12;
        const maxDays = validYearMonth ? daysInMonth(anoNum, mesNum) : 31;
        if (!Number.isInteger(diaNum) || diaNum < 1 || diaNum > maxDays) {
          errors.push(`Linha ${lineNum}: Dia "${row[diaIdx]}" inválido para o mês ${mesNum || 'informado'}/${anoNum || 'informado'} (aceita de 1 a ${maxDays}).`);
        }

        // 6. Valor
        const rawVal = row[valIdx];
        let cents = 0;
        if (typeof rawVal === 'number') {
          cents = Math.round(rawVal * 100);
        } else {
          cents = amountCents(String(rawVal || ''));
        }
        if (!Number.isSafeInteger(cents) || cents <= 0) {
          errors.push(`Linha ${lineNum}: Valor "${rawVal}" inválido. Deve ser um valor numérico maior que zero.`);
        }

        // 7. Conferido
        const rawConf = row[confIdx];
        let isConferido: boolean | null = null;
        if (typeof rawConf === 'boolean') {
          isConferido = rawConf;
        } else {
          const strConf = String(rawConf ?? '').trim().toUpperCase();
          if (strConf === 'TRUE' || strConf === 'VERDADEIRO' || strConf === 'SIM' || strConf === '1') isConferido = true;
          else if (strConf === 'FALSE' || strConf === 'FALSO' || strConf === 'NAO' || strConf === 'NÃO' || strConf === '0' || strConf === '') isConferido = false;
          else {
            errors.push(`Linha ${lineNum}: Campo Conferido "${rawConf}" inválido. Utilize TRUE ou FALSE.`);
          }
        }

        // 8. Descrição principal (cliente no DB) e campos opcionais
        // O campo Descricao na planilha preenche 'cliente' no banco (exibido como DESCRIÇÃO na tabela).
        // Se a planilha contiver ambas as colunas (ex: legada com Cliente e Descricao), preserva ambas harmoniosamente sem perda.
        // Observações internas não são confundidas com a descrição nem preenchidas automaticamente por ela.
        const rawDesc = descIdx !== -1 ? String(row[descIdx] || '').trim() : '';
        const rawCli = cliIdx !== -1 ? String(row[cliIdx] || '').trim() : '';
        let cliente = '';

        if (descIdx !== -1 && cliIdx !== -1) {
          if (rawCli && rawDesc && rawCli !== rawDesc) {
            cliente = `${rawCli} - ${rawDesc}`;
          } else {
            cliente = rawDesc || rawCli;
          }
        } else if (descIdx !== -1) {
          cliente = rawDesc;
        } else if (cliIdx !== -1) {
          cliente = rawCli;
        }

        const funcionario = funcIdx !== -1 ? String(row[funcIdx] || '').trim() : '';
        const observacoes = '';

        if (matchedLot && validYearMonth && matchedTipo && Number.isInteger(diaNum) && diaNum >= 1 && diaNum <= maxDays && cents > 0 && isConferido !== null) {
          validRows.push({
            lineNum,
            loterica: matchedLot,
            ano: anoNum,
            mes: mesNum,
            dia: diaNum,
            tipo: matchedTipo,
            data_formatada: dateString(anoNum, mesNum, diaNum),
            valor: cents / 100,
            funcionario,
            cliente,
            observacoes,
            status: isConferido ? 'conferido' : 'pendente',
          });
        }
      }

      if (validRows.length === 0 && errors.length === 0) {
        errors.push('Nenhum registro com dados encontrado na aba "Lançamentos".');
      }

      // Detecção de duplicações na planilha e no banco de dados
      // Regra: Não exibir avisos de duplicação entre linhas da própria planilha baseados apenas na igualdade de campos.
      // Em lotéricas, valores iguais no mesmo dia (ex: 89 lançamentos de R$ 15,00 no dia 21, ou R$ 20,00) são lançamentos legítimos.
      // Também não classificamos como duplicados em relação ao banco existente sem um identificador confiável.
      // Todas as linhas válidas da planilha são preservadas individualmente.
      const duplicates: { lineNum: number; details: string }[] = [];

      setImportModal({
        fileName: file.name,
        validRows,
        errors,
        duplicates,
      });
    } catch (reason: any) {
      setError(`Erro ao ler o arquivo Excel: ${reason?.message || String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    await parseAndPreviewFile(file);
  }

  async function executeImport() {
    if (!importModal || !api || importModal.validRows.length === 0) return;
    setImporting(true);
    setError('');
    try {
      for (const row of importModal.validRows) {
        await api.addLancamento({
          loterica: row.loterica,
          ano: row.ano,
          mes: row.mes,
          dia: row.dia,
          data_formatada: row.data_formatada,
          valor: row.valor,
          tipo: row.tipo,
          funcionario: row.funcionario,
          cliente: row.cliente,
          observacoes: row.observacoes,
          status: row.status,
        });
      }
      const count = importModal.validRows.length;
      setImportModal(null);
      await refreshData(false);
      await refreshSync();
      setNotice(`${count} lançamento(s) importado(s) com sucesso no Relatório.`);
    } catch (reason: any) {
      setError(`Erro durante a gravação dos lançamentos: ${reason?.message || String(reason)}`);
    } finally {
      setImporting(false);
    }
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
            <Ledger title="PIX FALTANDO" kind="falta" entries={faltas} onEdit={openEdit} onInlineSave={saveInlineEdit} onToggleStatus={toggleRowStatus} onMarkAsConferido={handleMarkAsConferido} onDelete={handleDelete} isActive={isActive} />
            <Ledger title="PIX SOBRANDO" kind="sobra" entries={sobras} onEdit={openEdit} onInlineSave={saveInlineEdit} onToggleStatus={toggleRowStatus} onMarkAsConferido={handleMarkAsConferido} onDelete={handleDelete} isActive={isActive} />
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
            <div className="rp-settings-card-heading export"><Download size={15} /><strong>IMPORTAÇÃO E EXPORTAÇÃO DE PLANILHAS</strong></div>
            <p className="rp-settings-description">Exporte os lançamentos para Excel ou importe registros de uma planilha padronizada, preenchendo automaticamente os dados do Relatório.</p>
            <div className="rp-report-tools-actions">
              <button type="button" className="rp-button rp-button-outline export-action" onClick={() => void exportReport()}><Download size={14} /> Exportar para Excel (.xlsx)</button>
              <button type="button" className="rp-button rp-button-outline import-action" onClick={() => importFileInputRef.current?.click()}><Upload size={14} /> Importar do Excel (.xlsx)</button>
            </div>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx"
              style={{ display: 'none' }}
              onChange={(event) => void handleImportFileChange(event)}
            />
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

      {importModal && (
        <div
          className="rp-overlay rp-import-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !importing) setImportModal(null);
          }}
        >
          <section
            className="rp-entry-modal rp-import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rp-import-title"
          >
            <header>
              <div>
                <p className="rp-eyebrow">IMPORTAÇÃO DE PLANILHA</p>
                <h2 id="rp-import-title">Importar lançamentos do Excel</h2>
                <span>Arquivo: <strong>{importModal.fileName}</strong></span>
              </div>
              <button
                type="button"
                className="rp-icon-button"
                disabled={importing}
                onClick={() => setImportModal(null)}
                aria-label="Fechar prévia de importação"
              >
                <X size={16} />
              </button>
            </header>

            <div className="rp-import-body">
              {importModal.errors.length > 0 && (
                <div className="rp-import-alert rp-import-alert-danger">
                  <div className="rp-import-alert-header">
                    <AlertTriangle size={16} />
                    <strong>{importModal.errors.length} erro(s) impeditivo(s) encontrado(s)</strong>
                  </div>
                  <p>
                    A planilha contém dados inválidos ou incompatíveis. Nenhum registro será importado até que todos os erros sejam corrigidos no arquivo Excel.
                  </p>
                  <ul className="rp-import-list rp-import-error-list">
                    {importModal.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importModal.errors.length === 0 && (
                <>
                  <div className="rp-import-stats">
                    <div className="rp-import-stat-card">
                      <span>Total de lançamentos</span>
                      <strong>{importModal.validRows.length}</strong>
                    </div>
                    <div className="rp-import-stat-card">
                      <span>Valor total</span>
                      <strong className="total">
                        {brl.format(importModal.validRows.reduce((sum, r) => sum + r.valor, 0))}
                      </strong>
                    </div>
                    <div className="rp-import-stat-card">
                      <span>PIX Faltando</span>
                      <strong>
                        {importModal.validRows.filter((r) => r.tipo === 'falta').length} (
                        {brl.format(
                          importModal.validRows
                            .filter((r) => r.tipo === 'falta')
                            .reduce((sum, r) => sum + r.valor, 0)
                        )}
                        )
                      </strong>
                    </div>
                    <div className="rp-import-stat-card">
                      <span>PIX Sobrando</span>
                      <strong>
                        {importModal.validRows.filter((r) => r.tipo === 'sobra').length} (
                        {brl.format(
                          importModal.validRows
                            .filter((r) => r.tipo === 'sobra')
                            .reduce((sum, r) => sum + r.valor, 0)
                        )}
                        )
                      </strong>
                    </div>
                  </div>

                  {importModal.duplicates.length > 0 && (
                    <div className="rp-import-alert rp-import-alert-warning">
                      <div className="rp-import-alert-header">
                        <AlertTriangle size={16} />
                        <strong>Atenção: {importModal.duplicates.length} possível(is) duplicação(ões) identificada(s)</strong>
                      </div>
                      <p>
                        Os registros abaixo coincidem com lançamentos já cadastrados no sistema ou repetidos na planilha. Eles serão importados caso você confirme.
                      </p>
                      <ul className="rp-import-list rp-import-warning-list">
                        {importModal.duplicates.map((dup, idx) => (
                          <li key={idx}>
                            <span>Linha {dup.lineNum}:</span> {dup.details}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rp-import-info-box">
                    <strong>Informações da importação:</strong>
                    <span>
                      • Os lançamentos serão distribuídos automaticamente nas respectivas lotéricas ({Array.from(new Set(importModal.validRows.map((r) => r.loterica))).join(', ')}), anos e meses informados.
                    </span>
                    <span>
                      • A persistência utiliza o mecanismo oficial do Relatório e enfileira a sincronização com o Google Drive.
                    </span>
                  </div>
                </>
              )}
            </div>

            <footer>
              <button
                type="button"
                className="rp-button rp-button-outline"
                disabled={importing}
                onClick={() => setImportModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rp-button rp-button-primary lc-shared-action lc-shared-action-primary"
                disabled={importing || importModal.errors.length > 0 || importModal.validRows.length === 0}
                onClick={() => void executeImport()}
              >
                {importing
                  ? 'Importando…'
                  : `Confirmar Importação (${importModal.validRows.length} ${importModal.validRows.length === 1 ? 'lançamento' : 'lançamentos'})`}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

export const Ledger = React.memo(function Ledger({ title, kind, entries, onEdit, onInlineSave, onToggleStatus, onMarkAsConferido, onDelete, isActive = true }: any) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'valor' | 'cliente' | 'funcionario' } | null>(null);
  const [cellDraft, setCellDraft] = useState('');
  const savingCell = useRef(false);
  const activeCell = useRef<{ id: string; field: 'valor' | 'cliente' | 'funcionario' } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ row: any; isMulti: boolean; targetRows: any[]; x: number; y: number } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ rows: any[] } | null>(null);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', keydown); };
  }, [contextMenu]);

  useEffect(() => {
    if (!deleteModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setDeleteModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [deleteModal]);

  const totalSum = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < entries.length; i++) {
      sum += Number(entries[i].valor || 0);
    }
    return sum;
  }, [entries]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<number, any[]>();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const day = Number(entry.dia) || 0;
      let list = groups.get(day);
      if (!list) {
        list = [];
        groups.set(day, list);
      }
      list.push(entry);
    }
    return [...groups.entries()].sort(([left], [right]) => left - right);
  }, [entries]);

  const displayedRows = useMemo(() => {
    const rows: any[] = [];
    for (let g = 0; g < groupedEntries.length; g++) {
      const dayEntries = groupedEntries[g][1];
      for (let i = 0; i < dayEntries.length; i++) {
        rows.push(dayEntries[i]);
      }
    }
    return rows;
  }, [groupedEntries]);

  type LedgerDisplayRow =
    | { type: 'day-group'; day: number; subtotal: number; key: string }
    | { type: 'day-head'; day: number; key: string }
    | { type: 'entry'; entry: any; key: string };

  const displayItems = useMemo<LedgerDisplayRow[]>(() => {
    const items: LedgerDisplayRow[] = [];
    for (let g = 0; g < groupedEntries.length; g++) {
      const [day, dayEntries] = groupedEntries[g];
      let subtotal = 0;
      for (let i = 0; i < dayEntries.length; i++) {
        subtotal += Number(dayEntries[i].valor || 0);
      }
      items.push({ type: 'day-group', day, subtotal, key: `group-${day}` });
      items.push({ type: 'day-head', day, key: `head-${day}` });
      for (let i = 0; i < dayEntries.length; i++) {
        items.push({ type: 'entry', entry: dayEntries[i], key: String(dayEntries[i].id) });
      }
    }
    return items;
  }, [groupedEntries]);

  const getItemHeight = useCallback((item: LedgerDisplayRow) => {
    if (item.type === 'day-group') return 38;
    if (item.type === 'day-head') return 32;
    return 44;
  }, []);

  const {
    containerRef,
    visibleItems,
    topSpacerHeight,
    bottomSpacerHeight,
  } = useRelatorioVirtualTable<LedgerDisplayRow>({
    items: displayItems,
    getItemHeight,
    overscanPx: 350,
    minItemsToVirtualize: 35,
  });

  const {
    selectedIds,
    handleRowClick,
    clearSelection,
    summary,
  } = useRelatorioTableSelection(displayedRows);

  useEffect(() => {
    if (isActive === false) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeCell.current) return;
      if (e.key === 'Escape' && selectedIds.size > 0) {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, selectedIds.size, clearSelection]);

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
    <header><div className="rp-ledger-heading"><div><span className="rp-ledger-mark" /><h2>{title}</h2></div><p>{kind === 'falta' ? 'Diferenças não localizadas no caixa / pendências' : 'Valores a mais recebidos no PIX / sem comprovante'}</p></div><div className="rp-ledger-total"><span>{kind === 'falta' ? 'Total faltando' : 'Total sobrando'}</span><strong>{brl.format(totalSum)}</strong></div></header>
    <div className="rp-ledger-scroll" ref={containerRef}>
      <table>
        <colgroup>
          <col className="rp-col-value" />
          <col className="rp-col-description" />
          <col className="rp-col-employee" />
          <col className="rp-col-action" />
        </colgroup>
        <tbody>
          {topSpacerHeight > 0 && (
            <tr
              key="rp-top-spacer"
              aria-hidden="true"
              style={{ height: `${topSpacerHeight}px`, padding: 0, border: 0, margin: 0, lineHeight: 0, fontSize: 0 }}
            >
              <td colSpan={4} style={{ height: `${topSpacerHeight}px`, padding: 0, border: 0, margin: 0, lineHeight: 0, fontSize: 0 }} />
            </tr>
          )}
          {visibleItems.map((item) => {
            if (item.type === 'day-group') {
              return (
                <tr key={item.key} className="rp-day-group">
                  <td colSpan={4}>
                    <div>
                      <span>🗓️ DIA {String(item.day).padStart(2, '0')}</span>
                      <small>SUBTOTAL: <strong>{brl.format(item.subtotal)}</strong></small>
                    </div>
                  </td>
                </tr>
              );
            }
            if (item.type === 'day-head') {
              return (
                <tr key={item.key} className="rp-group-head">
                  <th>VALOR</th>
                  <th>DESCRIÇÃO</th>
                  <th>FUNCIONÁRIO</th>
                  <th aria-label="Conferência"></th>
                </tr>
              );
            }
            const row = item.entry;
            const isChecked = row.status === 'conferido';
            const isSelected = selectedIds.has(String(row.id));
            return (
              <tr
                key={row.id}
                id={`report-row-${row.id}`}
                className={`${isChecked ? 'is-conferido' : ''} ${isSelected ? 'is-selected' : ''}`.trim() || undefined}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const isSel = selectedIds.has(String(row.id));
                  const isMulti = isSel && selectedIds.size > 1;
                  const targetRows = isMulti
                    ? displayedRows.filter((r: any) => selectedIds.has(String(r.id)))
                    : [row];
                  setContextMenu({
                    row,
                    isMulti,
                    targetRows,
                    x: Math.min(event.clientX, window.innerWidth - 210),
                    y: Math.min(event.clientY, window.innerHeight - 190),
                  });
                }}
                title="Clique com o botão direito para ver as ações"
              >
                {renderEditableCell(row, 'valor', 'Valor', brl.format(row.valor))}
                {renderEditableCell(row, 'cliente', 'Descrição', row.cliente || '—')}
                {renderEditableCell(row, 'funcionario', 'Funcionário', row.funcionario || '—')}
                <td
                  className={`rp-check-cell ${isSelected ? 'is-selected' : ''}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName.toLowerCase() !== 'input') {
                      e.preventDefault();
                      handleRowClick(e, row.id);
                    }
                  }}
                  title="Clique fora da caixa para selecionar com Ctrl / Shift"
                >
                  <div
                    className="rp-check-action"
                    title={isChecked ? 'Desmarcar conferência' : 'Marcar como conferido'}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      onChange={() => void onToggleStatus?.(row)}
                      aria-label={isChecked ? 'Reabrir lançamento' : 'Marcar como conferido'}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
          {bottomSpacerHeight > 0 && (
            <tr
              key="rp-bottom-spacer"
              aria-hidden="true"
              style={{ height: `${bottomSpacerHeight}px`, padding: 0, border: 0, margin: 0, lineHeight: 0, fontSize: 0 }}
            >
              <td colSpan={4} style={{ height: `${bottomSpacerHeight}px`, padding: 0, border: 0, margin: 0, lineHeight: 0, fontSize: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      {!entries.length && <div className="rp-empty">Nenhum lançamento {kind === 'falta' ? 'faltando' : 'sobrando'} neste filtro.</div>}
    </div>
    {summary && summary.count > 0 && (
      <footer
        className="rp-selection-summary"
        role="region"
        aria-label="Resumo da seleção de linhas"
      >
        <div className="rp-selection-summary-info">
          <span className="rp-selection-summary-title">Resumo da Seleção:</span>
          <span className="rp-selection-summary-values">
            Quantidade: <strong>{summary.count}</strong>
            <span className="rp-selection-summary-divider">|</span>
            Total: <strong>{brl.format(summary.totalValor)}</strong>
            <span className="rp-selection-summary-divider">|</span>
            Média: <strong>{brl.format(summary.mediaValor)}</strong>
          </span>
        </div>
        <button
          type="button"
          onClick={clearSelection}
          className="rp-selection-clear-btn"
          title="Limpar seleção de linhas (Esc)"
        >
          Limpar seleção (Esc)
        </button>
      </footer>
    )}
    {contextMenu && (() => {
      const isMulti = contextMenu.isMulti;
      const targetRows = contextMenu.targetRows;
      const pendingRows = targetRows.filter((r: any) => r.status !== 'conferido');
      const hasPending = pendingRows.length > 0;

      return (
        <div
          className="rp-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          {isMulti ? (
            <strong>{targetRows.length} lançamentos selecionados</strong>
          ) : (
            <strong>{brl.format(contextMenu.row.valor)} · Dia {String(contextMenu.row.dia).padStart(2, '0')}</strong>
          )}

          {isMulti ? (
            <>
              {hasPending && (
                <button
                  type="button"
                  onClick={async () => {
                    const rowsToMark = pendingRows;
                    setContextMenu(null);
                    if (onMarkAsConferido) {
                      await onMarkAsConferido(rowsToMark);
                    } else if (onToggleStatus) {
                      for (const r of rowsToMark) {
                        await onToggleStatus(r);
                      }
                    }
                  }}
                >
                  Marcar como conferidos
                </button>
              )}
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const rows = targetRows;
                  setContextMenu(null);
                  setDeleteModal({ rows });
                }}
              >
                Excluir {targetRows.length} lançamentos selecionados
              </button>
            </>
          ) : (
            <>
              {contextMenu.row.status !== 'conferido' && (
                <button
                  type="button"
                  onClick={async () => {
                    const row = contextMenu.row;
                    setContextMenu(null);
                    if (onMarkAsConferido) {
                      await onMarkAsConferido([row]);
                    } else if (onToggleStatus) {
                      await onToggleStatus(row);
                    }
                  }}
                >
                  Marcar como conferido
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  onEdit(contextMenu.row);
                }}
              >
                Editar lançamento
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const rows = targetRows;
                  setContextMenu(null);
                  setDeleteModal({ rows });
                }}
              >
                Excluir lançamento
              </button>
            </>
          )}
        </div>
      );
    })()}

    {deleteModal && (
      <div
        className="rp-overlay rp-delete-confirm-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDeleteModal(null);
        }}
      >
        <div
          className="rp-entry-modal rp-confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`rp-delete-dialog-${kind}`}
        >
          <header>
            <div>
              <p className="rp-eyebrow">CONFIRMAÇÃO</p>
              <h2 id={`rp-delete-dialog-${kind}`}>Confirmar exclusão</h2>
            </div>
            <button
              type="button"
              className="rp-icon-button"
              onClick={() => setDeleteModal(null)}
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </header>
          <div className="rp-delete-body">
            <p>
              {deleteModal.rows.length === 1
                ? 'Excluir este lançamento? A exclusão será lógica e sincronizada.'
                : `Excluir estes ${deleteModal.rows.length} lançamentos? A exclusão será lógica e sincronizada.`}
            </p>
          </div>
          <footer>
            <button
              type="button"
              className="rp-button rp-button-outline"
              onClick={() => setDeleteModal(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rp-button rp-button-danger"
              onClick={async () => {
                const rowsToDelete = deleteModal.rows;
                setDeleteModal(null);
                await onDelete(rowsToDelete);
                clearSelection();
              }}
            >
              {deleteModal.rows.length === 1 ? 'Excluir lançamento' : 'Excluir lançamentos'}
            </button>
          </footer>
        </div>
      </div>
    )}
  </section>;
});
