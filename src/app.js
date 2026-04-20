import { state, setUnlocked, wipeSensitive, resetInactivityTimer, isUnlocked, markDirty, markSaved, syncSettingsFromVault } from "./state.js";
import { render, renderEditor, getEditorFormValues, getSearchValues, renderQRModal, closeQRModal } from "./ui.js";
import { auditVault, generatePassword, passwordStrengthHint } from "./features/passwords.js";
import { importEntriesFromFile } from "./features/importers.js";
import { generateTotpCode, isValidTotpSecret, secretFromText } from "./features/totp.js";
import { getArgon2Support } from "./features/kdf.js";
import {
  newEmptyVaultPayload,
  createEncryptedVaultFile,
  openEncryptedVaultFile,
  reencryptVaultToFile,
  downloadJson,
  readJsonFile,
  buildTimestampedFilename,
} from "./vault.js";

const appRoot = document.getElementById("app");
const lockBtn = document.getElementById("lockBtn");

let selectedEntryId = null;
let visibleFilter = { q: "", tag: "", favoritesOnly: false, showArchived: false };
let visiblePasswords = new Set();
let deletingEntryIds = new Set();
let qrState = { chunks: [], index: 0 };
let keyboardNavIndex = -1;
let mode = "home";
let totpIntervalId = null;
let totpCache = new Map();

function updateLockButton() {
  lockBtn.disabled = !isUnlocked();
}

function getSecuritySettings() {
  return state.vaultData?.settings?.security || {
    inactivityMs: 2 * 60 * 1000,
    clipboardClearMs: 20000,
    preferredKdf: "PBKDF2",
    lockOnHide: false,
  };
}

function setSecuritySettings(nextSecurity) {
  if (!state.vaultData) return;
  state.vaultData.settings = state.vaultData.settings || {};
  state.vaultData.settings.security = {
    ...getSecuritySettings(),
    ...nextSecurity,
  };
  syncSettingsFromVault();
  state.upgradeAvailable = state.vaultMeta?.crypto?.kdf !== state.vaultData.settings.security.preferredKdf;
}

function armInactivity() {
  if (!isUnlocked()) return;
  resetInactivityTimer(() => lockNow("Vault locked by inactivity."));
}

function startTotpTicker() {
  if (totpIntervalId) clearInterval(totpIntervalId);
  totpIntervalId = setInterval(() => {
    refreshTotpCache();
  }, 1000);
}

function stopTotpTicker() {
  if (totpIntervalId) {
    clearInterval(totpIntervalId);
    totpIntervalId = null;
  }
}

function rerender() {
  render(appRoot, handlers);
  renderEditor(selectedEntryId ? getEntryById(selectedEntryId) : null, handlers);
  updateLockButton();
}

function lockNow(message = "") {
  selectedEntryId = null;
  keyboardNavIndex = -1;
  visibleFilter = { q: "", tag: "", favoritesOnly: false, showArchived: false };
  visiblePasswords.clear();
  deletingEntryIds.clear();
  qrState = { chunks: [], index: 0 };
  totpCache.clear();
  closeQRModal();
  stopTotpTicker();
  wipeSensitive();
  mode = "home";
  rerender();
  if (message) toast(message);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function toast(message, isError = false) {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const node = document.createElement("div");
  node.id = "toast";
  node.className = "card";
  node.style.position = "fixed";
  node.style.right = "18px";
  node.style.bottom = "18px";
  node.style.maxWidth = "420px";
  node.style.zIndex = 9999;
  node.innerHTML = `<div class="${isError ? "error" : "ok"}">${escapeHtml(message)}</div><div class="small muted">This message disappears automatically.</div>`;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

function cloneSnapshot(entry) {
  return {
    title: entry.title,
    url: entry.url,
    username: entry.username,
    password: entry.password,
    notes: entry.notes,
    tags: [...(entry.tags || [])],
    totpSecret: entry.totpSecret || "",
    totpDigits: entry.totpDigits || 6,
    totpPeriod: entry.totpPeriod || 30,
  };
}

function getEntryById(id) {
  return state.vaultData?.entries?.find((entry) => entry.id === id) || null;
}

function normalizeImportedEntry(entry) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: entry.title || "",
    url: entry.url || "",
    username: entry.username || "",
    password: entry.password || "",
    notes: entry.notes || "",
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    totpSecret: secretFromText(entry.totpSecret || ""),
    totpDigits: entry.totpDigits || 6,
    totpPeriod: entry.totpPeriod || 30,
    history: [],
    isFavorite: false,
    archived: false,
    importedFrom: entry.importedFrom || "Import",
    createdAt: now,
    updatedAt: now,
    lastPasswordChangeAt: now,
  };
}

