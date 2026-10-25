import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PendentesPanel } from './PendentesPanel';
import type { PixTransaction } from '../services/statementParser';

const mockPendentes: PixTransaction[] = [
  {
    id: 'p_1',
    rowNumber: 1,
    historico: 'CRED PIX CHAVE',
    documento: '010523',
    valor: 15.0,
    valorCentavos: 1500,
    rawValor: '15,00',
    formattedBr: '15,00',
    dia: 'DIA 01',
    horario: '05:23',
    isPix: true,
  },
  {
    id: 'p_2',
    rowNumber: 2,
    historico: 'PIX RECEBIDO DADOS CONTA',
    documento: '020830',
    valor: 35.0,
    valorCentavos: 3500,
    rawValor: '35,00',
    formattedBr: '35,00',
    dia: 'DIA 02',
    horario: '08:30',
    isPix: true,
  },
];

describe('PendentesPanel Component', () => {
  it('renders pendentes rows with spreadsheet aesthetics and no checkboxes', () => {
    render(<PendentesPanel pendentes={mockPendentes} />);

    expect(screen.getByText('Pendentes')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // count badge

    // Checkboxes should not exist in pendentes panel
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    // Values rendered
    expect(screen.getByText('15,00')).toBeInTheDocument();
    expect(screen.getByText('35,00')).toBeInTheDocument();
  });

  it('supports row selection and calculates financial summary in pendentes panel', () => {
    render(<PendentesPanel pendentes={mockPendentes} />);

    // Initially no summary
    expect(screen.queryByText('Resumo da Seleção:')).not.toBeInTheDocument();

    // Click row 1
    const row1 = document.getElementById('tx-pendente-p_1')!;
    fireEvent.click(row1);

    expect(row1.className).toContain('border-l-sky-600');
    expect(screen.getByText('Resumo da Seleção:')).toBeInTheDocument();
    const summaryContainer1 = screen.getByText('Resumo da Seleção:').closest('div')!;
    expect(summaryContainer1).toHaveTextContent('Valor Total: R$ 15,00 | Contagem: 1 | Média: R$ 15,00');

    // Ctrl+click row 2 (35.00) -> Total = 50.00, Count = 2, Média = 25.00
    const row2 = document.getElementById('tx-pendente-p_2')!;
    fireEvent.click(row2, { ctrlKey: true });

    const summaryContainer2 = screen.getByText('Resumo da Seleção:').closest('div')!;
    expect(summaryContainer2).toHaveTextContent('Valor Total: R$ 50,00 | Contagem: 2 | Média: R$ 25,00');

    // Click clear selection button
    const clearBtn = screen.getByText('Limpar seleção (Esc)');
    fireEvent.click(clearBtn);

    expect(screen.queryByText('Resumo da Seleção:')).not.toBeInTheDocument();
  });
});
