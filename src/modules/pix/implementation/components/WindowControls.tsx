import React, { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { dbClient } from '../services/dbClient';

export const WindowControls: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = dbClient.isElectron();

  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    // Check initial maximized state
    window.electronAPI.window.isMaximized().then(setIsMaximized).catch(() => {});

    // Listen to maximize changes
    const cleanup = window.electronAPI.window.onMaximizedChange((maximized) => {
      setIsMaximized(maximized);
    });

    return () => {
      cleanup();
    };
  }, [isElectron]);

  if (!isElectron) {
    return null;
  }

  const handleMinimize = () => {
    window.electronAPI?.window.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.window.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.window.close();
  };

  return (
    <div className="flex items-center app-no-drag">
      {/* Minimize */}
      <button
        type="button"
        onClick={handleMinimize}
        className="w-10 h-9 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 transition-colors cursor-pointer"
        aria-label="Minimizar janela"
        title="Minimizar"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      {/* Maximize / Restore */}
      <button
        type="button"
        onClick={handleMaximize}
        className="w-10 h-9 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 transition-colors cursor-pointer"
        aria-label={isMaximized ? 'Restaurar janela' : 'Maximizar janela'}
        title={isMaximized ? 'Restaurar' : 'Maximizar'}
      >
        {isMaximized ? (
          <Copy className="w-3 h-3 rotate-180" />
        ) : (
          <Square className="w-3 h-3" />
        )}
      </button>

      {/* Close */}
      <button
        type="button"
        onClick={handleClose}
        className="w-11 h-9 flex items-center justify-center text-slate-500 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
        aria-label="Fechar aplicativo"
        title="Fechar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