function createNewEntry() {
  return normalizeImportedEntry({ importedFrom: "Manual" });
}

function getVisibleEntries() {
  const entries = [...(state.vaultData?.entries || [])];
  const { q, tag, favoritesOnly, showArchived } = visibleFilter;
  let out = showArchived ? entries.filter((entry) => entry.archived) : entries.filter((entry) => !entry.archived);
  if (favoritesOnly) out = out.filter((entry) => entry.isFavorite);
  if (q) {
    const needle = q.toLowerCase();
    out = out.filter((entry) => [entry.title, entry.url, entry.username, entry.notes, ...(entry.tags || [])].join(" ").toLowerCase().includes(needle));
  }
  if (tag) {
    const needle = tag.toLowerCase();
    out = out.filter((entry) => (entry.tags || []).some((item) => item.toLowerCase() === needle));
  }
  out.sort((a, b) => {
    if (!!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
  return out;
}

function getAudit() {
  return auditVault(state.vaultData?.entries || []);
}

function getAuditById(id) {
  return getAudit().items.find((item) => item.id === id) || { issues: [], score: 0 };
}

function summarizeChanges() {
  const changeLog = state.changeLog || {};
  return [
    changeLog.added ? `${changeLog.added} new` : "",
    changeLog.edited ? `${changeLog.edited} edited` : "",
    changeLog.deleted ? `${changeLog.deleted} deleted` : "",
    changeLog.archived ? `${changeLog.archived} archived` : "",
    changeLog.imported ? `${changeLog.imported} imported` : "",
  ].filter(Boolean).join(", ");
}

async function copyWithAutoClear(value, label) {
  if (state.readOnly) return toast("Clipboard disabled in Emergency Read-Only Mode.", true);
  try {
    await navigator.clipboard.writeText(value || "");
    toast(`${label} copied to clipboard.`);
    const clearMs = getSecuritySettings().clipboardClearMs || 20000;
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === value) await navigator.clipboard.writeText("");
      } catch {
        // Best-effort clear only.
      }
    }, clearMs);
  } catch {
    toast("Clipboard copy failed.", true);
  }
}

async function getEntryTotp(entry) {
  if (!entry?.totpSecret) return { valid: false, label: "No TOTP secret set", code: "", expiresIn: 0 };
  if (!isValidTotpSecret(entry.totpSecret)) return { valid: false, label: "Invalid TOTP secret", code: "", expiresIn: 0 };
  try {
    const data = await generateTotpCode(entry.totpSecret, {
      digits: entry.totpDigits || 6,
      period: entry.totpPeriod || 30,
    });
    return { valid: true, label: "TOTP ready", ...data };
  } catch (error) {
    return { valid: false, label: error.message, code: "", expiresIn: 0 };
  }
}

async function refreshTotpCache() {
  const entries = state.vaultData?.entries || [];
  const nextCache = new Map();
  await Promise.all(entries.map(async (entry) => {
    if (!entry.totpSecret) return;
    nextCache.set(entry.id, await getEntryTotp(entry));
  }));
  totpCache = nextCache;
}

function updateVaultTimestamp() {
  if (state.vaultData) state.vaultData.updatedAt = new Date().toISOString();
}

