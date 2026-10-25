import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConferenceList } from './ConferenceList';
import type { PixTransaction } from '../services/statementParser';

function createMockTransactions(): PixTransaction[] {
  return [
    {
      id: 'tx_1',
      rowNumber: 1,
      historico: 'CRED PIX CHAVE',
      documento: '010523',
      valor: 10,
      valorCentavos: 1000,
      rawValor: '10,00',
      formattedBr: '10,00',
      dia: 'DIA 01',
      horario: '05:23',
      isPix: true,
    },
    {
      id: 'tx_2',
      rowNumber: 2,
      historico: 'CRED PIX CHAVE',
      documento: '010524',
      valor: 10,
      valorCentavos: 1000,
      rawValor: '10,00',
      formattedBr: '10,00',
      dia: 'DIA 01',
      horario: '05:24',
      isPix: true,
    },
    {
      id: 'tx_3',
      rowNumber: 3,
      historico: 'CRED PIX CHAVE',
      documento: '010525',
      valor: 10,
      valorCentavos: 1000,
      rawValor: '10,00',
      formattedBr: '10,00',
      dia: 'DIA 01',
      horario: '05:25',
      isPix: true,
    },
    {
      id: 'tx_4',
      rowNumber: 4,
      historico: 'PIX RECEBIDO DADOS CONTA',
      documento: '020830',
      valor: 25.5,
      valorCentavos: 2550,
      rawValor: '25,50',
      formattedBr: '25,50',
      dia: 'DIA 02',
      horario: '08:30',
      isPix: true,
    },
  ];
}

