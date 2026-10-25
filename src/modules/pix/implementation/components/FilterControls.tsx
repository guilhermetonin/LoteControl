import React, { useState } from 'react';
import { Calendar, Filter, Clock, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react';
import type { TimeRangeFilter } from '../hooks/useConference';

interface FilterControlsProps {
  availableDias: string[];
  selectedDia: string;
  onSelectDia: (dia: string) => void;
  availableHistoricos: string[];
  selectedHistoricos: Set<string>;
  onToggleHistorico: (historico: string) => void;
  onSelectAllHistoricos: () => void;
  onClearAllHistoricos: () => void;
  timeRange: TimeRangeFilter;
  setTimeRange: (range: TimeRangeFilter) => void;
  isTimeFilterActive: boolean;
  setIsTimeFilterActive: (active: boolean) => void;
  totalFilteredPix: number;
}

export const FilterControls: React.FC<FilterControlsProps> = ({
  availableDias,
  selectedDia,
  onSelectDia,
  availableHistoricos,
  selectedHistoricos,
  onToggleHistorico,
  onSelectAllHistoricos,
  onClearAllHistoricos,
  timeRange,
  setTimeRange,
  isTimeFilterActive,
  setIsTimeFilterActive,
  totalFilteredPix,
}) => {
  const [isHistoricosOpen, setIsHistoricosOpen] = useState(false);
  const [isTimeOpen, setIsTimeOpen] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs mb-6 space-y-4">
      {/* 1. Dia Selector */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-rose-700" />
            Filtrar por Dia:
          </label>
          <span className="text-xs font-semibold text-slate-500">
            {totalFilteredPix} lançamentos exibidos
          </span>
        </div>

        {/* Horizontal scrollable pills for days */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
          <button
            type="button"
            onClick={() => onSelectDia('TODOS')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedDia === 'TODOS'
                ? 'bg-rose-900 text-white shadow-sm ring-2 ring-rose-900/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-rose-900 text-white shadow-sm ring-2 ring-rose-900/20'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {dia}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Historicos Filter (Collapsible/Interactive) */}
      <div className="border-t border-slate-100 pt-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-rose-700" />
              Históricos PIX Selecionados ({selectedHistoricos.size}/{availableHistoricos.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSelectAllHistoricos}
              className="text-xs font-semibold text-rose-800 hover:text-rose-950 underline cursor-pointer"
            >
              Selecionar todos
            </button>
            <span className="text-slate-300">•</span>
            <button
              type="button"
              onClick={onClearAllHistoricos}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
            >
              Limpar seleção
            </button>
            <button
              type="button"
              onClick={() => setIsHistoricosOpen(!isHistoricosOpen)}
              className="sm:hidden p-1 text-slate-500 hover:text-slate-700"
            >
              {isHistoricosOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Checkbox pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {availableHistoricos.map((hist) => {
            const isChecked = selectedHistoricos.has(hist);
            const isHabitual =
              hist === 'CRED PIX CHAVE' || hist === 'PIX RECEBIDO DADOS CONTA';

            return (
              <label
                key={hist}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-all select-none ${
                  isChecked
                    ? 'bg-rose-50 text-rose-950 border-rose-300 font-bold shadow-2xs'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleHistorico(hist)}
                  className="hidden"
                />
                {isChecked ? (
                  <CheckSquare className="w-4 h-4 text-rose-800 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-300 shrink-0" />
                )}
                <span>{hist}</span>
                {isHabitual && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
                    Padrão
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* 3. Optional Horário Filter */}
      <div className="border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isTimeFilterActive}
              onChange={(e) => {
                setIsTimeFilterActive(e.target.checked);
                if (e.target.checked) setIsTimeOpen(true);
              }}
              className="w-4 h-4 text-rose-800 rounded border-slate-300 focus:ring-rose-800 cursor-pointer"
            />
            <Clock className="w-4 h-4 text-rose-700" />
            <span>Filtrar por horário (opcional)</span>
          </label>

          {isTimeFilterActive && (
            <button
              type="button"
              onClick={() => setIsTimeOpen(!isTimeOpen)}
              className="text-xs text-slate-500 flex items-center gap-1 cursor-pointer"
            >
              {isTimeOpen ? 'Ocultar' : 'Configurar'}
              {isTimeOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {isTimeFilterActive && isTimeOpen && (
          <div className="mt-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600">Das:</span>
              <input
                type="time"
                value={timeRange.start}
                onChange={(e) => setTimeRange({ ...timeRange, start: e.target.value })}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600">Até:</span>
              <input
                type="time"
                value={timeRange.end}
                onChange={(e) => setTimeRange({ ...timeRange, end: e.target.value })}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            {(timeRange.start || timeRange.end) && (
              <button
                type="button"
                onClick={() => setTimeRange({ start: '', end: '' })}
                className="text-xs text-rose-700 hover:text-rose-900 font-semibold underline cursor-pointer"
              >
                Limpar horários
              </button>
            )}
            <span className="text-[11px] text-slate-400">
              * Lançamentos sem horário válido continuam visíveis.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
