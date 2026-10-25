import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { PixTransaction } from '../services/statementParser';

export interface SelectionSummary {
  count: number;
  totalValor: number;
  mediaValor: number;
  totalCentavos: number;
}

export interface UseTableSelectionReturn {
  selectedIds: Set<string>;
  anchorId: string | null;
  handleRowClick: (e: React.MouseEvent, txId: string) => void;
  clearSelection: () => void;
  summary: SelectionSummary | null;
}

/**
 * Hook for spreadsheet-style row selection supporting:
 * - Normal click: selects single row, clears previous selection, sets anchor.
 * - Ctrl/Cmd + click: toggles clicked row in/out of selection, sets anchor.
 * - Shift + click: selects continuous range between anchor and clicked row.
 * - Shift + click after another selection: re-evaluates range using the persistent anchor.
 * - Automatically purges selected IDs that no longer exist in the provided items list.
 * - Computes real-time financial summary: total, count, and average formatted in BRL.
 */
export function useTableSelection(items: PixTransaction[]): UseTableSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // Synchronize selection with items list: remove IDs that are no longer visible or present
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const currentValidIds = new Set(items.map((i) => i.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (currentValidIds.has(id)) {
          next.add(id);
        }
      });
      if (next.size === prev.size) return prev;
      return next;
    });

    if (anchorId && !items.some((i) => i.id === anchorId)) {
      setAnchorId(null);
    }
  }, [items, anchorId]);

  const handleRowClick = useCallback(
    (e: React.MouseEvent, txId: string) => {
      // Prevent browser text selection when Shift is pressed
      if (e.shiftKey) {
        window.getSelection()?.removeAllRanges();
      }

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      // 1. Shift + Click: Range Selection from persistent anchor
      if (isShift && anchorId) {
        const anchorIndex = items.findIndex((t) => t.id === anchorId);
        const targetIndex = items.findIndex((t) => t.id === txId);

        if (anchorIndex !== -1 && targetIndex !== -1) {
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          const rangeIds = items.slice(start, end + 1).map((t) => t.id);

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
          if (next.has(txId)) {
            next.delete(txId);
          } else {
            next.add(txId);
          }
          return next;
        });
        setAnchorId(txId);
        return;
      }

      // 3. Normal Click: Select only clicked item
      setSelectedIds(new Set([txId]));
      setAnchorId(txId);
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

    const selectedItems = items.filter((t) => selectedIds.has(t.id));
    const count = selectedItems.length;
    if (count === 0) return null;

    const totalCentavos = selectedItems.reduce((acc, t) => acc + t.valorCentavos, 0);
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
