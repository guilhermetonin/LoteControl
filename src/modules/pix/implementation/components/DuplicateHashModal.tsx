import React from 'react';
import { History, PlusCircle, AlertCircle, Calendar } from 'lucide-react';
import type { ConferenceRecord } from '../services/sqliteDatabase';

interface DuplicateHashModalProps {
  isOpen: boolean;
  existingConference: ConferenceRecord | null;
  newFileName: string;
  onOpenExisting: () => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

export const DuplicateHashModal: React.FC<DuplicateHashModalProps> = ({
  isOpen,
  existingConference,
  newFileName,
  onOpenExisting,
  onCreateNew,
  onCancel,
}) => {
  if (!isOpen || !existingConference) return null;

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-extrabold text-slate-900 leading-6">
                Extrato com Conteúdo Idêntico Encontrado
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                O arquivo <strong className="text-slate-900">{newFileName}</strong> possui o mesmo conteúdo exato (hash) de uma conferência já registrada no seu banco de dados.
              </p>

              {/* Existing info card */}
              <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Importado em: {formatDate(existingConference.importedAt)}
                </div>
                <div>
                  Arquivo original: <strong>{existingConference.fileName}</strong>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                  <span>Total: <strong>{existingConference.totalPix} PIX</strong></span>
                  <span>•</span>
                  <span className="text-emerald-700 font-bold">
                    {existingConference.conferidosCount} conferidos ({existingConference.percentCompleted}%)
                  </span>
                  <span>•</span>
                  <span className="text-amber-700 font-bold">
                    {existingConference.pendentesCount} pendentes
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs font-semibold text-slate-700">
                Como deseja proceder?
              </p>
            </div>
          </div>
        </div>

        {/* Options buttons */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onCreateNew}
            className="px-4 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            title="Cria uma nova conferência do zero, sem herdar as marcações anteriores"
          >
            <PlusCircle className="w-3.5 h-3.5 text-slate-600" />
            Iniciar Nova Conferência (Limpa)
          </button>

          <button
            type="button"
            onClick={onOpenExisting}
            className="px-4 py-2 text-xs font-bold text-white bg-[#12385f] hover:bg-[#0d2c4c] rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            title="Abre a conferência existente mantendo todas as marcações já feitas"
          >
            <History className="w-3.5 h-3.5" />
            Continuar Existente
          </button>
        </div>
      </div>
    </div>
  );
};
