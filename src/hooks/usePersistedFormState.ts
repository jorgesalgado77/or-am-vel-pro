import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Persists form state in sessionStorage so fields survive modal close/reopen.
 * Call `clearPersistedState()` after a successful save to reset.
 *
 * @param key Unique key per form (e.g. "support-dialog")
 * @param initialState Default values for the form
 */
export function usePersistedFormState<T extends Record<string, unknown>>(
  key: string,
  initialState: T,
): [T, (updates: Partial<T>) => void, () => void] {
  const storageKey = `form_persist_${key}`;

  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...initialState, ...parsed };
      }
    } catch {
      // ignore
    }
    return initialState;
  });

  // Sync to sessionStorage on every change
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // quota exceeded — ignore
    }
  }, [state, storageKey]);

  const updateState = useCallback((updates: Partial<T>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const clearPersistedState = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setState(initialState);
  }, [storageKey, initialState]);

  return [state, updateState, clearPersistedState];
}

/**
 * Simple persisted single value — useful for individual fields.
 */
export function usePersistedValue<T>(key: string, initialValue: T): [T, (v: T) => void, () => void] {
  const storageKey = `form_val_${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return initialValue;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [value, storageKey]);

  const clear = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setValue(initialValue);
  }, [storageKey, initialValue]);

  return [value, setValue, clear];
}
