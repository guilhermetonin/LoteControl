import React, { useState } from 'react';
import {
  ChevronDown,
  Calendar,
  Filter,
  CheckSquare,
  Square,
} from 'lucide-react';
import type { ConferenceStats } from '../hooks/useConference';

export interface CompactFilterSummaryProps {
  stats: ConferenceStats;
  selectedDia: string;
  onSelectDia: (dia: string) => void;
  availableDias: string[];
  selectedHistoricos: Set<string>;
  onToggleHistorico: (historico: string) => void;
  onSelectAllHistoricos: () => void;
  onClearAllHistoricos: () => void;
  availableHistoricos: string[];
  initialSelectedHistoricos?: string[];
}

export const CompactFilterSummary: React.FC<CompactFilterSummaryProps> = ({
  stats,
  selectedDia,
  onSelectDia,
  availableDias,
  selectedHistoricos,
  onToggleHistorico,
  onSelectAllHistoricos,
  onClearAllHistoricos,
  availableHistoricos,
  initialSelectedHistoricos = [],
}) => {
  // Starts collapsed by default
  const [isExpanded, setIsExpanded] = useState(false);

  const diaLabel = selectedDia === 'TODOS' ? 'Todos os dias' : selectedDia;
  const isFiltered =
    selectedDia !== 'TODOS' ||
    (availableHistoricos.length > 0 && selectedHistoricos.size !== availableHistoricos.length);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:px-4 sm:py-2.5 shadow-2xs transition-all">
      {/* ALWAYS-VISIBLE TOP BAR: Indicators, Progress & Expand/Collapse Toggle Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Indicators: Dia, Total, Conferidos, Pendentes, % */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="font-bold text-[#12385f] bg-[#e8f1fa] hover:bg-[#d8e8f8] px-2.5 py-0.5 rounded-md border border-[#c7d9ec] cursor-pointer transition-colors"
            title="Clique para alternar o dia ou expandir filtros"
          >
            {diaLabel}
          </button>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-slate-800">
            {stats.totalCount} {stats.totalCount === 1 ? 'lançamento' : 'lançamentos'}
          </span>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-emerald-700">
            {stats.conferidosCount} conferidos
          </span>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-amber-700">
            {stats.pendentesCount} pendentes
          </span>
          <span className="text-slate-300">·</span>
          <span className="font-bold text-slate-700">
            {stats.percentCompleted}%
          </span>

          {isFiltered && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f1fa] text-[#12385f] border border-[#c7d9ec]">
              Filtro ativo
            </span>
          )}
        </div>

        {/* Right side: Mini progress bar + Expand/Collapse Chevron Button */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-20 sm:w-28 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                style={{ width: `${stats.percentCompleted}%` }}
              />
            </div>
            <span className="text-[11px] font-bold text-emerald-800 w-7 text-right">
              {stats.percentCompleted}%
            </span>
          </div>

          {/* Chevron expand/collapse button with smooth 180° rotation */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
              isExpanded
                ? 'bg-[#e8f1fa] text-[#12385f] border-[#c7d9ec] shadow-2xs font-bold'
                : 'bg-slate-50 text-slate-700 hover:text-slate-900 hover:bg-slate-100 border-slate-200'
            }`}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Recolher filtros' : 'Expandir filtros'}
            title={isExpanded ? 'Recolher painel de filtros' : 'Expandir filtros de dia e histórico'}
          >
            <span>{isExpanded ? 'Ocultar filtros' : 'Filtros'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isExpanded ? 'rotate-180 text-[#12385f]' : 'text-slate-500'
              }`}
            />
          </button>
        </div>
      </div>

      {/* EXPANDABLE FILTER PANEL (Inline, smoothly animated, integrated into the layout) */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-200/90 space-y-3.5 animate-in fade-in duration-150">
          {/* 1. FILTRO POR DIA COM BADGES CLICÁVEIS */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Calendar className="w-3.5 h-3.5 text-[#12385f]" />
                <span>Filtrar por Dia</span>
                {selectedDia !== 'TODOS' && (
                  <span className="text-[11px] font-semibold normal-case text-slate-600">
                    — Exibindo apenas {selectedDia}
                  </span>
                )}
              </div>
              {selectedDia !== 'TODOS' && (
                <button
                  type="button"
                  onClick={() => onSelectDia('TODOS')}
                  className="text-[11px] text-[#1d68a7] hover:text-[#12385f] font-bold hover:underline cursor-pointer"
                >
                  Limpar filtro de dia
                </button>
              )}
            </div>

            {/* Badges horizontais com quebra automática de linha (flex-wrap) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => onSelectDia('TODOS')}
                className={`px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
                  selectedDia === 'TODOS'
                    ? 'bg-rose-900 !bg-[#12385f] !text-white shadow-2xs border border-[#12385f] font-bold'
                    : 'bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300 border border-slate-200/90 font-medium'
                }`}
              >
                Todos os dias
              </button>

              {availableDias.map((dia) => {
                const isSelected = selectedDia === dia;
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => onSelectDia(dia)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-rose-900 !bg-[#12385f] text-white shadow-2xs border border-[#12385f] font-bold'
                        : 'bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300 border border-slate-200/90 font-medium'
                    }`}
                  >
                    {dia}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. FILTRO POR HISTÓRICO DE PIX */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Filter className="w-3.5 h-3.5 text-[#12385f]" />
                <span>Históricos de PIX</span>
                <span className="text-[11px] font-normal normal-case text-slate-400">
                  ({selectedHistoricos.size} de {availableHistoricos.length} selecionados)
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={onSelectAllHistoricos}
                  className="text-[11px] text-[#1d68a7] hover:text-[#12385f] font-bold hover:underline cursor-pointer"
                >
                  Marcar todos
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={onClearAllHistoricos}
                  className="text-[11px] text-slate-500 hover:text-slate-800 font-medium hover:underline cursor-pointer"
                >
                  Desmarcar todos
                </button>
              </div>
            </div>

            {/* Badges / Checkboxes de Históricos */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {availableHistoricos.map((hist) => {
                const isChecked = selectedHistoricos.has(hist);
                const isHabitual = initialSelectedHistoricos.includes(hist);

                return (
                  <button
                    key={hist}
                    type="button"
                    onClick={() => onToggleHistorico(hist)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer border ${
                      isChecked
                        ? 'bg-[#e8f1fa] text-[#12385f] border-[#c7d9ec] shadow-2xs font-bold'
                        : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-3.5 h-3.5 text-[#12385f] shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    )}
                    <span className="truncate max-w-[240px]" title={hist}>
                      {hist}
                    </span>
                    {isHabitual && (
                      <span className="px-1 py-0.2 rounded text-[9px] bg-amber-100 text-amber-900 border border-amber-300 font-bold shrink-0">
                        Padrão
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
