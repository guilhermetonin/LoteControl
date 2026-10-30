import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { ConflictResolutionModal, type ConflictItem } from '../src/modules/relatorio/components/ConflictResolutionModal';

describe('ConflictResolutionModal (Novo Modal de Resolução de Conflitos)', () => {
  const mockConflicts: ConflictItem[] = [
    {
      id: 'conflict-1',
      entry_id: 'entry-101',
      created_at: '2026-10-30T08:00:00.000Z',
      local_data: {
        id: 'entry-101',
        loterica: 'CAÇULA',
        ano: 2026,
        mes: 10,
        dia: 15,
        data_formatada: '15/10/2026',
        valor: 150.00,
        tipo: 'falta',
        funcionario: 'ANA PAULA',
        cliente: 'Cliente Balcão',
        status: 'pendente',
        observacoes: 'Observação feita no computador local',
        deleted: 0
      },
      remote_data: {
        id: 'entry-101',
        loterica: 'CAÇULA',
        ano: 2026,
        mes: 10,
        dia: 15,
        data_formatada: '15/10/2026',
        valor: 180.00,
        tipo: 'falta',
        funcionario: 'ANA PAULA',
        cliente: 'Cliente Balcão',
        status: 'conferido',
        observacoes: 'Observação feita pelo Google Drive',
        deleted: 0
      }
    },
    {
      id: 'conflict-2',
      entry_id: 'entry-102',
      created_at: '2026-10-30T08:05:00.000Z',
      local_data: {
        id: 'entry-102',
        dia: 20,
        data_formatada: '20/10/2026',
        valor: 50.00,
        tipo: 'sobra',
        funcionario: 'CARLOS',
        status: 'pendente',
        deleted: 0
      },
      remote_data: {
        id: 'entry-102',
        dia: 20,
        data_formatada: '20/10/2026',
        valor: 50.00,
        tipo: 'sobra',
        funcionario: 'MARCOS',
        status: 'pendente',
        deleted: 1
      }
    }
  ];

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('1. renderiza a comparação lado a lado entre versão local e remota', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    expect(screen.getByText('Conflito de Sincronização')).toBeInTheDocument();
    expect(screen.getByText('Versão Local')).toBeInTheDocument();
    expect(screen.getByText('(Neste computador)')).toBeInTheDocument();
    expect(screen.getByText('Versão Remota')).toBeInTheDocument();
    expect(screen.getByText('(Google Drive)')).toBeInTheDocument();
  });

  it('2. destaca visualmente campos divergentes entre as versões', () => {
    const { container } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    // No conflito 1, valor (150 vs 180), status (Pendente vs Conferido) e observações são divergentes
    const divergentRows = container.querySelectorAll('.rp-conflict-field-row.is-divergent');
    expect(divergentRows.length).toBeGreaterThan(0);

    const diffTags = screen.getAllByText('Divergente');
    expect(diffTags.length).toBeGreaterThan(0);
  });

  it('3. exibe contador "Conflito 1 de 2" e permite navegar para o próximo conflito', () => {
    const { container } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    const counter = container.querySelector('.rp-conflict-counter');
    expect(counter).toHaveTextContent('Conflito 1 de 2');

    const nextBtn = screen.getByLabelText('Próximo conflito');
    fireEvent.click(nextBtn);

    expect(counter).toHaveTextContent('Conflito 2 de 2');
    expect(screen.getByText('CARLOS')).toBeInTheDocument();
    expect(screen.getByText('MARCOS')).toBeInTheDocument();
  });

  it('4. aciona "Manter versão local" com a opção "local" para o conflito selecionado', () => {
    const onResolve = vi.fn();
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={onResolve}
        onSnooze={vi.fn()}
      />
    );

    const keepLocalBtn = screen.getByRole('button', { name: /Manter versão local/i });
    fireEvent.click(keepLocalBtn);

    expect(onResolve).toHaveBeenCalledWith('conflict-1', 'local');
  });

  it('5. aciona "Usar versão remota" com a opção "remote" para o conflito selecionado', () => {
    const onResolve = vi.fn();
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={onResolve}
        onSnooze={vi.fn()}
      />
    );

    const useRemoteBtn = screen.getByRole('button', { name: /Usar versão remota/i });
    fireEvent.click(useRemoteBtn);

    expect(onResolve).toHaveBeenCalledWith('conflict-1', 'remote');
  });

  it('6. aciona "Adiar resolução por 1 minuto" com exatamente 60 segundos sem resolver nem descartar dados', () => {
    const onSnooze = vi.fn();
    const onResolve = vi.fn();
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={onResolve}
        onSnooze={onSnooze}
      />
    );

    const snoozeBtn = screen.getByRole('button', { name: /Adiar resolução por 1 minuto/i });
    fireEvent.click(snoozeBtn);

    expect(onSnooze).toHaveBeenCalledTimes(1);
    expect(onSnooze).toHaveBeenCalledWith(60);
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Adiar resolução por 15 segundos/i })).not.toBeInTheDocument();
  });

  it('7. bloqueia fechamento acidental ao pressionar ESC ou clicar no backdrop', () => {
    const onSnooze = vi.fn();
    const onResolve = vi.fn();
    const { container } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={onResolve}
        onSnooze={onSnooze}
      />
    );

    const overlay = container.querySelector('.rp-conflict-overlay');
    expect(overlay).not.toBeNull();

    // Clique no backdrop não deve fechar nem acionar resolução
    fireEvent.click(overlay!);
    expect(onResolve).not.toHaveBeenCalled();
    expect(onSnooze).not.toHaveBeenCalled();

    // Pressionar tecla ESC não deve fechar nem acionar resolução
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(onResolve).not.toHaveBeenCalled();
    expect(onSnooze).not.toHaveBeenCalled();
  });

  it('8. renderiza conflito originado de pending_update (DAG / fork de arquivo)', () => {
    const pendingUpdateConflict: ConflictItem = {
      id: 'pending-data/meses/2026-10.json',
      entry_id: 'data/meses/2026-10.json',
      source: 'pending_update',
      fileKey: 'data/meses/2026-10.json',
      created_at: '2026-10-30T08:10:00.000Z',
      local_data: {
        totalLancamentos: 142,
        somaTotal: 4520.50,
        versao: 'Snapshot Local (10:15)'
      },
      remote_data: {
        totalLancamentos: 145,
        somaTotal: 4790.00,
        versao: 'Snapshot Remoto Google Drive (10:16)'
      }
    };

    const { container } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={[pendingUpdateConflict]}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    expect(screen.getByText(/data\/meses\/2026-10\.json/)).toBeInTheDocument();
    expect(container.querySelector('.rp-conflict-counter')).toHaveTextContent('Conflito 1 de 1');
    expect(screen.getAllByText('totalLancamentos').length).toBe(2);
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.getByText('145')).toBeInTheDocument();
  });

  it('9. renderiza badges "Faltando" (vermelho) e "Sobrando" (verde) para Operação / Tipo', () => {
    const conflictWithBothTipos: ConflictItem = {
      id: 'conflict-tipo-test',
      local_data: {
        tipo: 'falta',
        valor: 100
      },
      remote_data: {
        tipo: 'sobra',
        valor: 100
      }
    };

    const { container } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={[conflictWithBothTipos]}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    const faltaBadge = container.querySelector('.rp-conflict-tipo-badge.is-falta');
    const sobraBadge = container.querySelector('.rp-conflict-tipo-badge.is-sobra');

    expect(faltaBadge).toBeInTheDocument();
    expect(faltaBadge).toHaveTextContent('Faltando');

    expect(sobraBadge).toBeInTheDocument();
    expect(sobraBadge).toHaveTextContent('Sobrando');

    // Não deve exibir as palavras brutas "falta" ou "sobra" soltas
    expect(screen.queryByText(/^falta$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^sobra$/i)).not.toBeInTheDocument();
  });

  it('10. substitui texto do Status por checkbox visual (desmarcada = pendente, marcada = conferido)', () => {
    const conflictStatus: ConflictItem = {
      id: 'conflict-status-test',
      local_data: {
        status: 'pendente'
      },
      remote_data: {
        status: 'conferido'
      }
    };

    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={[conflictStatus]}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    // O título do campo continua sendo "Status"
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0);

    // Não deve conter os textos "Pendente" ou "Conferido" como valores
    expect(screen.queryByText('Pendente')).not.toBeInTheDocument();
    expect(screen.queryByText('Conferido')).not.toBeInTheDocument();

    // Checkboxes visuais
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes.length).toBe(2);

    // Local é pendente (desmarcada)
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[0]).toBeDisabled();

    // Remoto é conferido (marcada)
    expect(checkboxes[1].checked).toBe(true);
    expect(checkboxes[1]).toBeDisabled();
  });

  it('11. remove completamente o campo Observações da apresentação do modal', () => {
    const conflictWithNotes: ConflictItem = {
      id: 'conflict-notes-test',
      local_data: {
        observacoes: 'Nota local secreta',
        valor: 50
      },
      remote_data: {
        observacoes: 'Nota remota privada',
        valor: 50
      }
    };

    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={[conflictWithNotes]}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    expect(screen.queryByText('Observações')).not.toBeInTheDocument();
    expect(screen.queryByText('Nota local secreta')).not.toBeInTheDocument();
    expect(screen.queryByText('Nota remota privada')).not.toBeInTheDocument();
  });

  it('12. formata campos de data para "Criado" e "Atualizado" no formato HH:MM DD/MM/YYYY', () => {
    const conflictDates: ConflictItem = {
      id: 'conflict-dates-test',
      local_data: {
        criado_em: '2026-10-30T02:20:28.926Z',
        atualizado_em: '2026-10-30T11:47:51.361Z'
      },
      remote_data: {
        criado_em: '2026-10-30T02:20:28.926Z',
        atualizado_em: '2026-10-30T11:47:49.002Z'
      }
    };

    const { container } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={[conflictDates]}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    // Nomes na interface devem ser "Criado" e "Atualizado" (não em snake_case)
    expect(screen.getAllByText('Criado').length).toBe(2);
    expect(screen.getAllByText('Atualizado').length).toBe(2);
    expect(screen.queryByText('criado_em')).not.toBeInTheDocument();
    expect(screen.queryByText('atualizado_em')).not.toBeInTheDocument();

    // Formato não deve conter 'T' nem 'Z' nem milissegundos
    expect(container.textContent).not.toContain('2026-10-30T02:20:28.926Z');
    expect(container.textContent).not.toContain('2026-10-30T11:47:51.361Z');

    // Validação da conversão com formato HH:MM DD/MM/YYYY
    const dLocal = new Date('2026-10-30T11:47:51.361Z');
    const expectedHours = String(dLocal.getHours()).padStart(2, '0');
    const expectedMinutes = String(dLocal.getMinutes()).padStart(2, '0');
    const expectedFormatted = `${expectedHours}:${expectedMinutes} 30/10/2026`;

    expect(screen.getAllByText(expectedFormatted).length).toBeGreaterThan(0);
  });

  it('13. remove campos técnicos is_demo e version da interface do modal', () => {
    const conflictTechnical: ConflictItem = {
      id: 'conflict-tech-test',
      local_data: {
        is_demo: 0,
        version: 2,
        valor: 12.00
      },
      remote_data: {
        is_demo: 0,
        version: 2,
        valor: 12.00
      }
    };

    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={[conflictTechnical]}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    expect(screen.queryByText('is_demo')).not.toBeInTheDocument();
    expect(screen.queryByText('version')).not.toBeInTheDocument();
  });

  it('14. formata Data / Período no padrão brasileiro DD/MM/YYYY sem sofrer alteração por fuso horário', () => {
    const conflictIsoDate: ConflictItem = {
      id: 'conflict-date-iso',
      local_data: {
        data: '2026-10-29',
        valor: 12.00
      },
      remote_data: {
        data: '2026-10-29',
        valor: 12.00
      }
    };

    const { container } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={[conflictIsoDate]}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    // Deve exibir 29/10/2026 nos dois lados
    const formattedDates = screen.getAllByText('29/10/2026');
    expect(formattedDates.length).toBe(2);

    // Não deve exibir o formato ISO 2026-10-29
    expect(container.textContent).not.toContain('2026-10-29');
  });

  it('15. identifica divergência quando Data / Período for diferente entre local e remoto', () => {
    const conflictDiffDates: ConflictItem = {
      id: 'conflict-diff-dates',
      local_data: {
        data: '2026-10-29',
        valor: 50
      },
      remote_data: {
        data: '2026-10-30',
        valor: 50
      }
    };

    const { container } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={[conflictDiffDates]}
        onResolve={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    expect(screen.getByText('29/10/2026')).toBeInTheDocument();
    expect(screen.getByText('30/10/2026')).toBeInTheDocument();

    // A linha de Data deve ser marcada como divergente
    const dateLabel = screen.getAllByText('Data / Período')[0];
    const row = dateLabel.closest('.rp-conflict-field-row');
    expect(row).toHaveClass('is-divergent');
  });
});
