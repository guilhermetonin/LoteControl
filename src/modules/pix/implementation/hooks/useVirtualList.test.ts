import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVirtualList } from './useVirtualList';

describe('useVirtualList Hook', () => {
  it('falls back to non-virtual mode when containerHeight is 0 (e.g. in JSDOM / headless unit tests)', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        itemCount: 100,
        itemHeight: 48,
        overscan: 5,
      })
    );

    // In JSDOM with no layout engine, clientHeight is 0 -> isVirtual should be false
    expect(result.current.isVirtual).toBe(false);
    expect(result.current.startIndex).toBe(0);
    expect(result.current.endIndex).toBe(100);
    expect(result.current.topSpacerHeight).toBe(0);
    expect(result.current.bottomSpacerHeight).toBe(0);
    expect(result.current.totalHeight).toBe(4800);
  });

  it('calculates total height accurately', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        itemCount: 1885,
        itemHeight: 48,
        overscan: 5,
      })
    );

    expect(result.current.totalHeight).toBe(1885 * 48); // 90480px
  });

  it('scrollToIndex does not throw when called with valid or boundary index', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        itemCount: 50,
        itemHeight: 48,
        overscan: 5,
      })
    );

    expect(() => {
      act(() => {
        result.current.scrollToIndex(10);
        result.current.scrollToIndex(0);
        result.current.scrollToIndex(-5);
        result.current.scrollToIndex(999);
      });
    }).not.toThrow();
  });
});
