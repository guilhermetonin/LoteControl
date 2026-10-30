import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  DiffErrorBoundary,
  normalizeDiffItems,
  type NormalizedDiffItem
} from '../src/modules/relatorio/RelatorioModule';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Relatório - Visualização de Diferenças e Error Boundary (Cenários 7 e 8)', () => {
  describe('normalizeDiffItems', () => {
    it('normaliza objeto estruturado de conflito trilateral (3-way merge)', () => {
      const backendDiff = {
        conflicts: [
          {
            id: 'tx-sobra-1',
            entryA: { id: 'tx-sobra-1', dia: 5, valor: 15, tipo: 'sobra', funcionario: 'Ana' },
            entryB: { id: 'tx-sobra-1', dia: 5, valor: 18, tipo: 'sobra', funcionario: 'Beatriz' },
            base: { id: 'tx-sobra-1', dia: 5, valor: 10, tipo: 'sobra' },
          },
        ],
        summary: '1 conflito(s) no mesmo registro',
      };

      const normalized = normalizeDiffItems(backendDiff);

      expect(Array.isArray(normalized)).toBe(true);
      expect(normalized.length).toBe(1);
      expect(normalized[0].operation).toBe('Conflito');
      expect(normalized[0].id).toBe('tx-sobra-1');
      expect(normalized[0].entry.valor).toBe(18);
      expect(normalized[0].local.valor).toBe(15);
      expect(normalized[0].remote.valor).toBe(18);
      // Confirma que métodos de Array como .slice funcionam sem erro
      expect(normalized.slice(0, 10)).toHaveLength(1);
    });

    it('normaliza objeto estruturado de diff campo a campo (computeDiff: updated, added, deleted)', () => {
      const backendDiff = {
        added: [
          { id: 'tx-new-1', dia: 10, valor: 50, tipo: 'falta', funcionario: 'Carlos' },
        ],
        updated: [
          {
            id: 'tx-upd-1',
            local: { id: 'tx-upd-1', dia: 2, valor: 100, tipo: 'sobra' },
            remote: { id: 'tx-upd-1', dia: 2, valor: 120, tipo: 'sobra' },
            diffs: [{ field: 'valor', label: 'Valor', localVal: 100, remoteVal: 120 }],
          },
        ],
        deleted: [
          { id: 'tx-del-1', dia: 8, valor: 30, tipo: 'falta', localEntry: { id: 'tx-del-1', dia: 8, valor: 30 } },
        ],
        summary: '1 novo(s), 1 alteração(ões), 1 exclusão(ões)',
      };

      const normalized = normalizeDiffItems(backendDiff);

      expect(Array.isArray(normalized)).toBe(true);
      expect(normalized).toHaveLength(3);
      expect(normalized.map(i => i.operation)).toEqual(['Alteração', 'Novo', 'Exclusão']);
      expect(normalized[0].details).toContain('Valor: 100 → 120');
      expect(normalized[1].id).toBe('tx-new-1');
      expect(normalized[2].id).toBe('tx-del-1');
    });

    it('mantém compatibilidade com arrays puros preexistentes', () => {
      const arrayDiff = [
        { id: 'item-1', operation: 'Alteração', entry: { dia: 1, valor: 10 } },
        { id: 'item-2', operation: 'Novo', entry: { dia: 2, valor: 20 } },
      ];

      const normalized = normalizeDiffItems(arrayDiff);

      expect(Array.isArray(normalized)).toBe(true);
      expect(normalized).toHaveLength(2);
      expect(normalized[0].id).toBe('item-1');
      expect(normalized[1].id).toBe('item-2');
    });

    it('trata graciosamente dados nulos, indefinidos, vazios ou inesperados sem lançar exceções', () => {
      expect(normalizeDiffItems(null)).toEqual([]);
      expect(normalizeDiffItems(undefined)).toEqual([]);
      expect(normalizeDiffItems({})).toEqual([]);
      expect(normalizeDiffItems({ foo: 'bar', invalid: 123 })).toEqual([]);
      expect(normalizeDiffItems('string-invalida' as any)).toEqual([]);
      expect(normalizeDiffItems(12345 as any)).toEqual([]);
    });
  });

  describe('DiffErrorBoundary e renderização segura', () => {
    it('renderiza os filhos normalmente quando não há erros', () => {
      render(
        <DiffErrorBoundary>
          <div data-testid="diff-content">Conteúdo da Comparação</div>
        </DiffErrorBoundary>
      );

      expect(screen.getByTestId('diff-content')).toBeInTheDocument();
      expect(screen.getByText('Conteúdo da Comparação')).toBeInTheDocument();
    });

    it('captura exceção em componente filho e evita tela branca renderizando card de erro com botão fechar', () => {
      // Suprime o console.error do teste intencional de erro do React
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      function BrokenComponent(): React.ReactElement {
        throw new Error('Falha simulada durante a renderização do diff');
      }

      const onReset = vi.fn();

      render(
        <DiffErrorBoundary onReset={onReset}>
          <BrokenComponent />
        </DiffErrorBoundary>
      );

      // Confirma que não houve tela branca e que a mensagem amigável apareceu
      expect(screen.getByText('Erro ao exibir comparação')).toBeInTheDocument();
      expect(screen.getByText(/Falha simulada durante a renderização do diff/i)).toBeInTheDocument();

      // Clica no botão fechar e confirma o reset
      const closeButtons = screen.getAllByRole('button', { name: 'Fechar comparação' });
      expect(closeButtons.length).toBeGreaterThan(0);
      fireEvent.click(closeButtons[0]);
      expect(onReset).toHaveBeenCalledOnce();

      consoleErrorSpy.mockRestore();
    });

    it('renderiza com segurança a visualização de diff a partir do objeto estruturado do backend sem crash de slice', () => {
      const backendObjectDiff = {
        conflicts: [
          {
            id: 'conflito-1',
            entryA: { id: 'conflito-1', dia: 15, valor: 45.5, tipo: 'falta' },
            entryB: { id: 'conflito-1', dia: 15, valor: 80.0, tipo: 'falta' },
          },
        ],
        summary: '1 conflito detectado',
      };

      const diffItems = normalizeDiffItems(backendObjectDiff);

      // Simula a árvore JSX do RelatorioModule
      render(
        <DiffErrorBoundary>
          <section className="rp-sync-card">
            <p className="rp-diff-summary">Versão remota v2 · {backendObjectDiff.summary}</p>
            <div className="rp-diff-list">
              {diffItems.slice(0, 100).map((item, index) => (
                <div key={item.id || index} data-testid="diff-row">
                  <span>{item.operation}</span>
                  <strong>Dia {item.entry?.dia} · R$ {item.entry?.valor?.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </section>
        </DiffErrorBoundary>
      );

      expect(screen.getByText(/1 conflito detectado/i)).toBeInTheDocument();
      expect(screen.getByTestId('diff-row')).toBeInTheDocument();
      expect(screen.getByText('Conflito')).toBeInTheDocument();
      expect(screen.getByText(/Dia 15 · R\$ 80.00/i)).toBeInTheDocument();
    });

    it('renderiza mensagem amigável quando o diff estiver vazio sem quebrar', () => {
      const emptyDiff = {};
      const diffItems = normalizeDiffItems(emptyDiff);

      render(
        <DiffErrorBoundary>
          <section className="rp-sync-card">
            <p className="rp-diff-summary">Versão remota v1 · 0 diferença(s)</p>
            {diffItems.length === 0 ? (
              <p className="rp-diff-empty">Nenhuma diferença detectada entre os registros.</p>
            ) : (
              <div className="rp-diff-list" />
            )}
          </section>
        </DiffErrorBoundary>
      );

      expect(screen.getByText('Nenhuma diferença detectada entre os registros.')).toBeInTheDocument();
    });
  });
});