describe('ConferenceList Component & Checkbox Bug Regression Tests', () => {
  it('calls onToggleCheck EXACTLY once when user clicks directly on the checkbox input', () => {
    const txs = createMockTransactions();
    const handleToggle = vi.fn();

    render(
      <ConferenceList
        transactions={txs}
        checkedIds={new Set()}
        onToggleCheck={handleToggle}
        behavior="keep_in_list"
        activeTab="todos"
        onChangeTab={vi.fn()}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(4);

    // Click the first checkbox
    fireEvent.click(checkboxes[0]);

    // MUST be called exactly once (NOT twice due to event bubbling or double handlers)
    expect(handleToggle).toHaveBeenCalledTimes(1);
    expect(handleToggle).toHaveBeenCalledWith('tx_1');
  });

  it('allows clicking the checkbox repeatedly, toggling reliably each time', () => {
    const txs = createMockTransactions();
    let checkedSet = new Set<string>();
    const handleToggle = vi.fn((id: string) => {
      if (checkedSet.has(id)) {
        checkedSet.delete(id);
      } else {
        checkedSet.add(id);
      }
    });

    const { rerender } = render(
      <ConferenceList
        transactions={txs}
        checkedIds={checkedSet}
        onToggleCheck={handleToggle}
        behavior="keep_in_list"
        activeTab="todos"
        onChangeTab={vi.fn()}
      />
    );

    const checkbox = screen.getAllByRole('checkbox')[0];

    // Click 1: Mark
    fireEvent.click(checkbox);
    expect(handleToggle).toHaveBeenCalledTimes(1);
    expect(handleToggle).toHaveBeenLastCalledWith('tx_1');
    expect(checkedSet.has('tx_1')).toBe(true);

    rerender(
      <ConferenceList
        transactions={txs}
        checkedIds={checkedSet}
        onToggleCheck={handleToggle}
        behavior="keep_in_list"
        activeTab="todos"
        onChangeTab={vi.fn()}
      />
    );
    expect(checkbox).toBeChecked();

    // Click 2: Unmark
    fireEvent.click(checkbox);
    expect(handleToggle).toHaveBeenCalledTimes(2);
    expect(handleToggle).toHaveBeenLastCalledWith('tx_1');
    expect(checkedSet.has('tx_1')).toBe(false);

    rerender(
      <ConferenceList
        transactions={txs}
        checkedIds={checkedSet}
        onToggleCheck={handleToggle}
        behavior="keep_in_list"
        activeTab="todos"
        onChangeTab={vi.fn()}
      />
    );
    expect(checkbox).not.toBeChecked();

    // Click 3: Mark again
    fireEvent.click(checkbox);
    expect(handleToggle).toHaveBeenCalledTimes(3);
    expect(checkedSet.has('tx_1')).toBe(true);

    // Click 4: Unmark again
    fireEvent.click(checkbox);
    expect(handleToggle).toHaveBeenCalledTimes(4);
    expect(checkedSet.has('tx_1')).toBe(false);
  });

  it('clicking the row outside the checkbox selects the row without calling onToggleCheck (separation of selection and checking)', () => {
    const txs = createMockTransactions();
    const handleToggle = vi.fn();

    render(
      <ConferenceList
        transactions={txs}
        checkedIds={new Set()}
        onToggleCheck={handleToggle}
        behavior="keep_in_list"
        activeTab="todos"
        onChangeTab={vi.fn()}
      />
    );

    // Click text description of row 1
    const textDesc = screen.getByText('010523', { exact: false });
    fireEvent.click(textDesc);

    // Selecting row does NOT mark the PIX as checked
    expect(handleToggle).not.toHaveBeenCalled();

    // Verify row gets the selected visual class (border-l-sky-600)
    const rowEl = document.getElementById('tx-row-tx_1');
    expect(rowEl?.className).toContain('border-l-sky-600');

    // And financial summary appears
    expect(screen.getByText('Resumo da Seleção:')).toBeInTheDocument();
    expect(screen.getByText(/Valor Total:/)).toBeInTheDocument();
  });

  it('calculates financial summary correctly and displays formatted BRL string upon selection', () => {
    const txs = createMockTransactions();
    // tx_1 = 10.00, tx_2 = 10.00, tx_4 = 25.00
    render(
      <ConferenceList
        transactions={txs}
        checkedIds={new Set()}
        onToggleCheck={vi.fn()}
        behavior="keep_in_list"
        activeTab="todos"
        onChangeTab={vi.fn()}
      />
    );

    // Select row 1
    const row1 = document.getElementById('tx-row-tx_1')!;
    fireEvent.click(row1);

    // Ctrl+click row 4 (valor 25.00)
    const row4 = document.getElementById('tx-row-tx_4')!;
    fireEvent.click(row4, { ctrlKey: true });

    // tx_1 = 10.00, tx_4 = 25.50 -> Total = 35.50, Count = 2, Média = 17.75
    expect(screen.getByText('Resumo da Seleção:')).toBeInTheDocument();
    expect(screen.getByText('R$ 35,50')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('R$ 17,75')).toBeInTheDocument();

    // Clicking "Limpar seleção" clears the summary
    const clearBtn = screen.getByText('Limpar seleção (Esc)');
    fireEvent.click(clearBtn);
    expect(screen.queryByText('Resumo da Seleção:')).not.toBeInTheDocument();
  });

  it('marking a transaction with duplicated values does NOT affect other identical values', () => {
    const txs = createMockTransactions();
    // tx_1, tx_2, tx_3 all have R$ 10,00
    const checked = new Set(['tx_1']);

    render(
      <ConferenceList
        transactions={txs}
        checkedIds={checked}
        onToggleCheck={vi.fn()}
        behavior="keep_in_list"
        activeTab="todos"
        onChangeTab={vi.fn()}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked(); // tx_1
    expect(checkboxes[1]).not.toBeChecked(); // tx_2
    expect(checkboxes[2]).not.toBeChecked(); // tx_3
  });

  it('in "move_to_conferidos" mode with tab "pendentes", checking removes item from pendentes view', () => {
    const txs = createMockTransactions();
    // Initially all 4 pendentes
    const { rerender } = render(
      <ConferenceList
        transactions={txs}
        checkedIds={new Set()}
        onToggleCheck={vi.fn()}
        behavior="move_to_conferidos"
        activeTab="pendentes"
        onChangeTab={vi.fn()}
      />
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(4);

    // Rerender with tx_1 checked -> should display 3 items
    rerender(
      <ConferenceList
        transactions={txs}
        checkedIds={new Set(['tx_1'])}
        onToggleCheck={vi.fn()}
        behavior="move_to_conferidos"
        activeTab="pendentes"
        onChangeTab={vi.fn()}
      />
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.queryByText('Doc: 010523')).toBeNull(); // tx_1 is gone from pendentes!
  });

  it('in "keep_in_list" mode with tab "todos", marked item remains visible with checked state and no textual badge', () => {
    const txs = createMockTransactions();
    render(
      <ConferenceList
        transactions={txs}
        checkedIds={new Set(['tx_1'])}
        onToggleCheck={vi.fn()}
        behavior="keep_in_list"
        activeTab="todos"
        onChangeTab={vi.fn()}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(4);
    expect(checkboxes[0]).toBeChecked();
    expect(screen.getByText('Doc: 010523')).toBeInTheDocument();
    // Confirms badge "Conferido ✓" has been removed per requirement 5
    expect(screen.queryByText('Conferido ✓')).toBeNull();
  });

  it('renders time badges in dedicated fixed-alignment column for both short and long descriptions', () => {
    const txs: PixTransaction[] = [
      {
        id: 'tx_short',
        rowNumber: 1,
        historico: 'CRED PIX CHAVE', // short description
        documento: '010523',
        valor: 10,
        valorCentavos: 1000,
        rawValor: '10,00',
        formattedBr: '10,00',
        dia: 'DIA 01',
        horario: '05:23',
        isPix: true,
      },
      {
        id: 'tx_long',
        rowNumber: 2,
        historico: 'PIX RECEBIDO DADOS CONTA DE PAGAMENTO COMPLETA', // long description
        documento: '020830',
        valor: 25.5,
        valorCentavos: 2550,
        rawValor: '25,50',
        formattedBr: '25,50',
        dia: 'DIA 02',
        horario: '08:30',
        isPix: true,
      },
      {
        id: 'tx_notime',
        rowNumber: 3,
        historico: 'PIX SEM HORARIO',
        documento: '000000',
        valor: 50,
        valorCentavos: 5000,
        rawValor: '50,00',
        formattedBr: '50,00',
        dia: 'DIA 03',
        horario: null,
        isPix: true,
      },
    ];

    render(
      <ConferenceList
        transactions={txs}
        checkedIds={new Set()}
        onToggleCheck={vi.fn()}
        behavior="keep_in_list"
        activeTab="todos"
        onChangeTab={vi.fn()}
      />
    );

    // Verify time badges exist
    const timeShort = screen.getByText('05:23');
    const timeLong = screen.getByText('08:30');
    expect(timeShort).toBeInTheDocument();
    expect(timeLong).toBeInTheDocument();

    // Verify both are inside container with dedicated right-aligned styling
    const colShort = timeShort.closest('.w-16, .sm\\:w-20');
    const colLong = timeLong.closest('.w-16, .sm\\:w-20');
    expect(colShort).not.toBeNull();
    expect(colLong).not.toBeNull();
    expect(colShort).toHaveClass('justify-end');
    expect(colLong).toHaveClass('justify-end');
  });
});
