import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  applySettingsToDocument,
  loadSettings,
  saveSettings,
  type PlayerSettings,
} from "./settings.js";

type SettingsContextValue = {
  settings: PlayerSettings;
  update: (partial: Partial<PlayerSettings>) => void;
  setSettings: (settings: PlayerSettings) => void;
  debugMode: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider(props: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<PlayerSettings>(() => {
    const loaded = loadSettings();
    applySettingsToDocument(loaded);
    return loaded;
  });

  const setSettings = useCallback((next: PlayerSettings) => {
    saveSettings(next);
    setSettingsState(next);
  }, []);

  const update = useCallback((partial: Partial<PlayerSettings>) => {
    setSettingsState((current) => {
      const next: PlayerSettings = {
        ...current,
        ...partial,
        notifications: partial.notifications
          ? { ...current.notifications, ...partial.notifications }
          : current.notifications,
        version: 1,
      };
      saveSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      settings,
      update,
      setSettings,
      debugMode: settings.debugMode,
    }),
    [settings, update, setSettings],
  );

  return <SettingsContext.Provider value={value}>{props.children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
