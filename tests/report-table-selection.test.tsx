import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { Ledger } from '../src/modules/relatorio/RelatorioModule';
import { useRelatorioTableSelection } from '../src/modules/relatorio/useRelatorioTableSelection';

const mockEntries = [
  { id: 'item-1', dia: 1, valor: 100.0, tipo: 'falta', status: 'pendente', cliente: 'Cliente A', funcionario: 'Ana' },
  { id: 'item-2', dia: 1, valor: 100.0, tipo: 'falta', status: 'pendente', cliente: 'Cliente B', funcionario: 'Bia' },
  { id: 'item-3', dia: 3, valor: 50.0, tipo: 'falta', status: 'pendente', cliente: 'Cliente C', funcionario: 'Carlos' },
  { id: 'item-4', dia: 3, valor: 50.0, tipo: 'falta', status: 'pendente', cliente: 'Cliente D', funcionario: 'Daniel' },
];

afterEach(() => cleanup());

describe('useRelatorioTableSelection (Hook de seleção do Relatório)', () => {
  it('seleciona uma linha individualmente e define a âncora', () => {
    const { result } = renderHook(() => useRelatorioTableSelection(mockEntries));

    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'item-1');
    });

    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has('item-1')).toBe(true);
    expect(result.current.anchorId).toBe('item-1');
    expect(result.current.summary?.count).toBe(1);
    expect(result.current.summary?.totalValor).toBe(100.0);

    // Clique normal em outro item substitui a seleção anterior
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'item-2');
    });

    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has('item-1')).toBe(false);
    expect(result.current.selectedIds.has('item-2')).toBe(true);
    expect(result.current.anchorId).toBe('item-2');
  });

  it('permite seleção individual múltipla com Ctrl, inclusive entre dias diferentes', () => {
    const { result } = renderHook(() => useRelatorioTableSelection(mockEntries));

    // Seleciona duas linhas do dia 1
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'item-1');
    });
    act(() => {
      result.current.handleRowClick({ ctrlKey: true, metaKey: false, shiftKey: false } as any, 'item-2');
    });

    expect(result.current.selectedIds.size).toBe(2);
    expect(result.current.summary?.count).toBe(2);
    expect(result.current.summary?.totalValor).toBe(200.0);

    // Mantém Ctrl pressionado e seleciona duas linhas do dia 3
    act(() => {
      result.current.handleRowClick({ ctrlKey: true, metaKey: false, shiftKey: false } as any, 'item-3');
    });
    act(() => {
      result.current.handleRowClick({ ctrlKey: true, metaKey: false, shiftKey: false } as any, 'item-4');
    });

    // As quatro linhas de dias diferentes devem permanecer selecionadas simultaneamente
    expect(result.current.selectedIds.size).toBe(4);
    expect(result.current.selectedIds.has('item-1')).toBe(true);
    expect(result.current.selectedIds.has('item-2')).toBe(true);
    expect(result.current.selectedIds.has('item-3')).toBe(true);
    expect(result.current.selectedIds.has('item-4')).toBe(true);
    expect(result.current.summary?.count).toBe(4);
    expect(result.current.summary?.totalValor).toBe(300.0);
  });

  it('seleciona por intervalo com Shift respeitando a ordem exibida na tabela', () => {
    const { result } = renderHook(() => useRelatorioTableSelection(mockEntries));

    // 1. Clica no item-1 (dia 1) como âncora
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'item-1');
    });

    // 2. Shift + clique no item-3 (dia 3)
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: true } as any, 'item-3');
    });

    // Deve selecionar item-1, item-2 e item-3
    expect(result.current.selectedIds.size).toBe(3);
    expect(result.current.selectedIds.has('item-1')).toBe(true);
    expect(result.current.selectedIds.has('item-2')).toBe(true);
    expect(result.current.selectedIds.has('item-3')).toBe(true);
    expect(result.current.selectedIds.has('item-4')).toBe(false);
    expect(result.current.summary?.count).toBe(3);
    expect(result.current.summary?.totalValor).toBe(250.0);

    // Âncora permanece em item-1 (permite expandir ou encolher)
    expect(result.current.anchorId).toBe('item-1');

    // 3. Shift + clique no item-4 expande até o final
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: true } as any, 'item-4');
    });

    expect(result.current.selectedIds.size).toBe(4);
    expect(result.current.summary?.count).toBe(4);
    expect(result.current.summary?.totalValor).toBe(300.0);
  });

  it('permite combinar Ctrl e Shift', () => {
    const { result } = renderHook(() => useRelatorioTableSelection(mockEntries));

    // Seleciona item-1
    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'item-1');
    });

    // Ctrl+click em item-3 define nova âncora em item-3
    act(() => {
      result.current.handleRowClick({ ctrlKey: true, metaKey: false, shiftKey: false } as any, 'item-3');
    });

    // Ctrl+Shift+click em item-4 adiciona o intervalo [item-3, item-4] sem limpar item-1
    act(() => {
      result.current.handleRowClick({ ctrlKey: true, metaKey: false, shiftKey: true } as any, 'item-4');
    });

    expect(result.current.selectedIds.size).toBe(3);
    expect(result.current.selectedIds.has('item-1')).toBe(true);
    expect(result.current.selectedIds.has('item-3')).toBe(true);
    expect(result.current.selectedIds.has('item-4')).toBe(true);
    expect(result.current.summary?.count).toBe(3);
    expect(result.current.summary?.totalValor).toBe(200.0);
  });

  it('limpa seleção ao chamar clearSelection()', () => {
    const { result } = renderHook(() => useRelatorioTableSelection(mockEntries));

    act(() => {
      result.current.handleRowClick({ ctrlKey: false, metaKey: false, shiftKey: false } as any, 'item-1');
    });
    expect(result.current.summary).not.toBeNull();

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.anchorId).toBeNull();
    expect(result.current.summary).toBeNull();
  });
});

