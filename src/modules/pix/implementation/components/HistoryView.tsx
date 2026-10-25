import React from 'react';
import {
  Clock,
  CheckCircle2,
  Calendar,
  FileSpreadsheet,
  Trash2,
  ExternalLink,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { ConferenceRecord } from '../services/sqliteDatabase';

interface HistoryViewProps {
  conferences: ConferenceRecord[];
  activeConferenceId: string | null;
  onOpenConference: (id: string) => void;
  onDeleteConference: (id: string, fileName: string) => void;
  onDeleteAllConferences: () => void;
  onBackToActive: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  conferences,
  activeConferenceId,
  onOpenConference,
  onDeleteConference,
  onDeleteAllConferences,
  onBackToActive,
}) => {
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
    <div className="max-w-6xl mx-auto px-4 py-6 bg-white">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-200 gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#12385f] tracking-tight flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-[#12385f]" />
            Histórico de Importações
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Reabra uma planilha importada anteriormente para continuar a conferência.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {conferences.length > 0 && (
            <button
              type="button"
              onClick={onDeleteAllConferences}
              className="lc-btn lc-btn-danger"
            >
              <Trash2 size={15} />
              <span>Limpar Histórico</span>
            </button>
          )}

          {activeConferenceId && (
            <button
              type="button"
              onClick={onBackToActive}
              className="lc-btn lc-btn-primary"
            >
              <span>Voltar à Conferência Ativa</span>
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Conference Cards List */}
      {conferences.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#e8f1fa] border border-[#c7d9ec] flex items-center justify-center text-[#12385f] mx-auto mb-3">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Nenhuma planilha no histórico</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Quando você importar uma planilha bancária, ela será registrada automaticamente no histórico local.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {conferences.map((conf) => {
            const isActive = conf.id === activeConferenceId;

            return (
              <div
                key={conf.id}
                className={`pix-history-card bg-white rounded-xl border transition-all ${
                  isActive
                    ? 'border-blue-400 ring-2 ring-blue-800/10'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* File info */}
                <div className="pix-history-card-meta">
                  <div className="w-11 h-11 rounded-xl bg-[#e8f1fa] border border-[#c7d9ec] text-[#12385f] flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 truncate" title={conf.fileName}>
                        {conf.fileName}
                      </h4>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f1fa] text-[#12385f] border border-[#c7d9ec]">
                          Sessão Ativa
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(conf.importedAt)}
                      </span>
                      <span>•</span>
                      <span className="text-slate-600 font-semibold">
                        Aba: {conf.sheetName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pix-history-actions">
                  <button
                    type="button"
                    onClick={() => onOpenConference(conf.id)}
                    className="pix-history-open cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>{isActive ? 'Continuar' : 'Abrir importação'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteConference(conf.id, conf.fileName)}
                    className="pix-history-delete"
                    title="Excluir esta planilha do histórico"
                    aria-label={`Excluir ${conf.fileName} do histórico`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Metrics Badges & Progress */}
                <div className="pix-history-metrics grid grid-cols-4 items-center gap-3 sm:gap-5 shrink-0">
                  <div className="text-center">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                      Total PIX
                    </div>
                    <div className="text-lg font-black text-[#12385f] mt-0.5">
                      {conf.totalPix}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Conferidos
                    </div>
                    <div className="text-lg font-black text-emerald-700 mt-0.5">
                      {conf.conferidosCount}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Pendentes
                    </div>
                    <div className="text-lg font-black text-amber-700 mt-0.5">
                      {conf.pendentesCount}
                    </div>
                  </div>

                  <div className="w-24 sm:w-28 text-center">
                    <div className="text-[11px] font-bold text-slate-600 mb-1">
                      {conf.percentCompleted}%
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all"
                        style={{ width: `${conf.percentCompleted}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
