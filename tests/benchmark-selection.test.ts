import { describe, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRelatorioTableSelection } from '../src/modules/relatorio/useRelatorioTableSelection';

function generateMockItems(count: number) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      id: `id-${i}`,
      dia: (i % 30) + 1,
      valor: 15.0 + (i % 50),
    });
  }
  return items;
}

describe('Benchmark useRelatorioTableSelection', () => {
  for (const count of [500, 1000, 5000, 10000]) {
    it(`mede clique simples e Shift-clique com ${count} itens`, () => {
      const items = generateMockItems(count);
      const { result } = renderHook(() => useRelatorioTableSelection(items));

      // 1. Clique inicial no primeiro item
      let start = performance.now();
      act(() => {
        result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'id-0');
      });
      const singleClickTime = performance.now() - start;

      // 2. Shift-clique no último item (seleciona todos os N itens)
      start = performance.now();
      act(() => {
        result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: true } as any, `id-${count - 1}`);
      });
      const shiftClickTime = performance.now() - start;

      // 3. Verifica resumo calculado
      start = performance.now();
      const summary = result.current.summary;
      const summaryTime = performance.now() - start;

      console.log(`[Selection ${count} itens] Single click: ${singleClickTime.toFixed(2)}ms | Shift-click (${count} range): ${shiftClickTime.toFixed(2)}ms | Summary: ${summary?.count} itens (${summaryTime.toFixed(2)}ms)`);
    });
  }
});
