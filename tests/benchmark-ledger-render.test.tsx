import { describe, expect, it } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { Ledger } from '../src/modules/relatorio/RelatorioModule';

function generateMockEntries(count: number) {
  const entries = [];
  for (let i = 0; i < count; i++) {
    const dia = (i % 30) + 1;
    entries.push({
      id: `entry-${i}`,
      dia,
      valor: 15.0 + (i % 100),
      tipo: 'sobra',
      status: i % 2 === 0 ? 'conferido' : 'pendente',
      cliente: `Cliente ${i}`,
      funcionario: `Func ${i % 10}`,
    });
  }
  return entries;
}

describe('Benchmark de Renderização do Ledger e Interação de Seleção', () => {
  for (const count of [500, 1000, 2500, 5000]) {
    it(`mede clique simples e Shift-clique dentro do Ledger com ${count} itens`, () => {
      const entries = generateMockEntries(count);
      
      const startRender = performance.now();
      const { container, unmount } = render(
        <Ledger
          title="PIX SOBRANDO"
          kind="sobra"
          entries={entries}
          onEdit={() => {}}
          onInlineSave={() => {}}
          onToggleStatus={() => {}}
          onDelete={() => {}}
        />
      );
      const initialRenderTime = performance.now() - startRender;

      const checkCells = container.querySelectorAll('.rp-check-cell');
      expect(checkCells.length).toBe(count);

      // Clique simples na primeira linha
      const startClick = performance.now();
      fireEvent.click(checkCells[0]);
      const clickTime = performance.now() - startClick;

      // Shift-clique na última linha (intervalo de count linhas)
      const startShift = performance.now();
      fireEvent.click(checkCells[count - 1], { shiftKey: true });
      const shiftTime = performance.now() - startShift;

      console.log(`[Ledger ${count} itens] Render inicial: ${initialRenderTime.toFixed(2)}ms | Clique simples: ${clickTime.toFixed(2)}ms | Shift-clique (${count} linhas): ${shiftTime.toFixed(2)}ms`);

      unmount();
    });
  }

  it('mede desempenho no modo VIRTUALIZADO (com viewport real no Electron/Chromium) para 5000 itens', () => {
    const entries = generateMockEntries(5000);

    // Mock clientHeight on HTMLDivElement to activate virtualization
    const origClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return 600;
      },
    });

    const startRender = performance.now();
    const { container, unmount } = render(
      <Ledger
        title="PIX SOBRANDO"
        kind="sobra"
        entries={entries}
        onEdit={() => {}}
        onInlineSave={() => {}}
        onToggleStatus={() => {}}
        onDelete={() => {}}
      />
    );
    const virtualRenderTime = performance.now() - startRender;

    const renderedRows = container.querySelectorAll('tbody tr[id^="report-row-"]');
    const startClick = performance.now();
    const checkCells = container.querySelectorAll('.rp-check-cell');
    if (checkCells.length > 0) {
      fireEvent.click(checkCells[0]);
    }
    const virtualClickTime = performance.now() - startClick;

    console.log(`[Ledger 5000 itens VIRTUALIZADO] Render inicial: ${virtualRenderTime.toFixed(2)}ms | Linhas reais no DOM: ${renderedRows.length} de 5000 | Clique: ${virtualClickTime.toFixed(2)}ms`);

    if (origClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', origClientHeight);
    } else {
      delete (HTMLElement.prototype as any).clientHeight;
    }

    unmount();
  });
});
