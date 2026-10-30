import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { SyncStatusBadge } from '../src/modules/relatorio/components/SyncStatusBadge';

describe('SyncStatusBadge (Testes do Badge de Sincronização)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  it('1. exibe inicialmente "Conectado" quando a conta está conectada e em repouso', () => {
    render(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Pronto para sincronizar',
          pendingCount: 0,
          conflictCount: 0,
        }}
      />
    );

    const badge = screen.getByTestId('sync-status-badge');
    expect(badge).toHaveTextContent('Conectado');
    expect(badge).toHaveAttribute('data-state', 'connected');
    expect(badge.className).toContain('rp-sync-badge-connected');
  });

  it('2. exibe "Sincronizando" com ícone de rotação quando em sincronização ativa', () => {
    render(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Sincronizando',
          isSyncing: true,
        }}
      />
    );

    const badge = screen.getByTestId('sync-status-badge');
    expect(badge).toHaveTextContent('Sincronizando');
    expect(badge).toHaveAttribute('data-state', 'syncing');
    expect(badge.className).toContain('rp-sync-badge-syncing');

    // Confirma ícone com classe de rotação
    const icon = badge.querySelector('.rp-sync-spin');
    expect(icon).not.toBeNull();
  });

  it('3. exibe "Sincronizado" em verde após conclusão de sincronização bem-sucedida', () => {
    const { rerender } = render(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Sincronizando',
          isSyncing: true,
          lastSyncTime: '2026-10-29T22:50:00Z',
        }}
      />
    );

    // Conclusão com sucesso
    rerender(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Sincronizado',
          isSyncing: false,
          lastSyncTime: '2026-10-29T22:50:05Z',
        }}
      />
    );

    const badge = screen.getByTestId('sync-status-badge');
    expect(badge).toHaveTextContent('Sincronizado');
    expect(badge).toHaveAttribute('data-state', 'synced');
    expect(badge.className).toContain('rp-sync-badge-synced');
  });

  it('4. retorna automaticamente de "Sincronizado" para "Conectado" após 5 segundos', () => {
    const { rerender } = render(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Sincronizando',
          isSyncing: true,
        }}
      />
    );

    rerender(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Sincronizado',
          isSyncing: false,
          lastSyncTime: '2026-10-29T22:50:05Z',
        }}
      />
    );

    const badge = screen.getByTestId('sync-status-badge');
    expect(badge).toHaveTextContent('Sincronizado');

    // Avança 4.9 segundos: ainda deve estar "Sincronizado"
    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(badge).toHaveTextContent('Sincronizado');

    // Completa os 5 segundos: deve retornar para "Conectado"
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(badge).toHaveTextContent('Conectado');
    expect(badge).toHaveAttribute('data-state', 'connected');
  });

  it('5. preserva "Conflito (N)" mesmo durante ou após uma sincronização bem-sucedida', () => {
    const { rerender } = render(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Conflito',
          conflictCount: 2,
          isSyncing: true,
        }}
        conflictsCount={2}
      />
    );

    // Tentativa de sincronização em outro arquivo conclui, mas o conflito continua aberto
    rerender(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Sincronizado',
          conflictCount: 2,
          isSyncing: false,
          lastSyncTime: '2026-10-29T22:51:00Z',
        }}
        conflictsCount={2}
      />
    );

    const badge = screen.getByTestId('sync-status-badge');
    // Prioridade máxima: conflito impede exibição do verde "Sincronizado"
    expect(badge).toHaveTextContent('Conflito (2)');
    expect(badge).toHaveAttribute('data-state', 'conflict');
    expect(badge.className).toContain('rp-sync-badge-conflict');
  });

  it('6. exibe "Offline" diante de falha real de conexão', () => {
    render(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Offline',
          lastError: 'fetch failed: ENOTFOUND googleapis.com',
        }}
      />
    );

    const badge = screen.getByTestId('sync-status-badge');
    expect(badge).toHaveTextContent('Offline');
    expect(badge).toHaveAttribute('data-state', 'offline');
    expect(badge.className).toContain('rp-sync-badge-offline');
  });

  it('7. diferencia erro de conexão ("Offline") de erro de autenticação ("Reconectar conta")', () => {
    const { rerender } = render(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Autorização expirada',
          lastError: 'invalid_grant: Token expirado ou revogado pelo usuário',
        }}
      />
    );

    const badge = screen.getByTestId('sync-status-badge');
    expect(badge).toHaveTextContent('Reconectar conta');
    expect(badge).toHaveAttribute('data-state', 'auth-error');
    expect(badge.className).toContain('rp-sync-badge-auth-error');

    // Agora altera para falha de internet
    rerender(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Offline',
          lastError: 'ECONNREFUSED 142.250.190.42:443',
        }}
      />
    );

    expect(badge).toHaveTextContent('Offline');
    expect(badge).toHaveAttribute('data-state', 'offline');
  });

  it('8. atualiza dinamicamente a quantidade de conflitos pendentes', () => {
    const { rerender } = render(
      <SyncStatusBadge
        syncStatus={{ userEmail: 'operador@gmail.com', conflictCount: 1 }}
        conflictsCount={1}
      />
    );

    expect(screen.getByTestId('sync-status-badge')).toHaveTextContent('Conflito (1)');

    rerender(
      <SyncStatusBadge
        syncStatus={{ userEmail: 'operador@gmail.com', conflictCount: 3 }}
        conflictsCount={3}
      />
    );

    expect(screen.getByTestId('sync-status-badge')).toHaveTextContent('Conflito (3)');

    // Conflitos resolvidos
    rerender(
      <SyncStatusBadge
        syncStatus={{ userEmail: 'operador@gmail.com', conflictCount: 0, status: 'Pronto para sincronizar' }}
        conflictsCount={0}
      />
    );

    expect(screen.getByTestId('sync-status-badge')).toHaveTextContent('Conectado');
  });

  it('9. limpa temporizadores ao desmontar o componente sem vazamento de memória', () => {
    const { rerender, unmount } = render(
      <SyncStatusBadge
        syncStatus={{ userEmail: 'operador@gmail.com', isSyncing: true }}
      />
    );

    rerender(
      <SyncStatusBadge
        syncStatus={{ userEmail: 'operador@gmail.com', isSyncing: false, status: 'Sincronizado' }}
      />
    );

    // Desmonta antes de esgotar os 5 segundos
    unmount();

    // Avança o relógio: não deve disparar warning de atualização em componente desmontado
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(6000);
      });
    }).not.toThrow();
  });

  it('11. impede estado infinito de Sincronizando quando o status é Sincronizado', () => {
    render(
      <SyncStatusBadge
        syncStatus={{
          userEmail: 'operador@gmail.com',
          status: 'Sincronizado',
          lastSyncTime: '2026-10-30T01:47:06.000Z',
          pendingCount: 0,
          conflictCount: 0,
          isSyncing: false,
        }}
      />
    );

    const badge = screen.getByTestId('sync-status-badge');
    expect(badge).not.toHaveTextContent('Sincronizando');
    expect(badge).not.toHaveAttribute('data-state', 'syncing');
    expect(badge.querySelector('.rp-sync-spin')).toBeNull();
    expect(['connected', 'synced']).toContain(badge.getAttribute('data-state'));
  });

  it('10. aciona o callback de clique para abrir o fluxo de conflitos ou configurações', () => {
    const onClick = vi.fn();
    render(
      <SyncStatusBadge
        syncStatus={{ userEmail: 'operador@gmail.com', conflictCount: 1 }}
        conflictsCount={1}
        onClick={onClick}
      />
    );

    const badge = screen.getByTestId('sync-status-badge');
    fireEvent.click(badge);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