function renderCreateScreen() {
  const wrap = document.createElement("div");
  wrap.className = "card";
  const argon2 = getArgon2Support();
  wrap.innerHTML = `
    <h2>Create New Vault</h2>
    <div class="row">
      <div>
        <label>Vault Name</label>
        <input id="cv_name" type="text" autocomplete="off" placeholder="My Vault" />
      </div>
      <div>
        <label>File name</label>
        <input id="cv_filename" type="text" autocomplete="off" value="vault.json" />
      </div>
    </div>
    <div class="row">
      <div>
        <label>Master Password</label>
        <input id="cv_pw" type="password" autocomplete="new-password" />
        <div class="small" id="pw_strength"></div>
      </div>
      <div>
        <label>Confirm Master Password</label>
        <input id="cv_pw2" type="password" autocomplete="new-password" />
      </div>
    </div>
    <div class="row">
      <div>
        <label>Preferred KDF</label>
        <select id="cv_kdf">
          <option value="PBKDF2">PBKDF2</option>
          <option value="Argon2id" ${argon2.available ? "" : "disabled"}>Argon2id ${argon2.available ? "" : "(adapter missing)"}</option>
        </select>
      </div>
      <div>
        <label>Auto-lock timeout</label>
        <select id="cv_timeout">
          <option value="60000">1 minute</option>
          <option value="120000" selected>2 minutes</option>
          <option value="300000">5 minutes</option>
          <option value="900000">15 minutes</option>
        </select>
      </div>
    </div>
    <div class="actions">
      <button id="cv_create">Create & Download Vault</button>
      <button class="secondary" id="cv_back">Back</button>
    </div>
    <p class="small muted">Argon2id migration is supported when a runtime adapter is available. This build does not bundle one by default.</p>
  `;

  wrap.querySelector("#cv_back").addEventListener("click", () => {
    mode = "home";
    rerender();
  });
  const pw = wrap.querySelector("#cv_pw");
  const pw2 = wrap.querySelector("#cv_pw2");
  const strength = wrap.querySelector("#pw_strength");
  pw.addEventListener("input", () => {
    strength.textContent = passwordStrengthHint(pw.value);
    strength.className = `small ${pw.value.length >= 12 ? "ok" : "muted"}`;
  });
  wrap.querySelector("#cv_create").addEventListener("click", async () => {
    const name = wrap.querySelector("#cv_name").value.trim() || "My Vault";
    const filename = wrap.querySelector("#cv_filename").value.trim() || "vault.json";
    const preferredKdf = wrap.querySelector("#cv_kdf").value;
    const inactivityMs = Number(wrap.querySelector("#cv_timeout").value) || 120000;
    if (!pw.value || pw.value.length < 8) return toast("Use a master password with at least 8 characters.", true);
    if (pw.value !== pw2.value) return toast("Passwords do not match.", true);

    const payload = newEmptyVaultPayload(name);
    payload.settings.security.preferredKdf = preferredKdf;
    payload.settings.security.inactivityMs = inactivityMs;

    try {
      const fileJson = await createEncryptedVaultFile(payload, pw.value, { kdf: preferredKdf });
      downloadJson(fileJson, filename);
      toast("Downloaded new encrypted vault.");
      mode = "home";
      rerender();
    } catch (error) {
      toast(error.message || "Failed to create vault.", true);
    } finally {
      pw.value = "";
      pw2.value = "";
    }
  });
  return wrap;
}

