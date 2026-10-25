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
 *
 * Performance-optimized:
 * - Uses indexed Map for O(1) anchor and target lookups (eliminates O(N) findIndex).
 * - Computes financial summary in O(K) over selected items only (eliminates full array filter).
 * - Avoids re-allocating Set/arrays when selection hasn't changed.
 */
export function useRelatorioTableSelection<T extends RelatorioSelectionItem>(
  items: T[]
): UseRelatorioTableSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // Pre-index items for O(1) lookups
  const { idToIndex, idToItem, validIds } = useMemo(() => {
    const idMap = new Map<string, number>();
    const itemMap = new Map<string, T>();
    const idSet = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      const strId = String(items[i].id);
      idMap.set(strId, i);
      itemMap.set(strId, items[i]);
      idSet.add(strId);
    }
    return { idToIndex: idMap, idToItem: itemMap, validIds: idSet };
  }, [items]);

  // Synchronize selection with items list: remove IDs that are no longer visible or present
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let hasInvalid = false;
      for (const id of prev) {
        if (!validIds.has(id)) {
          hasInvalid = true;
          break;
        }
      }
      if (!hasInvalid) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id);
        }
      }
      return next;
    });

    if (anchorId && !validIds.has(String(anchorId))) {
      setAnchorId(null);
    }
  }, [validIds, anchorId]);

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
        const anchorIndex = idToIndex.get(String(anchorId));
        const targetIndex = idToIndex.get(idStr);

        if (anchorIndex !== undefined && targetIndex !== undefined) {
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          const rangeIds = items.slice(start, end + 1).map((t) => String(t.id));

          setSelectedIds((prev) => {
            if (isCtrlOrMeta) {
              const next = new Set(prev);
              for (let i = 0; i < rangeIds.length; i++) {
                next.add(rangeIds[i]);
              }
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
    [items, anchorId, idToIndex]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  // Compute Financial Summary using real integer centavos to avoid float rounding errors
  const summary: SelectionSummary | null = useMemo(() => {
    if (selectedIds.size === 0) return null;

    let count = 0;
    let totalCentavos = 0;

    for (const id of selectedIds) {
      const item = idToItem.get(id);
      if (item) {
        count++;
        const raw = item.valor;
        const num = typeof raw === 'number' ? raw : Number(String(raw || '').replace(',', '.'));
        if (Number.isFinite(num)) {
          totalCentavos += Math.round(num * 100);
        }
      }
    }

    if (count === 0) return null;

    const totalValor = totalCentavos / 100;
    const mediaValor = totalCentavos / count / 100;

    return {
      count,
      totalValor,
      mediaValor,
      totalCentavos,
    };
  }, [selectedIds, idToItem]);

  return {
    selectedIds,
    anchorId,
    handleRowClick,
    clearSelection,
    summary,
  };
}
