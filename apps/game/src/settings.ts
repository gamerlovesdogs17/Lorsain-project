export const PLAYER_SETTINGS_KEY = "lorsain-player-settings";

export type NotificationCategory =
  "elections" | "government" | "legislation" | "party" | "caucuses" | "foreign" | "career";

export type PlayerSettings = {
  autosave: boolean;
  confirmMajorActions: boolean;
  notifications: Record<NotificationCategory, boolean>;
  reducedMotion: boolean;
  highContrast: boolean;
  compactDensity: boolean;
  debugMode: boolean;
  version: 1;
};

export const NOTIFICATION_CATEGORIES: Array<{ id: NotificationCategory; label: string }> = [
  { id: "elections", label: "Elections" },
  { id: "government", label: "Government" },
  { id: "legislation", label: "Legislation" },
  { id: "party", label: "Party" },
  { id: "caucuses", label: "Caucuses" },
  { id: "foreign", label: "Foreign Affairs" },
  { id: "career", label: "Personal / Career" },
];

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  autosave: true,
  confirmMajorActions: true,
  notifications: {
    elections: true,
    government: true,
    legislation: true,
    party: true,
    caucuses: true,
    foreign: true,
    career: true,
  },
  reducedMotion: false,
  highContrast: false,
  compactDensity: false,
  debugMode: false,
  version: 1,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSettings(raw: unknown): PlayerSettings {
  if (!isRecord(raw))
    return {
      ...DEFAULT_PLAYER_SETTINGS,
      notifications: { ...DEFAULT_PLAYER_SETTINGS.notifications },
    };
  const notifications = { ...DEFAULT_PLAYER_SETTINGS.notifications };
  if (isRecord(raw.notifications)) {
    for (const key of Object.keys(notifications) as NotificationCategory[]) {
      if (typeof raw.notifications[key] === "boolean") {
        notifications[key] = raw.notifications[key] as boolean;
      }
    }
  }
  return {
    autosave: typeof raw.autosave === "boolean" ? raw.autosave : DEFAULT_PLAYER_SETTINGS.autosave,
    confirmMajorActions:
      typeof raw.confirmMajorActions === "boolean"
        ? raw.confirmMajorActions
        : DEFAULT_PLAYER_SETTINGS.confirmMajorActions,
    notifications,
    reducedMotion:
      typeof raw.reducedMotion === "boolean"
        ? raw.reducedMotion
        : DEFAULT_PLAYER_SETTINGS.reducedMotion,
    highContrast:
      typeof raw.highContrast === "boolean"
        ? raw.highContrast
        : (DEFAULT_PLAYER_SETTINGS.highContrast ?? false),
    compactDensity:
      typeof raw.compactDensity === "boolean"
        ? raw.compactDensity
        : (DEFAULT_PLAYER_SETTINGS.compactDensity ?? false),
    debugMode:
      typeof raw.debugMode === "boolean" ? raw.debugMode : DEFAULT_PLAYER_SETTINGS.debugMode,
    version: 1,
  };
}

export function loadSettings(): PlayerSettings {
  if (typeof window === "undefined") {
    return {
      ...DEFAULT_PLAYER_SETTINGS,
      notifications: { ...DEFAULT_PLAYER_SETTINGS.notifications },
    };
  }
  try {
    const raw = window.localStorage.getItem(PLAYER_SETTINGS_KEY);
    if (!raw) {
      return {
        ...DEFAULT_PLAYER_SETTINGS,
        notifications: { ...DEFAULT_PLAYER_SETTINGS.notifications },
      };
    }
    return normalizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return {
      ...DEFAULT_PLAYER_SETTINGS,
      notifications: { ...DEFAULT_PLAYER_SETTINGS.notifications },
    };
  }
}

export function saveSettings(settings: PlayerSettings): void {
  if (typeof window === "undefined") return;
  const next: PlayerSettings = { ...settings, version: 1 };
  window.localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(next));
  applySettingsToDocument(next);
}

export function updateSettings(partial: Partial<PlayerSettings>): PlayerSettings {
  const current = loadSettings();
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
}

export function isDebugMode(): boolean {
  return loadSettings().debugMode;
}

export function applySettingsToDocument(settings: PlayerSettings = loadSettings()): void {
  if (typeof document === "undefined") return;
  document.body.setAttribute("data-density", settings.compactDensity ? "compact" : "comfortable");
  document.body.classList.toggle("reduced-motion", settings.reducedMotion);
  document.body.classList.toggle("high-contrast", Boolean(settings.highContrast));
  document.body.classList.toggle("debug-mode", settings.debugMode);
}
