import React, { useState } from 'react';
import { Copy, Check, AlertCircle, CheckCheck, Undo2 } from 'lucide-react';
import type { PixTransaction } from '../services/statementParser';
import { copyTransactionsToClipboard, type CopyResult } from '../services/clipboard';

interface ClipboardBarProps {
  pendentes: PixTransaction[];
  conferidos: PixTransaction[];
  onCheckAllFiltered: () => void;
  onUncheckAllFiltered: () => void;
}

export const ClipboardBar: React.FC<ClipboardBarProps> = ({
  pendentes,
  conferidos,
  onCheckAllFiltered,
  onUncheckAllFiltered,
}) => {
  const [toast, setToast] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [copiedType, setCopiedType] = useState<'pendentes' | 'conferidos' | null>(null);

  const showToast = (result: CopyResult, type: 'pendentes' | 'conferidos') => {
    if (result.success) {
      setCopiedType(type);
      setToast({
        type: 'success',
        message: result.message,
      });
      setTimeout(() => {
        setCopiedType(null);
      }, 2500);
    } else {
      setToast({
        type: 'warning',
        message: result.message,
      });
    }

    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const handleCopyPendentes = async () => {
    const result = await copyTransactionsToClipboard(pendentes, 'pendentes');
    showToast(result, 'pendentes');
  };

  const handleCopyConferidos = async () => {
    const result = await copyTransactionsToClipboard(conferidos, 'conferidos');
    showToast(result, 'conferidos');
  };

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-lg mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      {/* Buttons to Copy */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopyPendentes}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-md transition-all active:scale-98 cursor-pointer"
          title="Copiar valores pendentes (formato: 1 por linha, com vírgula)"
        >
          {copiedType === 'pendentes' ? (
            <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
          ) : (
            <Copy className="w-4 h-4 text-slate-950" />
          )}
          Copiar Pendentes ({pendentes.length})
        </button>

        <button
          type="button"
          onClick={handleCopyConferidos}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-sm border border-slate-700 transition-all active:scale-98 cursor-pointer"
          title="Copiar valores já conferidos (formato: 1 por linha, com vírgula)"
        >
          {copiedType === 'conferidos' ? (
            <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
          ) : (
            <Copy className="w-4 h-4 text-slate-400" />
          )}
          Copiar Conferidos ({conferidos.length})
        </button>

        <div className="h-6 w-px bg-slate-800 hidden sm:block mx-1" />

        {/* Quick Batch check buttons */}
        <button
          type="button"
          onClick={onCheckAllFiltered}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Marcar todos os lançamentos atualmente filtrados como conferidos"
        >
          <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
          Marcar todos
        </button>

        <button
          type="button"
          onClick={onUncheckAllFiltered}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Desmarcar todos os lançamentos atualmente filtrados"
        >
          <Undo2 className="w-3.5 h-3.5 text-amber-400" />
          Desmarcar todos
        </button>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold animate-in fade-in slide-in-from-top-1 duration-150 ${
            toast.type === 'success'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
          }`}
        >
          {toast.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};
