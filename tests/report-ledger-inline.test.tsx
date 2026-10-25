import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Ledger } from '../src/modules/relatorio/RelatorioModule';

const entry = {
  id: 'report-1', dia: 7, valor: 25.5, tipo: 'sobra', status: 'pendente',
  cliente: 'Caixa', funcionario: 'Ana', observacoes: 'Conferir comprovante',
};

afterEach(() => cleanup());

describe('edição rápida inline do Relatório', () => {
  it('mantem as tres colunas de dados e a coluna da checkbox sem titulo', () => {
    render(<Ledger title="PIX Sobrando" kind="sobra" entries={[entry]} onEdit={vi.fn()} onInlineSave={vi.fn()} onConfirm={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['VALOR', 'DESCRI\u00c7\u00c3O', 'FUNCION\u00c1RIO', '']);
    expect(screen.queryByText('Conferir comprovante')).not.toBeInTheDocument();
  });

  it('entra na edição ao clicar uma vez na célula e salva apenas o campo editado', async () => {
    const onInlineSave = vi.fn().mockResolvedValue(true);
    render(<Ledger title="PIX Sobrando" kind="sobra" entries={[entry]} onEdit={vi.fn()} onInlineSave={onInlineSave} onConfirm={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByText('Caixa').closest('td')!);
    const input = screen.getByRole('textbox', { name: 'Descrição' });
    expect(input).toHaveValue('Caixa');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    fireEvent.change(input, { target: { value: 'Caixa atualizado' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onInlineSave).toHaveBeenCalledWith(entry, {
      dia: '7', valor: '25,50', cliente: 'Caixa atualizado', funcionario: 'Ana',
    }));
  });

  it.each([
    ['Valor', 'R$ 25,50', '27,00', { dia: '7', valor: '27,00', cliente: 'Caixa', funcionario: 'Ana' }],
    ['Funcionário', 'Ana', 'Bia', { dia: '7', valor: '25,50', cliente: 'Caixa', funcionario: 'Bia' }],
  ])('também edita %s diretamente com um clique', async (field, cellText, value, expected) => {
    const onInlineSave = vi.fn().mockResolvedValue(true);
    render(<Ledger title="PIX Sobrando" kind="sobra" entries={[entry]} onEdit={vi.fn()} onInlineSave={onInlineSave} onConfirm={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />);
    const cell = field === 'Valor' ? screen.getByRole('button', { name: /^Valor:/ }) : screen.getByText(cellText);
    fireEvent.click(cell.closest('td')!);
    const input = screen.getByRole('textbox', { name: field });
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onInlineSave).toHaveBeenCalledWith(entry, expected));
  });

  it('cancela uma célula em edição com Escape sem persistir', () => {
    const onInlineSave = vi.fn();
    render(<Ledger title="PIX Sobrando" kind="sobra" entries={[entry]} onEdit={vi.fn()} onInlineSave={onInlineSave} onConfirm={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByText('Ana').closest('td')!);
    const input = screen.getByRole('textbox', { name: 'Funcionário' });
    fireEvent.change(input, { target: { value: 'Alteração temporária' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onInlineSave).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Funcionário' })).not.toBeInTheDocument();
  });

  it('alterna conferido diretamente no checkbox de Ações sem abrir o modal detalhado', () => {
    const onToggleStatus = vi.fn();
    const onConfirm = vi.fn();
    render(<Ledger title="PIX Sobrando" kind="sobra" entries={[entry]} onEdit={vi.fn()} onInlineSave={vi.fn()} onConfirm={onConfirm} onToggleStatus={onToggleStatus} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Marcar como conferido' }));
    expect(onToggleStatus).toHaveBeenCalledWith(entry);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
