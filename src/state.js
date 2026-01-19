export const state = {
  locked: true,
  readOnly: false, // Emergency Read-Only Mode
  vaultMeta: null,   // { version, crypto }
  vaultData: null,   // decrypted object
  fileNameHint: "vault.json",
  inactivityMs: 2 * 60 * 1000, // 2 min default
  _inactivityTimer: null,
};

export function isUnlocked() {
  return !state.locked && !!state.vaultData;
}

export function setUnlocked(meta, data) {
  state.locked = false;
  state.vaultMeta = meta;
  state.vaultData = data;
  state.changeLog = { added: 0, edited: 0, deleted: 0, archived: 0 };
}

export function wipeSensitive() {
  // Best-effort memory clearing: overwrite and drop references.
  state.readOnly = false; // Reset read-only mode
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
        }
      }
      state.vaultData = null;
    } catch {
      state.vaultData = null;
    }
  }
  state.vaultMeta = null;
  state.locked = true;
}

export function resetInactivityTimer(onTimeoutLock) {
  if (state._inactivityTimer) clearTimeout(state._inactivityTimer);
  state._inactivityTimer = setTimeout(() => {
    onTimeoutLock();
  }, state.inactivityMs);
}
