export const DEFAULT_INACTIVITY_MS = 2 * 60 * 1000;

export const state = {
  locked: true,
  readOnly: false,
  vaultMeta: null,
  vaultData: null,
  fileNameHint: "vault.json",
  inactivityMs: DEFAULT_INACTIVITY_MS,
  _inactivityTimer: null,
  changeLog: null,
  hasUnsavedChanges: false,
  lastSavedAt: null,
  lastSavedFileName: null,
  upgradeAvailable: false,
  lastUndoSnapshot: null,
};

export function isUnlocked() {
  return !state.locked && !!state.vaultData;
}

export function setUnlocked(meta, data) {
  state.locked = false;
  state.vaultMeta = meta;
  state.vaultData = data;
  state.changeLog = { added: 0, edited: 0, deleted: 0, archived: 0, imported: 0 };
  state.hasUnsavedChanges = false;
  state.lastSavedAt = null;
  state.upgradeAvailable = false;
  syncSettingsFromVault();
}

export function syncSettingsFromVault() {
  const inactivityMs = state.vaultData?.settings?.security?.inactivityMs;
  state.inactivityMs = Number.isFinite(inactivityMs) && inactivityMs > 0
    ? inactivityMs
    : DEFAULT_INACTIVITY_MS;
}

export function markDirty(kind = "edited", count = 1) {
  state.hasUnsavedChanges = true;
  if (state.changeLog && typeof state.changeLog[kind] === "number") {
    state.changeLog[kind] += count;
  }
}

export function markSaved(fileName) {
  state.hasUnsavedChanges = false;
  state.lastSavedAt = new Date().toISOString();
  state.lastSavedFileName = fileName || null;
  state.changeLog = { added: 0, edited: 0, deleted: 0, archived: 0, imported: 0 };
}

export function rememberUndoSnapshot(snapshot) {
  state.lastUndoSnapshot = snapshot;
}

export function clearUndoSnapshot() {
  state.lastUndoSnapshot = null;
}

export function wipeSensitive() {
  state.readOnly = false;
  if (state._inactivityTimer) {
    clearTimeout(state._inactivityTimer);
    state._inactivityTimer = null;
  }
  if (state.vaultData) {
    try {
      if (Array.isArray(state.vaultData.entries)) {
        for (const e of state.vaultData.entries) {
          if (e.password) e.password = "";
          if (e.username) e.username = "";
          if (e.notes) e.notes = "";
          if (e.url) e.url = "";
          if (e.title) e.title = "";
          if (e.tags) e.tags = [];
          if (e.totpSecret) e.totpSecret = "";
        }
      }
    } catch {
      // Best-effort wipe only.
    }
  }
  state.vaultData = null;
  state.vaultMeta = null;
  state.locked = true;
  state.hasUnsavedChanges = false;
  state.lastSavedAt = null;
  state.lastSavedFileName = null;
  state.upgradeAvailable = false;
  state.lastUndoSnapshot = null;
}

export function resetInactivityTimer(onTimeoutLock) {
  if (state._inactivityTimer) clearTimeout(state._inactivityTimer);
  state._inactivityTimer = setTimeout(() => {
    onTimeoutLock();
  }, state.inactivityMs);
}
