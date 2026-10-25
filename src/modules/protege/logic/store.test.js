import { describe, expect, it } from 'vitest';
import { ProtegeStore } from './store.js';

describe('histórico Protege', () => {
  it('remove somente registros exclusivos da importação e limpa o filtro ativo', () => {
    const store = new ProtegeStore({
      records: [
        { id: 'shared', lotericaKey: 'cacula' },
        { id: 'only-first', lotericaKey: 'cacula' },
        { id: 'untracked', lotericaKey: 'cacula' },
      ],
      historicoImportacoes: [
        { id: 'first', recordIds: ['shared', 'only-first'] },
        { id: 'second', recordIds: ['shared'] },
      ],
      filtroImportacaoId: 'first',
    });

    expect(store.deleteImportHistory('first')).toEqual({ deletedRecords: 1 });
    expect(store.filtroImportacaoId).toBeNull();
    expect(store.recordsMap.has('only-first')).toBe(false);
    expect(store.recordsMap.has('shared')).toBe(true);
    expect(store.recordsMap.has('untracked')).toBe(true);
  });

  it('limpa os registros rastreados pelo histórico e preserva registros sem vínculo', () => {
    const store = new ProtegeStore({
      records: [{ id: 'tracked', lotericaKey: 'cacula' }, { id: 'untracked', lotericaKey: 'cacula' }],
      historicoImportacoes: [{ id: 'first', recordIds: ['tracked'] }],
      filtroImportacaoId: 'first',
    });

    expect(store.clearImportHistory()).toEqual({ deletedRecords: 1 });
    expect(store.historicoImportacoes).toEqual([]);
    expect(store.filtroImportacaoId).toBeNull();
    expect(store.recordsMap.has('untracked')).toBe(true);
  });
});
