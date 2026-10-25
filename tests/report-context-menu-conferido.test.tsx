import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { Ledger, RelatorioModule } from '../src/modules/relatorio/RelatorioModule';

const mockEntries = [
  { id: 'item-1', dia: 1, valor: 100.0, tipo: 'falta', status: 'pendente', cliente: 'Cliente A', funcionario: 'Ana' },
  { id: 'item-2', dia: 1, valor: 150.0, tipo: 'falta', status: 'conferido', cliente: 'Cliente B', funcionario: 'Bia' },
  { id: 'item-3', dia: 2, valor: 200.0, tipo: 'falta', status: 'pendente', cliente: 'Cliente C', funcionario: 'Carlos' },
  { id: 'item-4', dia: 2, valor: 250.0, tipo: 'falta', status: 'conferido', cliente: 'Cliente D', funcionario: 'Daniel' },
];

afterEach(() => cleanup());

describe('1. Contraste Visual dos Lançamentos Conferidos e Selecionados', () => {
  it('garante as classes CSS adequadas para pendente/conferido e selecionado/não-selecionado', () => {
    const { container } = render(
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

    const row1 = document.getElementById('report-row-item-1')!;
    const row2 = document.getElementById('report-row-item-2')!;

    // 1. Pendente não selecionado: não possui is-conferido nem is-selected
    expect(row1).not.toHaveClass('is-conferido');
    expect(row1).not.toHaveClass('is-selected');

    // 2. Conferido não selecionado: possui is-conferido e não is-selected
    expect(row2).toHaveClass('is-conferido');
    expect(row2).not.toHaveClass('is-selected');

    // Clica na célula de seleção do item-1 (pendente)
    const checkCells = container.querySelectorAll('.rp-check-cell');
    fireEvent.click(checkCells[0]);

    // 3. Pendente selecionado: possui is-selected e não is-conferido
    expect(row1).toHaveClass('is-selected');
    expect(row1).not.toHaveClass('is-conferido');

    // Ctrl+clique no item-2 (conferido)
    fireEvent.click(checkCells[1], { ctrlKey: true });

    // 4. Conferido selecionado: possui simultaneamente is-conferido e is-selected
    expect(row2).toHaveClass('is-conferido');
    expect(row2).toHaveClass('is-selected');
  });

  it('preserva diferenciação em intervalo misto selecionado com Shift', () => {
    const { container } = render(
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

    const checkCells = container.querySelectorAll('.rp-check-cell');
    // Clica no item-1 como âncora
    fireEvent.click(checkCells[0]);
    // Shift+clique no item-4 para selecionar todo o intervalo [item-1 .. item-4]
    fireEvent.click(checkCells[3], { shiftKey: true });

    const row1 = document.getElementById('report-row-item-1')!;
    const row2 = document.getElementById('report-row-item-2')!;
    const row3 = document.getElementById('report-row-item-3')!;
    const row4 = document.getElementById('report-row-item-4')!;

    // Todas as 4 linhas estão selecionadas
    expect(row1).toHaveClass('is-selected');
    expect(row2).toHaveClass('is-selected');
    expect(row3).toHaveClass('is-selected');
    expect(row4).toHaveClass('is-selected');

    // Linhas pendentes mantêm apenas is-selected (sem is-conferido)
    expect(row1).not.toHaveClass('is-conferido');
    expect(row3).not.toHaveClass('is-conferido');

    // Linhas conferidas mantêm is-conferido juntamente com is-selected
    expect(row2).toHaveClass('is-conferido');
    expect(row4).toHaveClass('is-conferido');
  });

  it('verifica que relatorio.css define amarelo (#fef3c7) para pendente selecionado e azul (#e0f2fe) para conferido selecionado', () => {
    const cssPath = path.join(__dirname, '../src/modules/relatorio/relatorio.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Confirma que conferido não selecionado permanece o verde original #dcfce7
    expect(css).toMatch(/\.rp-ledger\s+tbody\s+tr\.is-conferido\s+td\s*\{[^}]*background-color:\s*#dcfce7/);

    // Confirma que NÃO conferido (pendente) selecionado utiliza amarelo-claro #fef3c7 com borda #d97706
    expect(css).toMatch(/\.rp-ledger\s+tbody\s+tr\.is-selected\s+td\s*\{[^}]*background-color:\s*#fef3c7/);
    expect(css).toMatch(/\.rp-ledger\s+tbody\s+tr\.is-selected\s+td:first-child\s*\{[^}]*border-left:\s*3px\s+solid\s+#d97706/);

    // Confirma que CONFERIDO selecionado utiliza azul-claro #e0f2fe com borda #0284c7
    expect(css).toMatch(/\.rp-ledger\s+tbody\s+tr\.is-conferido\.is-selected\s+td\s*\{[^}]*background-color:\s*#e0f2fe/);
    expect(css).toMatch(/\.rp-ledger\s+tbody\s+tr\.is-conferido\.is-selected\s+td:first-child\s*\{[^}]*border-left:\s*3px\s+solid\s+#0284c7/);
  });
});

describe('2. Ajuste do Menu de Contexto (Individual vs. Múltiplo)', () => {
  it('item único pendente: exibe "Marcar como conferido", "Editar lançamento" e "Excluir lançamento"', () => {
    const onMarkAsConferido = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={onEdit}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onMarkAsConferido={onMarkAsConferido}
        onDelete={onDelete}
      />
    );

    const row1 = document.getElementById('report-row-item-1')!;
    fireEvent.contextMenu(row1, { clientX: 100, clientY: 100 });

    // Menu contextual deve conter "Marcar como conferido"
    const markBtn = screen.getByRole('button', { name: 'Marcar como conferido' });
    expect(markBtn).toBeInTheDocument();

    // Menu contextual deve conter "Editar lançamento"
    const editBtn = screen.getByRole('button', { name: 'Editar lançamento' });
    expect(editBtn).toBeInTheDocument();

    // Menu contextual deve conter "Excluir lançamento"
    const deleteBtn = screen.getByRole('button', { name: 'Excluir lançamento' });
    expect(deleteBtn).toBeInTheDocument();

    // Clica em "Marcar como conferido"
    fireEvent.click(markBtn);
    expect(onMarkAsConferido).toHaveBeenCalledWith([mockEntries[0]]);
  });

  it('item único conferido: NÃO exibe "Marcar como conferido", mas mantém "Editar" e "Excluir"', () => {
    render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onMarkAsConferido={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const row2 = document.getElementById('report-row-item-2')!; // row2 é status: 'conferido'
    fireEvent.contextMenu(row2, { clientX: 100, clientY: 100 });

    // NÃO deve exibir opção de marcar como conferido pois já está conferido
    expect(screen.queryByRole('button', { name: /marcar como conferido/i })).not.toBeInTheDocument();

    // Mantém as demais opções individuais
    expect(screen.getByRole('button', { name: 'Editar lançamento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir lançamento' })).toBeInTheDocument();
  });

  it('múltiplos itens selecionados pendentes: NÃO exibe "Editar lançamento" e exibe "Marcar como conferidos"', () => {
    const onMarkAsConferido = vi.fn();
    const { container } = render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onMarkAsConferido={onMarkAsConferido}
        onDelete={vi.fn()}
      />
    );

    const checkCells = container.querySelectorAll('.rp-check-cell');
    // Seleciona item-1 (pendente)
    fireEvent.click(checkCells[0]);
    // Ctrl+clique no item-3 (pendente)
    fireEvent.click(checkCells[2], { ctrlKey: true });

    const row3 = document.getElementById('report-row-item-3')!;
    fireEvent.contextMenu(row3, { clientX: 150, clientY: 150 });

    // Cabeçalho plural
    expect(screen.getByText('2 lançamentos selecionados')).toBeInTheDocument();

    // "Editar lançamento" DEVE ser removido completamente
    expect(screen.queryByRole('button', { name: /editar lançamento/i })).not.toBeInTheDocument();

    // "Marcar como conferidos" deve estar presente no plural
    const markBtn = screen.getByRole('button', { name: 'Marcar como conferidos' });
    expect(markBtn).toBeInTheDocument();

    // Exclusão múltipla preservada
    expect(screen.getByRole('button', { name: 'Excluir 2 lançamentos selecionados' })).toBeInTheDocument();

    // Clica em "Marcar como conferidos"
    fireEvent.click(markBtn);
    expect(onMarkAsConferido).toHaveBeenCalledWith([mockEntries[0], mockEntries[2]]);
  });

  it('seleção mista (pendentes + conferidos): aplica "Marcar como conferidos" APENAS aos pendentes', () => {
    const onMarkAsConferido = vi.fn();
    const { container } = render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onMarkAsConferido={onMarkAsConferido}
        onDelete={vi.fn()}
      />
    );

    const checkCells = container.querySelectorAll('.rp-check-cell');
    // Seleciona item-1 (pendente), item-2 (conferido) e item-3 (pendente)
    fireEvent.click(checkCells[0]);
    fireEvent.click(checkCells[1], { ctrlKey: true });
    fireEvent.click(checkCells[2], { ctrlKey: true });

    const row1 = document.getElementById('report-row-item-1')!;
    fireEvent.contextMenu(row1, { clientX: 100, clientY: 100 });

    expect(screen.getByText('3 lançamentos selecionados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar lançamento/i })).not.toBeInTheDocument();

    const markBtn = screen.getByRole('button', { name: 'Marcar como conferidos' });
    expect(markBtn).toBeInTheDocument();

    fireEvent.click(markBtn);

    // Deve enviar estritamente item-1 e item-3 para conferência, ignorando item-2 que já estava conferido
    expect(onMarkAsConferido).toHaveBeenCalledWith([mockEntries[0], mockEntries[2]]);
  });

  it('todos os itens selecionados já conferidos: NÃO exibe "Marcar como conferidos"', () => {
    const { container } = render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onMarkAsConferido={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const checkCells = container.querySelectorAll('.rp-check-cell');
    // Seleciona item-2 (conferido) e item-4 (conferido)
    fireEvent.click(checkCells[1]);
    fireEvent.click(checkCells[3], { ctrlKey: true });

    const row2 = document.getElementById('report-row-item-2')!;
    fireEvent.contextMenu(row2, { clientX: 100, clientY: 100 });

    expect(screen.getByText('2 lançamentos selecionados')).toBeInTheDocument();

    // Como todos os itens já estão conferidos, "Marcar como conferidos" NÃO deve ser exibido
    expect(screen.queryByRole('button', { name: /marcar como conferido/i })).not.toBeInTheDocument();

    // "Editar lançamento" também não deve aparecer na seleção múltipla
    expect(screen.queryByRole('button', { name: /editar lançamento/i })).not.toBeInTheDocument();

    // Apenas a exclusão múltipla é exibida
    expect(screen.getByRole('button', { name: 'Excluir 2 lançamentos selecionados' })).toBeInTheDocument();
  });
});

describe('3. Integração com RelatorioModule e Persistência em Lote', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      report: {
        getLancamentos: vi.fn().mockResolvedValue([
          { id: 'rel-1', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 5, tipo: 'falta', valor: 100.0, cliente: 'Cliente 1', funcionario: 'Ana', status: 'pendente', observacoes: 'Obs 1' },
          { id: 'rel-2', loterica: 'CAÇULA', ano: 2026, mes: 10, dia: 5, tipo: 'falta', valor: 200.0, cliente: 'Cliente 2', funcionario: 'Bia', status: 'pendente', observacoes: '' },
        ]),
        getDaysWithEntries: vi.fn().mockResolvedValue([5]),
        getFuncionarios: vi.fn().mockResolvedValue(['Ana', 'Bia']),
        getOfficialBaseInfo: vi.fn().mockResolvedValue(null),
        getSyncStatus: vi.fn().mockResolvedValue({ status: 'Conectado' }),
        getSyncConfig: vi.fn().mockResolvedValue({}),
        getPendingUpdates: vi.fn().mockResolvedValue([]),
        getConflicts: vi.fn().mockResolvedValue([]),
        toggleStatus: vi.fn().mockResolvedValue(true),
        deleteLancamento: vi.fn().mockResolvedValue(true),
        onSyncStatus: vi.fn().mockReturnValue(() => {}),
        onRemoteUpdate: vi.fn().mockReturnValue(() => {}),
      },
      events: {
        onDomainChanged: vi.fn().mockReturnValue(() => {}),
      },
      shell: {
        getState: vi.fn().mockResolvedValue({ minimizeToTray: false }),
        setMinimizeToTray: vi.fn().mockResolvedValue(true),
      },
      dialog: {
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
        saveFile: vi.fn().mockResolvedValue(true),
      },
    };
  });

  it('persiste a marcação em lote via electronAPI.report.toggleStatus e atualiza interface', async () => {
    const toggleStatusSpy = (window as any).electronAPI.report.toggleStatus;

    render(<RelatorioModule workspaceId="test-ws" isActive={true} />);

    // Aguarda carregamento dos lançamentos
    await waitFor(() => {
      expect(document.getElementById('report-row-rel-1')).toBeInTheDocument();
      expect(document.getElementById('report-row-rel-2')).toBeInTheDocument();
    });

    const checkCells = document.querySelectorAll('.rp-ledger.falta .rp-check-cell');
    expect(checkCells.length).toBe(2);

    // Seleciona as duas linhas
    fireEvent.click(checkCells[0]);
    fireEvent.click(checkCells[1], { ctrlKey: true });

    // Abre menu de contexto
    const row1 = document.getElementById('report-row-rel-1')!;
    fireEvent.contextMenu(row1, { clientX: 100, clientY: 100 });

    const markBtn = screen.getByRole('button', { name: 'Marcar como conferidos' });
    expect(markBtn).toBeInTheDocument();

    // Clica em "Marcar como conferidos"
    fireEvent.click(markBtn);

    // Deve chamar toggleStatus para os dois itens com 'conferido'
    await waitFor(() => {
      expect(toggleStatusSpy).toHaveBeenCalledWith('rel-1', 'conferido', 'Obs 1');
      expect(toggleStatusSpy).toHaveBeenCalledWith('rel-2', 'conferido', '');
    });
  });
});
