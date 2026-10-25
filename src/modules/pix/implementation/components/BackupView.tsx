import React, { useState, useRef, type ChangeEvent } from 'react';
import { Download, Upload, ShieldCheck, Loader2 } from 'lucide-react';
import { dbClient } from '../services/dbClient';
import { ToastNotification } from '../../../../app/components/SharedMenus';

interface BackupViewProps {
  onBackupRestored: () => void;
}

export const BackupView: React.FC<BackupViewProps> = ({ onBackupRestored }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setFeedback(null);
    try {
      const backupData = await dbClient.exportBackup();
      const jsonContent = JSON.stringify(backupData, null, 2);

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const filename = `Conferencia-PIX-Backup-${dateStr}.json`;

      const success = await dbClient.promptSaveBackup(jsonContent, filename);
      if (success) {
        setFeedback({
          type: 'success',
          message: `Backup exportado com sucesso! (${backupData.conferences.length} conferência(s) incluída(s)).`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Falha ao exportar backup: ${err?.message || err}`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const processBackupJson = async (jsonString: string) => {
    setIsRestoring(true);
    setFeedback(null);
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(jsonString);
      } catch {
        throw new Error('O arquivo selecionado não é um arquivo JSON válido.');
      }

      if (!parsed || typeof parsed !== 'object' || !parsed.version || !Array.isArray(parsed.conferences)) {
        throw new Error(
          'Arquivo de backup incompatível: o arquivo não contém a estrutura ou versão necessária de conferências.'
        );
      }

      const res = await dbClient.restoreBackup(parsed);
      setFeedback({
        type: 'success',
        message: `Restauração concluída com sucesso! ${res.conferencesRestored} conferência(s) e ${res.settingsRestored} configuração(ões) restauradas.`,
      });
      onBackupRestored();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Erro ao restaurar backup: ${err?.message || err}`,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreClick = async () => {
    if (dbClient.isElectron()) {
      const content = await dbClient.promptOpenBackup();
      if (content) {
        await processBackupJson(content);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const text = await file.text();
      await processBackupJson(text);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 bg-white">
      <ToastNotification
        toast={
          feedback
            ? {
                tone: feedback.type === 'success' ? 'success' : 'danger',
                text: feedback.message,
                onClose: () => setFeedback(null),
              }
            : null
        }
        onDismiss={() => setFeedback(null)}
      />

      {/* Title */}
      <div className="pb-4 border-b border-slate-200">
        <h2 className="text-xl font-extrabold text-[#12385f] tracking-tight flex items-center gap-2.5">
          <ShieldCheck className="w-6 h-6 text-[#12385f]" />
          Backup e Restauração de Conferências
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Exporte suas conferências e marcações em arquivo seguro para transferência entre computadores ou para recuperação local.
        </p>
      </div>

      {/* Grid of Export and Restore */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="w-11 h-11 rounded-xl bg-[#e8f1fa] border border-[#c7d9ec] text-[#12385f] flex items-center justify-center mb-4">
              <Download className="w-5 h-5" />
            </div>

            <h3 className="text-base font-bold text-slate-900">
              Exportar Backup Completo
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Gera um arquivo <code className="text-[#12385f] font-bold">.json</code> versionado contendo todos os extratos importados, os lançamentos, as marcações conferidas e as configurações atuais.
            </p>

            <ul className="mt-4 text-xs text-slate-600 space-y-1 list-disc list-inside">
              <li>Formato padronizado e seguro</li>
              <li>Pronto para transferir para outro PC</li>
              <li>100% offline, local e íntegro</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="mt-6 w-full lc-btn lc-btn-primary"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{isExporting ? 'Exportando...' : 'Exportar Arquivo de Backup'}</span>
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="w-11 h-11 rounded-xl bg-[#e8f1fa] border border-[#c7d9ec] text-[#12385f] flex items-center justify-center mb-4">
              <Upload className="w-5 h-5" />
            </div>

            <h3 className="text-base font-bold text-slate-900">
              Restaurar de um Backup
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Selecione um arquivo de backup <code className="text-[#12385f] font-bold">.json</code> exportado anteriormente. Os dados serão validados antes de qualquer gravação no banco de dados.
            </p>

            <ul className="mt-4 text-xs text-slate-600 space-y-1 list-disc list-inside">
              <li>Validação rigorosa de integridade</li>
              <li>Tratamento automático de conflitos</li>
              <li>Não corrompe o banco em caso de erro</li>
            </ul>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          <button
            type="button"
            onClick={handleRestoreClick}
            disabled={isRestoring}
            className="mt-6 w-full lc-btn lc-btn-primary"
          >
            {isRestoring ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>{isRestoring ? 'Restaurando...' : 'Selecionar Arquivo de Backup'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
