import { state, setUnlocked, wipeSensitive, resetInactivityTimer, isUnlocked } from "./state.js";
import { render, renderEditor, getEditorFormValues, getSearchValues } from "./ui.js";
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
let visibleFilter = { q: "", tag: "" };
let visiblePasswords = new Set();
let deletingEntryIds = new Set();

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
  visibleFilter = { q: "", tag: "" };
  visiblePasswords.clear();
  deletingEntryIds.clear();
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

document.addEventListener("visibilitychange", () => {
  // optional strict behavior: lock when tab hidden
  if (document.hidden && isUnlocked()) lockNow();
});

function getEntryById(id) {
  const v = state.vaultData;
  if (!v) return null;
  return (v.entries || []).find((x) => x.id === id) || null;
}

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
      No data is stored in your browser. You must keep the downloaded JSON safe.
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
    Object.assign(e, vals, { updatedAt: new Date().toISOString() });

    render(appRoot, handlers);
    renderEditor(getEntryById(id), handlers);
    armInactivity();
  },

  onDeleteEntry: (id) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode", true);
    const v = state.vaultData;
    if (!v) return;
    v.entries = v.entries.filter((x) => x.id !== id);
    deletingEntryIds.delete(id);
    if (selectedEntryId === id) selectedEntryId = null;
    render(appRoot, handlers);
    renderEditor(selectedEntryId ? getEntryById(selectedEntryId) : null, handlers);
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
    const { q, tag } = visibleFilter;
    let out = [...(v.entries || [])];

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
    return out;
  },

  onApplySearch: () => {
    visibleFilter = getSearchValues();
    render(appRoot, handlers);
    renderEditor(selectedEntryId ? getEntryById(selectedEntryId) : null, handlers);
    armInactivity();
  },

  onClearSearch: () => {
    visibleFilter = { q: "", tag: "" };
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

/** ✅ Now do initial render */
render(appRoot, handlers);
updateLockButton();