function renderOpenScreen() {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>Open Existing Vault</h2>
    <div class="row">
      <div>
        <label>Encrypted vault JSON</label>
        <input id="ov_file" type="file" accept="application/json" />
      </div>
      <div>
        <label>Master Password</label>
        <input id="ov_pw" type="password" autocomplete="current-password" />
      </div>
    </div>
    <div class="inline wrap" style="margin-top:12px;">
      <label class="inline" style="gap:8px;">
        <input id="ov_readonly" type="checkbox" style="width:auto;" />
        <span>Open in Emergency Read-Only Mode</span>
      </label>
    </div>
    <div class="actions">
      <button id="ov_open">Open Vault</button>
      <button class="secondary" id="ov_back">Back</button>
    </div>
    <p class="small muted">Decrypted data stays only in memory. Refreshing or locking clears it.</p>
  `;

  wrap.querySelector("#ov_back").addEventListener("click", () => {
    mode = "home";
    rerender();
  });
  wrap.querySelector("#ov_open").addEventListener("click", async () => {
    const file = wrap.querySelector("#ov_file").files?.[0];
    const password = wrap.querySelector("#ov_pw").value;
    if (!file) return toast("Choose a vault JSON file.", true);
    if (!password) return toast("Enter the master password.", true);
    try {
      const obj = await readJsonFile(file);
      const { meta, data } = await openEncryptedVaultFile(obj, password);
      state.fileNameHint = file.name || "vault.json";
      setUnlocked(meta, data);
      state.readOnly = wrap.querySelector("#ov_readonly").checked;
      state.upgradeAvailable = meta.crypto.kdf !== getSecuritySettings().preferredKdf;
      await refreshTotpCache();
      mode = "home";
      rerender();
      startTotpTicker();
      armInactivity();
    } catch (error) {
      toast(error.message || "Failed to open vault.", true);
    } finally {
      wrap.querySelector("#ov_pw").value = "";
    }
  });
  return wrap;
}

function renderChangePasswordScreen() {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>Change Master Password</h2>
    <div class="row">
      <div>
        <label>New Master Password</label>
        <input id="cp_pw" type="password" autocomplete="new-password" />
        <div class="small" id="cp_strength"></div>
      </div>
      <div>
        <label>Confirm New Master Password</label>
        <input id="cp_pw2" type="password" autocomplete="new-password" />
      </div>
    </div>
    <div class="actions">
      <button id="cp_save">Change & Download Vault</button>
      <button class="secondary" id="cp_back">Cancel</button>
    </div>
    <p class="small muted">This re-encrypts the entire vault and downloads a new file. Keep the previous file until you verify the new one opens.</p>
  `;
  wrap.querySelector("#cp_back").addEventListener("click", () => {
    mode = "home";
    rerender();
  });
  const pw = wrap.querySelector("#cp_pw");
  const pw2 = wrap.querySelector("#cp_pw2");
  const strength = wrap.querySelector("#cp_strength");
  pw.addEventListener("input", () => {
    strength.textContent = passwordStrengthHint(pw.value);
    strength.className = `small ${pw.value.length >= 12 ? "ok" : "muted"}`;
  });
  wrap.querySelector("#cp_save").addEventListener("click", async () => {
    if (!pw.value || pw.value.length < 8) return toast("Use a stronger password.", true);
    if (pw.value !== pw2.value) return toast("Passwords do not match.", true);
    try {
      updateVaultTimestamp();
      const fileJson = await reencryptVaultToFile(state.vaultData, pw.value, state.vaultMeta, {
        kdf: getSecuritySettings().preferredKdf,
      });
      const filename = buildTimestampedFilename(state.fileNameHint || "vault.json");
      downloadJson(fileJson, filename);
      markSaved(filename);
      toast("Downloaded vault with the new master password.");
      mode = "home";
      rerender();
    } catch (error) {
      toast(error.message || "Failed to change password.", true);
    }
  });
  return wrap;
}

