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
 * - Only renders the visible subset of rows (+ configurable overscan in pixels).
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
  const [scrollTop, setScrollTop] = useState(0);
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setContainerHeight(el.clientHeight);

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        if (el) {
          setScrollTop(el.scrollTop);
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
  }, [containerRef]);

  // When containerHeight is 0 (e.g. during test runs in JSDOM) or when items count is small, do not virtualize.
  const isVirtual = containerHeight > 0 && items.length > minItemsToVirtualize;

  let startIndex = 0;
  let endIndex = items.length;
  let topSpacerHeight = 0;
  let bottomSpacerHeight = 0;

  if (isVirtual && items.length > 0) {
    const minVisibleY = Math.max(0, scrollTop - overscanPx);
    const maxVisibleY = Math.min(totalHeight, scrollTop + containerHeight + overscanPx);

    const startBoundary = findFirstGE(prefixHeights, minVisibleY, items.length + 1);
    startIndex = Math.max(0, startBoundary - 1);

    const endBoundary = findFirstGE(prefixHeights, maxVisibleY, items.length + 1);
    endIndex = Math.min(items.length, Math.max(startIndex + 1, endBoundary));

    topSpacerHeight = prefixHeights[startIndex];
    bottomSpacerHeight = Math.max(0, totalHeight - prefixHeights[endIndex]);
  }

  const visibleItems = useMemo(() => {
    if (!isVirtual) return items;
    return items.slice(startIndex, endIndex);
  }, [items, isVirtual, startIndex, endIndex]);

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
    startIndex,
    endIndex,
    totalHeight,
    topSpacerHeight,
    bottomSpacerHeight,
    isVirtual,
    scrollToIndex,
  };
}
