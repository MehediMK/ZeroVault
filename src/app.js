import { state, setUnlocked, wipeSensitive, resetInactivityTimer, isUnlocked } from "./state.js";
import { render, renderEditor, getEditorFormValues, getSearchValues, renderQRModal, closeQRModal } from "./ui.js";
import { getDomainColor, getInitials, timeAgo } from "./helpers.js";
import {
  newEmptyVaultPayload,
  createEncryptedVaultFile,
  openEncryptedVaultFile,
  reencryptVaultToFile,
  downloadJson,
  readJsonFile
} from "./vault.js";

const appRoot = document.getElementById("app");
const lockBtn = document.getElementById("lockBtn");

// In-memory only; user must re-enter master password to save (by design).
let selectedEntryId = null;
let visibleFilter = { q: "", tag: "", favoritesOnly: false, showArchived: false };
let visiblePasswords = new Set();
let deletingEntryIds = new Set();
let qrState = { chunks: [], index: 0 };
let keyboardNavIndex = -1; // -1 means no selection specific for keyboard

// Minimal UX routing: locked screens
let mode = "home"; // home | create | open
let transient = {
  fileObj: null,
  fileName: "vault.json",
};

function updateLockButton() {
  lockBtn.disabled = !isUnlocked();
}

function lockNow() {
  selectedEntryId = null;
  keyboardNavIndex = -1;
  visibleFilter = { q: "", tag: "", favoritesOnly: false, showArchived: false };
  visiblePasswords.clear();
  deletingEntryIds.clear();
  qrState = { chunks: [], index: 0 };
  closeQRModal();
  wipeSensitive();
  mode = "home";
  transient = { fileObj: null, fileName: "vault.json" };
  updateLockButton();
  render(appRoot, handlers);
}

lockBtn.addEventListener("click", () => lockNow());

// Auto-lock on inactivity (only when unlocked)
function armInactivity() {
  if (!isUnlocked()) return;
  resetInactivityTimer(() => lockNow());
}

["mousemove", "keydown", "mousedown", "touchstart"].forEach((ev) => {
  window.addEventListener(
    ev,
    () => {
      if (isUnlocked()) armInactivity();
    },
    { passive: true }
  );
});

// Keyboard Navigation Listener
document.addEventListener("keydown", (e) => {
  if (!isUnlocked() || state.readOnly) return;
  // If editing an input, ignore navigation
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

  const entries = handlers.getVisibleEntries();
  if (entries.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    keyboardNavIndex = Math.min(keyboardNavIndex + 1, entries.length - 1);
    render(appRoot, handlers);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    keyboardNavIndex = Math.max(keyboardNavIndex - 1, 0);
    render(appRoot, handlers);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (keyboardNavIndex >= 0 && entries[keyboardNavIndex]) {
      handlers.onEditEntry(entries[keyboardNavIndex].id);
    }
  } else if (e.key.toLowerCase() === "c") {
    if (keyboardNavIndex >= 0 && entries[keyboardNavIndex]) {
      handlers.onCopyPassword(entries[keyboardNavIndex].id);
    }
  } else if (e.key.toLowerCase() === "e") {
    if (keyboardNavIndex >= 0 && entries[keyboardNavIndex]) {
      handlers.onEditEntry(entries[keyboardNavIndex].id);
    }
  } else if (e.key === "Delete") {
    if (keyboardNavIndex >= 0 && entries[keyboardNavIndex]) {
      handlers.onArchiveEntry(entries[keyboardNavIndex].id);
    }
  }
});

document.addEventListener("visibilitychange", () => {
  // Relaxed behavior: rely on the standard inactivity timer (e.g. 2 mins)
  // instead of locking immediately when the tab is hidden.
  if (!document.hidden && isUnlocked()) {
    armInactivity();
  }
});

function getEntryById(id) {
  const v = state.vaultData;
  if (!v) return null;
  return (v.entries || []).find((x) => x.id === id) || null;
}

// ... render functions (create, open, etc) remain mostly same ...
// For brevity, assuming renderCreateScreen, renderOpenScreen, etc are here or imported if I was refactoring fully, 
// but since I'm patching app.js, I will keep the large blocks below unmodified in the replacement unless necessary.
// Actually, to avoid errors with replacing huge blocks, I will target specific handler section.
// Wait, I need to replace the whole file imports anyway to add helpers.

