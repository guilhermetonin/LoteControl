import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { PixTransaction, StatementParseResult } from '../services/statementParser';
import { dbClient } from '../services/dbClient';
import type { ConferenceBehavior, ViewTab } from '../components/ConferenceList';

export interface TimeRangeFilter {
  start: string; // 'HH:MM' or ''
  end: string;   // 'HH:MM' or ''
}

export interface ConferenceStats {
  totalCount: number;
  conferidosCount: number;
  pendentesCount: number;
  percentCompleted: number;
  totalCentavos: number;
  conferidosCentavos: number;
  pendentesCentavos: number;
  totalValor: number;
  conferidosValor: number;
  pendentesValor: number;
}

export type HistoryAction =
  | {
      type: 'TOGGLE_CHECK';
      transactionId: string;
      previousChecked: boolean;
      newChecked: boolean;
      description: string;
    }
  | {
      type: 'BATCH_CHECK';
      changes: Array<{
        transactionId: string;
        previousChecked: boolean;
        newChecked: boolean;
      }>;
      description: string;
    }
  | {
      type: 'UPDATE_OBSERVATION';
      transactionId: string;
      previousObservation: string;
      newObservation: string;
      description: string;
    }
  | {
      type: 'ADD_TRANSACTION';
      transaction: PixTransaction;
      isChecked: boolean;
      description: string;
    }
  | {
      type: 'DELETE_TRANSACTION';
      transaction: PixTransaction;
      isChecked: boolean;
      adjacentId?: string;
      description: string;
    }
  | {
      type: 'EDIT_TRANSACTION';
      transactionId: string;
      previousData: Partial<PixTransaction>;
      newData: Partial<PixTransaction>;
      description: string;
    };

