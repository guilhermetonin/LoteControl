import React from 'react';
import { CheckCircle2, Clock, Layers } from 'lucide-react';
import type { ConferenceStats } from '../hooks/useConference';
import { formatCurrencyBr } from '../utils/rules';

interface StatsBarProps {
  stats: ConferenceStats;
  selectedDia: string;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats, selectedDia }) => {
  const diaLabel = selectedDia === 'TODOS' ? 'Todos os dias' : selectedDia;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 mb-4 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Resumo do Filtro Atual:
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#e8f1fa] text-[#12385f] border border-[#c7d9ec]">
            {diaLabel}
          </span>
        </div>

        {/* Progress percent */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-600">Progresso:</span>
          <div className="w-32 sm:w-44 h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div
              className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
              style={{ width: `${stats.percentCompleted}%` }}
            />
          </div>
          <span className="text-xs font-bold text-emerald-700 w-10 text-right">
            {stats.percentCompleted}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total no Filtro */}
        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-200/80 text-slate-700 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Total no Filtro
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-extrabold text-slate-900">
                {stats.totalCount}
              </span>
              <span className="text-xs font-semibold text-slate-600">
                ({formatCurrencyBr(stats.totalValor)})
              </span>
            </div>
          </div>
        </div>

        {/* Conferidos */}
        <div className="bg-emerald-50/70 rounded-xl p-3.5 border border-emerald-200/80 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">
              Conferidos
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-extrabold text-emerald-950">
                {stats.conferidosCount}
              </span>
              <span className="text-xs font-semibold text-emerald-800">
                ({formatCurrencyBr(stats.conferidosValor)})
              </span>
            </div>
          </div>
        </div>

        {/* Pendentes */}
        <div className="bg-amber-50/70 rounded-xl p-3.5 border border-amber-200/80 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-800" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wide">
              Pendentes
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-extrabold text-amber-950">
                {stats.pendentesCount}
              </span>
              <span className="text-xs font-semibold text-amber-800">
                ({formatCurrencyBr(stats.pendentesValor)})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