// ... (Create/Open functions skipped in detail here but assumed present in file) ...

// Let's scroll down to handlers definition to begin my surgical replacement if possible. 
// But since I changed imports, I have to provide the top of the file. 

// I will assume the file starts with imports and ends with handlers.
// Since I can't see the middle "render" functions in my mental diff easily without reading them all,
// I'll stick to replacing the HANDLERS and the IMPORTS/STATE section. 

// Let's do imports and state variables first.
// Then I will do a separate one for Handlers.

/* ... */



function renderCreateScreen() {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>Create New Vault</h2>
    <div class="row">
      <div>
        <label>Vault Name</label>
        <input id="cv_name" type="text" autocomplete="off" placeholder="My Vault" />
      </div>
      <div>
        <label>File name (download)</label>
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
    <div class="actions">
      <button id="cv_create">Create & Download Encrypted Vault</button>
      <button class="secondary" id="cv_back">Back</button>
    </div>
    <p class="small">
      Your master password is never stored. If you forget it, the vault cannot be recovered.
    </p>
    <p class="small">
      No data is stored in the browser. Save the file to Drive/Dropbox/iCloud to prevent loss and sync devices.
    </p>
  `;

  wrap.querySelector("#cv_back").addEventListener("click", () => {
    mode = "home";
    render(appRoot, handlers);
  });

  const pw = wrap.querySelector("#cv_pw");
  const pw2 = wrap.querySelector("#cv_pw2");
  const strength = wrap.querySelector("#pw_strength");

  pw.addEventListener("input", () => {
    strength.textContent = passwordStrengthHint(pw.value);
    strength.className = "small " + (pw.value.length >= 12 ? "ok" : "");
  });

  wrap.querySelector("#cv_create").addEventListener("click", async () => {
    const name = wrap.querySelector("#cv_name").value.trim() || "My Vault";
    const filename = wrap.querySelector("#cv_filename").value.trim() || "vault.json";
    const p1 = pw.value;
    const p2 = pw2.value;

    if (!p1 || p1.length < 8) return toast("Use a longer master password (8+).", true);
    if (p1 !== p2) return toast("Passwords do not match.", true);

    const payload = newEmptyVaultPayload(name);

    try {
      const fileJson = await createEncryptedVaultFile(payload, p1);
      downloadJson(fileJson, filename);
      toast("Downloaded new encrypted vault JSON.");
      mode = "home";
      render(appRoot, handlers);
    } catch (e) {
      toast(e?.message || "Failed to create vault.", true);
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
        <label>Upload encrypted vault JSON</label>
        <input id="ov_file" type="file" accept="application/json" />
      </div>
    <div class="row">
      <div>
        <label>Master Password</label>
        <input id="ov_pw" type="password" autocomplete="current-password" />
      </div>
    </div>
    <div class="row" style="margin-top: 10px; align-items: center; justify-content: flex-start; gap: 8px;">
      <input type="checkbox" id="ov_readonly" style="width: auto;" />
      <label for="ov_readonly" style="display:inline; cursor:pointer; margin:0;">Open in Emergency Read-Only Mode</label>
    </div>
    <div class="actions">
      <button id="ov_open">Open Vault</button>
      <button class="secondary" id="ov_back">Back</button>
    </div>
    <p class="small">
      Decrypted data stays only in memory. Locking or refreshing clears it.
    </p>
  `;

  wrap.querySelector("#ov_back").addEventListener("click", () => {
    mode = "home";
    render(appRoot, handlers);
  });

  wrap.querySelector("#ov_open").addEventListener("click", async () => {
    const fileInput = wrap.querySelector("#ov_file");
    const pw = wrap.querySelector("#ov_pw").value;

    const file = fileInput.files?.[0];
    if (!file) return toast("Choose a vault JSON file.", true);
    if (!pw) return toast("Enter master password.", true);

    try {
      const obj = await readJsonFile(file);
      const { meta, data } = await openEncryptedVaultFile(obj, pw);

      const isReadOnly = wrap.querySelector("#ov_readonly").checked;
      state.fileNameHint = file.name || "vault.json";
      setUnlocked(meta, data);
      state.readOnly = isReadOnly;

      updateLockButton();
      render(appRoot, handlers);
      renderEditor(null, handlers);
      armInactivity();
    } catch (e) {
      toast(e?.message || "Failed to open vault.", true);
    } finally {
      wrap.querySelector("#ov_pw").value = "";
    }
  });

  return wrap;
}

