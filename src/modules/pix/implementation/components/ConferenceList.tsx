import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Clock,
  Search,
  ArrowUpDown,
  CheckCircle2,
  ListFilter,
  AlertCircle,
  MoreHorizontal,
  Copy,
  CheckCheck,
  Undo2,
  Check,
  Plus,
  Trash2,
} from 'lucide-react';
import type { PixTransaction } from '../services/statementParser';
import { formatCurrencyPlain, formatCurrencyBr } from '../utils/rules';
import { copyTransactionsToClipboard } from '../services/clipboard';
import { AddTransactionModal } from './AddTransactionModal';
import { useVirtualList } from '../hooks/useVirtualList';
import { useTableSelection } from '../hooks/useTableSelection';

export type ConferenceBehavior = 'move_to_conferidos' | 'keep_in_list';
export type ViewTab = 'pendentes' | 'conferidos' | 'todos';

const ROW_HEIGHT = 48; // Strictly uniform 48px row height matching spreadsheet reference

interface ConferenceListProps {
  transactions: PixTransaction[];
  checkedIds: Set<string>;
  onToggleCheck: (id: string) => void;
  behavior: ConferenceBehavior;
  activeTab: ViewTab;
  onChangeTab: (tab: ViewTab) => void;
  onCheckAllFiltered: () => void;
  onUncheckAllFiltered: () => void;
  persistenceError?: string | null;
  highlightedTxId?: string | null;
  onDeleteTransaction?: (id: string) => void;
  onAddTransaction?: (transaction: PixTransaction) => void;
  availableHistoricos?: string[];
  currentDia?: string;
  isActive?: boolean;
}

// Memoized individual row for instantaneous sub-millisecond checkbox toggling and spreadsheet selection
interface PixRowProps {
  tx: PixTransaction;
  isChecked: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  onToggleCheck: (id: string) => void;
  onSelectRow: (e: React.MouseEvent, id: string) => void;
  onDelete?: (e: React.MouseEvent, id: string) => void;
}

const PixRow = React.memo<PixRowProps>(
  ({ tx, isChecked, isSelected, isHighlighted, onToggleCheck, onSelectRow, onDelete }) => {
    return (
      <div
        id={`tx-row-${tx.id}`}
        onClick={(e) => onSelectRow(e, tx.id)}
        className={`h-12 max-h-12 min-h-[48px] flex items-stretch justify-between select-none cursor-pointer border-b transition-colors ${
          isHighlighted
            ? 'ring-4 ring-amber-400 ring-inset bg-amber-50/90 z-20 shadow-md border-amber-300'
            : isSelected
            ? 'bg-sky-100/80 border-b-sky-200 border-l-4 border-l-sky-600'
            : 'bg-white hover:bg-slate-50/90 border-slate-200'
        }`}
      >
        {/* ESQUERDA: Informações do Lançamento (Dia, Histórico, Doc, e Coluna Fixa de Horário) */}
        <div className="flex-1 min-w-0 px-3 flex items-center gap-2">
          {/* Delete button (se manual) */}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => onDelete(e, tx.id)}
              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
              title="Excluir lançamento"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Dia Badge (Never wraps) */}
          <span className="text-[11px] font-bold text-slate-600 px-2 py-0.5 rounded bg-slate-100 border border-slate-200/90 whitespace-nowrap shrink-0">
            {tx.dia}
          </span>

          {/* Área do Histórico e Documento (ocupa todo o espaço restante) */}
          <div className="flex-1 min-w-0 flex items-center gap-2 truncate pr-2">
            <span
              className={`text-xs sm:text-sm font-semibold truncate ${
                isChecked ? 'text-slate-400 line-through' : 'text-slate-800'
              }`}
              title={tx.historico}
            >
              {tx.historico}
            </span>

            <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap shrink-0">
              Doc: {tx.documento || '---'}
            </span>
          </div>

          {/* Coluna de Horário com largura fixa e alinhamento consistente à direita */}
          <div className="w-16 sm:w-20 shrink-0 flex items-center justify-end">
            {tx.horario ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/70 whitespace-nowrap tabular-nums"
                title={`Horário: ${tx.horario}`}
              >
                <Clock className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                {tx.horario}
              </span>
            ) : null}
          </div>
        </div>

        {/* DIREITA: Retângulo de Valor (Bordô se pendente, Verde se conferido) + Célula da Checkbox */}
        <div className="flex items-stretch shrink-0">
          {/* Retângulo de Valor com largura fixa (w-48 sm:w-52), números brancos grandes sem R$ */}
          <div
            className={`w-44 sm:w-52 flex items-center justify-end px-3 sm:px-4 text-white font-extrabold text-2xl sm:text-[25px] tabular-nums tracking-tight select-none border-b border-white transition-colors ${
              isChecked ? 'bg-[#14532d]' : 'bg-[#67000d]'
            }`}
          >
            {formatCurrencyPlain(tx.valor)}
          </div>

          {/* Célula da Checkbox: clique isolado de seleção da linha */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-12 bg-[#ededed] border-l border-white border-b border-white flex items-center justify-center shrink-0"
          >
            <input
              type="checkbox"
              checked={isChecked}
              onClick={(e) => {
                e.stopPropagation();
              }}
              onChange={(e) => {
                e.stopPropagation();
                onToggleCheck(tx.id);
              }}
              className={`w-7 h-7 rounded-[1px] border-[2.5px] border-[#374151] cursor-pointer appearance-none transition-colors flex items-center justify-center ${
                isChecked
                  ? 'bg-[#14532d] border-[#14532d] bg-no-repeat bg-center'
                  : 'bg-white hover:border-slate-800'
              }`}
              style={
                isChecked
                  ? {
                      backgroundImage: `url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")`,
                      backgroundSize: '80% 80%',
                    }
                  : undefined
              }
              aria-label={`Marcar lançamento ${formatCurrencyPlain(tx.valor)}`}
            />
          </div>
        </div>
      </div>
    );
  }
);

