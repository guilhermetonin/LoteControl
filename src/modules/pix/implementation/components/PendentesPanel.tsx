import React, { useState, useEffect } from 'react';
import { Copy, Check, Clock, MoreHorizontal, ArrowRight } from 'lucide-react';
import type { PixTransaction } from '../services/statementParser';
import { copyTransactionsToClipboard } from '../services/clipboard';
import { formatCurrencyPlain, formatCurrencyBr } from '../utils/rules';
import { useVirtualList } from '../hooks/useVirtualList';
import { useTableSelection } from '../hooks/useTableSelection';
import { TransferPendentesModal } from './TransferPendentesModal';

const ROW_HEIGHT = 48; // Strictly uniform 48px row height matching spreadsheet reference

interface PendentesPanelProps {
  pendentes: PixTransaction[];
  highlightedTxId?: string | null;
  conferenceId?: string | null;
  fileName?: string;
  onMoved?: (transactions: PixTransaction[]) => Promise<void>;
  isActive?: boolean;
}

const PendentesPanelComponent: React.FC<PendentesPanelProps> = ({
  pendentes,
  highlightedTxId,
  conferenceId = null,
  fileName = '',
  onMoved,
  isActive = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [isActionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [transferRequest, setTransferRequest] = useState<{ mode: 'copy' | 'move'; transactions: PixTransaction[] } | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  const handleCopy = async () => {
    const res = await copyTransactionsToClipboard(pendentes, 'pendentes');
    if (res.success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      alert(res.message);
    }
  };

  const handleTransfer = (mode: 'copy' | 'move') => {
    if (pendentes.length === 0) return;
    const rows = selectedIds.size > 0
      ? pendentes.filter((tx) => selectedIds.has(tx.id))
      : pendentes;
    setTransferRequest({ mode, transactions: rows });
  };

  const handleConfirmTransfer = async (targetLoterica: string, fallbackMonth: number, fallbackYear: number) => {
    if (!transferRequest || !conferenceId) {
      alert('Importe ou abra uma conferência antes de enviar valores ao Relatório.');
      return;
    }
    const api = window.electronAPI?.integration;
    if (!api) {
      alert('A transferência para o Relatório está disponível no aplicativo desktop integrado.');
      return;
    }

    setIsTransferring(true);
    try {
      const result = await api.transferPixPending({
        conferenceId,
        fileName,
        transactions: transferRequest.transactions,
        targetLoterica,
        fallbackMonth,
        fallbackYear,
        mode: transferRequest.mode,
      });
      if (!result.success) throw new Error('O Relatório não confirmou a gravação dos valores.');
      if (transferRequest.mode === 'move') await onMoved?.(transferRequest.transactions);
      alert(`${result.inserted} valor(es) enviado(s) para Sobrando.${result.skipped ? ` ${result.skipped} já existiam e não foram duplicados.` : ''}`);
      setTransferRequest(null);
      clearSelection();
    } catch (error: any) {
      alert(`Não foi possível enviar os pendentes: ${error?.message || error}`);
    } finally {
      setIsTransferring(false);
    }
  };

  // Virtual Windowing for silky smooth performance
  const {
    containerRef,
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    scrollToIndex,
  } = useVirtualList({
    itemCount: pendentes.length,
    itemHeight: ROW_HEIGHT,
    overscan: 6,
  });

  // Spreadsheet-style multi-selection and financial summary (strictly independent from main list)
  const {
    selectedIds,
    handleRowClick,
    clearSelection,
    summary,
  } = useTableSelection(pendentes);

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
      const targetIndex = pendentes.findIndex((tx) => tx.id === highlightedTxId);
      if (targetIndex !== -1) {
        scrollToIndex(targetIndex, 'smooth');
      }
    }
  }, [highlightedTxId, pendentes, scrollToIndex]);

  const visibleItems = pendentes.slice(startIndex, endIndex);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden flex flex-col h-full min-h-0">
      {/* Panel Header */}
      <div className="p-3 sm:px-4 sm:py-2.5 bg-[#12385f] text-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <h2 className="text-base sm:text-lg font-bold tracking-tight whitespace-nowrap">
            Pendentes
          </h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 whitespace-nowrap">
            {pendentes.length}
          </span>
        </div>

        <div className="relative">
          <button type="button" aria-label="Ações dos pendentes" aria-haspopup="menu" aria-expanded={isActionsMenuOpen} onClick={() => setActionsMenuOpen((open) => !open)} className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
            <MoreHorizontal className="h-4 w-4" /> Ações
          </button>
          {isActionsMenuOpen && <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-52 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-800 shadow-lg">
            <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); void handleCopy(); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold hover:bg-slate-100">{copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}{copied ? 'Copiado!' : 'Copiar valores pendentes'}</button>
            <button type="button" role="menuitem" disabled={!pendentes.length} onClick={() => { setActionsMenuOpen(false); handleTransfer('copy'); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"><Copy className="h-4 w-4" />Copiar para o Relatório</button>
            <button type="button" role="menuitem" disabled={!pendentes.length} onClick={() => { setActionsMenuOpen(false); handleTransfer('move'); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-blue-900 hover:bg-blue-50 disabled:opacity-50"><ArrowRight className="h-4 w-4" />Mover para o Relatório</button>
          </div>}
        </div>
      </div>

      {/* Spreadsheet Reference Table Subheader (No checkbox column) */}
      <div className="px-3 sm:px-4 py-1.5 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 select-none">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0">Lançamento / Detalhes</div>
          <div className="w-16 sm:w-20 shrink-0 text-right pr-1">Horário</div>
        </div>
        <div className="flex items-center shrink-0">
          <div className="w-44 sm:w-52 text-right pr-4">Valor Pendente</div>
          <div className="w-16 text-center">Dia</div>
        </div>
      </div>

      {/* List Content: Virtualized, strictly uniform 48px row height, NO checkboxes */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto bg-white select-none"
      >
        {pendentes.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <p className="font-semibold text-slate-500">Nenhum PIX pendente neste filtro.</p>
            <p className="text-[11px] text-slate-400 mt-1">Todos os valores foram conferidos com sucesso.</p>
          </div>
        ) : (
          <div>
            {/* Top virtual spacer */}
            {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px` }} />}

            {/* Rendered visible rows */}
            {visibleItems.map((tx) => {
              const isHighlighted = highlightedTxId === tx.id;
              const isSelected = selectedIds.has(tx.id);

              return (
                <div
                  id={`tx-pendente-${tx.id}`}
                  key={tx.id}
                  onClick={(e) => handleRowClick(e, tx.id)}
                  className={`h-12 max-h-12 min-h-[48px] flex items-stretch justify-between select-none cursor-pointer border-b transition-colors ${
                    isHighlighted
                      ? 'ring-4 ring-amber-400 ring-inset bg-amber-50/90 z-20 shadow-md border-amber-300'
                      : isSelected
                      ? 'bg-sky-100/80 border-b-sky-200 border-l-4 border-l-sky-600'
                      : 'bg-white hover:bg-slate-50/90 border-slate-200'
                  }`}
                >
                  {/* ESQUERDA: Detalhes do Lançamento (Histórico + Doc, e Coluna Fixa de Horário) */}
                  <div className="flex-1 min-w-0 px-3 flex items-center gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-2 truncate pr-2">
                      <span
                        className="text-xs sm:text-sm font-semibold text-slate-800 truncate"
                        title={tx.historico}
                      >
                        {tx.historico}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                        Doc: {tx.documento || '---'}
                      </span>
                    </div>

                    {/* Coluna Fixa de Horário com largura fixa e alinhamento à direita */}
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

                  {/* DIREITA: Retângulo de Valor Bordô (#67000d) com números grandes, sem R$, e Dia */}
                  <div className="flex items-stretch shrink-0">
                    <div className="w-44 sm:w-52 flex items-center justify-end px-3 sm:px-4 text-white font-extrabold text-2xl sm:text-[25px] tabular-nums tracking-tight select-none border-b border-white bg-[#67000d]">
                      {formatCurrencyPlain(tx.valor)}
                    </div>

                    <div className="w-16 bg-[#ededed] border-l border-white border-b border-white flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-slate-600 px-2 py-0.5 rounded bg-slate-100 border border-slate-200/90 whitespace-nowrap">
                        {tx.dia}
                      </span>
                    </div>
                  </div>
                </div>
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
            title="Limpar seleção de pendentes (Esc)"
          >
            Limpar seleção (Esc)
          </button>
        </div>
      )}

      {transferRequest && (
        <TransferPendentesModal
          mode={transferRequest.mode}
          transactions={transferRequest.transactions}
          onConfirm={handleConfirmTransfer}
          onCancel={() => !isTransferring && setTransferRequest(null)}
          busy={isTransferring}
        />
      )}
    </div>
  );
};

export const PendentesPanel = React.memo(PendentesPanelComponent);
