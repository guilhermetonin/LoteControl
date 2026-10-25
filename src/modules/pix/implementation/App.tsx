import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Header, type MainNavSection } from './components/Header';
import { FileDropzone } from './components/FileDropzone';
import { CompactFilterSummary } from './components/CompactFilterSummary';
import { ConferenceList, type ConferenceBehavior } from './components/ConferenceList';
import { PendentesPanel } from './components/PendentesPanel';
import { SidebarDrawer } from './components/SidebarDrawer';
import { ConfirmModal } from './components/ConfirmModal';
import { HistoryView } from './components/HistoryView';
import { BackupView } from './components/BackupView';
import { DuplicateHashModal } from './components/DuplicateHashModal';
import { parseStatement, type StatementParseResult } from './services/statementParser';
import { useConferenceState } from './hooks/useConference';
import { dbClient } from './services/dbClient';
import type { ConferenceRecord } from './services/sqliteDatabase';

interface PixAppProps {
  workspaceId?: string;
  isActive?: boolean;
}

export function App({ workspaceId = 'standalone', isActive = true }: PixAppProps) {
  const [currentSection, setCurrentSection] = useState<MainNavSection>('conferencia');
  const [conferences, setConferences] = useState<ConferenceRecord[]>([]);
  const [activeConferenceId, setActiveConferenceId] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<StatementParseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Modals state
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id?: string; fileName?: string; isAll?: boolean } | null>(null);
  const [duplicateModal, setDuplicateModal] = useState<{
    pendingBuffer: ArrayBuffer;
    fileName: string;
    parseResult: StatementParseResult;
    existingConference: ConferenceRecord;
  } | null>(null);

  // App Settings
  const [behavior, setBehavior] = useState<ConferenceBehavior>('move_to_conferidos');
  const [hasLocalStorageData, setHasLocalStorageData] = useState(false);

  // Load initial settings and conferences list from SQLite
  const refreshConferences = useCallback(async () => {
    try {
      const list = await dbClient.getConferences();
      setConferences(list);
    } catch (err) {
      console.error('Erro ao carregar lista de conferências do SQLite:', err);
    }
  }, []);

  useEffect(() => {
    async function initSettings() {
      try {
        const savedBehavior = (await dbClient.getSetting(
          'behavior_after_check',
          'move_to_conferidos'
        )) as ConferenceBehavior;
        setBehavior(savedBehavior);

        await refreshConferences();

        // Check if there are legacy localStorage marks
        if (typeof localStorage !== 'undefined') {
          let hasOld = false;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('conferencia_pix_marks_')) {
              hasOld = true;
              break;
            }
          }
          setHasLocalStorageData(hasOld);
        }
      } catch (err) {
        console.error('Erro ao inicializar configurações do SQLite:', err);
      }
    }
    initSettings();
  }, [refreshConferences]);

  // Hook for conference state management
  const {
    selectedDia,
    setSelectedDia,
    selectedHistoricos,
    toggleHistorico,
    selectAllHistoricos,
    clearAllHistoricos,
    timeRange,
    setTimeRange,
    isTimeFilterActive,
    setIsTimeFilterActive,
    checkedIds,
    toggleCheck,
    checkAllFiltered,
    uncheckAllFiltered,
    clearConference,
    filteredTransactions,
    pendentes,
    stats,
    activeTab,
    setActiveTab,
    persistenceError,
    // Undo / Redo & Highlights
    canUndo,
    canRedo,
    undo,
    redo,
    highlightedTxId,
    refreshPersistedState,
    // Transaction operations
    addManualTransaction,
    deleteManualTransaction,
  } = useConferenceState(parseResult, activeConferenceId, behavior);

  useEffect(() => {
    return window.electronAPI?.events?.onDomainChanged((event) => {
      if (event.module !== 'pix') return;
      void refreshConferences();
      if (!event.key || event.key === activeConferenceId || ['restore', 'all', 'migration'].includes(event.key)) {
        void refreshPersistedState().catch((error) => console.error('Falha ao atualizar Pix entre abas:', error));
      }
    });
  }, [activeConferenceId, refreshConferences, refreshPersistedState]);

  // Auto-scroll to highlighted transaction on Undo / Redo
  useEffect(() => {
    if (highlightedTxId) {
      const frame = requestAnimationFrame(() => {
        const el =
          document.getElementById(`tx-row-${highlightedTxId}`) ||
          document.getElementById(`tx-pendente-${highlightedTxId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [highlightedTxId]);

  // Global Keyboard Shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y, Ctrl+Shift+Z)
  // Works reliably regardless of scroll position, list focus or checkbox clicks
  useEffect(() => {
    const isTextInput = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === 'textarea' || (el as HTMLElement).isContentEditable) return true;
      if (tag === 'input') {
        const type = (el as HTMLInputElement).type?.toLowerCase();
        return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(type);
      }
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if user is typing inside a genuine text input
      if (isTextInput(document.activeElement) || isTextInput(e.target as Element)) {
        return;
      }

      // Ctrl+Z or Cmd+Z (without shift) -> Desfazer (Undo)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        e.stopPropagation();
        if (canUndo) {
          undo();
        }
      }
      // Ctrl+Y or Cmd+Y or Ctrl+Shift+Z or Cmd+Shift+Z -> Refazer (Redo)
      else if (
        ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (canRedo) {
          redo();
        }
      }
    };

    if (!isActive) return;
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isActive, canUndo, canRedo, undo, redo]);

  // Behavior setting change
  const handleChangeBehavior = async (newBehavior: ConferenceBehavior) => {
    setBehavior(newBehavior);
    try {
      await dbClient.setSetting('behavior_after_check', newBehavior);
    } catch (err) {
      console.error('Erro ao salvar configuração no banco:', err);
    }
  };

  const handleMovedPendentes = useCallback(async (transactions: import('./services/statementParser').PixTransaction[]) => {
    await checkAllFiltered(transactions);
  }, [checkAllFiltered]);

  // Reopen an existing conference from history
  const handleOpenConferenceFromHistory = async (id: string) => {
    setIsLoading(true);
    try {
      const conf = await dbClient.getConference(id);
      if (!conf) throw new Error('Conferência não encontrada no banco.');

      const txs = await dbClient.getTransactions(id);

      const reconstructed: StatementParseResult = {
        fileName: conf.fileName,
        fileHash: conf.fileHash,
        sheetName: conf.sheetName,
        allSheets: [conf.sheetName],
        totalRawRows: conf.totalRawRows,
        totalValidTransactions: conf.totalValidTransactions,
        pixTransactions: txs,
        availableHistoricos: conf.availableHistoricos,
        initialSelectedHistoricos: conf.initialSelectedHistoricos,
        availableDias: conf.availableDias,
        errors: [],
      };

      setParseResult(reconstructed);
      setActiveConferenceId(conf.id);
      setCurrentSection('conferencia');
    } catch (err: any) {
      alert(`Erro ao reabrir conferência: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // File loading handler with duplicate hash check
  const handleFileLoaded = useCallback(
    async (buffer: ArrayBuffer, fileName: string) => {
      setIsLoading(true);
      setErrors([]);
      try {
        const result = await parseStatement(buffer, fileName);
        if (result.errors && result.errors.length > 0) {
          setErrors(result.errors);
          setParseResult(null);
          setActiveConferenceId(null);
          return;
        }

        // Check if a conference with this content hash already exists in SQLite
        const existing = await dbClient.findConferenceByHash(result.fileHash);
        if (existing) {
          setDuplicateModal({
            pendingBuffer: buffer,
            fileName,
            parseResult: result,
            existingConference: existing,
          });
          return;
        }

        // Save new conference to SQLite
        const newConfId = await dbClient.saveConference(result);
        setParseResult(result);
        setActiveConferenceId(newConfId);
        await refreshConferences();
        setErrors([]);
      } catch (err: any) {
        setErrors([`Erro inesperado ao processar o arquivo: ${err?.message || err}`]);
        setParseResult(null);
        setActiveConferenceId(null);
      } finally {
        setIsLoading(false);
      }
    },
    [refreshConferences]
  );

  // Duplicate modal options
  const handleDuplicateOpenExisting = async () => {
    if (!duplicateModal) return;
    const existingId = duplicateModal.existingConference.id;
    setDuplicateModal(null);
    await handleOpenConferenceFromHistory(existingId);
  };

  const handleDuplicateCreateNew = async () => {
    if (!duplicateModal) return;
    const { parseResult: result } = duplicateModal;
    setDuplicateModal(null);
    setIsLoading(true);
    try {
      const newConfId = await dbClient.saveConference(result, { newSession: true });
      setParseResult(result);
      setActiveConferenceId(newConfId);
      await refreshConferences();
    } catch (err: any) {
      alert(`Erro ao criar nova conferência: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const nativeFileInputRef = useRef<HTMLInputElement>(null);

  // Native File Dialog Importer (Windows Electron dialog.showOpenDialog)
  const handleImportNativeFile = async () => {
    if (window.electronAPI?.dialog?.openStatementFile) {
      try {
        const result = await window.electronAPI.dialog.openStatementFile();
        if (result.canceled) {
          // Canceled by user: preserve active conference, marks and filters completely intact
          return;
        }
        if (result.error) {
          alert(result.error);
          return;
        }
        if (result.data && result.fileName) {
          const uint8 = new Uint8Array(result.data);
          const arrayBuffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
          await handleFileLoaded(arrayBuffer, result.fileName);
        }
      } catch (err: any) {
        alert(`Erro ao abrir diálogo de importação: ${err?.message || err}`);
      }
    } else {
      // Browser fallback
      nativeFileInputRef.current?.click();
    }
  };

  const handleFallbackFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const buffer = await file.arrayBuffer();
      await handleFileLoaded(buffer, file.name);
      e.target.value = '';
    }
  };

  // Delete conference handlers
  const handleDeleteConference = (id: string, fileName: string) => {
    setDeleteConfirm({ id, fileName, isAll: false });
  };

  const handleDeleteAllConferences = () => {
    setDeleteConfirm({ isAll: true });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.isAll) {
        await dbClient.deleteAllConferences();
        setParseResult(null);
        setActiveConferenceId(null);
      } else if (deleteConfirm.id) {
        await dbClient.deleteConference(deleteConfirm.id);
        if (activeConferenceId === deleteConfirm.id) {
          setParseResult(null);
          setActiveConferenceId(null);
        }
      }
      await refreshConferences();
    } catch (err: any) {
      alert(`Erro ao excluir: ${err?.message || err}`);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // LocalStorage migration
  const handleMigrateLocalStorage = async () => {
    if (typeof localStorage === 'undefined') return;
    try {
      let migratedCount = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('conferencia_pix_marks_')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.fileHash && Array.isArray(parsed.checkedIds)) {
                const conf = await dbClient.findConferenceByHash(parsed.fileHash);
                if (conf) {
                  await dbClient.setMultipleChecks(conf.id, parsed.checkedIds, true);
                  migratedCount++;
                }
              }
            } catch {}
          }
        }
      }
      alert(`Migração concluída com sucesso! ${migratedCount} conferência(s) atualizada(s) no SQLite.`);
      setHasLocalStorageData(false);
      await refreshConferences();
    } catch (err: any) {
      alert(`Erro durante a migração: ${err?.message || err}`);
    }
  };

  const handleCheckAllFiltered = useCallback(() => {
    checkAllFiltered(filteredTransactions);
  }, [checkAllFiltered, filteredTransactions]);

  const handleUncheckAllFiltered = useCallback(() => {
    uncheckAllFiltered(filteredTransactions);
  }, [uncheckAllFiltered, filteredTransactions]);

  const availableHistoricos = useMemo(() => {
    return parseResult?.availableHistoricos || [];
  }, [parseResult?.availableHistoricos]);

  const availableDias = useMemo(() => {
    if (parseResult?.availableDias && parseResult.availableDias.length > 0) {
      return parseResult.availableDias;
    }
    const set = new Set<string>();
    (parseResult?.pixTransactions || []).forEach((tx) => {
      if (tx.dia) set.add(tx.dia);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [parseResult?.availableDias, parseResult?.pixTransactions]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const openPixSettings = () => setIsSidebarOpen(true);
    window.addEventListener('lotecontrol:open-pix-settings', openPixSettings);
    return () => window.removeEventListener('lotecontrol:open-pix-settings', openPixSettings);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  return (
    <div id={`pix-instance-${workspaceId}`} data-module-ready="pix" className="h-full w-full overflow-hidden bg-white text-slate-900 flex flex-col font-sans select-none">
      <Header
        currentSection={currentSection}
        onNavigate={setCurrentSection}
        conferencesCount={conferences.length}
        hasActiveFile={Boolean(parseResult)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        onImportNewFile={handleImportNativeFile}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        showSettingsButton={false}
      />

      {/* Hidden input fallback for browser testing */}
      <input
        ref={nativeFileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={handleFallbackFileChange}
      />

      <main className="flex-1 min-h-0 w-full overflow-hidden flex flex-col px-3 sm:px-5 py-3">
        {/* SECTION: CONFERÊNCIA */}
        {currentSection === 'conferencia' && (
          <div className="flex-1 min-h-0 flex flex-col">
            {!parseResult ? (
              <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-2">
                <FileDropzone
                  onFileLoaded={handleFileLoaded}
                  isLoading={isLoading}
                  errors={errors}
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col gap-2.5">
                {/* Expandable Top Filter Area with Day Badges and History Filters */}
                <div className="shrink-0">
                  <CompactFilterSummary
                    stats={stats}
                    selectedDia={selectedDia}
                    onSelectDia={setSelectedDia}
                    availableDias={availableDias}
                    selectedHistoricos={selectedHistoricos}
                    onToggleHistorico={toggleHistorico}
                    onSelectAllHistoricos={selectAllHistoricos}
                    onClearAllHistoricos={clearAllHistoricos}
                    availableHistoricos={availableHistoricos}
                    initialSelectedHistoricos={parseResult.initialSelectedHistoricos}
                  />
                </div>

                {/* Main Desktop Grid: Main List (7 cols) + Only Pendentes (5 cols) with independent internal scrollbars */}
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
                  {/* Left: Lista de PIX */}
                  <div className="lg:col-span-7 h-full min-h-0 flex flex-col">
                    <ConferenceList
                      transactions={filteredTransactions}
                      checkedIds={checkedIds}
                      onToggleCheck={toggleCheck}
                      behavior={behavior}
                      activeTab={activeTab}
                      onChangeTab={setActiveTab}
                      onCheckAllFiltered={handleCheckAllFiltered}
                      onUncheckAllFiltered={handleUncheckAllFiltered}
                      persistenceError={persistenceError}
                      isActive={isActive}
                      highlightedTxId={highlightedTxId}
                      onDeleteTransaction={deleteManualTransaction}
                      onAddTransaction={addManualTransaction}
                      availableHistoricos={availableHistoricos}
                      currentDia={selectedDia}
                    />
                  </div>

                  {/* Right: Somente Pendentes */}
                  <div className="lg:col-span-5 h-full min-h-0 flex flex-col">
                    <PendentesPanel
                      pendentes={pendentes}
                      highlightedTxId={highlightedTxId}
                      conferenceId={activeConferenceId}
                      fileName={parseResult.fileName}
                      onMoved={handleMovedPendentes}
                      isActive={isActive}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION: HISTÓRICO */}
        {currentSection === 'historico' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <HistoryView
              conferences={conferences}
              activeConferenceId={activeConferenceId}
              onOpenConference={handleOpenConferenceFromHistory}
              onDeleteConference={handleDeleteConference}
              onDeleteAllConferences={handleDeleteAllConferences}
              onBackToActive={() => setCurrentSection('conferencia')}
            />
          </div>
        )}

        {/* SECTION: BACKUP */}
        {currentSection === 'backup' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <BackupView onBackupRestored={refreshConferences} />
          </div>
        )}
      </main>

      {/* Settings Drawer */}
      <SidebarDrawer
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
        parseResult={parseResult}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        isTimeFilterActive={isTimeFilterActive}
        setIsTimeFilterActive={setIsTimeFilterActive}
        behavior={behavior}
        onChangeBehavior={handleChangeBehavior}
        onClearConferenceMarks={parseResult ? () => setIsConfirmClearOpen(true) : undefined}
        hasLocalStorageData={hasLocalStorageData}
        onMigrateLocalStorage={handleMigrateLocalStorage}
        isActive={isActive}
      />

      {/* Confirmation Modal: Clear Marks */}
      <ConfirmModal
        isOpen={isConfirmClearOpen}
        title="Limpar todas as marcações?"
        message="Deseja realmente desmarcar todos os PIX conferidos deste extrato? Esta ação removerá as marcações salvas no banco de dados local para este arquivo."
        confirmLabel="Sim, limpar marcações"
        cancelLabel="Cancelar"
        onConfirm={() => {
          clearConference();
          setIsConfirmClearOpen(false);
        }}
        onCancel={() => setIsConfirmClearOpen(false)}
      />

      {/* Confirmation Modal: Delete Conference / History */}
      <ConfirmModal
        isOpen={Boolean(deleteConfirm)}
        title={deleteConfirm?.isAll ? 'Limpar todo o histórico de conferências?' : 'Excluir conferência?'}
        message={
          deleteConfirm?.isAll
            ? 'Deseja realmente excluir todo o histórico de extratos e conferências salvos no banco de dados local? Esta ação não pode ser desfeita.'
            : `Deseja realmente excluir a conferência do arquivo "${deleteConfirm?.fileName}" do histórico? Os dados do extrato e marcações serão apagados do banco.`
        }
        confirmLabel={deleteConfirm?.isAll ? 'Sim, apagar tudo' : 'Sim, excluir'}
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Modal: Duplicate Hash on Import */}
      <DuplicateHashModal
        isOpen={Boolean(duplicateModal)}
        existingConference={duplicateModal?.existingConference || null}
        newFileName={duplicateModal?.fileName || ''}
        onOpenExisting={handleDuplicateOpenExisting}
        onCreateNew={handleDuplicateCreateNew}
        onCancel={() => setDuplicateModal(null)}
      />

    </div>
  );
}

export default App;
