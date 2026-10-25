import React, { useState, useCallback, useMemo, useEffect } from 'react';

export interface SelectionSummary {
  count: number;
  totalValor: number;
  mediaValor: number;
  totalCentavos: number;
}

export interface RelatorioSelectionItem {
  id: string | number;
  valor?: number | string | null;
  dia?: number | string | null;
  [key: string]: any;
}

export interface UseRelatorioTableSelectionReturn {
  selectedIds: Set<string>;
  anchorId: string | null;
  handleRowClick: (e: React.MouseEvent, rowId: string | number) => void;
  clearSelection: () => void;
  summary: SelectionSummary | null;
}

/**
 * Hook for spreadsheet-style row selection in Relatório module supporting:
 * - Normal click: selects single row, clears previous selection, sets anchor.
 * - Ctrl/Cmd + click: toggles clicked row in/out of selection, sets anchor.
 * - Shift + click: selects continuous range between anchor and clicked row.
 * - Shift + click after another selection: re-evaluates range using the persistent anchor.
 * - Automatically purges selected IDs that no longer exist in the provided items list.
 * - Computes real-time financial summary: total, count, and average formatted in BRL using centavos.
 */
export function useRelatorioTableSelection<T extends RelatorioSelectionItem>(
  items: T[]
): UseRelatorioTableSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // Synchronize selection with items list: remove IDs that are no longer visible or present
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const currentValidIds = new Set(items.map((i) => String(i.id)));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (currentValidIds.has(id)) {
          next.add(id);
        }
      });
      if (next.size === prev.size) return prev;
      return next;
    });

    if (anchorId && !items.some((i) => String(i.id) === String(anchorId))) {
      setAnchorId(null);
    }
  }, [items, anchorId]);

  const handleRowClick = useCallback(
    (e: React.MouseEvent, rowId: string | number) => {
      const idStr = String(rowId);

      // Prevent browser text selection when Shift is pressed
      if (e.shiftKey) {
        window.getSelection()?.removeAllRanges();
      }

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      // 1. Shift + Click: Range Selection from persistent anchor
      if (isShift && anchorId) {
        const anchorIndex = items.findIndex((t) => String(t.id) === String(anchorId));
        const targetIndex = items.findIndex((t) => String(t.id) === idStr);

        if (anchorIndex !== -1 && targetIndex !== -1) {
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          const rangeIds = items.slice(start, end + 1).map((t) => String(t.id));

          setSelectedIds((prev) => {
            if (isCtrlOrMeta) {
              const next = new Set(prev);
              rangeIds.forEach((id) => next.add(id));
              return next;
            }
            return new Set(rangeIds);
          });
          // Do NOT overwrite anchorId: persistent anchor allows expanding or shrinking the range
          return;
        }
      }

      // 2. Ctrl / Cmd + Click: Toggle item in/out of selection
      if (isCtrlOrMeta) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(idStr)) {
            next.delete(idStr);
          } else {
            next.add(idStr);
          }
          return next;
        });
        setAnchorId(idStr);
        return;
      }

      // 3. Normal Click: Select only clicked item
      setSelectedIds(new Set([idStr]));
      setAnchorId(idStr);
    },
    [items, anchorId]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  // Compute Financial Summary using real integer centavos to avoid float rounding errors
  const summary: SelectionSummary | null = useMemo(() => {
    if (selectedIds.size === 0) return null;

    const selectedItems = items.filter((t) => selectedIds.has(String(t.id)));
    const count = selectedItems.length;
    if (count === 0) return null;

    const totalCentavos = selectedItems.reduce((acc, t) => {
      const raw = t.valor;
      const num = typeof raw === 'number' ? raw : Number(String(raw || '').replace(',', '.'));
      return acc + (Number.isFinite(num) ? Math.round(num * 100) : 0);
    }, 0);

    const totalValor = totalCentavos / 100;
    const mediaValor = totalCentavos / count / 100;

    return {
      count,
      totalValor,
      mediaValor,
      totalCentavos,
    };
  }, [items, selectedIds]);

  return {
    selectedIds,
    anchorId,
    handleRowClick,
    clearSelection,
    summary,
  };
}