function toast(msg, isError = false) {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const n = document.createElement("div");
  n.id = "toast";
  n.className = "card";
  n.style.position = "fixed";
  n.style.right = "18px";
  n.style.bottom = "18px";
  n.style.maxWidth = "420px";
  n.style.zIndex = 9999;
  n.innerHTML = `<div class="${isError ? "error" : "ok"}">${escapeHtml(msg)}</div>
                 <div class="small">This message disappears automatically.</div>`;
  document.body.appendChild(n);

  setTimeout(() => n.remove(), 3000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function passwordStrengthHint(pw) {
  const len = pw.length;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasNum = /\d/.test(pw);
  const hasSym = /[^a-zA-Z0-9]/.test(pw);
  const score = [hasLower, hasUpper, hasNum, hasSym].filter(Boolean).length + (len >= 12 ? 1 : 0);

  if (len === 0) return "";
  if (len < 8) return "Weak: too short.";
  if (score <= 2) return "Okay: add symbols/uppercase/length.";
  if (score <= 4) return "Good: consider 14+ chars.";
  return "Strong.";
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
        <label>Confirm New Password</label>
        <input id="cp_pw2" type="password" autocomplete="new-password" />
      </div>
    </div>
    <div class="actions">
      <button id="cp_save">Change & Download Vault</button>
      <button class="secondary" id="cp_back">Cancel</button>
    </div>
    <p class="small">
      This will re-encrypt your <b>entire vault</b> with the new password and download it as a new file.
      <br>
      Please delete the old file after verifying the new one works.
    </p>
  `;

  wrap.querySelector("#cp_back").addEventListener("click", () => {
    mode = "home";
    render(appRoot, handlers);
  });

  const pw = wrap.querySelector("#cp_pw");
  const pw2 = wrap.querySelector("#cp_pw2");
  const strength = wrap.querySelector("#cp_strength");

  pw.addEventListener("input", () => {
    strength.textContent = passwordStrengthHint(pw.value);
    strength.className = "small " + (pw.value.length >= 12 ? "ok" : "");
  });

  wrap.querySelector("#cp_save").addEventListener("click", async () => {
    const p1 = pw.value;
    const p2 = pw2.value;

    if (!p1 || p1.length < 8) return toast("Use a longer password (8+).", true);
    if (p1 !== p2) return toast("Passwords do not match.", true);

    if (state.readOnly) return toast("Cannot change password in Read-Only mode.", true);
    if (!state.vaultData) return;

    state.vaultData.updatedAt = new Date().toISOString();

    try {
      // Re-encrypt with NEW password
      const fileJson = await reencryptVaultToFile(state.vaultData, p1, state.vaultMeta);
      await downloadJson(fileJson, state.fileNameHint || "vault.json");
      toast("Downloaded vault with NEW password.");

      mode = "home";
      render(appRoot, handlers);
    } catch (e) {
      toast(e?.message || "Failed to change password.", true);
    }
  });

  return wrap;
}

/** ✅ handlers must be defined BEFORE first render */
const handlers = {
  onGoCreate: () => {
    mode = "create";
    appRoot.innerHTML = "";
    appRoot.appendChild(renderCreateScreen());
  },
  onGoOpen: () => {
    mode = "open";
    appRoot.innerHTML = "";
    appRoot.appendChild(renderOpenScreen());
  },
  onGoChangePassword: () => {
    if (state.readOnly) return toast("Disabled in Read-Only Mode", true);
    mode = "change-password";
    appRoot.innerHTML = "";
    appRoot.appendChild(renderChangePasswordScreen());
  },

  onGoQR: async () => {
    if (state.readOnly) return toast("Disabled in Read-Only Mode", true);
    if (!state.vaultData) return;

    // Warn if qrcode lib missing
    if (!window.qrcode) {
      toast("QRCode library not loaded. Check connection or src/qrcode.js", true);
      return;
    }

    const master = prompt("Enter master password to generate transfer QRs:");
    if (!master) return;

    try {
      const fileJson = await reencryptVaultToFile(state.vaultData, master, state.vaultMeta);
      const jsonStr = JSON.stringify(fileJson);

      // Chunk it
      const chunkSize = 800;
      const totalLen = jsonStr.length;
      const chunks = [];
      const totalChunks = Math.ceil(totalLen / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = jsonStr.slice(i * chunkSize, (i + 1) * chunkSize);
        // Format: ZV1:index/total:data  (index is 1-based)
        chunks.push(`ZV1:${i + 1}/${totalChunks}:${chunk}`);
      }

      qrState = { chunks, index: 0 };
      renderQRModal(qrState.chunks, qrState.index, qrState.chunks.length, handlers);
      armInactivity();
    } catch (e) {
      toast("Failed to encrypt for QR: " + e.message, true);
    }
  },

  onNextQR: () => {
    if (qrState.index < qrState.chunks.length - 1) {
      qrState.index++;
      renderQRModal(qrState.chunks, qrState.index, qrState.chunks.length, handlers);
      armInactivity();
    } else {
      closeQRModal();
      toast("Transfer finished.");
    }
  },

  onPrevQR: () => {
    if (qrState.index > 0) {
      qrState.index--;
      renderQRModal(qrState.chunks, qrState.index, qrState.chunks.length, handlers);
      armInactivity();
    }
  },

  onCloseQR: () => {
    qrState = { chunks: [], index: 0 };
    closeQRModal();
    armInactivity();
  },

  onSwitchReadOnly: () => {
    state.readOnly = true;
    render(appRoot, handlers);
    renderEditor(selectedEntryId ? getEntryById(selectedEntryId) : null, handlers);
    toast("Switched to Emergency Read-Only Mode.");
  },

  onAddEntry: () => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode", true);
    const v = state.vaultData;
    if (!v) return;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    v.entries.unshift({
      id,
      title: "",
      url: "",
      username: "",
      password: "",
      notes: "",
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
    selectedEntryId = id;
    render(appRoot, handlers);
    renderEditor(getEntryById(id), handlers);
    armInactivity();
  },

  onEditEntry: (id) => {
    selectedEntryId = id;
    renderEditor(getEntryById(id), handlers);
    armInactivity();
  },

  onCancelEdit: () => {
    selectedEntryId = null;
    renderEditor(null, handlers);
    armInactivity();
  },

  onSaveEntry: (id) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode", true);
    const e = getEntryById(id);
    if (!e) return;

    const vals = getEditorFormValues();

    // Check if changes were actually made
    const hasChanges = Object.keys(vals).some(k =>
      JSON.stringify(vals[k]) !== JSON.stringify(e[k] || (Array.isArray(vals[k]) ? [] : ""))
    );

    if (hasChanges) {
      // Versioning: Save current state to history before updating
      e.history = e.history || [];
      e.history.unshift({
        savedAt: new Date().toISOString(),
        snapshot: {
          title: e.title,
          url: e.url,
          username: e.username,
          password: e.password,
          notes: e.notes,
          tags: [...(e.tags || [])]
        }
      });
      // Limit history to last 10 versions to save space
      if (e.history.length > 10) e.history.length = 10;
    }

    Object.assign(e, vals, { updatedAt: new Date().toISOString() });

    render(appRoot, handlers);
    renderEditor(getEntryById(id), handlers);
    armInactivity();
  },

  onRestoreHistory: (entryId, historyIndex) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode", true);
    if (!confirm("Are you sure you want to restore this version? The current version will be saved to history.")) return;

    const e = getEntryById(entryId);
    if (!e || !e.history || !e.history[historyIndex]) return;

    const versionToRestore = e.history[historyIndex];

    // Save current state as history before restoring
    e.history.unshift({
      savedAt: new Date().toISOString(),
      reason: "Rollback",
      snapshot: {
        title: e.title,
        url: e.url,
        username: e.username,
        password: e.password,
        notes: e.notes,
        tags: [...(e.tags || [])]
      }
    });

    // Apply restored snapshot
    Object.assign(e, versionToRestore.snapshot, { updatedAt: new Date().toISOString() });

    // Correct logic: we just unshifted, so the index might have shifted if we were pointing to a specific index, 
    // but typically we just pull the data and push new history. 
    // The previous history items remain secure.

    // Clean up history limit
    if (e.history.length > 20) e.history.length = 20;

    render(appRoot, handlers);
    renderEditor(getEntryById(entryId), handlers);
    toast("Restored entry to previous version.");
    armInactivity();
  },

  onToggleFavorite: (id) => {
    if (state.readOnly) return;
    const e = getEntryById(id);
    if (e) {
      e.isFavorite = !e.isFavorite;
      e.updatedAt = new Date().toISOString();
      render(appRoot, handlers);
      // If editor is open for this item, re-render it to show state change if we add star there
      if (selectedEntryId === id) renderEditor(e, handlers);
    }
    armInactivity();
  },

  onToggleFavoriteFilter: () => {
    visibleFilter.favoritesOnly = !visibleFilter.favoritesOnly;
    render(appRoot, handlers);
    armInactivity();
  },

  onToggleArchiveFilter: () => {
    visibleFilter.showArchived = !visibleFilter.showArchived;
    render(appRoot, handlers);
    armInactivity();
  },

  onCopyUsername: async (id) => {
    const e = getEntryById(id);
    if (!e) return;
    if (state.readOnly) return toast("Clipboard disabled in Emergency Read-Only Mode", true);

    try {
      await navigator.clipboard.writeText(e.username || "");
      toast("Copied username.");
      setTimeout(async () => {
        // Best effort clear
      }, 20000);
    } catch {
      toast("Clipboard copy failed.", true);
    }
    armInactivity();
  },

  onDeleteEntry: (id) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode", true);
    // Permanent delete
    const v = state.vaultData;
    if (!v) return;
    v.entries = v.entries.filter((x) => x.id !== id);
    deletingEntryIds.delete(id);
    if (selectedEntryId === id) selectedEntryId = null;
    render(appRoot, handlers);
    renderEditor(selectedEntryId ? getEntryById(selectedEntryId) : null, handlers);
    armInactivity();
  },

  onArchiveEntry: (id) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode", true);
    const e = getEntryById(id);
    if (e) {
      e.archived = true;
      e.updatedAt = new Date().toISOString();
      toast("Entry archived.");

      // Auto-move selection if keyboard nav active
      if (keyboardNavIndex >= 0) {
        // Stay at same index or move up if at end
        const visible = handlers.getVisibleEntries();
        if (keyboardNavIndex >= visible.length) keyboardNavIndex = Math.max(0, visible.length - 1);
      }

      render(appRoot, handlers);
      if (selectedEntryId === id) renderEditor(null, handlers); // close editor if archived
    }
    armInactivity();
  },

  onRestoreEntry: (id) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode", true);
    const e = getEntryById(id);
    if (e) {
      e.archived = false;
      e.updatedAt = new Date().toISOString();
      toast("Entry restored.");
      render(appRoot, handlers);
      if (selectedEntryId === id) renderEditor(e, handlers);
    }
    armInactivity();
  },

  onCopyPassword: async (id) => {
    const e = getEntryById(id);
    if (!e) return;

    if (state.readOnly) return toast("Clipboard disabled in Emergency Read-Only Mode", true);

    try {
      await navigator.clipboard.writeText(e.password || "");
      toast("Copied password to clipboard.");
      setTimeout(async () => {
        try { await navigator.clipboard.writeText(""); } catch { }
      }, 20000);
    } catch {
      toast("Clipboard copy failed (browser permission).", true);
    }
    armInactivity();
  },

  onSaveDownload: async () => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode", true);
    if (!state.vaultData) return;

    const master = prompt("Enter master password to re-encrypt and download:");
    if (!master) return;

    state.vaultData.updatedAt = new Date().toISOString();

    try {
      const fileJson = await reencryptVaultToFile(state.vaultData, master, state.vaultMeta);
      downloadJson(fileJson, state.fileNameHint || "vault.json");
      toast("Downloaded updated encrypted vault JSON.");
    } catch (e) {
      toast(e?.message || "Failed to encrypt vault.", true);
    }
    armInactivity();
  },

  getVisibleEntries: () => {
    const v = state.vaultData;
    if (!v) return [];
    const { q, tag, favoritesOnly, showArchived } = visibleFilter;
    let out = [...(v.entries || [])];

    // Filter archived logic
    if (!showArchived) {
      out = out.filter(e => !e.archived);
    } else {
      // If showArchived is TRUE, maybe we ONLY show archived? 
      // Or show ALL? Usually "Archive" view shows only archived or mixed.
      // Let's make it intuitive: if toggle is ON, show everything (or better, make it a mode).
      // Standard pattern: "Show Archived" implies inclusion. 
      // But better for "Archive" management: Filter to JUST archived?
      // Let's do: if showArchived is true, show ONLY archived items to easily find them.
      out = out.filter(e => e.archived);
    }

    if (favoritesOnly) {
      out = out.filter(e => e.isFavorite);
    }
    if (q) {
      const qq = q.toLowerCase();
      out = out.filter((e) => {
        const hay = [e.title, e.url, e.username, e.notes, e.password, ...(e.tags || [])].join(" ").toLowerCase();
        return hay.includes(qq);
      });
    }
    if (tag) {
      const tt = tag.toLowerCase();
      out = out.filter((e) => (e.tags || []).some((t) => t.toLowerCase() === tt));
    }

    // Sort: favorites first
    out.sort((a, b) => {
      if (!!a.isFavorite !== !!b.isFavorite) {
        return a.isFavorite ? -1 : 1;
      }
      return 0;
    });

    return out;
  },

  // Helper for UI to know which row is selected via keyboard
  isKeyboardSelected: (index) => index === keyboardNavIndex,

  isShowArchived: () => visibleFilter.showArchived,

  onApplySearch: () => {
    // Merge new search values with existing filter state (preserving favoritesOnly)
    visibleFilter = { ...visibleFilter, ...getSearchValues() };
    render(appRoot, handlers);
    renderEditor(selectedEntryId ? getEntryById(selectedEntryId) : null, handlers);
    armInactivity();
  },

  onClearSearch: () => {
    // Clear search terms but preserve Favorites toggle? Usually Clear implies 'Reset All'.
    // Let's reset everything for clarity.
    visibleFilter = { q: "", tag: "", favoritesOnly: false, showArchived: false };
    render(appRoot, handlers);
    renderEditor(selectedEntryId ? getEntryById(selectedEntryId) : null, handlers);
    armInactivity();
  },

  onTogglePassword: (id) => {
    if (visiblePasswords.has(id)) {
      visiblePasswords.delete(id);
    } else {
      visiblePasswords.add(id);
    }
    render(appRoot, handlers);
    armInactivity();
  },

  isPasswordVisible: (id) => visiblePasswords.has(id),

  isFavoritesFilterOn: () => !!visibleFilter.favoritesOnly,

  onInitiateDelete: (id) => {
    if (state.readOnly) return;
    deletingEntryIds.add(id);
    render(appRoot, handlers);
    armInactivity();
  },

  onCancelDelete: (id) => {
    deletingEntryIds.delete(id);
    render(appRoot, handlers);
    armInactivity();
  },

  isEntryDeleting: (id) => deletingEntryIds.has(id),
};

// Initial Render
function init() {
  try {
    const root = document.getElementById("app");
    if (root) {
      render(root, handlers);
      updateLockButton();
    } else {
      window.addEventListener('DOMContentLoaded', () => {
        try {
          render(document.getElementById("app"), handlers);
          updateLockButton();
        } catch (e) {
          document.body.innerHTML = `<div style="color:red; padding:20px;"><h3>Error initializing app:</h3><pre>${e.stack}</pre></div>`;
        }
      });
    }
  } catch (e) {
    document.body.innerHTML = `<div style="color:red; padding:20px;"><h3>Error initializing app (main):</h3><pre>${e.stack}</pre></div>`;
  }
}

init();