PixRow.displayName = 'PixRow';

const ConferenceListComponent: React.FC<ConferenceListProps> = ({
  transactions,
  checkedIds,
  onToggleCheck,
  activeTab,
  onChangeTab,
  onCheckAllFiltered,
  onUncheckAllFiltered,
  persistenceError,
  highlightedTxId,
  onDeleteTransaction,
  onAddTransaction,
  availableHistoricos = [],
  currentDia = 'DIA 01',
  isActive = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [copiedConferidos, setCopiedConferidos] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Tab counts memoized
  const totalCount = transactions.length;

  const conferidosList = useMemo(() => {
    return transactions.filter((t) => checkedIds.has(t.id));
  }, [transactions, checkedIds]);

  const conferidosCount = conferidosList.length;
  const pendentesCount = totalCount - conferidosCount;

  // Filter by active tab memoized
  const tabFiltered = useMemo(() => {
    return transactions.filter((tx) => {
      const isChecked = checkedIds.has(tx.id);
      if (activeTab === 'pendentes') return !isChecked;
      if (activeTab === 'conferidos') return isChecked;
      return true; // 'todos'
    });
  }, [transactions, checkedIds, activeTab]);

  // Search and sort filter memoized
  const displayed = useMemo(() => {
    const list = searchTerm
      ? tabFiltered.filter((tx) => {
          const term = searchTerm.toLowerCase().trim();
          return (
            tx.formattedBr.includes(term) ||
            tx.historico.toLowerCase().includes(term) ||
            tx.documento.includes(term) ||
            (tx.horario && tx.horario.includes(term))
          );
        })
      : tabFiltered;

    return [...list].sort((a, b) => {
      const cmp = a.valorCentavos - b.valorCentavos;
      return sortAsc ? cmp : -cmp;
    });
  }, [tabFiltered, searchTerm, sortAsc]);

  // Virtual Windowing for silky smooth performance with thousands of items
  const {
    containerRef,
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    scrollToIndex,
  } = useVirtualList({
    itemCount: displayed.length,
    itemHeight: ROW_HEIGHT,
    overscan: 6,
  });

  // Spreadsheet-style multi-selection and financial summary
  const {
    selectedIds,
    handleRowClick,
    clearSelection,
    summary,
  } = useTableSelection(displayed);

  // Esc clears row selection
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIds.size > 0) {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, selectedIds.size, clearSelection]);

  // Auto-scroll to highlighted item on Undo / Redo
  useEffect(() => {
    if (highlightedTxId) {
      const targetIndex = displayed.findIndex((tx) => tx.id === highlightedTxId);
      if (targetIndex !== -1) {
        scrollToIndex(targetIndex, 'smooth');
      }
    }
  }, [highlightedTxId, displayed, scrollToIndex]);

  const handleCopyConferidos = async () => {
    const res = await copyTransactionsToClipboard(conferidosList, 'conferidos');
    if (res.success) {
      setCopiedConferidos(true);
      setTimeout(() => {
        setCopiedConferidos(false);
        setIsActionsMenuOpen(false);
      }, 2000);
    } else {
      alert(res.message);
    }
  };

  const handleDelete = useCallback(
    (e: React.MouseEvent, txId: string) => {
      e.stopPropagation();
      if (window.confirm('Deseja realmente excluir este lançamento?')) {
        onDeleteTransaction?.(txId);
      }
    },
    [onDeleteTransaction]
  );

  const visibleItems = displayed.slice(startIndex, endIndex);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden flex flex-col h-full min-h-0">
      {/* Header: Title "Lista de PIX", Search, Add and Secondary Actions */}
      <div className="p-3 sm:px-4 sm:py-2.5 bg-[#12385f] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base sm:text-lg font-bold tracking-tight whitespace-nowrap">
            Lista de PIX
          </h2>
          <span className="text-xs text-blue-200/70 font-medium hidden sm:inline whitespace-nowrap">
            ({displayed.length} {displayed.length === 1 ? 'item' : 'itens'})
          </span>
        </div>

        {/* Search, Add PIX, Sort and Secondary Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Add Manual PIX button */}
          {onAddTransaction && (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors whitespace-nowrap"
              title="Adicionar lançamento manual"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span className="hidden sm:inline">Adicionar PIX</span>
            </button>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar valor, doc..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl text-xs text-white placeholder-blue-200/60 focus:outline-hidden focus:ring-2 focus:ring-[#1d68a7] w-32 sm:w-40 transition-all"
            />
          </div>

          {/* Sort order toggle */}
          <button
            type="button"
            onClick={() => setSortAsc(!sortAsc)}
            className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            title="Alternar ordenação numérica crescente / decrescente"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-blue-200" />
            <span className="hidden md:inline">{sortAsc ? 'Crescente' : 'Decrescente'}</span>
          </button>

          {/* Secondary Actions Menu (More) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)}
              className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 text-xs cursor-pointer transition-colors"
              title="Ações secundárias"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isActionsMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 text-slate-800 z-30 text-xs animate-in fade-in duration-100">
                <button
                  type="button"
                  onClick={handleCopyConferidos}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-slate-700 cursor-pointer"
                >
                  {copiedConferidos ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{copiedConferidos ? 'Copiado!' : `Copiar conferidos (${conferidosCount})`}</span>
                </button>

                <div className="h-px bg-slate-100 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    onCheckAllFiltered();
                    setIsActionsMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-emerald-700 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Marcar todos do filtro</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onUncheckAllFiltered();
                    setIsActionsMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-amber-700 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5 text-amber-600" />
                  <span>Desmarcar todos do filtro</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Persistence Error Alert */}
      {persistenceError && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{persistenceError}</span>
        </div>
      )}

      {/* Tabs Bar: Pendentes, Conferidos, Todos */}
      <div className="px-3 sm:px-4 py-2 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-xl">
          <button
            type="button"
            onClick={() => onChangeTab('pendentes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'pendentes'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Pendentes ({pendentesCount})
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('conferidos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'conferidos'
                ? 'bg-emerald-600 !text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Conferidos ({conferidosCount})
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'todos'
                ? 'bg-[#12385f] !text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            Todos ({totalCount})
          </button>
        </div>

        <span className="text-[11px] text-slate-400 font-medium hidden sm:inline whitespace-nowrap">
          Listando {displayed.length}
        </span>
      </div>

      {/* Spreadsheet Reference Table Header: Informações | Horário | Valor | Marcar */}
      <div className="px-3 py-1.5 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 select-none">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0">Dia / Lançamento / Detalhes</div>
          <div className="w-16 sm:w-20 shrink-0 text-right pr-1">Horário</div>
        </div>
        <div className="flex items-center shrink-0">
          <div className="w-44 sm:w-52 text-right pr-4">Valor</div>
          <div className="w-12 text-center">Status</div>
        </div>
      </div>

      {/* Rows List: Virtualized, strictly uniform 48px row height, spreadsheet aesthetic */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto bg-white select-none"
      >
        {displayed.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm font-semibold text-slate-500">
              {activeTab === 'pendentes' && pendentesCount === 0 && totalCount > 0
                ? '🎉 Todos os lançamentos deste filtro foram conferidos!'
                : activeTab === 'conferidos' && conferidosCount === 0
                ? 'Nenhum lançamento conferido ainda neste filtro.'
                : 'Nenhum lançamento encontrado para os critérios selecionados.'}
            </p>
            <p className="text-xs mt-1 text-slate-400">
              {activeTab === 'pendentes' && pendentesCount === 0 && totalCount > 0
                ? 'Alterne para a aba "Conferidos" ou "Todos" para revisar.'
                : 'Tente alterar os filtros de dia, histórico ou pesquisa.'}
            </p>
          </div>
        ) : (
          <div>
            {/* Top virtual spacer */}
            {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px` }} />}

            {/* Rendered visible rows */}
            {visibleItems.map((tx) => {
              const isChecked = checkedIds.has(tx.id);
              const isSelected = selectedIds.has(tx.id);
              const isHighlighted = highlightedTxId === tx.id;

              return (
                <PixRow
                  key={tx.id}
                  tx={tx}
                  isChecked={isChecked}
                  isSelected={isSelected}
                  isHighlighted={isHighlighted}
                  onToggleCheck={onToggleCheck}
                  onSelectRow={handleRowClick}
                  onDelete={onDeleteTransaction ? handleDelete : undefined}
                />
              );
            })}

            {/* Bottom virtual spacer */}
            {bottomSpacerHeight > 0 && (
              <div style={{ height: `${bottomSpacerHeight}px` }} />
            )}
          </div>
        )}
      </div>

      {/* Selection Financial Summary Bar (in the footer position when items are selected via click/Ctrl/Shift) */}
      {summary && summary.count > 0 && (
        <div className="p-2.5 px-4 bg-sky-50 border-t border-sky-200 flex items-center justify-between text-xs text-sky-950 font-medium shrink-0 animate-in fade-in duration-150">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sky-900">Resumo da Seleção:</span>
            <span className="tabular-nums">
              Valor Total: <strong className="font-bold text-sky-950">{formatCurrencyBr(summary.totalValor)}</strong> | Contagem: <strong className="font-bold text-sky-950">{summary.count}</strong> | Média: <strong className="font-bold text-sky-950">{formatCurrencyBr(summary.mediaValor)}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="px-2 py-0.5 rounded text-[11px] font-bold text-sky-800 hover:text-sky-950 hover:bg-sky-200/70 transition-colors cursor-pointer whitespace-nowrap"
            title="Limpar seleção de linhas (Esc)"
          >
            Limpar seleção (Esc)
          </button>
        </div>
      )}

      {/* Add Transaction Modal */}
      {isAddModalOpen && onAddTransaction && (
        <AddTransactionModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAdd={(newTx) => {
            onAddTransaction(newTx);
            setIsAddModalOpen(false);
          }}
          availableHistoricos={availableHistoricos}
          defaultDia={currentDia}
        />
      )}
    </div>
  );
};

export const ConferenceList = React.memo(ConferenceListComponent);
