import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CompactFilterSummary } from './CompactFilterSummary';

const historicos = ['CRED PIX CHAVE', 'CRED PIX QR COD DIN', 'PIX MANUAL DE DADOS'];

function renderFilters(overrides: Record<string, unknown> = {}) {
  const props = {
    selectedDia: 'TODOS',
    onSelectDia: vi.fn(),
    availableDias: ['DIA 01', 'DIA 02', 'DIA 28'],
    selectedHistoricos: new Set(['CRED PIX CHAVE', 'PIX MANUAL DE DADOS']),
    onToggleHistorico: vi.fn(),
    onSelectAllHistoricos: vi.fn(),
    onClearAllHistoricos: vi.fn(),
    availableHistoricos: historicos,
    initialSelectedHistoricos: ['CRED PIX CHAVE', 'PIX MANUAL DE DADOS'],
    ...overrides,
  };
  return { ...render(<CompactFilterSummary {...props as any} />), props };
}

describe('CompactFilterSummary dropdown filters', () => {
  it('renders the day selector, history selector, and removable selected tags in one row', () => {
    renderFilters();
    expect(screen.getByRole('button', { name: 'Todos os dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Históricos de Pix' })).toBeInTheDocument();
    expect(screen.queryByText(/lançamentos exibidos/)).not.toBeInTheDocument();
    expect(document.querySelector('.pix-compact-filter-summary')).toBeInTheDocument();
    expect(document.querySelector('.pix-compact-filter-summary')?.classList.contains('rounded-2xl')).toBe(false);
    expect(screen.getByRole('button', { name: 'Remover CRED PIX CHAVE' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the checkbox dropdown with dynamic options and select-all actions', () => {
    const { props } = renderFilters();
    fireEvent.click(screen.getByRole('button', { name: 'Históricos de Pix' }));
    const menu = screen.getByRole('dialog', { name: 'Históricos de Pix' });
    expect(within(menu).getByRole('checkbox', { name: /CRED PIX CHAVE/ })).toBeChecked();
    expect(within(menu).getByRole('checkbox', { name: /CRED PIX QR COD DIN/ })).not.toBeChecked();
    fireEvent.click(within(menu).getByRole('checkbox', { name: /CRED PIX QR COD DIN/ }));
    expect(props.onToggleHistorico).toHaveBeenCalledWith('CRED PIX QR COD DIN');
    fireEvent.click(within(menu).getByRole('button', { name: 'Marcar todos' }));
    fireEvent.click(within(menu).getByRole('button', { name: 'Desmarcar todos' }));
    expect(props.onSelectAllHistoricos).toHaveBeenCalledOnce();
    expect(props.onClearAllHistoricos).toHaveBeenCalledOnce();
  });

  it('opens the calendar under the day selector and never keeps the history menu open with it', () => {
    const { props } = renderFilters();
    fireEvent.click(screen.getByRole('button', { name: 'Históricos de Pix' }));
    expect(screen.getByRole('dialog', { name: 'Históricos de Pix' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Todos os dias' }));
    expect(screen.queryByRole('dialog', { name: 'Históricos de Pix' })).not.toBeInTheDocument();
    const calendar = screen.getByRole('dialog', { name: 'Selecionar dia' });
    expect(within(calendar).getByRole('button', { name: '02' })).toHaveClass('has-data');
    fireEvent.click(within(calendar).getByRole('button', { name: '02' }));
    expect(props.onSelectDia).toHaveBeenCalledWith('DIA 02');
    fireEvent.click(screen.getByRole('button', { name: 'Históricos de Pix' }));
    expect(screen.queryByRole('dialog', { name: 'Selecionar dia' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Históricos de Pix' })).toBeInTheDocument();
  });
});
