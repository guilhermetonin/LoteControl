import React from 'react';
import { Settings, ArrowRightLeft, Check } from 'lucide-react';
import type { ConferenceBehavior } from './ConferenceList';

interface SettingsViewProps {
  behavior: ConferenceBehavior;
  onChangeBehavior: (behavior: ConferenceBehavior) => void;
  onMigrateLocalStorage?: () => void;
  migrationAvailable?: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  behavior,
  onChangeBehavior,
  onMigrateLocalStorage,
  migrationAvailable,
}) => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Title */}
      <div className="pb-4 border-b border-slate-200">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
          <Settings className="w-7 h-7 text-rose-800" />
          Configurações do Aplicativo
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Personalize as preferências de exibição e conferência.
        </p>
      </div>

      {/* Main Setting: Comportamento após conferir um PIX */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-rose-800" />
          Comportamento após conferir um PIX
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Defina como os lançamentos se comportam na interface imediatamente após você marcar a caixa de seleção.
        </p>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Opção A: Mover para Conferidos */}
          <div
            onClick={() => onChangeBehavior('move_to_conferidos')}
            className={`rounded-2xl p-5 border-2 cursor-pointer transition-all ${
              behavior === 'move_to_conferidos'
                ? 'border-rose-800 bg-rose-50/40 shadow-sm ring-2 ring-rose-800/10'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-slate-900">
                Opção A — Mover para Conferidos
              </span>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  behavior === 'move_to_conferidos'
                    ? 'border-rose-800 bg-rose-800 text-white'
                    : 'border-slate-300 bg-white'
                }`}
              >
                {behavior === 'move_to_conferidos' && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
              Recomendado (Padrão)
            </span>

            <p className="mt-3 text-xs text-slate-600 leading-relaxed">
              Ao marcar um PIX na lista de pendentes, ele <strong>sai imediatamente da lista de pendentes</strong> e entra na lista de conferidos. Ao desmarcá-lo em conferidos, ele retorna para os pendentes.
            </p>

            <div className="mt-4 p-3 bg-white/80 rounded-xl border border-slate-200 text-[11px] text-slate-500">
              ✓ Ideal para conferência contínua com registros em papel, mantendo na tela apenas o que ainda falta conferir.
            </div>
          </div>

          {/* Opção B: Manter na lista principal */}
          <div
            onClick={() => onChangeBehavior('keep_in_list')}
            className={`rounded-2xl p-5 border-2 cursor-pointer transition-all ${
              behavior === 'keep_in_list'
                ? 'border-rose-800 bg-rose-50/40 shadow-sm ring-2 ring-rose-800/10'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-slate-900">
                Opção B — Manter na lista principal
              </span>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  behavior === 'keep_in_list'
                    ? 'border-rose-800 bg-rose-800 text-white'
                    : 'border-slate-300 bg-white'
                }`}
              >
                {behavior === 'keep_in_list' && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              Visualização Completa
            </span>

            <p className="mt-3 text-xs text-slate-600 leading-relaxed">
              Ao marcar um PIX, a checkbox permanece marcada e o lançamento <strong>continua visível na lista principal</strong> com a indicação visual de conferido.
            </p>

            <div className="mt-4 p-3 bg-white/80 rounded-xl border border-slate-200 text-[11px] text-slate-500">
              ✓ Permite visualizar todos os lançamentos ordenados na mesma página, sem esconder os itens já conferidos.
            </div>
          </div>
        </div>
      </div>

      {/* Keep legacy import action but omit storage-engine details from the user-facing settings. */}
      {migrationAvailable && onMigrateLocalStorage && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 flex items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-bold text-amber-900">Marcações anteriores detectadas</h4>
            <p className="text-[11px] text-amber-700 mt-0.5">Importe com segurança as marcações salvas anteriormente neste computador.</p>
          </div>
          <button type="button" onClick={onMigrateLocalStorage} className="px-4 py-2 text-xs font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 rounded-xl transition-colors shrink-0 cursor-pointer">
            Importar marcações
          </button>
        </div>
      )}
    </div>
  );
};
