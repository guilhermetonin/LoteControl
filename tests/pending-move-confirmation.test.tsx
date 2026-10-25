import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PendentesPanel } from '../src/modules/pix/implementation/components/PendentesPanel';

const pending = {
  id: 'tx-move-1', rowNumber: 1, historico: 'CRED PIX CHAVE', documento: '010923',
  valor: 12.34, valorCentavos: 1234, rawValor: '12,34', formattedBr: '12,34',
  dia: 'DIA 01', horario: '09:23', isPix: true, dataMovimento: '2026-09-01',
};

afterEach(() => { cleanup(); delete (window as any).electronAPI; vi.restoreAllMocks(); });

describe('confirmação de mover pendentes', () => {
  it('marca Pix como conferido somente depois da resposta positiva do Relatório', async () => {
    let resolveTransfer!: (value: any) => void;
    const transfer = vi.fn(() => new Promise((resolve) => { resolveTransfer = resolve; }));
    const onMoved = vi.fn(async () => {});
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { integration: { transferPixPending: transfer } } });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<PendentesPanel pendentes={[pending]} conferenceId="conf-1" fileName="extrato.xlsx" onMoved={onMoved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ações dos pendentes' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para o Relatório' }));
    fireEvent.click(screen.getByText('Mover pendentes'));
    await waitFor(() => expect(transfer).toHaveBeenCalledOnce());
    expect(onMoved).not.toHaveBeenCalled();
    resolveTransfer({ success: true, inserted: 1, skipped: 0, mode: 'move' });
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith([pending]));
  });

  it('mantém a marcação Pix intacta se o Relatório não confirmar a persistência', async () => {
    const transfer = vi.fn().mockRejectedValue(new Error('gravação recusada'));
    const onMoved = vi.fn(async () => {});
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { integration: { transferPixPending: transfer } } });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<PendentesPanel pendentes={[pending]} conferenceId="conf-1" fileName="extrato.xlsx" onMoved={onMoved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ações dos pendentes' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para o Relatório' }));
    fireEvent.click(screen.getByText('Mover pendentes'));
    await waitFor(() => expect(transfer).toHaveBeenCalledOnce());
    expect(onMoved).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('mantém a marcação Pix intacta se a gravação da marcação falhar depois do commit do Relatório', async () => {
    const transfer = vi.fn().mockResolvedValue({ success: true, inserted: 1, skipped: 0, mode: 'move' });
    const onMoved = vi.fn().mockRejectedValue(new Error('falha ao persistir marcação'));
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { integration: { transferPixPending: transfer } } });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<PendentesPanel pendentes={[pending]} conferenceId="conf-1" fileName="extrato.xlsx" onMoved={onMoved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ações dos pendentes' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para o Relatório' }));
    fireEvent.click(screen.getByText('Mover pendentes'));
    await waitFor(() => expect(onMoved).toHaveBeenCalledOnce());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
