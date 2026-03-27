import { useState, useEffect, useCallback } from "react";

export type PushCategory = "tarefas" | "mensagens" | "leads";

export interface PushPreferences {
  tarefas: boolean;
  mensagens: boolean;
  leads: boolean;
}

const STORAGE_KEY = "push_notification_preferences";

const DEFAULT_PREFS: PushPreferences = {
  tarefas: true,
  mensagens: true,
  leads: true,
};

export function usePushPreferences() {
  const [preferences, setPreferences] = useState<PushPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_PREFS, ...JSON.parse(stored) } : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });

  const updatePreference = useCallback((category: PushCategory, enabled: boolean) => {
    setPreferences(prev => {
      const next = { ...prev, [category]: enabled };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isEnabled = useCallback((category: PushCategory) => {
    return preferences[category] ?? true;
  }, [preferences]);

  return { preferences, updatePreference, isEnabled };
}