function renderImportScreen() {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>Import Entries</h2>
    <p class="small muted">Supported now: generic CSV exports and Bitwarden JSON exports.</p>
    <div class="row">
      <div>
        <label>Import file</label>
        <input id="iv_file" type="file" accept=".csv,.json" />
      </div>
    </div>
    <div class="actions">
      <button id="iv_import">Import Into Current Vault</button>
      <button class="secondary" id="iv_back">Back</button>
    </div>
  `;
  wrap.querySelector("#iv_back").addEventListener("click", () => {
    mode = "home";
    rerender();
  });
  wrap.querySelector("#iv_import").addEventListener("click", async () => {
    const file = wrap.querySelector("#iv_file").files?.[0];
    if (!file) return toast("Choose an import file.", true);
    try {
      const imported = await importEntriesFromFile(file);
      const entries = imported.map(normalizeImportedEntry);
      state.vaultData.entries.unshift(...entries);
      updateVaultTimestamp();
      markDirty("imported", entries.length);
      await refreshTotpCache();
      toast(`Imported ${entries.length} entries.`);
      mode = "home";
      rerender();
    } catch (error) {
      toast(error.message || "Import failed.", true);
    }
  });
  return wrap;
}

function renderSecurityScreen() {
  const wrap = document.createElement("div");
  wrap.className = "card";
  const security = getSecuritySettings();
  const argon2 = getArgon2Support();
  wrap.innerHTML = `
    <h2>Security Settings</h2>
    <div class="row">
      <div>
        <label>Auto-lock timeout (minutes)</label>
        <input id="sv_timeout" type="number" min="1" max="120" value="${Math.round((security.inactivityMs || 120000) / 60000)}" />
      </div>
      <div>
        <label>Clipboard clear delay (seconds)</label>
        <input id="sv_clipboard" type="number" min="5" max="120" value="${Math.round((security.clipboardClearMs || 20000) / 1000)}" />
      </div>
    </div>
    <div class="row">
      <div>
        <label>Preferred KDF for next save</label>
        <select id="sv_kdf">
          <option value="PBKDF2" ${security.preferredKdf === "PBKDF2" ? "selected" : ""}>PBKDF2</option>
          <option value="Argon2id" ${(security.preferredKdf === "Argon2id") ? "selected" : ""} ${argon2.available ? "" : "disabled"}>Argon2id ${argon2.available ? "" : "(adapter missing)"}</option>
        </select>
      </div>
      <div class="inline wrap" style="align-items:end;">
        <label class="inline" style="gap:8px; margin:0 0 10px 0;">
          <input id="sv_hide" type="checkbox" style="width:auto;" ${security.lockOnHide ? "checked" : ""} />
          <span>Lock immediately when tab is hidden</span>
        </label>
      </div>
    </div>
    <div class="actions">
      <button id="sv_save">Save Settings</button>
      <button class="secondary" id="sv_back">Back</button>
    </div>
    <p class="small muted">Current vault crypto: ${state.vaultMeta?.crypto?.kdf || "PBKDF2"}. If preferred KDF differs, the next download will migrate the vault.</p>
  `;
  wrap.querySelector("#sv_back").addEventListener("click", () => {
    mode = "home";
    rerender();
  });
  wrap.querySelector("#sv_save").addEventListener("click", () => {
    const minutes = Math.max(1, Number(wrap.querySelector("#sv_timeout").value) || 2);
    const seconds = Math.max(5, Number(wrap.querySelector("#sv_clipboard").value) || 20);
    const preferredKdf = wrap.querySelector("#sv_kdf").value;
    setSecuritySettings({
      inactivityMs: minutes * 60000,
      clipboardClearMs: seconds * 1000,
      preferredKdf,
      lockOnHide: wrap.querySelector("#sv_hide").checked,
    });
    markDirty("edited");
    toast("Security settings updated. Download the vault to persist them.");
    mode = "home";
    rerender();
    armInactivity();
  });
  return wrap;
}

function showModeScreen() {
  appRoot.innerHTML = "";
  const screen = mode === "create"
    ? renderCreateScreen()
    : mode === "open"
      ? renderOpenScreen()
      : mode === "change-password"
        ? renderChangePasswordScreen()
        : mode === "import"
          ? renderImportScreen()
          : mode === "security"
            ? renderSecurityScreen()
            : null;
  if (screen) {
    appRoot.appendChild(screen);
  } else {
    rerender();
  }
}

lockBtn.addEventListener("click", () => lockNow("Vault locked."));

["mousemove", "keydown", "mousedown", "touchstart"].forEach((eventName) => {
  window.addEventListener(eventName, () => {
    if (isUnlocked()) armInactivity();
  }, { passive: true });
});

document.addEventListener("visibilitychange", () => {
  if (!isUnlocked()) return;
  if (document.hidden && getSecuritySettings().lockOnHide) {
    lockNow("Vault locked because the tab was hidden.");
  } else if (!document.hidden) {
    armInactivity();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.hasUnsavedChanges) return;
  event.preventDefault();
  event.returnValue = "";
});

document.addEventListener("keydown", (event) => {
  if (!isUnlocked() || state.readOnly) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const entries = getVisibleEntries();
  if (!entries.length) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    keyboardNavIndex = Math.min(keyboardNavIndex + 1, entries.length - 1);
    selectedEntryId = entries[keyboardNavIndex]?.id || selectedEntryId;
    rerender();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    keyboardNavIndex = Math.max(keyboardNavIndex - 1, 0);
    selectedEntryId = entries[keyboardNavIndex]?.id || selectedEntryId;
    rerender();
  } else if (event.key === "Enter" && keyboardNavIndex >= 0) {
    event.preventDefault();
    handlers.onEditEntry(entries[keyboardNavIndex].id);
  }
});

const handlers = {
  onGoCreate: () => {
    mode = "create";
    showModeScreen();
  },
  onGoOpen: () => {
    mode = "open";
    showModeScreen();
  },
  onGoImport: () => {
    mode = "import";
    showModeScreen();
  },
  onGoSecurity: () => {
    mode = "security";
    showModeScreen();
  },
  onGoChangePassword: () => {
    if (state.readOnly) return toast("Disabled in Read-Only Mode.", true);
    mode = "change-password";
    showModeScreen();
  },
  onGoQR: async () => {
    if (state.readOnly) return toast("Disabled in Read-Only Mode.", true);
    if (!window.qrcode) return toast("QR library is not loaded.", true);
    const master = prompt("Enter master password to generate transfer QR codes:");
    if (!master) return;
    try {
      const fileJson = await reencryptVaultToFile(state.vaultData, master, state.vaultMeta, { kdf: getSecuritySettings().preferredKdf });
      const json = JSON.stringify(fileJson);
      const chunkSize = 800;
      const chunks = [];
      for (let i = 0; i < json.length; i += chunkSize) {
        chunks.push(`ZV2:${Math.floor(i / chunkSize) + 1}/${Math.ceil(json.length / chunkSize)}:${json.slice(i, i + chunkSize)}`);
      }
      qrState = { chunks, index: 0 };
      renderQRModal(chunks, 0, chunks.length, handlers);
      armInactivity();
    } catch (error) {
      toast(error.message || "QR generation failed.", true);
    }
  },
  onNextQR: () => {
    if (qrState.index < qrState.chunks.length - 1) {
      qrState.index += 1;
      renderQRModal(qrState.chunks, qrState.index, qrState.chunks.length, handlers);
    } else {
      closeQRModal();
      toast("Transfer finished.");
    }
  },
  onPrevQR: () => {
    if (qrState.index > 0) {
      qrState.index -= 1;
      renderQRModal(qrState.chunks, qrState.index, qrState.chunks.length, handlers);
    }
  },
  onCloseQR: () => {
    qrState = { chunks: [], index: 0 };
    closeQRModal();
  },
  onSwitchReadOnly: () => {
    state.readOnly = true;
    rerender();
    toast("Switched to Emergency Read-Only Mode.");
  },
  onAddEntry: () => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode.", true);
    const entry = createNewEntry();
    state.vaultData.entries.unshift(entry);
    selectedEntryId = entry.id;
    updateVaultTimestamp();
    markDirty("added");
    rerender();
  },
  onEditEntry: (id) => {
    selectedEntryId = id;
    rerender();
    armInactivity();
  },
  onCancelEdit: () => {
    selectedEntryId = null;
    rerender();
  },
  onSaveEntry: (id) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode.", true);
    const entry = getEntryById(id);
    if (!entry) return;
    const values = getEditorFormValues();
    const normalizedSecret = secretFromText(values.totpSecret || "");
    const next = { ...values, totpSecret: normalizedSecret };
    const hasChanges = JSON.stringify({
      ...cloneSnapshot(entry),
      totpSecret: entry.totpSecret || "",
    }) !== JSON.stringify(next);
    if (!hasChanges) return toast("No changes to save.");

    entry.history = entry.history || [];
    entry.history.unshift({
      savedAt: new Date().toISOString(),
      snapshot: cloneSnapshot(entry),
    });
    if (entry.history.length > 10) entry.history.length = 10;
    const passwordChanged = entry.password !== next.password;
    Object.assign(entry, next, { updatedAt: new Date().toISOString() });
    if (passwordChanged) entry.lastPasswordChangeAt = new Date().toISOString();
    updateVaultTimestamp();
    markDirty("edited");
    refreshTotpCache();
    rerender();
    toast("Entry updated. Download the vault to persist changes.");
  },
  onRestoreHistory: (entryId, historyIndex) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode.", true);
    const entry = getEntryById(entryId);
    if (!entry?.history?.[historyIndex]) return;
    if (!confirm("Restore this saved version? The current version will be pushed into history.")) return;
    const snapshot = entry.history[historyIndex].snapshot;
    entry.history.unshift({
      savedAt: new Date().toISOString(),
      reason: "Rollback",
      snapshot: cloneSnapshot(entry),
    });
    Object.assign(entry, snapshot, { updatedAt: new Date().toISOString() });
    if (entry.history.length > 20) entry.history.length = 20;
    updateVaultTimestamp();
    markDirty("edited");
    refreshTotpCache();
    rerender();
  },
  onToggleFavorite: (id) => {
    if (state.readOnly) return;
    const entry = getEntryById(id);
    if (!entry) return;
    entry.isFavorite = !entry.isFavorite;
    entry.updatedAt = new Date().toISOString();
    updateVaultTimestamp();
    markDirty("edited");
    rerender();
  },
  onArchiveEntry: (id) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode.", true);
    const entry = getEntryById(id);
    if (!entry) return;
    entry.archived = true;
    entry.updatedAt = new Date().toISOString();
    updateVaultTimestamp();
    markDirty("archived");
    if (selectedEntryId === id) selectedEntryId = null;
    rerender();
  },
  onRestoreEntry: (id) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode.", true);
    const entry = getEntryById(id);
    if (!entry) return;
    entry.archived = false;
    entry.updatedAt = new Date().toISOString();
    updateVaultTimestamp();
    markDirty("edited");
    rerender();
  },
  onInitiateDelete: (id) => {
    deletingEntryIds.add(id);
    rerender();
  },
  onCancelDelete: (id) => {
    deletingEntryIds.delete(id);
    rerender();
  },
  isEntryDeleting: (id) => deletingEntryIds.has(id),
  onDeleteEntry: (id) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode.", true);
    state.vaultData.entries = state.vaultData.entries.filter((entry) => entry.id !== id);
    deletingEntryIds.delete(id);
    if (selectedEntryId === id) selectedEntryId = null;
    updateVaultTimestamp();
    markDirty("deleted");
    rerender();
  },
  onCopyUsername: async (id) => {
    const entry = getEntryById(id);
    if (!entry) return;
    await copyWithAutoClear(entry.username || "", "Username");
  },
  onCopyPassword: async (id) => {
    const entry = getEntryById(id);
    if (!entry) return;
    await copyWithAutoClear(entry.password || "", "Password");
  },
  onCopyTotp: async (id) => {
    const entry = getEntryById(id);
    if (!entry?.totpSecret) return toast("No TOTP secret configured.", true);
    const totp = await getEntryTotp(entry);
    if (!totp.valid || !totp.code) return toast(totp.label, true);
    await copyWithAutoClear(totp.code, "TOTP code");
  },
  onGeneratePassword: (id) => {
    const entry = getEntryById(id);
    if (!entry) return;
    const lenInput = prompt("Generated password length:", "20");
    if (!lenInput) return;
    const length = Math.max(12, Number(lenInput) || 20);
    try {
      const password = generatePassword({ length, includeUpper: true, includeLower: true, includeNumbers: true, includeSymbols: true });
      const input = document.getElementById("f_password");
      if (input) input.value = password;
      toast("Generated a strong password. Save the entry to keep it.");
    } catch (error) {
      toast(error.message, true);
    }
  },
  onSaveDownload: async () => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode.", true);
    if (!state.vaultData) return;
    const summary = summarizeChanges();
    if (summary && !confirm(`Download updated vault?\n\nChanges: ${summary}`)) return;
    const master = prompt("Enter master password to re-encrypt and download:");
    if (!master) return;
    const backupAlso = confirm("Also download a timestamped backup copy?");
    try {
      updateVaultTimestamp();
      state.vaultData.saveHistory.unshift({
        savedAt: new Date().toISOString(),
        fileName: state.fileNameHint || "vault.json",
        changeSummary: summary || "No tracked changes",
        kdf: getSecuritySettings().preferredKdf,
      });
      if (state.vaultData.saveHistory.length > 20) state.vaultData.saveHistory.length = 20;
      const fileJson = await reencryptVaultToFile(state.vaultData, master, state.vaultMeta, {
        kdf: getSecuritySettings().preferredKdf,
      });
      const primaryName = state.fileNameHint || "vault.json";
      downloadJson(fileJson, primaryName);
      if (backupAlso) {
        downloadJson(fileJson, buildTimestampedFilename(primaryName));
      }
      state.vaultMeta.crypto.kdf = getSecuritySettings().preferredKdf;
      state.upgradeAvailable = false;
      markSaved(primaryName);
      toast(backupAlso ? "Downloaded vault and timestamped backup." : "Downloaded updated vault.");
      rerender();
    } catch (error) {
      toast(error.message || "Failed to encrypt vault.", true);
    }
    armInactivity();
  },
  onToggleFavoriteFilter: () => {
    visibleFilter.favoritesOnly = !visibleFilter.favoritesOnly;
    rerender();
  },
  onToggleArchiveFilter: () => {
    visibleFilter.showArchived = !visibleFilter.showArchived;
    rerender();
  },
  onApplySearch: () => {
    visibleFilter = { ...visibleFilter, ...getSearchValues() };
    rerender();
  },
  onClearSearch: () => {
    visibleFilter = { q: "", tag: "", favoritesOnly: false, showArchived: false };
    rerender();
  },
  onTogglePassword: (id) => {
    if (visiblePasswords.has(id)) visiblePasswords.delete(id);
    else visiblePasswords.add(id);
    rerender();
  },
  getVisibleEntries,
  getFilterState: () => ({ ...visibleFilter }),
  isShowArchived: () => visibleFilter.showArchived,
  isFavoritesFilterOn: () => visibleFilter.favoritesOnly,
  isPasswordVisible: (id) => visiblePasswords.has(id),
  isKeyboardSelected: (index) => getVisibleEntries()[index]?.id === selectedEntryId,
  isEntrySelected: (id) => id === selectedEntryId,
  getAuditSummary: () => getAudit().totals,
  getEntryAudit: (id) => getAuditById(id),
  getEntryTotp: (id) => {
    return totpCache.get(id) || {
      valid: false,
      label: getEntryById(id)?.totpSecret ? "Calculating TOTP..." : "No TOTP secret set",
      code: "",
      expiresIn: 0,
    };
  },
  getCryptoSummary: () => {
    const security = getSecuritySettings();
    return {
      current: `${state.vaultMeta?.crypto?.kdf || "PBKDF2"} / ${state.vaultMeta?.crypto?.cipher || "AES-GCM"}`,
      preferred: security.preferredKdf,
      upgradeAvailable: state.upgradeAvailable,
      argon2Available: getArgon2Support().available,
    };
  },
  getFileSummary: () => ({
    name: state.fileNameHint || "vault.json",
    lastSaved: state.lastSavedAt ? new Date(state.lastSavedAt).toLocaleString() : "Not downloaded in this session",
  }),
};

function init() {
  try {
    render(appRoot, handlers);
    updateLockButton();
    startTotpTicker();
    refreshTotpCache();
  } catch (error) {
    document.body.innerHTML = `<div style="color:red; padding:20px;"><h3>Error initializing app:</h3><pre>${escapeHtml(error.stack || error.message)}</pre></div>`;
  }
}

showModeScreen();
init();
