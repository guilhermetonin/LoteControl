import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CheckSquare, ChevronDown, Filter, Square, X } from 'lucide-react';
import { DayFilterPopover } from '../../../../app/components/SharedMenus';

export interface CompactFilterSummaryProps {
  selectedDia: string;
  onSelectDia: (dia: string) => void;
  availableDias: string[];
  selectedHistoricos: Set<string>;
  onToggleHistorico: (historico: string) => void;
  onSelectAllHistoricos: () => void;
  onClearAllHistoricos: () => void;
  availableHistoricos: string[];
  initialSelectedHistoricos?: string[];
}

export const CompactFilterSummary: React.FC<CompactFilterSummaryProps> = ({
  selectedDia,
  onSelectDia,
  availableDias,
  selectedHistoricos,
  onToggleHistorico,
  onSelectAllHistoricos,
  onClearAllHistoricos,
  availableHistoricos,
  initialSelectedHistoricos = [],
}) => {
  const [openMenu, setOpenMenu] = useState<'days' | 'historicos' | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const historyButtonRef = useRef<HTMLButtonElement | null>(null);
  const dayButtonRef = useRef<HTMLButtonElement | null>(null);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);
  const selectedDayNumber = selectedDia === 'TODOS' ? null : Number(selectedDia.match(/\d+/)?.[0] || 0) || null;
  const daysWithEntries = useMemo(() => new Set(availableDias.map((dia) => Number(dia.match(/\d+/)?.[0] || 0)).filter((day) => day >= 1 && day <= 31)), [availableDias]);
  const toggleMenu = (menu: 'days' | 'historicos') => {
    if (openMenu === menu) { setOpenMenu(null); setMenuAnchor(null); return; }
    const button = menu === 'historicos' ? historyButtonRef.current : dayButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setMenuAnchor(new DOMRect(rect.left, rect.bottom + 6, rect.width, rect.height));
    setOpenMenu(menu);
  };

  useEffect(() => {
    if (openMenu !== 'historicos') return;
    const closeOutside = (event: MouseEvent) => {
      if (historyMenuRef.current && !historyMenuRef.current.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  return (
    <div className="pix-compact-filter-summary">
      <div className="pix-selected-history-tags">
        {Array.from(selectedHistoricos).map((historico, index) => (
          <span key={historico} className={`inline-flex items-center gap-2 px-3 py-2 rounded-full bg-[#e8f1fa] text-[#12385f] border border-[#c7d9ec] text-xs font-bold ${index > 0 ? 'ml-[10px]' : ''}`}>
            {historico}<button type="button" aria-label={`Remover ${historico}`} onClick={() => onToggleHistorico(historico)}><X size={14} /></button>
          </span>
        ))}
      </div>
      <div className="pix-filter-selectors">

        <div className="pix-history-filter-wrap" ref={historyMenuRef}>
          <button
            ref={historyButtonRef}
            type="button"
            className={`rp-day-filter ${openMenu === 'historicos' ? 'active' : ''}`}
            aria-expanded={openMenu === 'historicos'}
            aria-haspopup="dialog"
            onClick={() => toggleMenu('historicos')}
          >
            <Filter size={14} />
            <span>Históricos de Pix</span>
            <ChevronDown size={13} />
          </button>
          {openMenu === 'historicos' && (
            <div className="pix-history-filter-menu" style={menuAnchor ? { position: 'fixed', top: menuAnchor.top, left: menuAnchor.left, zIndex: 1000 } : undefined} role="dialog" aria-label="Históricos de Pix">
              <strong>HISTÓRICOS DE PIX</strong>
              <div className="pix-history-filter-actions">
                <button type="button" onClick={onSelectAllHistoricos}>Marcar todos</button>
                <span>·</span>
                <button type="button" onClick={onClearAllHistoricos}>Desmarcar todos</button>
              </div>
              <div className="pix-history-filter-options">
                {availableHistoricos.map((historico) => {
                  const checked = selectedHistoricos.has(historico);
                  const isDefault = initialSelectedHistoricos.includes(historico);
                  return (
                    <label key={historico}>
                      <input type="checkbox" checked={checked} onChange={() => onToggleHistorico(historico)} />
                      {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                      <span>{historico}</span>
                      {isDefault && <small>Padrão</small>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DayFilterPopover selectedDay={selectedDayNumber} daysWithEntries={daysWithEntries} onSelectDay={(day) => onSelectDia(day === null ? 'TODOS' : `DIA ${String(day).padStart(2, '0')}`)} isOpen={openMenu === 'days'} onToggleOpen={() => toggleMenu('days')} onClose={() => { setOpenMenu(null); setMenuAnchor(null); }} allDaysLabel="Todos os dias" popoverPosition={menuAnchor ? { position: 'fixed', top: menuAnchor.top, left: menuAnchor.left, zIndex: 1000 } : undefined} triggerRef={dayButtonRef} />
      </div>
    </div>
  );
};