describe('Integração de Seleção Múltipla no Ledger do Relatório', () => {
  it('aciona a seleção ao clicar na área da célula da checkbox (fora do input)', () => {
    render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // O menu contextual não deve existir inicialmente
    expect(screen.queryByRole('region', { name: /resumo da seleção/i })).not.toBeInTheDocument();

    // Localiza a célula da checkbox da primeira linha
    const checkCells = document.querySelectorAll('.rp-check-cell');
    expect(checkCells.length).toBe(4);

    // Clica na célula (área quadrada), mas fora do input da checkbox
    fireEvent.click(checkCells[0]);

    // O menu contextual de seleção deve aparecer com Quantidade: 1 e Total correspondente
    const summary = screen.getByRole('region', { name: /resumo da seleção/i });
    expect(summary).toBeInTheDocument();
    expect(summary.textContent).toContain('Quantidade: 1');
    expect(summary.textContent).toContain('Total: R$\xa0100,00');

    // A linha correspondente deve ter a classe de seleção
    const row1 = document.getElementById('report-row-item-1');
    expect(row1).toHaveClass('is-selected');
  });

  it('clicar diretamente na checkbox altera status e NÃO interfere na seleção', () => {
    const onToggleStatus = vi.fn();
    render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={onToggleStatus}
        onDelete={vi.fn()}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox', { name: 'Marcar como conferido' });
    expect(checkboxes.length).toBe(4);

    // Clica diretamente no checkbox do item-1
    fireEvent.click(checkboxes[0]);

    // onToggleStatus deve ter sido chamado com item-1
    expect(onToggleStatus).toHaveBeenCalledWith(mockEntries[0]);

    // O menu contextual de seleção NÃO deve aparecer porque o clique foi no checkbox
    expect(screen.queryByRole('region', { name: /resumo da seleção/i })).not.toBeInTheDocument();

    const row1 = document.getElementById('report-row-item-1');
    expect(row1).not.toHaveClass('is-selected');
  });

  it('permite selecionar múltiplas linhas de dias diferentes com Ctrl e exibe total acumulado', () => {
    render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const checkCells = document.querySelectorAll('.rp-check-cell');

    // 1. Seleciona duas linhas do dia 1 (item-1 e item-2, R$ 100 cada)
    fireEvent.click(checkCells[0]);
    fireEvent.click(checkCells[1], { ctrlKey: true });

    let summary = screen.getByRole('region', { name: /resumo da seleção/i });
    expect(summary.textContent).toContain('Quantidade: 2');
    expect(summary.textContent).toContain('Total: R$\xa0200,00');

    // 2. Mantém Ctrl pressionado e seleciona duas linhas do dia 3 (item-3 e item-4, R$ 50 cada)
    fireEvent.click(checkCells[2], { ctrlKey: true });
    fireEvent.click(checkCells[3], { ctrlKey: true });

    // Todas as 4 linhas devem estar selecionadas simultaneamente
    summary = screen.getByRole('region', { name: /resumo da seleção/i });
    expect(summary.textContent).toContain('Quantidade: 4');
    expect(summary.textContent).toContain('Total: R$\xa0300,00');

    expect(document.getElementById('report-row-item-1')).toHaveClass('is-selected');
    expect(document.getElementById('report-row-item-2')).toHaveClass('is-selected');
    expect(document.getElementById('report-row-item-3')).toHaveClass('is-selected');
    expect(document.getElementById('report-row-item-4')).toHaveClass('is-selected');
  });

  it('permite selecionar intervalo com Shift entre linhas de dias diferentes', () => {
    render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const checkCells = document.querySelectorAll('.rp-check-cell');

    // Clica na linha 1 do dia 1 (R$ 100)
    fireEvent.click(checkCells[0]);

    // Shift + clique na primeira linha do dia 3 (item-3, R$ 50)
    fireEvent.click(checkCells[2], { shiftKey: true });

    // Deve selecionar item-1, item-2 e item-3
    const summary = screen.getByRole('region', { name: /resumo da seleção/i });
    expect(summary.textContent).toContain('Quantidade: 3');
    expect(summary.textContent).toContain('Total: R$\xa0250,00');

    expect(document.getElementById('report-row-item-1')).toHaveClass('is-selected');
    expect(document.getElementById('report-row-item-2')).toHaveClass('is-selected');
    expect(document.getElementById('report-row-item-3')).toHaveClass('is-selected');
    expect(document.getElementById('report-row-item-4')).not.toHaveClass('is-selected');
  });

  it('limpa seleção e fecha o menu ao pressionar Escape ou clicar no botão de limpar', () => {
    render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const checkCells = document.querySelectorAll('.rp-check-cell');
    fireEvent.click(checkCells[0]);

    expect(screen.getByRole('region', { name: /resumo da seleção/i })).toBeInTheDocument();

    // Pressionar Escape limpa a seleção
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('region', { name: /resumo da seleção/i })).not.toBeInTheDocument();
    expect(document.getElementById('report-row-item-1')).not.toHaveClass('is-selected');

    // Seleciona novamente e clica no botão "Limpar seleção (Esc)"
    fireEvent.click(checkCells[0]);
    expect(screen.getByRole('region', { name: /resumo da seleção/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /limpar seleção/i }));
    expect(screen.queryByRole('region', { name: /resumo da seleção/i })).not.toBeInTheDocument();
  });
});