export function useConferenceState(
  parseResult: StatementParseResult | null,
  conferenceId: string | null,
  behavior: ConferenceBehavior = 'move_to_conferidos'
) {
  // Transactions list (reactive state)
  const [transactions, setTransactions] = useState<PixTransaction[]>(
    () => parseResult?.pixTransactions || []
  );

  // Selected day: 'TODOS' or 'DIA XX'
  const [selectedDia, setSelectedDia] = useState<string>('TODOS');

  // Selected PIX descriptions: Set of descriptions
  const [selectedHistoricos, setSelectedHistoricos] = useState<Set<string>>(
    () => new Set(parseResult?.initialSelectedHistoricos || [])
  );

  // Active view tab: 'pendentes' | 'conferidos' | 'todos'
  const [activeTab, setActiveTab] = useState<ViewTab>(() =>
    behavior === 'move_to_conferidos' ? 'pendentes' : 'todos'
  );

  // Optional Time Filter
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>({ start: '', end: '' });
  const [isTimeFilterActive, setIsTimeFilterActive] = useState<boolean>(false);

  // Checked IDs set
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);

  // Highlighted transaction ID (for auto-scroll and visual focus)
  const [highlightedTxId, setHighlightedTxId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHighlight = useCallback(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    setHighlightedTxId(null);
  }, []);

  const triggerHighlight = useCallback((txId: string | null, durationMs = 1800) => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    setHighlightedTxId(txId);
    if (txId) {
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedTxId(null);
        highlightTimerRef.current = null;
      }, durationMs);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  // Reset tab when behavior setting changes, if on default
  useEffect(() => {
    setActiveTab(behavior === 'move_to_conferidos' ? 'pendentes' : 'todos');
  }, [behavior]);

  // Load state whenever a new conference or statement is set
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (parseResult) {
        setTransactions(parseResult.pixTransactions || []);
        setSelectedDia('TODOS');
        setSelectedHistoricos(new Set(parseResult.initialSelectedHistoricos));
        setTimeRange({ start: '', end: '' });
        setIsTimeFilterActive(false);
        setPersistenceError(null);
        setUndoStack([]);
        setRedoStack([]);
        setHighlightedTxId(null);

        // Load saved checkmarks from SQLite database
        if (conferenceId) {
          try {
            const savedIds = await dbClient.getCheckedIds(conferenceId);
            if (isMounted) {
              setCheckedIds(savedIds);
            }
          } catch (err: any) {
            console.error('Erro ao carregar marcações do SQLite:', err);
            if (isMounted) {
              setPersistenceError('Aviso: Não foi possível carregar as marcações salvas do banco de dados.');
            }
          }
        } else {
          setCheckedIds(new Set());
        }
      } else {
        setTransactions([]);
        setSelectedDia('TODOS');
        setSelectedHistoricos(new Set());
        setCheckedIds(new Set());
        setTimeRange({ start: '', end: '' });
        setIsTimeFilterActive(false);
        setPersistenceError(null);
        setUndoStack([]);
        setRedoStack([]);
        setHighlightedTxId(null);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [conferenceId, parseResult?.fileHash]);

  // Push an operation to Undo Stack (and reset Redo Stack)
  const pushAction = useCallback((action: HistoryAction) => {
    setUndoStack((prev) => [...prev.slice(-99), action]);
    setRedoStack([]);
  }, []);

  // Undo operation
  const undo = useCallback(async () => {
    if (undoStack.length === 0) return;

    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev, action]);

    switch (action.type) {
      case 'TOGGLE_CHECK': {
        setCheckedIds((prev) => {
          const next = new Set(prev);
          if (action.previousChecked) next.add(action.transactionId);
          else next.delete(action.transactionId);
          return next;
        });
        if (conferenceId) {
          try {
            await dbClient.setMultipleChecks(conferenceId, [action.transactionId], action.previousChecked);
          } catch (err) {
            console.error('Erro ao persistir desfazer no SQLite:', err);
            setPersistenceError('Erro ao gravar alteração no banco de dados SQLite.');
          }
        }
        triggerHighlight(action.transactionId);
        break;
      }
      case 'BATCH_CHECK': {
        setCheckedIds((prev) => {
          const next = new Set(prev);
          action.changes.forEach((c) => {
            if (c.previousChecked) next.add(c.transactionId);
            else next.delete(c.transactionId);
          });
          return next;
        });
        if (conferenceId && action.changes.length > 0) {
          try {
            const toCheck = action.changes.filter((c) => c.previousChecked).map((c) => c.transactionId);
            const toUncheck = action.changes.filter((c) => !c.previousChecked).map((c) => c.transactionId);
            if (toCheck.length > 0) await dbClient.setMultipleChecks(conferenceId, toCheck, true);
            if (toUncheck.length > 0) await dbClient.setMultipleChecks(conferenceId, toUncheck, false);
          } catch (err) {
            console.error('Erro ao persistir desfazer em lote no SQLite:', err);
            setPersistenceError('Erro ao gravar alteração no banco de dados SQLite.');
          }
        }
        if (action.changes.length > 0) {
          triggerHighlight(action.changes[0].transactionId);
        }
        break;
      }
      case 'UPDATE_OBSERVATION': {
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.id === action.transactionId ? { ...tx, observacao: action.previousObservation } : tx
          )
        );
        if (conferenceId) {
          try {
            await dbClient.updateTransactionObservation(conferenceId, action.transactionId, action.previousObservation);
          } catch (err) {
            console.error('Erro ao persistir desfazer observação no SQLite:', err);
            setPersistenceError('Erro ao salvar alteração no banco SQLite.');
          }
        }
        triggerHighlight(action.transactionId);
        break;
      }
      case 'ADD_TRANSACTION': {
        // Undo of add is delete
        setTransactions((prev) => prev.filter((tx) => tx.id !== action.transaction.id));
        setCheckedIds((prev) => {
          const next = new Set(prev);
          next.delete(action.transaction.id);
          return next;
        });
        if (conferenceId) {
          try {
            await dbClient.deleteTransaction(conferenceId, action.transaction.id);
          } catch (err) {
            console.error('Erro ao desfazer adicionar lançamento no SQLite:', err);
            setPersistenceError('Erro ao gravar no banco SQLite.');
          }
        }
        triggerHighlight(null);
        break;
      }
      case 'DELETE_TRANSACTION': {
        // Undo of delete is re-add
        setTransactions((prev) => {
          const next = [...prev, action.transaction];
          return next.sort((a, b) => a.valorCentavos - b.valorCentavos || a.rowNumber - b.rowNumber);
        });
        if (action.isChecked) {
          setCheckedIds((prev) => new Set(prev).add(action.transaction.id));
        }
        if (conferenceId) {
          try {
            await dbClient.addTransaction(conferenceId, action.transaction, action.isChecked);
          } catch (err) {
            console.error('Erro ao restaurar lançamento excluído no SQLite:', err);
            setPersistenceError('Erro ao gravar no banco SQLite.');
          }
        }
        triggerHighlight(action.transaction.id);
        break;
      }
      case 'EDIT_TRANSACTION': {
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.id === action.transactionId ? { ...tx, ...action.previousData } : tx
          )
        );
        if (conferenceId) {
          try {
            await dbClient.updateTransaction(conferenceId, action.transactionId, action.previousData);
          } catch (err) {
            console.error('Erro ao desfazer edição no SQLite:', err);
            setPersistenceError('Erro ao gravar no banco SQLite.');
          }
        }
        triggerHighlight(action.transactionId);
        break;
      }
    }
  }, [undoStack, conferenceId, triggerHighlight]);

  // Redo operation
  const redo = useCallback(async () => {
    if (redoStack.length === 0) return;

    const action = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setUndoStack((prev) => [...prev, action]);

    switch (action.type) {
      case 'TOGGLE_CHECK': {
        setCheckedIds((prev) => {
          const next = new Set(prev);
          if (action.newChecked) next.add(action.transactionId);
          else next.delete(action.transactionId);
          return next;
        });
        if (conferenceId) {
          try {
            await dbClient.setMultipleChecks(conferenceId, [action.transactionId], action.newChecked);
          } catch (err) {
            console.error('Erro ao persistir refazer no SQLite:', err);
            setPersistenceError('Erro ao gravar refazer no banco de dados SQLite.');
          }
        }
        triggerHighlight(action.transactionId);
        break;
      }
      case 'BATCH_CHECK': {
        setCheckedIds((prev) => {
          const next = new Set(prev);
          action.changes.forEach((c) => {
            if (c.newChecked) next.add(c.transactionId);
            else next.delete(c.transactionId);
          });
          return next;
        });
        if (conferenceId && action.changes.length > 0) {
          try {
            const toCheck = action.changes.filter((c) => c.newChecked).map((c) => c.transactionId);
            const toUncheck = action.changes.filter((c) => !c.newChecked).map((c) => c.transactionId);
            if (toCheck.length > 0) await dbClient.setMultipleChecks(conferenceId, toCheck, true);
            if (toUncheck.length > 0) await dbClient.setMultipleChecks(conferenceId, toUncheck, false);
          } catch (err) {
            console.error('Erro ao persistir refazer em lote no SQLite:', err);
            setPersistenceError('Erro ao gravar alteração no banco de dados SQLite.');
          }
        }
        if (action.changes.length > 0) {
          triggerHighlight(action.changes[0].transactionId);
        }
        break;
      }
      case 'UPDATE_OBSERVATION': {
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.id === action.transactionId ? { ...tx, observacao: action.newObservation } : tx
          )
        );
        if (conferenceId) {
          try {
            await dbClient.updateTransactionObservation(conferenceId, action.transactionId, action.newObservation);
          } catch (err) {
            console.error('Erro ao persistir refazer observação no SQLite:', err);
            setPersistenceError('Erro ao salvar alteração no banco SQLite.');
          }
        }
        triggerHighlight(action.transactionId);
        break;
      }
      case 'ADD_TRANSACTION': {
        setTransactions((prev) => {
          const next = [...prev, action.transaction];
          return next.sort((a, b) => a.valorCentavos - b.valorCentavos || a.rowNumber - b.rowNumber);
        });
        if (action.isChecked) {
          setCheckedIds((prev) => new Set(prev).add(action.transaction.id));
        }
        if (conferenceId) {
          try {
            await dbClient.addTransaction(conferenceId, action.transaction, action.isChecked);
          } catch (err) {
            console.error('Erro ao refazer adicionar lançamento no SQLite:', err);
            setPersistenceError('Erro ao gravar no banco SQLite.');
          }
        }
        triggerHighlight(action.transaction.id);
        break;
      }
      case 'DELETE_TRANSACTION': {
        setTransactions((prev) => prev.filter((tx) => tx.id !== action.transaction.id));
        setCheckedIds((prev) => {
          const next = new Set(prev);
          next.delete(action.transaction.id);
          return next;
        });
        if (conferenceId) {
          try {
            await dbClient.deleteTransaction(conferenceId, action.transaction.id);
          } catch (err) {
            console.error('Erro ao refazer exclusão no SQLite:', err);
            setPersistenceError('Erro ao gravar no banco SQLite.');
          }
        }
        if (action.adjacentId) {
          triggerHighlight(action.adjacentId);
        }
        break;
      }
      case 'EDIT_TRANSACTION': {
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.id === action.transactionId ? { ...tx, ...action.newData } : tx
          )
        );
        if (conferenceId) {
          try {
            await dbClient.updateTransaction(conferenceId, action.transactionId, action.newData);
          } catch (err) {
            console.error('Erro ao refazer edição no SQLite:', err);
            setPersistenceError('Erro ao gravar no banco SQLite.');
          }
        }
        triggerHighlight(action.transactionId);
        break;
      }
    }
  }, [redoStack, conferenceId, triggerHighlight]);

  // Toggle single item using functional update with Undo/Redo tracking
  const toggleCheck = useCallback(
    async (id: string) => {
      clearHighlight();
      setPersistenceError(null);
      const isCurrentlyChecked = checkedIds.has(id);
      const nextChecked = !isCurrentlyChecked;

      // Push to Undo Stack
      pushAction({
        type: 'TOGGLE_CHECK',
        transactionId: id,
        previousChecked: isCurrentlyChecked,
        newChecked: nextChecked,
        description: `${nextChecked ? 'Marcar' : 'Desmarcar'} lançamento`,
      });

      // Optimistic update
      setCheckedIds((prev) => {
        const next = new Set(prev);
        if (nextChecked) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });

      // Persist in SQLite
      if (conferenceId) {
        try {
          await dbClient.toggleCheck(conferenceId, id);
        } catch (err: any) {
          console.error('Falha ao salvar marcação no banco de dados:', err);
          setPersistenceError('Erro ao gravar alteração no banco de dados SQLite.');
          // Revert optimistic update
          setCheckedIds((prev) => {
            const next = new Set(prev);
            if (isCurrentlyChecked) {
              next.add(id);
            } else {
              next.delete(id);
            }
            return next;
          });
        }
      }
    },
    [checkedIds, conferenceId, pushAction, clearHighlight]
  );

  // Check all currently filtered items with Undo/Redo tracking
  const checkAllFiltered = useCallback(
    async (itemsToCheck: PixTransaction[]) => {
      clearHighlight();
      setPersistenceError(null);
      const changes = itemsToCheck
        .filter((tx) => !checkedIds.has(tx.id))
        .map((tx) => ({
          transactionId: tx.id,
          previousChecked: false,
          newChecked: true,
        }));

      if (changes.length === 0) return;

      const idsToAdd = changes.map((c) => c.transactionId);

      try {
        // Persist first. In the Pix → Relatório move flow this is called only after
        // the report batch has been committed, so a disk error must leave Pix pending.
        if (conferenceId && idsToAdd.length > 0) {
          await dbClient.setMultipleChecks(conferenceId, idsToAdd, true);
        }
      } catch (err) {
        console.error('Erro ao salvar marcações em lote:', err);
        setPersistenceError('Erro ao salvar marcações no banco de dados.');
        throw err;
      }

      pushAction({
        type: 'BATCH_CHECK',
        changes,
        description: 'Marcar todos os lançamentos filtrados',
      });
      setCheckedIds((prev) => {
        const next = new Set(prev);
        idsToAdd.forEach((id) => next.add(id));
        return next;
      });
    },
    [checkedIds, conferenceId, pushAction, clearHighlight]
  );

  const refreshPersistedState = useCallback(async () => {
    if (!conferenceId) return;
    const [persistedTransactions, persistedIds] = await Promise.all([
      dbClient.getTransactions(conferenceId),
      dbClient.getCheckedIds(conferenceId),
    ]);
    setTransactions(persistedTransactions);
    setCheckedIds(new Set(persistedIds));
  }, [conferenceId]);

  // Uncheck all currently filtered items with Undo/Redo tracking
  const uncheckAllFiltered = useCallback(
    async (itemsToUncheck: PixTransaction[]) => {
      clearHighlight();
      setPersistenceError(null);
      const changes = itemsToUncheck
        .filter((tx) => checkedIds.has(tx.id))
        .map((tx) => ({
          transactionId: tx.id,
          previousChecked: true,
          newChecked: false,
        }));

      if (changes.length === 0) return;

      pushAction({
        type: 'BATCH_CHECK',
        changes,
        description: 'Desmarcar todos os lançamentos filtrados',
      });

      const idsToRemove = changes.map((c) => c.transactionId);

      setCheckedIds((prev) => {
        const next = new Set(prev);
        idsToRemove.forEach((id) => next.delete(id));
        return next;
      });

      if (conferenceId && idsToRemove.length > 0) {
        try {
          await dbClient.setMultipleChecks(conferenceId, idsToRemove, false);
        } catch (err) {
          console.error('Erro ao desmarcar em lote:', err);
          setPersistenceError('Erro ao salvar alterações no banco de dados.');
        }
      }
    },
    [checkedIds, conferenceId, pushAction, clearHighlight]
  );

  // Clear conference marks for this conference with Undo/Redo tracking
  const clearConference = useCallback(async () => {
    clearHighlight();
    setPersistenceError(null);
    const changes = Array.from(checkedIds).map((id) => ({
      transactionId: id,
      previousChecked: true,
      newChecked: false,
    }));

    if (changes.length > 0) {
      pushAction({
        type: 'BATCH_CHECK',
        changes,
        description: 'Limpar todas as marcações',
      });
    }

    setCheckedIds(new Set());

    if (conferenceId) {
      try {
        await dbClient.clearConferenceMarks(conferenceId);
      } catch (err) {
        console.error('Erro ao limpar marcações:', err);
        setPersistenceError('Erro ao limpar marcações no banco de dados.');
      }
    }
  }, [checkedIds, conferenceId, pushAction, clearHighlight]);

  // Update observation for a transaction with Undo/Redo tracking
  const updateObservation = useCallback(
    async (transactionId: string, newObservation: string) => {
      const currentTx = transactions.find((t) => t.id === transactionId);
      if (!currentTx) return;
      const previousObservation = currentTx.observacao || '';
      if (previousObservation === newObservation) return;

      pushAction({
        type: 'UPDATE_OBSERVATION',
        transactionId,
        previousObservation,
        newObservation,
        description: `Observação no lançamento ${currentTx.formattedBr}`,
      });

      setTransactions((prev) =>
        prev.map((t) => (t.id === transactionId ? { ...t, observacao: newObservation } : t))
      );
      setHighlightedTxId(transactionId);

      if (conferenceId) {
        try {
          await dbClient.updateTransactionObservation(conferenceId, transactionId, newObservation);
        } catch (err) {
          console.error('Erro ao salvar observação no SQLite:', err);
          setPersistenceError('Erro ao salvar observação no banco de dados SQLite.');
        }
      }
    },
    [transactions, conferenceId, pushAction]
  );

  // Add manual transaction with Undo/Redo tracking
  const addManualTransaction = useCallback(
    async (tx: PixTransaction) => {
      pushAction({
        type: 'ADD_TRANSACTION',
        transaction: tx,
        isChecked: false,
        description: `Adicionar lançamento ${tx.formattedBr}`,
      });

      setTransactions((prev) => {
        const next = [...prev, tx];
        return next.sort((a, b) => a.valorCentavos - b.valorCentavos || a.rowNumber - b.rowNumber);
      });
      setSelectedHistoricos((prev) => {
        const next = new Set(prev);
        next.add(tx.historico);
        return next;
      });
      setHighlightedTxId(tx.id);

      if (conferenceId) {
        try {
          await dbClient.addTransaction(conferenceId, tx, false);
        } catch (err) {
          console.error('Erro ao adicionar lançamento no SQLite:', err);
          setPersistenceError('Erro ao gravar lançamento no banco de dados.');
        }
      }
    },
    [conferenceId, pushAction]
  );

  // Delete transaction with Undo/Redo tracking
  const deleteManualTransaction = useCallback(
    async (transactionId: string) => {
      const targetTx = transactions.find((t) => t.id === transactionId);
      if (!targetTx) return;
      const idx = transactions.findIndex((t) => t.id === transactionId);
      const adjacentId = transactions[idx + 1]?.id || transactions[idx - 1]?.id;

      pushAction({
        type: 'DELETE_TRANSACTION',
        transaction: targetTx,
        isChecked: checkedIds.has(transactionId),
        adjacentId,
        description: `Excluir lançamento ${targetTx.formattedBr}`,
      });

      setTransactions((prev) => prev.filter((t) => t.id !== transactionId));
      setCheckedIds((prev) => {
        const next = new Set(prev);
        next.delete(transactionId);
        return next;
      });
      if (adjacentId) {
        setHighlightedTxId(adjacentId);
      }

      if (conferenceId) {
        try {
          await dbClient.deleteTransaction(conferenceId, transactionId);
        } catch (err) {
          console.error('Erro ao excluir lançamento no SQLite:', err);
          setPersistenceError('Erro ao remover lançamento do banco de dados.');
        }
      }
    },
    [transactions, checkedIds, conferenceId, pushAction]
  );

  // Edit transaction with Undo/Redo tracking
  const editManualTransaction = useCallback(
    async (transactionId: string, updates: Partial<PixTransaction>) => {
      const targetTx = transactions.find((t) => t.id === transactionId);
      if (!targetTx) return;
      const previousData: Partial<PixTransaction> = {};
      for (const key of Object.keys(updates) as (keyof PixTransaction)[]) {
        (previousData as any)[key] = targetTx[key];
      }

      pushAction({
        type: 'EDIT_TRANSACTION',
        transactionId,
        previousData,
        newData: updates,
        description: `Editar lançamento ${targetTx.formattedBr}`,
      });

      setTransactions((prev) =>
        prev.map((t) => (t.id === transactionId ? { ...t, ...updates } : t))
      );
      setHighlightedTxId(transactionId);

      if (conferenceId) {
        try {
          await dbClient.updateTransaction(conferenceId, transactionId, updates);
        } catch (err) {
          console.error('Erro ao atualizar lançamento no SQLite:', err);
          setPersistenceError('Erro ao atualizar lançamento no banco de dados.');
        }
      }
    },
    [transactions, conferenceId, pushAction]
  );

  // Historico filter controls
  const toggleHistorico = useCallback((historico: string) => {
    setSelectedHistoricos((prev) => {
      const next = new Set(prev);
      if (next.has(historico)) {
        next.delete(historico);
      } else {
        next.add(historico);
      }
      return next;
    });
  }, []);

  const selectAllHistoricos = useCallback(() => {
    if (parseResult) {
      setSelectedHistoricos(new Set(parseResult.availableHistoricos));
    }
  }, [parseResult]);

  const clearAllHistoricos = useCallback(() => {
    setSelectedHistoricos(new Set());
  }, []);

  // Filtered transactions calculation (reactive against transactions state)
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // 1. Filter by Histórico
      if (!selectedHistoricos.has(tx.historico)) {
        return false;
      }

      // 2. Filter by Dia
      if (selectedDia !== 'TODOS' && tx.dia !== selectedDia) {
        return false;
      }

      // 3. Optional Filter by Horário
      if (isTimeFilterActive && (timeRange.start || timeRange.end)) {
        // If transaction has no valid time, do not exclude unless user explicitly filters
        if (tx.horario) {
          if (timeRange.start && tx.horario < timeRange.start) return false;
          if (timeRange.end && tx.horario > timeRange.end) return false;
        }
      }

      return true;
    });
  }, [
    transactions,
    selectedHistoricos,
    selectedDia,
    isTimeFilterActive,
    timeRange.start,
    timeRange.end,
  ]);

  // Split into Conferidos and Pendentes (both sorted ascending)
  const conferidos = useMemo(() => {
    return filteredTransactions.filter((tx) => checkedIds.has(tx.id));
  }, [filteredTransactions, checkedIds]);

  const pendentes = useMemo(() => {
    return filteredTransactions.filter((tx) => !checkedIds.has(tx.id));
  }, [filteredTransactions, checkedIds]);

  // Summary statistics
  const stats: ConferenceStats = useMemo(() => {
    const totalCount = filteredTransactions.length;
    const conferidosCount = conferidos.length;
    const pendentesCount = pendentes.length;
    const percentCompleted =
      totalCount > 0 ? Math.round((conferidosCount / totalCount) * 100) : 0;

    const totalCentavos = filteredTransactions.reduce(
      (acc, tx) => acc + tx.valorCentavos,
      0
    );
    const conferidosCentavos = conferidos.reduce(
      (acc, tx) => acc + tx.valorCentavos,
      0
    );
    const pendentesCentavos = pendentes.reduce(
      (acc, tx) => acc + tx.valorCentavos,
      0
    );

    return {
      totalCount,
      conferidosCount,
      pendentesCount,
      percentCompleted,
      totalCentavos,
      conferidosCentavos,
      pendentesCentavos,
      totalValor: totalCentavos / 100,
      conferidosValor: conferidosCentavos / 100,
      pendentesValor: pendentesCentavos / 100,
    };
  }, [filteredTransactions, conferidos, pendentes]);

  return {
    selectedDia,
    setSelectedDia,
    selectedHistoricos,
    toggleHistorico,
    selectAllHistoricos,
    clearAllHistoricos,
    timeRange,
    setTimeRange,
    isTimeFilterActive,
    setIsTimeFilterActive,
    checkedIds,
    toggleCheck,
    checkAllFiltered,
    uncheckAllFiltered,
    clearConference,
    filteredTransactions,
    conferidos,
    pendentes,
    stats,
    activeTab,
    setActiveTab,
    persistenceError,
    // Undo / Redo & Highlights
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
    highlightedTxId,
    setHighlightedTxId,
    // Transaction & Observation operations
    updateObservation,
    addManualTransaction,
    editManualTransaction,
    deleteManualTransaction,
    transactions,
    refreshPersistedState,
  };
}
