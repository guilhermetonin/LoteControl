import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompactFilterSummary } from './CompactFilterSummary';
import type { ConferenceStats } from '../hooks/useConference';

const mockStats: ConferenceStats = {
  totalCount: 100,
  conferidosCount: 40,
  pendentesCount: 60,
  percentCompleted: 40,
  totalCentavos: 100000,
  conferidosCentavos: 40000,
  pendentesCentavos: 60000,
  totalValor: 1000.0,
  conferidosValor: 400.0,
  pendentesValor: 600.0,
};

describe('CompactFilterSummary Component', () => {
  it('renders indicators correctly and starts with the filter panel collapsed', () => {
    render(
      <CompactFilterSummary
        stats={mockStats}
        selectedDia="TODOS"
        onSelectDia={vi.fn()}
        availableDias={['DIA 01', 'DIA 02', 'DIA 03']}
        selectedHistoricos={new Set(['CRED PIX CHAVE', 'PIX RECEBIDO DADOS CONTA'])}
        onToggleHistorico={vi.fn()}
        onSelectAllHistoricos={vi.fn()}
        onClearAllHistoricos={vi.fn()}
        availableHistoricos={['CRED PIX CHAVE', 'PIX RECEBIDO DADOS CONTA']}
        initialSelectedHistoricos={['CRED PIX CHAVE']}
      />
    );

    // Indicators visible
    expect(screen.getByText('Todos os dias')).toBeInTheDocument();
    expect(screen.getByText('100 lançamentos')).toBeInTheDocument();
    expect(screen.getByText('40 conferidos')).toBeInTheDocument();
    expect(screen.getByText('60 pendentes')).toBeInTheDocument();

    // Expandable content should NOT be in the document initially
    expect(screen.queryByText('Filtrar por Dia')).not.toBeInTheDocument();
    expect(screen.queryByText('Históricos de PIX')).not.toBeInTheDocument();
  });

  it('expands on chevron button click and displays day badges and history pills', () => {
    const handleSelectDia = vi.fn();
    const handleToggleHistorico = vi.fn();
    const handleSelectAllHist = vi.fn();
    const handleClearAllHist = vi.fn();

    render(
      <CompactFilterSummary
        stats={mockStats}
        selectedDia="TODOS"
        onSelectDia={handleSelectDia}
        availableDias={['DIA 01', 'DIA 02', 'DIA 03']}
        selectedHistoricos={new Set(['CRED PIX CHAVE'])}
        onToggleHistorico={handleToggleHistorico}
        onSelectAllHistoricos={handleSelectAllHist}
        onClearAllHistoricos={handleClearAllHist}
        availableHistoricos={['CRED PIX CHAVE', 'PIX RECEBIDO DADOS CONTA']}
        initialSelectedHistoricos={['CRED PIX CHAVE']}
      />
    );

    // Click toggle button to expand
    const toggleBtn = screen.getByRole('button', { name: /expandir filtros/i });
    fireEvent.click(toggleBtn);

    // Now day and history sections are visible
    expect(screen.getByText('Filtrar por Dia')).toBeInTheDocument();
    expect(screen.getByText('Históricos de PIX')).toBeInTheDocument();

    // Verify day badges
    expect(screen.getByRole('button', { name: 'DIA 01' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DIA 02' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DIA 03' })).toBeInTheDocument();

    // Click DIA 02
    fireEvent.click(screen.getByRole('button', { name: 'DIA 02' }));
    expect(handleSelectDia).toHaveBeenCalledWith('DIA 02');

    // Click history pill
    fireEvent.click(screen.getByText('PIX RECEBIDO DADOS CONTA'));
    expect(handleToggleHistorico).toHaveBeenCalledWith('PIX RECEBIDO DADOS CONTA');

    // Quick history action buttons
    fireEvent.click(screen.getByText('Marcar todos'));
    expect(handleSelectAllHist).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Desmarcar todos'));
    expect(handleClearAllHist).toHaveBeenCalledTimes(1);

    // Clicking toggle button again collapses the panel
    const collapseBtn = screen.getByRole('button', { name: /recolher filtros/i });
    fireEvent.click(collapseBtn);
    expect(screen.queryByText('Filtrar por Dia')).not.toBeInTheDocument();
  });

  it('highlights selected day badge correctly', () => {
    render(
      <CompactFilterSummary
        stats={mockStats}
        selectedDia="DIA 02"
        onSelectDia={vi.fn()}
        availableDias={['DIA 01', 'DIA 02']}
        selectedHistoricos={new Set(['CRED PIX CHAVE'])}
        onToggleHistorico={vi.fn()}
        onSelectAllHistoricos={vi.fn()}
        onClearAllHistoricos={vi.fn()}
        availableHistoricos={['CRED PIX CHAVE']}
      />
    );

    // Open panel
    fireEvent.click(screen.getByRole('button', { name: /expandir filtros/i }));

    const dia2Btns = screen.getAllByRole('button', { name: 'DIA 02' });
    // The badge in the expandable panel is highlighted
    const badgeInPanel = dia2Btns[dia2Btns.length - 1];
    expect(badgeInPanel.className).toContain('bg-rose-900');
    expect(badgeInPanel.className).toContain('text-white');
  });
});
