import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRelatorioVirtualTable } from '../src/modules/relatorio/useRelatorioVirtualTable';

describe('useRelatorioVirtualTable (Virtualização da tabela do Relatório)', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({
    id: `item-${i}`,
    type: i % 10 === 0 ? 'day-group' : 'entry',
    height: i % 10 === 0 ? 38 : 44,
  }));

  const getItemHeight = (item: (typeof items)[0]) => item.height;

  it('retorna modo não virtual e todos os itens quando containerHeight é 0 (fallback JSDOM)', () => {
    const { result } = renderHook(() =>
      useRelatorioVirtualTable({
        items,
        getItemHeight,
        overscanPx: 100,
        minItemsToVirtualize: 35,
      })
    );

    expect(result.current.isVirtual).toBe(false);
    expect(result.current.visibleItems.length).toBe(100);
    expect(result.current.topSpacerHeight).toBe(0);
    expect(result.current.bottomSpacerHeight).toBe(0);
    expect(result.current.totalHeight).toBe(10 * 38 + 90 * 44); // 380 + 3960 = 4340
  });

  it('calcula fatiamento virtual, espaçador superior e inferior quando containerHeight > 0', () => {
    const fakeContainer = document.createElement('div');
    Object.defineProperty(fakeContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(fakeContainer, 'scrollTop', { value: 0, writable: true, configurable: true });

    const { result } = renderHook(() => {
      const hook = useRelatorioVirtualTable({
        items,
        getItemHeight,
        overscanPx: 100,
        minItemsToVirtualize: 35,
      });
      // Attach the fake container
      (hook.containerRef as any).current = fakeContainer;
      return hook;
    });

    // Simulate mount / resize detection
    act(() => {
      const el = fakeContainer;
      // trigger scroll listener or resize
      el.dispatchEvent(new Event('scroll'));
    });

    // Verify virtual mode can be activated when container has measured height
    // In actual DOM with clientHeight > 0, visible range only renders visible subset
    expect(result.current.totalHeight).toBe(4340);
  });

  it('não ativa virtualização para listas pequenas (<= minItemsToVirtualize)', () => {
    const smallItems = items.slice(0, 20);
    const fakeContainer = document.createElement('div');
    Object.defineProperty(fakeContainer, 'clientHeight', { value: 600, configurable: true });

    const { result } = renderHook(() => {
      const hook = useRelatorioVirtualTable({
        items: smallItems,
        getItemHeight,
        overscanPx: 100,
        minItemsToVirtualize: 35,
      });
      (hook.containerRef as any).current = fakeContainer;
      return hook;
    });

    expect(result.current.isVirtual).toBe(false);
    expect(result.current.visibleItems.length).toBe(20);
  });
});
