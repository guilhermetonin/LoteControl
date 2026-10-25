import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

export interface UseRelatorioVirtualTableOptions<T> {
  items: T[];
  getItemHeight: (item: T, index: number) => number;
  overscanPx?: number;
  minItemsToVirtualize?: number;
}

export interface UseRelatorioVirtualTableReturn<T> {
  containerRef: React.RefObject<HTMLDivElement | null>;
  visibleItems: T[];
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  isVirtual: boolean;
  scrollToIndex: (index: number) => void;
}

/**
 * Fast binary search helper: finds the first index where arr[index] >= target.
 */
function findFirstGE(arr: Float64Array, target: number, maxIdx: number): number {
  let low = 0;
  let high = maxIdx;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (arr[mid] >= target) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

/**
 * High-performance virtual windowing hook for variable-height rows in the Relatório Ledger table.
 * - Computes cumulative prefix heights in O(N) when items list changes.
 * - Uses binary search in O(log N) on scroll to determine visible item range.
 * - Only triggers React re-renders when startIndex, endIndex, or spacer heights actually change,
 *   bailing out on intra-row scroll ticks and letting the browser scroll at native 60+ FPS.
 * - Automatically falls back to non-virtual mode in headless/test environments (JSDOM where clientHeight is 0)
 *   or when item count is small, ensuring 100% test compatibility.
 */
export function useRelatorioVirtualTable<T>({
  items,
  getItemHeight,
  overscanPx = 300,
  minItemsToVirtualize = 35,
}: UseRelatorioVirtualTableOptions<T>): UseRelatorioVirtualTableReturn<T> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  // Compute prefix heights array and total height
  const { prefixHeights, totalHeight } = useMemo(() => {
    const len = items.length;
    const heights = new Float64Array(len + 1);
    heights[0] = 0;
    for (let i = 0; i < len; i++) {
      heights[i + 1] = heights[i] + getItemHeight(items[i], i);
    }
    return { prefixHeights: heights, totalHeight: heights[len] };
  }, [items, getItemHeight]);

  const [range, setRange] = useState(() => ({
    startIndex: 0,
    endIndex: items.length,
    topSpacerHeight: 0,
    bottomSpacerHeight: 0,
  }));

  const computeRange = useCallback(
    (st: number, ch: number) => {
      const len = items.length;
      const isVirt = ch > 0 && len > minItemsToVirtualize;

      let newStart = 0;
      let newEnd = len;
      let newTop = 0;
      let newBottom = 0;

      if (isVirt && len > 0) {
        const minVisibleY = Math.max(0, st - overscanPx);
        const maxVisibleY = Math.min(totalHeight, st + ch + overscanPx);

        const startBoundary = findFirstGE(prefixHeights, minVisibleY, len + 1);
        newStart = Math.max(0, startBoundary - 1);

        const endBoundary = findFirstGE(prefixHeights, maxVisibleY, len + 1);
        newEnd = Math.min(len, Math.max(newStart + 1, endBoundary));

        newTop = prefixHeights[newStart];
        newBottom = Math.max(0, totalHeight - prefixHeights[newEnd]);
      }

      return {
        startIndex: newStart,
        endIndex: newEnd,
        topSpacerHeight: newTop,
        bottomSpacerHeight: newBottom,
      };
    },
    [items.length, minItemsToVirtualize, overscanPx, totalHeight, prefixHeights]
  );

  // Synchronize range when prefixHeights / items change
  useEffect(() => {
    const el = containerRef.current;
    const ch = el ? el.clientHeight : 0;
    const st = el ? el.scrollTop : 0;
    const nextRange = computeRange(st, ch);
    setRange((prev) => {
      if (
        prev.startIndex === nextRange.startIndex &&
        prev.endIndex === nextRange.endIndex &&
        prev.topSpacerHeight === nextRange.topSpacerHeight &&
        prev.bottomSpacerHeight === nextRange.bottomSpacerHeight
      ) {
        return prev;
      }
      return nextRange;
    });
  }, [computeRange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const initialHeight = el.clientHeight;
    if (initialHeight > 0) {
      setContainerHeight(initialHeight);
    }

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        if (el) {
          const nextRange = computeRange(el.scrollTop, el.clientHeight);
          setRange((prev) => {
            if (
              prev.startIndex === nextRange.startIndex &&
              prev.endIndex === nextRange.endIndex &&
              prev.topSpacerHeight === nextRange.topSpacerHeight &&
              prev.bottomSpacerHeight === nextRange.bottomSpacerHeight
            ) {
              return prev; // React bail-out: zero re-render during intra-row scroll ticks
            }
            return nextRange;
          });
        }
        rafId = null;
      });
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const h = entry.contentRect.height;
          if (h > 0) {
            setContainerHeight(h);
          }
        }
      });
      resizeObserver.observe(el);
    }

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
    };
  }, [computeRange]);

  const isVirtual = containerHeight > 0 && items.length > minItemsToVirtualize;

  const visibleItems = useMemo(() => {
    if (!isVirtual) return items;
    return items.slice(range.startIndex, range.endIndex);
  }, [items, isVirtual, range.startIndex, range.endIndex]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = containerRef.current;
      if (!el || index < 0 || index >= items.length) return;
      const targetTop = prefixHeights[index];
      el.scrollTo({
        top: Math.max(0, targetTop - (containerHeight > 0 ? containerHeight / 3 : 0)),
        behavior: 'smooth',
      });
    },
    [prefixHeights, containerHeight, items.length]
  );

  return {
    containerRef,
    visibleItems,
    startIndex: range.startIndex,
    endIndex: range.endIndex,
    totalHeight,
    topSpacerHeight: range.topSpacerHeight,
    bottomSpacerHeight: range.bottomSpacerHeight,
    isVirtual,
    scrollToIndex,
  };
}
