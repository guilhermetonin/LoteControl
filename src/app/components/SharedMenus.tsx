import React, { useEffect, useRef } from 'react';
import { Calendar, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export interface LotericaOption {
  id: string;
  nome: string;
  cor?: string;
  slug?: string;
}

interface LotericaSelectorProps {
  options: LotericaOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export const LotericaSelector: React.FC<LotericaSelectorProps> = ({
  options,
  selectedId,
  onSelect,
  className = '',
}) => {
  return (
    <nav
      className={`lc-company-tabs rp-company-tabs pc-company-tabs ${className}`.trim()}
      aria-label="Lotéricas"
    >
      {options.map((company) => {
        const isActive = company.id === selectedId;
        return (
          <button
            key={company.id}
            type="button"
            className={`${company.slug || ''} ${isActive ? 'active' : ''}`.trim()}
            onClick={() => onSelect(company.id)}
          >
            {company.cor && (
              <span
                className="pc-company-dot"
                style={{ background: company.cor }}
                aria-hidden="true"
              />
            )}
            <span>{company.nome}</span>
          </button>
        );
      })}
    </nav>
  );
};

interface DayFilterPopoverProps {
  selectedDay: number | null;
  daysWithEntries: Set<number> | number[];
  onSelectDay: (day: number | null) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  allDaysLabel?: string;
}

export const DayFilterPopover: React.FC<DayFilterPopoverProps> = ({
  selectedDay,
  daysWithEntries,
  onSelectDay,
  isOpen,
  onToggleOpen,
  onClose,
  allDaysLabel = 'Todos os dias (Mês Completo)',
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const daysSet = daysWithEntries instanceof Set ? daysWithEntries : new Set(daysWithEntries);

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onClose]);

  return (
    <div className="rp-day-filter-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`rp-day-filter ${selectedDay !== null ? 'active' : ''}`}
        onClick={onToggleOpen}
      >
        <Calendar size={14} />
        <span>
          {selectedDay === null ? 'Todos os dias' : `Dia ${String(selectedDay).padStart(2, '0')}`}
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="rp-day-popover" role="dialog" aria-label="Selecionar dia">
          <button
            type="button"
            className={selectedDay === null ? 'active' : ''}
            onClick={() => {
              onSelectDay(null);
              onClose();
            }}
          >
            {allDaysLabel}
          </button>
          <div>
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
              const hasData = daysSet.has(day);
              const isSelected = selectedDay === day;
              return (
                <button
                  key={day}
                  type="button"
                  className={`${isSelected ? 'active' : ''} ${hasData ? 'has-data' : ''}`.trim()}
                  onClick={() => {
                    onSelectDay(day);
                    onClose();
                  }}
                >
                  {String(day).padStart(2, '0')}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export interface ToastItem {
  id?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'error';
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}

export const ToastNotification: React.FC<{
  toast: ToastItem | null;
  onDismiss?: () => void;
  autoHideMs?: number;
}> = ({ toast, onDismiss, autoHideMs = 4500 }) => {
  useEffect(() => {
    if (!toast || !onDismiss || autoHideMs <= 0 || toast.actionLabel) return;
    const timer = window.setTimeout(() => {
      onDismiss();
    }, autoHideMs);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss, autoHideMs]);

  if (!toast || !toast.text) return null;

  const normalizedTone =
    toast.tone === 'error' ? 'danger' : toast.tone || 'info';

  const Icon =
    normalizedTone === 'success'
      ? CheckCircle2
      : normalizedTone === 'danger' || normalizedTone === 'warning'
        ? AlertTriangle
        : Info;

  return (
    <div className="lc-toast-viewport" role="status" aria-live="polite">
      <div className={`lc-toast lc-toast-${normalizedTone}`}>
        <Icon size={16} className="lc-toast-icon" />
        <span className="lc-toast-text">{toast.text}</span>
        {toast.actionLabel && toast.onAction && (
          <button
            type="button"
            className="lc-toast-action"
            onClick={toast.onAction}
          >
            {toast.actionLabel}
          </button>
        )}
        {(onDismiss || toast.onClose) && (
          <button
            type="button"
            className="lc-toast-close"
            onClick={toast.onClose || onDismiss}
            aria-label="Fechar notificação"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
