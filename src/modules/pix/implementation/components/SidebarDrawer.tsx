import React, { useEffect, useState } from 'react';
import {
  X,
  Clock,
  Settings,
  RotateCcw,
  Check,
  Hash,
} from 'lucide-react';
import type { StatementParseResult } from '../services/statementParser';
import type { TimeRangeFilter } from '../hooks/useConference';
import type { ConferenceBehavior } from './ConferenceList';

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  parseResult: StatementParseResult | null;
  selectedDia?: string;
  onSelectDia?: (dia: string) => void;
  selectedHistoricos?: Set<string>;
  onToggleHistorico?: (historico: string) => void;
  onSelectAllHistoricos?: () => void;
  onClearAllHistoricos?: () => void;
  timeRange: TimeRangeFilter;
  setTimeRange: (range: TimeRangeFilter) => void;
  isTimeFilterActive: boolean;
  setIsTimeFilterActive: (active: boolean) => void;
  behavior: ConferenceBehavior;
  onChangeBehavior: (behavior: ConferenceBehavior) => void;
  onClearConferenceMarks?: () => void;
  hasLocalStorageData?: boolean;
  onMigrateLocalStorage?: () => void;
  isActive?: boolean;
}

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  isOpen,
  onClose,
  parseResult,
  timeRange,
  setTimeRange,
  isTimeFilterActive,
  setIsTimeFilterActive,
  behavior,
  onChangeBehavior,
  onClearConferenceMarks,
  hasLocalStorageData,
  onMigrateLocalStorage,
  isActive = true,
}) => {
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    void window.electronAPI?.shell.getState().then((state) => setMinimizeToTray(state.minimizeToTray)).catch(() => {});
  }, [isOpen]);
  const toggleMinimizeToTray = async () => {
    const next = !minimizeToTray;
    const actual = await window.electronAPI?.shell.setMinimizeToTray(next).catch(() => next) ?? next;
    setMinimizeToTray(actual);
  };
  // Listen for Escape key to close the drawer
  useEffect(() => {
    if (!isOpen || !isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isActive, onClose]);

  return (
    <div
      data-pix-settings-open={isOpen ? 'true' : 'false'}
      className={`fixed inset-0 z-50 transition-all duration-200 app-no-drag ${
        isOpen ? 'pointer-events-auto visible' : 'pointer-events-none invisible'
      }`}
    >
      {/* One centered settings dialog combines Pix and app-wide preferences. */}
      <div
        className={`fixed inset-0 bg-slate-950/35 transition-opacity duration-200 ease-out cursor-pointer ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />

      <div
        className={`pix-settings-panel relative w-full bg-white shadow-2xl flex flex-col z-10 border border-slate-200 overflow-hidden transition-opacity duration-150 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pix-settings-title"
      >
        {/* Drawer Header */}
        <div className="pix-settings-heading flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="pix-settings-icon w-10 h-10 rounded-xl flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 id="pix-settings-title" className="text-base font-extrabold tracking-tight">
                Configurações
              </h3>
              <p className="text-xs">Preferências do aplicativo e manutenção</p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="lc-icon-button"
            aria-label="Fechar painel"
            title="Fechar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-slate-800 text-xs">
          <div className="lc-setting-row">
            <div className="lc-setting-icon">
              <Clock size={17} />
            </div>
            <div className="lc-setting-copy">
              <strong className="pix-tray-setting-title">Minimizar para a bandeja</strong>
              <span>Preferência geral compartilhada por todas as janelas</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={minimizeToTray}
              onClick={() => void toggleMinimizeToTray()}
              className={`lc-switch ${minimizeToTray ? 'on' : ''}`}
            >
              <span />
            </button>
          </div>

          {/* SEÇÃO 1: INFORMAÇÕES DO ARQUIVO */}
          {parseResult && (
            <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-[#0f172a] font-bold text-sm">
                <Hash className="w-4 h-4 text-[#1d68a7]" />
                <span>Planilha Ativa</span>
              </div>
              <p className="font-semibold text-slate-800 truncate text-xs" title={parseResult.fileName}>
                {parseResult.fileName}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 pt-1">
                <div>
                  <span className="block text-slate-400">Total Linhas:</span>
                  <span className="font-bold text-slate-700">{parseResult.totalRawRows}</span>
                </div>
                <div>
                  <span className="block text-slate-400">PIX Válidos:</span>
                  <span className="font-bold text-slate-700">{parseResult.totalValidTransactions}</span>
                </div>
              </div>

              {onClearConferenceMarks && (
                <div className="pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={onClearConferenceMarks}
                    className="w-full lc-btn lc-btn-danger"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Limpar todas as marcações</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SEÇÃO 2: FILTRO OPCIONAL POR HORÁRIO */}
          {parseResult && (
            <div className="space-y-3 p-4 bg-white rounded-xl border border-slate-200">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-900 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isTimeFilterActive}
                  onChange={(e) => setIsTimeFilterActive(e.target.checked)}
                  className="w-4 h-4 text-[#12385f] rounded border-slate-300 focus:ring-[#12385f] cursor-pointer"
                />
                <Clock className="w-4 h-4 text-[#1d68a7]" />
                <span>Filtrar por horário de lançamento</span>
              </label>

              {isTimeFilterActive && (
                <div className="pt-2 border-t border-slate-200 flex items-center gap-2.5 text-xs">
                  <div className="flex-1">
                    <span className="block text-xs text-slate-500 font-medium mb-1">De:</span>
                    <input
                      type="time"
                      value={timeRange.start}
                      onChange={(e) => setTimeRange({ ...timeRange, start: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="block text-xs text-slate-500 font-medium mb-1">Até:</span>
                    <input
                      type="time"
                      value={timeRange.end}
                      onChange={(e) => setTimeRange({ ...timeRange, end: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SEÇÃO 3: CONFIGURAÇÕES DO APLICATIVO */}
          <div className="space-y-3 p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#1d68a7]" />
              <span>Comportamento após conferir um PIX</span>
            </h4>

            <div className="space-y-2">
              {/* Opção A: Mover para Conferidos */}
              <div
                onClick={() => onChangeBehavior('move_to_conferidos')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  behavior === 'move_to_conferidos'
                    ? 'border-[#12385f] bg-[#e8f1fa]'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Opção A — Mover para Conferidos
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      behavior === 'move_to_conferidos'
                        ? 'border-[#12385f] bg-[#12385f] text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {behavior === 'move_to_conferidos' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Ao marcar um PIX, ele sai imediatamente da visualização de pendentes e vai para conferidos.
                </p>
              </div>

              {/* Opção B: Manter na lista principal */}
              <div
                onClick={() => onChangeBehavior('keep_in_list')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  behavior === 'keep_in_list'
                    ? 'border-[#12385f] bg-[#e8f1fa]'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Opção B — Manter na lista principal
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      behavior === 'keep_in_list'
                        ? 'border-[#12385f] bg-[#12385f] text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {behavior === 'keep_in_list' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  O PIX marcado continua visível na lista principal com a indicação visual de conferido.
                </p>
              </div>
            </div>

            {hasLocalStorageData && onMigrateLocalStorage && (
              <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                <span className="text-xs font-bold text-amber-900 block">
                  Marcações legadas detectadas
                </span>
                <p className="text-xs text-amber-800">
                  Existem marcações anteriores salvas neste computador. Deseja importá-las para o Pix?
                </p>
                <button
                  type="button"
                  onClick={onMigrateLocalStorage}
                  className="w-full py-1.5 px-3 bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Importar marcações
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
