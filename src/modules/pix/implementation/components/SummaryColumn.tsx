import React, { useState } from 'react';
import { Copy, Clock, CheckCircle2, Check } from 'lucide-react';
import type { PixTransaction } from '../services/statementParser';
import { copyTransactionsToClipboard } from '../services/clipboard';
import { formatCurrencyBr } from '../utils/rules';

interface SummaryColumnProps {
  pendentes: PixTransaction[];
  conferidos: PixTransaction[];
  onToggleCheck: (id: string) => void;
}

export const SummaryColumn: React.FC<SummaryColumnProps> = ({
  pendentes,
  conferidos,
  onToggleCheck,
}) => {
  const [activeTab, setActiveTab] = useState<'pendentes' | 'conferidos'>('pendentes');
  const [copiedType, setCopiedType] = useState<'pendentes' | 'conferidos' | null>(null);

  const handleCopy = async (type: 'pendentes' | 'conferidos') => {
    const list = type === 'pendentes' ? pendentes : conferidos;
    const res = await copyTransactionsToClipboard(list, type);
    if (res.success) {
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } else {
      alert(res.message);
    }
  };

  const activeList = activeTab === 'pendentes' ? pendentes : conferidos;
  const isPendenteTab = activeTab === 'pendentes';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">
      {/* Header with Tabs */}
      <div className="p-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-1.5 p-1 bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('pendentes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              isPendenteTab
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Pendentes ({pendentes.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('conferidos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              !isPendenteTab
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Conferidos ({conferidos.length})
          </button>
        </div>

        {/* Quick copy for active tab */}
        <button
          type="button"
          onClick={() => handleCopy(activeTab)}
          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
          title={`Copiar valores ${activeTab} para planilha`}
        >
          {copiedType === activeTab ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-400" />
          )}
          Copiar {isPendenteTab ? 'Pendentes' : 'Conferidos'}
        </button>
      </div>

      {/* List Items */}
      <div className="p-3 overflow-y-auto max-h-[750px] divide-y divide-slate-100 space-y-2">
        {activeList.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            {isPendenteTab
              ? 'Nenhum lançamento pendente no filtro atual! Todos os PIX foram conferidos.'
              : 'Nenhum lançamento conferido ainda. Marque os PIX na lista principal.'}
          </div>
        ) : (
          activeList.map((tx) => (
            <div
              key={tx.id}
              onClick={() => onToggleCheck(tx.id)}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                isPendenteTab
                  ? 'bg-white hover:bg-slate-50 border-slate-200/90'
                  : 'bg-emerald-50/50 hover:bg-emerald-50 border-emerald-200/70'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-base font-black font-mono px-2.5 py-1 rounded-lg ${
                    isPendenteTab
                      ? 'bg-rose-900 text-white'
                      : 'bg-emerald-700 text-white'
                  }`}
                >
                  {formatCurrencyBr(tx.valor)}
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800 truncate max-w-[150px]">
                    {tx.historico}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Doc: {tx.documento} {tx.horario ? `• ${tx.horario}` : ''}
                  </span>
                </div>
              </div>

              <span className="text-[11px] font-semibold text-slate-400">
                {tx.dia}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
        <span>{activeList.length} registros</span>
        <span>
          Total:{' '}
          <strong>
            {formatCurrencyBr(
              activeList.reduce((acc, t) => acc + t.valorCentavos, 0) / 100
            )}
          </strong>
        </span>
      </div>
    </div>
  );
};
