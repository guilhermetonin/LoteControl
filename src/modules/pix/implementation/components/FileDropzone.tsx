import React, { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { ToastNotification } from '../../../../app/components/SharedMenus';

interface FileDropzoneProps {
  onFileLoaded: (buffer: ArrayBuffer, fileName: string) => Promise<void>;
  isLoading: boolean;
  errors: string[];
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  onFileLoaded,
  isLoading,
  errors,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dismissedErrorKey, setDismissedErrorKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const errorKey = errors.join(' | ');
  const showErrorToast = errors.length > 0 && dismissedErrorKey !== errorKey;

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processSelectedFile(file);
    }
  };

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await processSelectedFile(file);
    }
  };

  const processSelectedFile = async (file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const lowerName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!isValid) {
      alert('Formato de arquivo não suportado. Por favor, selecione um arquivo .xlsx, .xls ou .csv.');
      return;
    }

    const buffer = await file.arrayBuffer();
    await onFileLoaded(buffer, file.name);
  };

  const handleSelectFile = async () => {
    if (isLoading) return;
    if (window.electronAPI?.dialog?.openStatementFile) {
      try {
        const result = await window.electronAPI.dialog.openStatementFile();
        if (result.canceled) return;
        if (result.error) {
          alert(result.error);
          return;
        }
        if (result.data && result.fileName) {
          const uint8 = new Uint8Array(result.data);
          const arrayBuffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
          await onFileLoaded(arrayBuffer, result.fileName);
        }
      } catch (err: any) {
        alert(`Erro ao abrir diálogo: ${err?.message || err}`);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <ToastNotification
        toast={
          showErrorToast
            ? {
                tone: 'danger',
                text: `Não foi possível processar a planilha: ${errors[0]}`,
                onClose: () => setDismissedErrorKey(errorKey),
              }
            : null
        }
        onDismiss={() => setDismissedErrorKey(errorKey)}
      />

      {/* Main Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleSelectFile}
        className={`relative border-2 border-dashed rounded-2xl p-10 sm:p-14 text-center cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'border-[#12385f] bg-[#e8f1fa]/60 scale-[1.01] shadow-md'
            : 'border-slate-300 bg-white hover:border-[#1d68a7] shadow-xs'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
          className="hidden"
          onChange={handleFileInputChange}
          disabled={isLoading}
        />

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-6">
            <Loader2 className="w-12 h-12 text-[#12385f] animate-spin" />
            <h3 className="mt-4 text-base font-bold text-slate-800">Processando planilha bancária...</h3>
            <p className="text-xs text-slate-500 mt-1">
              Localizando colunas, extraindo dias e horários, e ordenando PIX...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-[#e8f1fa] border border-[#c7d9ec] flex items-center justify-center text-[#12385f] mb-5">
              <UploadCloud className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Selecione ou arraste a planilha de extrato da Caixa
            </h2>
            <p className="text-xs text-slate-500 mt-1.5">
              Formatos aceitos: .xlsx, .xls ou .csv
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleSelectFile();
              }}
              className="mt-6 lc-btn lc-btn-primary px-6"
            >
              <span>Escolher Arquivo do Computador</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
