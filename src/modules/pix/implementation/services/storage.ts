const STORAGE_PREFIX = 'conferencia_pix_marks_';

export interface SavedConferenceState {
  fileHash: string;
  fileName: string;
  checkedIds: string[];
  updatedAt: string;
}

const memoryStore: Record<string, string> = {};

function getStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // If localStorage access throws in restricted iframes
  }

  return {
    getItem: (k: string) => memoryStore[k] ?? null,
    setItem: (k: string, v: string) => {
      memoryStore[k] = v;
    },
    removeItem: (k: string) => {
      delete memoryStore[k];
    },
  };
}

/**
 * Loads checked transaction IDs from localStorage for a specific file hash.
 */
export function loadSavedMarks(fileHash: string): Set<string> {
  if (!fileHash) {
    return new Set<string>();
  }

  try {
    const storage = getStorage();
    const raw = storage.getItem(`${STORAGE_PREFIX}${fileHash}`);
    if (!raw) return new Set<string>();

    const parsed: SavedConferenceState = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.checkedIds)) {
      return new Set<string>(parsed.checkedIds);
    }
  } catch (err) {
    console.error('Erro ao recuperar progresso do localStorage:', err);
  }

  return new Set<string>();
}

/**
 * Saves checked transaction IDs to localStorage for a specific file hash.
 */
export function saveMarks(
  fileHash: string,
  fileName: string,
  checkedIds: Set<string>
): void {
  if (!fileHash) return;

  try {
    const storage = getStorage();
    const state: SavedConferenceState = {
      fileHash,
      fileName,
      checkedIds: Array.from(checkedIds),
      updatedAt: new Date().toISOString(),
    };
    storage.setItem(`${STORAGE_PREFIX}${fileHash}`, JSON.stringify(state));
  } catch (err) {
    console.error('Erro ao salvar progresso no localStorage:', err);
  }
}

/**
 * Clears saved marks for a specific file hash from localStorage.
 */
export function clearSavedMarks(fileHash: string): void {
  if (!fileHash) return;

  try {
    const storage = getStorage();
    storage.removeItem(`${STORAGE_PREFIX}${fileHash}`);
  } catch (err) {
    console.error('Erro ao limpar progresso no localStorage:', err);
  }
}
