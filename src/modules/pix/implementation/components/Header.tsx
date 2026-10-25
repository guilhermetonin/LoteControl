import React from 'react';
import {
  History,
  Archive,
  CheckSquare,
  Settings,
  FileUp,
  Undo2,
  Redo2,
} from 'lucide-react';

export type MainNavSection = 'conferencia' | 'historico' | 'backup';

interface HeaderProps {
  currentSection: MainNavSection;
  onNavigate: (section: MainNavSection) => void;
  conferencesCount: number;
  hasActiveFile: boolean;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onImportNewFile: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  showSettingsButton?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentSection,
  onNavigate,
  conferencesCount,
  hasActiveFile: _hasActiveFile,
  isSidebarOpen,
  onToggleSidebar,
  onImportNewFile,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  showSettingsButton = true,
}) => {
  return (
    <header className="lc-top-menu pix-toolbar sticky top-0 z-30 shrink-0 w-full app-no-drag">
      <div className="lc-menu-row">
        {/* Left: Navigation Tabs (+ Settings button when standalone) */}
        <div className="lc-menu-group">
          {showSettingsButton && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSidebar();
              }}
              className={`lc-btn ${
                isSidebarOpen ? 'lc-btn-primary' : 'lc-btn-outline'
              }`}
              aria-label={isSidebarOpen ? 'Fechar configurações' : 'Abrir configurações'}
              title={isSidebarOpen ? 'Fechar configurações (⚙)' : 'Abrir configurações (⚙)'}
            >
              <Settings size={16} />
            </button>
          )}

          <div className="pix-primary-nav" aria-label="Seções do Pix">
            <button
              type="button"
              onClick={() => onNavigate('conferencia')}
              className={`pix-primary-nav-button ${currentSection === 'conferencia' ? 'active' : ''}`}
            >
              <CheckSquare size={16} />
              <span>Conferência</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('historico')}
              className={`pix-primary-nav-button ${currentSection === 'historico' ? 'active' : ''}`}
            >
              <History size={16} />
              <span>Histórico</span>
              {conferencesCount > 0 && (
                <span className="pix-nav-count">{conferencesCount}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('backup')}
              className={`pix-primary-nav-button ${currentSection === 'backup' ? 'active' : ''}`}
            >
              <Archive size={16} />
              <span>Backup</span>
            </button>
          </div>
        </div>

        {/* Right: Standardized Action Buttons */}
        <div className="lc-menu-group">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo || currentSection !== 'conferencia'}
            className="lc-btn lc-btn-outline pix-toolbar-btn pix-toolbar-btn-secondary"
            aria-label="Desfazer última alteração (Ctrl+Z)"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 size={16} />
            <span>Desfazer</span>
          </button>

          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo || currentSection !== 'conferencia'}
            className="lc-btn lc-btn-outline pix-toolbar-btn pix-toolbar-btn-secondary"
            aria-label="Refazer alteração (Ctrl+Y ou Ctrl+Shift+Z)"
            title="Refazer (Ctrl+Y ou Ctrl+Shift+Z)"
          >
            <Redo2 size={16} />
            <span>Refazer</span>
          </button>

          <span className="lc-menu-divider" aria-hidden="true" />

          <button
            type="button"
            onClick={onImportNewFile}
            className="lc-btn lc-btn-primary pix-toolbar-btn pix-toolbar-btn-primary"
            title="Importar planilha da Caixa"
          >
            <FileUp size={16} />
            <span>Importar Planilha</span>
          </button>
        </div>
      </div>
    </header>
  );
};
