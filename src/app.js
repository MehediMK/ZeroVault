import { state, setUnlocked, wipeSensitive, resetInactivityTimer, isUnlocked, markDirty, markSaved, syncSettingsFromVault, pushHistorySnapshot, popHistorySnapshot, clearHistorySnapshots } from "./state.js";
import { render, renderEditor, getEditorFormValues, getSearchValues, renderQRModal, closeQRModal } from "./ui.js";
import { auditVault, generatePassword, passwordStrengthHint } from "./features/passwords.js";
import { importEntriesFromFile } from "./features/importers.js";
import { generateTotpCode, isValidTotpSecret, secretFromText } from "./features/totp.js";
import { getArgon2Support } from "./features/kdf.js";
import { validateEntry } from "./features/validation.js";
import { buildAuditExport, buildVaultSummaryExport, buildRecoverySheetHtml } from "./features/reports.js";
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
const PAGE_SIZE = 10;
const SENSITIVE_FIELDS = ["title", "url", "username", "password", "notes", "details", "recoveryCodes", "attachmentRefs", "totpSecret"];

let selectedEntryId = null;
let visibleFilter = defaultFilterState();
let currentPage = 1;
let deletingEntryIds = new Set();
let qrState = { chunks: [], index: 0 };
let keyboardNavIndex = -1;
let mode = "home";
let totpIntervalId = null;
let totpCache = new Map();
let bulkSelectedIds = new Set();
let sensitiveRevealFields = new Map();
let sensitiveRevealTimers = new Map();
let importPreview = [];
let importPreviewSelection = new Set();
let importFile = null;
let auditPanelOpen = false;
let generatorSettings = {
  length: 20,
  includeUpper: true,
  includeLower: true,
  includeNumbers: true,
  includeSymbols: true,
  pronounceable: false,
};

function defaultFilterState() {
  return {
    q: "",
    tag: "",
    category: "",
    sort: "recent",
    favoritesOnly: false,
    showArchived: false,
    weakOnly: false,
    sensitiveOnly: false,
    expiringOnly: false,
  };
}

function getSecuritySettings() {
  return state.vaultData?.settings?.security || {
    inactivityMs: 2 * 60 * 1000,
    clipboardClearMs: 20000,
    preferredKdf: "PBKDF2",
    lockOnHide: false,
    sensitiveRevealMs: 30000,
    allowSensitiveCopy: false,
  };
}

function setSecuritySettings(nextSecurity) {
  if (!state.vaultData) return;
  state.vaultData.settings = state.vaultData.settings || {};
  state.vaultData.settings.security = { ...getSecuritySettings(), ...nextSecurity };
  syncSettingsFromVault();
  state.upgradeAvailable = state.vaultMeta?.crypto?.kdf !== state.vaultData.settings.security.preferredKdf;
}

function updateLockButton() {
  lockBtn.disabled = !isUnlocked();
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
  if (totpIntervalId) clearInterval(totpIntervalId);
  totpIntervalId = null;
}

function rerender() {
  render(appRoot, handlers);
  renderEditor(selectedEntryId ? getEntryById(selectedEntryId) : null, handlers);
  updateLockButton();
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
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.innerHTML = `<div class="${isError ? "error" : "ok"}">${String(message).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))}</div><div class="small muted">This message disappears automatically.</div>`;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3600);
}

function cloneSnapshot(entry) {
  return {
    title: entry.title,
    url: entry.url,
    username: entry.username,
    password: entry.password,
    notes: entry.notes,
    tags: [...(entry.tags || [])],
    details: { ...(entry.details || {}) },
    recoveryCodes: [...(entry.recoveryCodes || [])],
    attachmentRefs: [...(entry.attachmentRefs || [])],
    totpSecret: entry.totpSecret || "",
    totpDigits: entry.totpDigits || 6,
    totpPeriod: entry.totpPeriod || 30,
    category: entry.category || "login",
    isSensitive: !!entry.isSensitive,
    passwordExpiryDays: Number(entry.passwordExpiryDays || 0) || 0,
  };
}

function cloneVaultState() {
  return {
    vaultData: structuredClone(state.vaultData),
    selectedEntryId,
    visibleFilter: { ...visibleFilter },
    currentPage,
    bulkSelectedIds: Array.from(bulkSelectedIds),
  };
}

function rememberUndo(action, note = "") {
  if (!state.vaultData) return;
  pushHistorySnapshot({
    action,
    note,
    savedAt: new Date().toISOString(),
    snapshot: cloneVaultState(),
  });
}

function restoreUndoSnapshot(snapshot) {
  if (!snapshot?.snapshot?.vaultData) return false;
  state.vaultData = structuredClone(snapshot.snapshot.vaultData);
  selectedEntryId = snapshot.snapshot.selectedEntryId || null;
  visibleFilter = { ...defaultFilterState(), ...(snapshot.snapshot.visibleFilter || {}) };
  currentPage = snapshot.snapshot.currentPage || 1;
  bulkSelectedIds = new Set(snapshot.snapshot.bulkSelectedIds || []);
  clearSensitiveReveals();
  updateVaultTimestamp();
  rerender();
  return true;
}

function updateVaultTimestamp() {
  if (state.vaultData) state.vaultData.updatedAt = new Date().toISOString();
}

function clearSensitiveReveals() {
  for (const timer of sensitiveRevealTimers.values()) clearTimeout(timer);
  sensitiveRevealTimers.clear();
  sensitiveRevealFields.clear();
}

function clearSensitiveRevealField(id, field) {
  const key = `${id}:${field}`;
  if (sensitiveRevealTimers.has(key)) clearTimeout(sensitiveRevealTimers.get(key));
  sensitiveRevealTimers.delete(key);
  const set = sensitiveRevealFields.get(id);
  if (!set) return;
  set.delete(field);
  if (!set.size) sensitiveRevealFields.delete(id);
}

function revealSensitiveField(id, field) {
  const set = sensitiveRevealFields.get(id) || new Set();
  set.add(field);
  sensitiveRevealFields.set(id, set);
  const key = `${id}:${field}`;
  if (sensitiveRevealTimers.has(key)) clearTimeout(sensitiveRevealTimers.get(key));
  sensitiveRevealTimers.set(key, setTimeout(() => {
    clearSensitiveRevealField(id, field);
    if (selectedEntryId === id) renderEditor(getEntryById(id), handlers);
    rerender();
  }, getSecuritySettings().sensitiveRevealMs || 30000));
}

function isFieldRevealed(id, field) {
  return !!sensitiveRevealFields.get(id)?.has(field);
}

function isEntryFullyRevealed(id) {
  const set = sensitiveRevealFields.get(id);
  return !!set && SENSITIVE_FIELDS.every((field) => set.has(field));
}

function lockNow(message = "") {
  selectedEntryId = null;
  keyboardNavIndex = -1;
  visibleFilter = defaultFilterState();
  currentPage = 1;
  deletingEntryIds.clear();
  qrState = { chunks: [], index: 0 };
  bulkSelectedIds.clear();
  clearSensitiveReveals();
  importPreview = [];
  importPreviewSelection.clear();
  importFile = null;
  auditPanelOpen = false;
  totpCache.clear();
  closeQRModal();
  stopTotpTicker();
  wipeSensitive();
  mode = "home";
  rerender();
  if (message) toast(message);
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
    details: entry.details && typeof entry.details === "object" ? entry.details : {},
    recoveryCodes: Array.isArray(entry.recoveryCodes) ? entry.recoveryCodes : [],
    attachmentRefs: Array.isArray(entry.attachmentRefs) ? entry.attachmentRefs : [],
    totpSecret: secretFromText(entry.totpSecret || ""),
    totpDigits: entry.totpDigits || 6,
    totpPeriod: entry.totpPeriod || 30,
    history: [],
    passwordHistory: [],
    passwordExpiryDays: Number(entry.passwordExpiryDays || 0) || 90,
    category: entry.category || "login",
    isSensitive: !!entry.isSensitive,
    isFavorite: false,
    archived: false,
    importedFrom: entry.importedFrom || "Import",
    createdAt: now,
    updatedAt: now,
    lastPasswordChangeAt: now,
    validationIssues: validateEntry(entry),
  };
}

function createNewEntry() {
  return normalizeImportedEntry({ importedFrom: "Manual" });
}

function getAudit() {
  return auditVault(state.vaultData?.entries || []);
}

function getEntryAudit(id) {
  return getAudit().items.find((item) => item.id === id) || { issues: [], score: 0 };
}

function getFilteredEntries() {
  const entries = [...(state.vaultData?.entries || [])];
  const { q, tag, category, sort, favoritesOnly, showArchived, weakOnly, sensitiveOnly, expiringOnly } = visibleFilter;
  let out = showArchived ? entries.filter((entry) => entry.archived) : entries.filter((entry) => !entry.archived);
  if (favoritesOnly) out = out.filter((entry) => entry.isFavorite);
  if (sensitiveOnly) out = out.filter((entry) => entry.isSensitive);
  if (category) out = out.filter((entry) => (entry.category || "login") === category);
  if (q) {
    const needle = q.toLowerCase();
    out = out.filter((entry) => [entry.title, entry.url, entry.username, entry.notes, ...(entry.tags || []), entry.category].join(" ").toLowerCase().includes(needle));
  }
  if (tag) {
    const needle = tag.toLowerCase();
    out = out.filter((entry) => (entry.tags || []).some((item) => item.toLowerCase() === needle));
  }
  if (weakOnly || expiringOnly) {
    out = out.filter((entry) => {
      const issues = getEntryAudit(entry.id).issues;
      if (weakOnly && !issues.some((issue) => ["Short password", "No uppercase", "No lowercase", "No number", "No symbol", "Reused password", "Missing password"].includes(issue))) return false;
      if (expiringOnly && !issues.some((issue) => issue === "Password expired" || issue === "Password expiring soon")) return false;
      return true;
    });
  }
  out.sort((a, b) => {
    if (sort === "title") return (a.title || "").localeCompare(b.title || "");
    if (sort === "weak") return getEntryAudit(b.id).score - getEntryAudit(a.id).score;
    if (sort === "favorites") {
      if (!!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    }
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
  return out;
}

function getVisibleEntries() {
  const filtered = getFilteredEntries();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  return filtered.slice(start, start + PAGE_SIZE);
}

function getPaginationSummary() {
  const totalItems = getFilteredEntries().length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  return {
    currentPage,
    pageSize: PAGE_SIZE,
    totalItems,
    totalPages,
    startItem: totalItems ? (currentPage - 1) * PAGE_SIZE + 1 : 0,
    endItem: Math.min(currentPage * PAGE_SIZE, totalItems),
  };
}

function syncPageToEntry(id) {
  const filtered = getFilteredEntries();
  const index = filtered.findIndex((entry) => entry.id === id);
  if (index >= 0) currentPage = Math.floor(index / PAGE_SIZE) + 1;
}

async function copyWithAutoClear(value, label, options = {}) {
  if (state.readOnly) return toast("Clipboard disabled in Emergency Read-Only Mode.", true);
  if (options.isSensitive && !getSecuritySettings().allowSensitiveCopy) {
    return toast("Sensitive copying is disabled in security settings.", true);
  }
  try {
    await navigator.clipboard.writeText(value || "");
    toast(`${label} copied to clipboard.`);
    const clearMs = getSecuritySettings().clipboardClearMs || 20000;
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === value) await navigator.clipboard.writeText("");
      } catch {
        // Best effort only.
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
  const next = new Map();
  await Promise.all(entries.map(async (entry) => {
    if (!entry.totpSecret) return;
    next.set(entry.id, await getEntryTotp(entry));
  }));
  totpCache = next;
}

function summarizeChanges() {
  const c = state.changeLog || {};
  return [c.added ? `${c.added} new` : "", c.edited ? `${c.edited} edited` : "", c.deleted ? `${c.deleted} deleted` : "", c.archived ? `${c.archived} archived` : "", c.imported ? `${c.imported} imported` : ""].filter(Boolean).join(", ");
}

function generatePronounceablePassword(length) {
  const vowels = "aeiou";
  const consonants = "bcdfghjklmnpqrstvwxyz";
  let out = "";
  for (let i = 0; i < length; i++) {
    const pool = i % 2 === 0 ? consonants : vowels;
    out += pool[Math.floor(Math.random() * pool.length)];
  }
  return out;
}

function currentGeneratorOptions() {
  return { ...generatorSettings };
}

function applyGeneratedPasswordToEditor(password) {
  const input = document.getElementById("f_password");
  if (input) input.value = password;
}

function tryParseUrlHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function scoreConflictMatch(entry, candidate) {
  let score = 0;
  if ((entry.title || "").trim().toLowerCase() === (candidate.title || "").trim().toLowerCase() && entry.title) score += 3;
  if ((entry.username || "").trim().toLowerCase() === (candidate.username || "").trim().toLowerCase() && entry.username) score += 3;
  if (tryParseUrlHost(entry.url) && tryParseUrlHost(entry.url) === tryParseUrlHost(candidate.url)) score += 4;
  if ((entry.password || "") && entry.password === candidate.password) score += 1;
  if ((entry.category || "login") === (candidate.category || "login")) score += 1;
  return score;
}

function findConflicts(entry) {
  return (state.vaultData?.entries || [])
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title || "(Untitled)",
      username: candidate.username || "",
      category: candidate.category || "login",
      score: scoreConflictMatch(entry, candidate),
    }))
    .filter((match) => match.score >= 4)
    .sort((a, b) => b.score - a.score);
}

function createSnapshotRecord(name, reason = "manual") {
  if (!state.vaultData) return null;
  const snapshotVault = structuredClone(state.vaultData);
  snapshotVault.snapshots = [];
  const snapshot = {
    id: crypto.randomUUID(),
    name: name || `Snapshot ${new Date().toLocaleString()}`,
    reason,
    createdAt: new Date().toISOString(),
    vaultData: snapshotVault,
  };
  state.vaultData.snapshots = state.vaultData.snapshots || [];
  state.vaultData.snapshots.unshift(snapshot);
  if (state.vaultData.snapshots.length > 20) state.vaultData.snapshots.length = 20;
  return snapshot;
}

function rememberSaveHistory(fileName, snapshotName = "") {
  state.vaultData.saveHistory = state.vaultData.saveHistory || [];
  state.vaultData.saveHistory.unshift({
    id: crypto.randomUUID(),
    fileName,
    savedAt: new Date().toISOString(),
    snapshotName,
  });
  if (state.vaultData.saveHistory.length > 25) state.vaultData.saveHistory.length = 25;
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openPrintableHtml(html) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!popup) {
    toast("Popup blocked. Allow popups to print the recovery sheet.", true);
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}

function renderCreateScreen() {
  const wrap = document.createElement("div");
  wrap.className = "card";
  const argon2 = getArgon2Support();
  wrap.innerHTML = `
    <h2>Create New Vault</h2>
    <div class="row">
      <div><label>Vault Name</label><input id="cv_name" type="text" autocomplete="off" placeholder="My Vault" /></div>
      <div><label>File name</label><input id="cv_filename" type="text" autocomplete="off" value="vault.json" /></div>
    </div>
    <div class="row">
      <div><label>Master Password</label><input id="cv_pw" type="password" autocomplete="new-password" /><div class="small" id="pw_strength"></div></div>
      <div><label>Confirm Master Password</label><input id="cv_pw2" type="password" autocomplete="new-password" /></div>
    </div>
    <div class="row">
      <div><label>Preferred KDF</label><select id="cv_kdf"><option value="PBKDF2">PBKDF2</option><option value="Argon2id" ${argon2.available ? "" : "disabled"}>Argon2id ${argon2.available ? "" : "(runtime unavailable)"}</option></select><div class="small muted">${argon2.available ? "Argon2id runtime detected." : argon2.reason}</div></div>
      <div><label>Auto-lock timeout</label><select id="cv_timeout"><option value="60000">1 minute</option><option value="120000" selected>2 minutes</option><option value="300000">5 minutes</option><option value="900000">15 minutes</option></select></div>
    </div>
    <div class="actions"><button id="cv_create">Create & Download Vault</button><button class="secondary" id="cv_back">Back</button></div>
  `;
  wrap.querySelector("#cv_back").addEventListener("click", () => { mode = "home"; rerender(); });
  const pw = wrap.querySelector("#cv_pw");
  const pw2 = wrap.querySelector("#cv_pw2");
  const strength = wrap.querySelector("#pw_strength");
  pw.addEventListener("input", () => {
    strength.textContent = passwordStrengthHint(pw.value);
    strength.className = `small ${pw.value.length >= 12 ? "ok" : "muted"}`;
  });
  wrap.querySelector("#cv_create").addEventListener("click", async () => {
    const payload = newEmptyVaultPayload(wrap.querySelector("#cv_name").value.trim() || "My Vault");
    payload.settings.security.preferredKdf = wrap.querySelector("#cv_kdf").value;
    payload.settings.security.inactivityMs = Number(wrap.querySelector("#cv_timeout").value) || 120000;
    if (!pw.value || pw.value.length < 8) return toast("Use a master password with at least 8 characters.", true);
    if (pw.value !== pw2.value) return toast("Passwords do not match.", true);
    try {
      const fileJson = await createEncryptedVaultFile(payload, pw.value, { kdf: payload.settings.security.preferredKdf });
      downloadJson(fileJson, wrap.querySelector("#cv_filename").value.trim() || "vault.json");
      toast("Downloaded new encrypted vault.");
      mode = "home";
      rerender();
    } catch (error) {
      toast(error.message || "Failed to create vault.", true);
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
      <div><label>Encrypted vault JSON</label><input id="ov_file" type="file" accept="application/json" /></div>
      <div><label>Master Password</label><input id="ov_pw" type="password" autocomplete="current-password" /></div>
    </div>
    <label class="inline wrap" style="margin-top:12px; gap:8px;"><input id="ov_readonly" type="checkbox" style="width:auto;" /><span>Open in Emergency Read-Only Mode</span></label>
    <div class="actions"><button id="ov_open">Open Vault</button><button class="secondary" id="ov_back">Back</button></div>
  `;
  wrap.querySelector("#ov_back").addEventListener("click", () => { mode = "home"; rerender(); });
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
      startTotpTicker();
      rerender();
      armInactivity();
    } catch (error) {
      toast(error.message || "Failed to open vault.", true);
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
      <div><label>Auto-lock timeout (minutes)</label><input id="sv_timeout" type="number" min="1" max="120" value="${Math.round((security.inactivityMs || 120000) / 60000)}" /></div>
      <div><label>Clipboard clear delay (seconds)</label><input id="sv_clipboard" type="number" min="5" max="120" value="${Math.round((security.clipboardClearMs || 20000) / 1000)}" /></div>
    </div>
    <div class="row">
      <div><label>Reveal timeout (seconds)</label><input id="sv_reveal" type="number" min="5" max="300" value="${Math.round((security.sensitiveRevealMs || 30000) / 1000)}" /></div>
      <div><label>Preferred KDF for next save</label><select id="sv_kdf"><option value="PBKDF2" ${security.preferredKdf === "PBKDF2" ? "selected" : ""}>PBKDF2</option><option value="Argon2id" ${security.preferredKdf === "Argon2id" ? "selected" : ""} ${argon2.available ? "" : "disabled"}>Argon2id ${argon2.available ? "" : "(runtime unavailable)"}</option></select><div class="small muted">${argon2.available ? "Argon2id runtime detected." : argon2.reason}</div></div>
    </div>
    <div class="row">
      <div><label class="inline wrap" style="margin-top:28px; gap:8px;"><input id="sv_hide" type="checkbox" style="width:auto;" ${security.lockOnHide ? "checked" : ""} /><span>Lock immediately when tab is hidden</span></label></div>
      <div><label class="inline wrap" style="margin-top:28px; gap:8px;"><input id="sv_sensitive_copy" type="checkbox" style="width:auto;" ${security.allowSensitiveCopy ? "checked" : ""} /><span>Allow copy from sensitive fields after reveal</span></label></div>
    </div>
    <div class="actions"><button id="sv_save">Save Settings</button><button class="secondary" id="sv_back">Back</button></div>
  `;
  wrap.querySelector("#sv_back").addEventListener("click", () => { mode = "home"; rerender(); });
  wrap.querySelector("#sv_save").addEventListener("click", () => {
    setSecuritySettings({
      inactivityMs: Math.max(1, Number(wrap.querySelector("#sv_timeout").value) || 2) * 60000,
      clipboardClearMs: Math.max(5, Number(wrap.querySelector("#sv_clipboard").value) || 20) * 1000,
      sensitiveRevealMs: Math.max(5, Number(wrap.querySelector("#sv_reveal").value) || 30) * 1000,
      preferredKdf: wrap.querySelector("#sv_kdf").value,
      lockOnHide: wrap.querySelector("#sv_hide").checked,
      allowSensitiveCopy: wrap.querySelector("#sv_sensitive_copy").checked,
    });
    markDirty("edited");
    mode = "home";
    rerender();
    toast("Security settings updated. Download the vault to persist them.");
  });
  return wrap;
}

function renderImportScreen() {
  const wrap = document.createElement("div");
  wrap.className = "card";
  const selectedCount = importPreviewSelection.size;
  wrap.innerHTML = `
    <h2>Import Preview</h2>
    <p class="small muted">Load a CSV or Bitwarden JSON export, review confidence matches, choose per-row actions, then import only the selected entries.</p>
    <div class="row">
      <div><label>Import file</label><input id="iv_file" type="file" accept=".csv,.json" /></div>
    </div>
    <div class="actions">
      <button id="iv_preview">Load Preview</button>
      <button id="iv_select_all" class="secondary" ${importPreview.length ? "" : "disabled"}>Select All</button>
      <button id="iv_import" ${selectedCount ? "" : "disabled"}>Import Selected (${selectedCount})</button>
      <button id="iv_back" class="secondary">Back</button>
    </div>
    <div id="import_preview_host"></div>
  `;
  wrap.querySelector("#iv_back").addEventListener("click", () => { mode = "home"; rerender(); });
  wrap.querySelector("#iv_file").addEventListener("change", (e) => {
    importFile = e.target.files?.[0] || null;
  });
  wrap.querySelector("#iv_preview").addEventListener("click", async () => {
    if (!importFile) importFile = wrap.querySelector("#iv_file").files?.[0] || null;
    if (!importFile) return toast("Choose an import file.", true);
    try {
      importPreview = (await importEntriesFromFile(importFile)).map((entry) => {
        const conflicts = findConflicts(entry);
        return {
          ...entry,
          conflictMatches: conflicts,
          conflictIds: conflicts.map((item) => item.id),
          conflictCount: conflicts.length,
          validationIssues: validateEntry(entry),
          importAction: conflicts.length ? (conflicts[0].score >= 8 ? "merge" : "review") : "import",
        };
      });
      importPreviewSelection = new Set(importPreview.map((_, index) => index));
      renderImportPreviewHost(wrap);
      wrap.querySelector("#iv_import").disabled = false;
      wrap.querySelector("#iv_import").textContent = `Import Selected (${importPreviewSelection.size})`;
      wrap.querySelector("#iv_select_all").disabled = false;
    } catch (error) {
      toast(error.message || "Import preview failed.", true);
    }
  });
  wrap.querySelector("#iv_select_all").addEventListener("click", () => {
    importPreviewSelection = new Set(importPreview.map((_, index) => index));
    renderImportPreviewHost(wrap);
    wrap.querySelector("#iv_import").textContent = `Import Selected (${importPreviewSelection.size})`;
    wrap.querySelector("#iv_import").disabled = !importPreviewSelection.size;
  });
  wrap.querySelector("#iv_import").addEventListener("click", async () => {
    const selected = importPreview.filter((_, index) => importPreviewSelection.has(index));
    if (!selected.length) return toast("Select at least one entry.", true);
    if (selected.some((item) => item.importAction === "review")) return toast("Resolve rows marked Review before importing.", true);
    rememberUndo("import", `${selected.length} rows`);
    let importedCount = 0;
    let updatedCount = 0;
    for (const item of selected) {
      const normalized = normalizeImportedEntry(item);
      if (!item.conflictCount || item.importAction === "import" || item.importAction === "duplicate") {
        state.vaultData.entries.unshift(normalized);
        importedCount++;
        continue;
      }
      const existing = getEntryById(item.conflictIds[0]);
      if (!existing) {
        state.vaultData.entries.unshift(normalized);
        importedCount++;
        continue;
      }
      if (item.importAction === "skip") continue;
      if (item.importAction === "replace") {
        Object.assign(existing, normalized, {
          id: existing.id,
          createdAt: existing.createdAt,
          history: existing.history || [],
          passwordHistory: existing.passwordHistory || [],
          updatedAt: new Date().toISOString(),
        });
        updatedCount++;
      } else if (item.importAction === "merge") {
        existing.notes = [existing.notes || "", normalized.notes || ""].filter(Boolean).join("\n\n").trim();
        existing.tags = Array.from(new Set([...(existing.tags || []), ...(normalized.tags || [])]));
        existing.recoveryCodes = Array.from(new Set([...(existing.recoveryCodes || []), ...(normalized.recoveryCodes || [])]));
        existing.attachmentRefs = Array.from(new Set([...(existing.attachmentRefs || []), ...(normalized.attachmentRefs || [])]));
        existing.details = { ...existing.details, ...normalized.details };
        if (!existing.password && normalized.password) existing.password = normalized.password;
        if (!existing.username && normalized.username) existing.username = normalized.username;
        if (!existing.url && normalized.url) existing.url = normalized.url;
        existing.validationIssues = validateEntry(existing);
        existing.updatedAt = new Date().toISOString();
        updatedCount++;
      }
    }
    await refreshTotpCache();
    updateVaultTimestamp();
    markDirty("imported", importedCount + updatedCount);
    importPreview = [];
    importPreviewSelection.clear();
    importFile = null;
    mode = "home";
    rerender();
    toast(`Import finished: ${importedCount} new, ${updatedCount} updated.`);
  });
  renderImportPreviewHost(wrap);
  return wrap;
}

function renderImportPreviewHost(wrap) {
  const host = wrap.querySelector("#import_preview_host");
  host.innerHTML = "";
  if (!importPreview.length) return;
  const table = document.createElement("table");
  table.className = "table mobile-cards";
  table.innerHTML = "<thead><tr><th></th><th>Title</th><th>Category</th><th>User</th><th>Matches</th><th>Validation</th><th>Action</th></tr></thead>";
  const tbody = document.createElement("tbody");
  importPreview.forEach((entry, index) => {
    const tr = document.createElement("tr");
    const matches = entry.conflictMatches?.length
      ? entry.conflictMatches.slice(0, 2).map((match) => `${match.title} (${match.score})`).join(", ")
      : "None";
    const validation = entry.validationIssues?.length ? entry.validationIssues.join(", ") : "OK";
    tr.innerHTML = `
      <td data-label=""><input type="checkbox" style="width:auto;" ${importPreviewSelection.has(index) ? "checked" : ""} aria-label="Select import row" /></td>
      <td data-label="Title">${entry.title || "(Untitled)"}</td>
      <td data-label="Category">${entry.category || "login"}</td>
      <td data-label="User">${entry.username || ""}</td>
      <td data-label="Matches">${matches}</td>
      <td data-label="Validation">${validation}</td>
      <td data-label="Action">
        <select aria-label="Choose import action">
          <option value="import" ${entry.importAction === "import" ? "selected" : ""}>Import</option>
          <option value="duplicate" ${entry.importAction === "duplicate" ? "selected" : ""}>Duplicate</option>
          <option value="merge" ${entry.importAction === "merge" ? "selected" : ""}>Merge</option>
          <option value="replace" ${entry.importAction === "replace" ? "selected" : ""}>Replace</option>
          <option value="skip" ${entry.importAction === "skip" ? "selected" : ""}>Skip</option>
          <option value="review" ${entry.importAction === "review" ? "selected" : ""}>Review</option>
        </select>
      </td>
    `;
    tr.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) importPreviewSelection.add(index);
      else importPreviewSelection.delete(index);
      wrap.querySelector("#iv_import").textContent = `Import Selected (${importPreviewSelection.size})`;
      wrap.querySelector("#iv_import").disabled = !importPreviewSelection.size;
    });
    tr.querySelector("select").addEventListener("change", (e) => {
      importPreview[index].importAction = e.target.value;
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  host.appendChild(table);
}

function renderChangePasswordScreen() {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>Change Master Password</h2>
    <div class="row">
      <div><label>New Master Password</label><input id="cp_pw" type="password" autocomplete="new-password" /><div class="small" id="cp_strength"></div></div>
      <div><label>Confirm New Master Password</label><input id="cp_pw2" type="password" autocomplete="new-password" /></div>
    </div>
    <div class="actions"><button id="cp_save">Change & Download Vault</button><button id="cp_back" class="secondary">Cancel</button></div>
  `;
  const pw = wrap.querySelector("#cp_pw");
  const pw2 = wrap.querySelector("#cp_pw2");
  const strength = wrap.querySelector("#cp_strength");
  pw.addEventListener("input", () => {
    strength.textContent = passwordStrengthHint(pw.value);
    strength.className = `small ${pw.value.length >= 12 ? "ok" : "muted"}`;
  });
  wrap.querySelector("#cp_back").addEventListener("click", () => { mode = "home"; rerender(); });
  wrap.querySelector("#cp_save").addEventListener("click", async () => {
    if (!pw.value || pw.value.length < 8) return toast("Use a stronger password.", true);
    if (pw.value !== pw2.value) return toast("Passwords do not match.", true);
    try {
      rememberUndo("change-password");
      updateVaultTimestamp();
      const fileJson = await reencryptVaultToFile(state.vaultData, pw.value, state.vaultMeta, { kdf: getSecuritySettings().preferredKdf });
      const filename = buildTimestampedFilename(state.fileNameHint || "vault.json");
      downloadJson(fileJson, filename);
      rememberSaveHistory(filename, "Master password changed");
      markSaved(filename);
      mode = "home";
      rerender();
      toast("Downloaded vault with the new master password.");
    } catch (error) {
      toast(error.message || "Failed to change password.", true);
    }
  });
  return wrap;
}

function showModeScreen() {
  appRoot.innerHTML = "";
  const screen = mode === "create" ? renderCreateScreen()
    : mode === "open" ? renderOpenScreen()
      : mode === "security" ? renderSecurityScreen()
        : mode === "import" ? renderImportScreen()
          : mode === "change-password" ? renderChangePasswordScreen()
            : null;
  if (screen) appRoot.appendChild(screen);
  else rerender();
}

function registerPwaEvents() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.pendingInstallPrompt = event;
    state.pwaStatus = "Install available";
    rerender();
  });
  window.addEventListener("appinstalled", () => {
    state.pendingInstallPrompt = null;
    state.pwaStatus = "Installed";
    rerender();
  });
  window.addEventListener("zerovault-update-ready", () => {
    state.updateReady = true;
    state.pwaStatus = "Update ready";
    rerender();
  });
  if (window.__zerovaultUpdateReady) {
    state.updateReady = true;
    state.pwaStatus = "Update ready";
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
  } else if (document.hidden) {
    clearSensitiveReveals();
  } else {
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
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    handlers.onUndoLastAction();
  }
});

const handlers = {
  onGoCreate: () => { mode = "create"; showModeScreen(); },
  onGoOpen: () => { mode = "open"; showModeScreen(); },
  onGoImport: () => { mode = "import"; showModeScreen(); },
  onGoSecurity: () => { mode = "security"; showModeScreen(); },
  onGoChangePassword: () => { mode = "change-password"; showModeScreen(); },
  onGoQR: async () => {
    if (state.readOnly) return toast("Disabled in Read-Only Mode.", true);
    if (!window.qrcode) return toast("QR library is not loaded.", true);
    const master = prompt("Enter master password to generate transfer QR codes:");
    if (!master) return;
    try {
      const fileJson = await reencryptVaultToFile(state.vaultData, master, state.vaultMeta, { kdf: getSecuritySettings().preferredKdf });
      const json = JSON.stringify(fileJson);
      const chunks = [];
      for (let i = 0; i < json.length; i += 800) chunks.push(`ZV2:${Math.floor(i / 800) + 1}/${Math.ceil(json.length / 800)}:${json.slice(i, i + 800)}`);
      qrState = { chunks, index: 0 };
      renderQRModal(chunks, 0, chunks.length, handlers);
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
  },
  onAddEntry: () => {
    rememberUndo("add-entry");
    const entry = createNewEntry();
    state.vaultData.entries.unshift(entry);
    selectedEntryId = entry.id;
    syncPageToEntry(entry.id);
    updateVaultTimestamp();
    markDirty("added");
    rerender();
  },
  onEditEntry: (id) => {
    selectedEntryId = id;
    syncPageToEntry(id);
    rerender();
  },
  onCancelEdit: () => {
    selectedEntryId = null;
    rerender();
  },
  onSaveEntry: async (id) => {
    if (state.readOnly) return toast("Action disabled in Emergency Read-Only Mode.", true);
    const entry = getEntryById(id);
    if (!entry) return;
    const values = getEditorFormValues();
    const next = { ...values, totpSecret: secretFromText(values.totpSecret || "") };
    if (entry.isSensitive) {
      for (const field of SENSITIVE_FIELDS) {
        if (!isFieldRevealed(id, field)) {
          if (field === "details") next.details = { ...(entry.details || {}) };
          else if (field === "recoveryCodes") next.recoveryCodes = [...(entry.recoveryCodes || [])];
          else if (field === "attachmentRefs") next.attachmentRefs = [...(entry.attachmentRefs || [])];
          else next[field] = structuredClone(entry[field] || (Array.isArray(entry[field]) ? [] : ""));
        }
      }
    }
    const validationIssues = validateEntry(next);
    if (validationIssues.length) return toast(validationIssues[0], true);
    const hasChanges = JSON.stringify(cloneSnapshot(entry)) !== JSON.stringify(next);
    if (!hasChanges) return toast("No changes to save.");
    rememberUndo("edit-entry", entry.title || id);
    entry.history = entry.history || [];
    entry.history.unshift({ savedAt: new Date().toISOString(), snapshot: cloneSnapshot(entry) });
    if (entry.history.length > 10) entry.history.length = 10;
    if (entry.password !== next.password) {
      entry.passwordHistory = entry.passwordHistory || [];
      entry.passwordHistory.unshift({ changedAt: new Date().toISOString(), value: entry.password || "" });
      if (entry.passwordHistory.length > 10) entry.passwordHistory.length = 10;
      entry.lastPasswordChangeAt = new Date().toISOString();
    }
    Object.assign(entry, next, { updatedAt: new Date().toISOString(), validationIssues });
    await refreshTotpCache();
    updateVaultTimestamp();
    markDirty("edited");
    rerender();
    toast("Entry updated. Download the vault to persist changes.");
  },
  onRestoreHistory: async (entryId, historyIndex) => {
    const entry = getEntryById(entryId);
    if (!entry?.history?.[historyIndex]) return;
    if (!confirm("Restore this saved version?")) return;
    rememberUndo("restore-history", entry.title || entryId);
    const snapshot = entry.history[historyIndex].snapshot;
    entry.history.unshift({ savedAt: new Date().toISOString(), reason: "Rollback", snapshot: cloneSnapshot(entry) });
    Object.assign(entry, snapshot, { updatedAt: new Date().toISOString(), validationIssues: validateEntry(snapshot) });
    await refreshTotpCache();
    updateVaultTimestamp();
    markDirty("edited");
    rerender();
  },
  onToggleFavorite: (id) => {
    const entry = getEntryById(id);
    if (!entry) return;
    rememberUndo("favorite", entry.title || id);
    entry.isFavorite = !entry.isFavorite;
    entry.updatedAt = new Date().toISOString();
    updateVaultTimestamp();
    markDirty("edited");
    rerender();
  },
  onArchiveEntry: (id) => {
    const entry = getEntryById(id);
    if (!entry) return;
    rememberUndo("archive-entry", entry.title || id);
    entry.archived = true;
    entry.updatedAt = new Date().toISOString();
    bulkSelectedIds.delete(id);
    if (selectedEntryId === id) selectedEntryId = null;
    updateVaultTimestamp();
    markDirty("archived");
    rerender();
  },
  onRestoreEntry: (id) => {
    const entry = getEntryById(id);
    if (!entry) return;
    rememberUndo("restore-entry", entry.title || id);
    entry.archived = false;
    entry.updatedAt = new Date().toISOString();
    updateVaultTimestamp();
    markDirty("edited");
    rerender();
  },
  onDeleteEntry: (id) => {
    rememberUndo("delete-entry", getEntryById(id)?.title || id);
    state.vaultData.entries = state.vaultData.entries.filter((entry) => entry.id !== id);
    deletingEntryIds.delete(id);
    bulkSelectedIds.delete(id);
    if (selectedEntryId === id) selectedEntryId = null;
    updateVaultTimestamp();
    markDirty("deleted");
    rerender();
  },
  onCopyPassword: async (id) => {
    const entry = getEntryById(id);
    if (!entry) return;
    if (entry.isSensitive && !isFieldRevealed(id, "password")) return toast("Reveal the password field first.", true);
    await copyWithAutoClear(entry.password || "", "Password", { isSensitive: !!entry.isSensitive });
  },
  onCopyField: async (id, field) => {
    const entry = getEntryById(id);
    if (!entry) return;
    if (entry.isSensitive && !isFieldRevealed(id, field)) return toast("Reveal this field first.", true);
    const labels = { username: "Username", url: "URL", notes: "Notes", totpSecret: "TOTP secret" };
    await copyWithAutoClear(entry[field] || "", labels[field] || "Field", { isSensitive: !!entry.isSensitive });
  },
  onCopyTotp: async (id) => {
    const entry = getEntryById(id);
    if (!entry) return;
    if (entry.isSensitive && !isFieldRevealed(id, "totpSecret")) return toast("Reveal the TOTP field first.", true);
    const totp = await getEntryTotp(entry);
    if (!totp.valid || !totp.code) return toast(totp.label, true);
    await copyWithAutoClear(totp.code, "TOTP code", { isSensitive: !!entry.isSensitive });
  },
  onGeneratePassword: (id) => {
    const entry = getEntryById(id);
    if (!entry) return;
    const opts = currentGeneratorOptions();
    const generated = opts.pronounceable ? generatePronounceablePassword(opts.length) : generatePassword(opts);
    applyGeneratedPasswordToEditor(generated);
    toast("Generated a password. Save the entry to keep it.");
  },
  onGeneratorSettingsChange: () => {
    generatorSettings = {
      length: Number(document.getElementById("g_length")?.value ?? generatorSettings.length) || 20,
      includeUpper: !!document.getElementById("g_upper")?.checked,
      includeLower: !!document.getElementById("g_lower")?.checked,
      includeNumbers: !!document.getElementById("g_numbers")?.checked,
      includeSymbols: !!document.getElementById("g_symbols")?.checked,
      pronounceable: !!document.getElementById("g_pronounceable")?.checked,
    };
    renderEditor(selectedEntryId ? getEntryById(selectedEntryId) : null, handlers);
  },
  onSensitiveCheckboxChange: () => {},
  onToggleSensitiveReveal: (id, field = "*") => {
    const entry = getEntryById(id);
    if (!entry?.isSensitive) return;
    if (field === "*") {
      const already = isEntryFullyRevealed(id);
      for (const item of SENSITIVE_FIELDS) {
        if (already) clearSensitiveRevealField(id, item);
        else revealSensitiveField(id, item);
      }
    } else if (isFieldRevealed(id, field)) {
      clearSensitiveRevealField(id, field);
    } else {
      revealSensitiveField(id, field);
    }
    if (selectedEntryId === id) renderEditor(getEntryById(id), handlers);
    rerender();
  },
  onSaveDownload: async () => {
    if (!state.vaultData) return;
    const summary = summarizeChanges();
    if (summary && !confirm(`Download updated vault?\n\nChanges: ${summary}`)) return;
    const master = prompt("Enter master password to re-encrypt and download:");
    if (!master) return;
    const snapshotName = prompt("Optional snapshot name before download:", "");
    const backupAlso = confirm("Also download a timestamped backup copy?");
    try {
      if (snapshotName) createSnapshotRecord(snapshotName, "pre-download");
      updateVaultTimestamp();
      const fileJson = await reencryptVaultToFile(state.vaultData, master, state.vaultMeta, { kdf: getSecuritySettings().preferredKdf });
      const primaryName = state.fileNameHint || "vault.json";
      downloadJson(fileJson, primaryName);
      if (backupAlso) downloadJson(fileJson, buildTimestampedFilename(primaryName));
      rememberSaveHistory(primaryName, snapshotName || "");
      state.upgradeAvailable = false;
      markSaved(primaryName);
      rerender();
      toast(backupAlso ? "Downloaded vault and timestamped backup." : "Downloaded updated vault.");
    } catch (error) {
      toast(error.message || "Failed to encrypt vault.", true);
    }
  },
  onCreateSnapshot: () => {
    const name = prompt("Snapshot name:", `Snapshot ${new Date().toLocaleString()}`);
    if (!name) return;
    createSnapshotRecord(name, "manual");
    markDirty("edited");
    rerender();
    toast("Restore point created.");
  },
  onRestoreSnapshot: async (snapshotId) => {
    const snapshot = (state.vaultData?.snapshots || []).find((item) => item.id === snapshotId);
    if (!snapshot) return;
    if (!confirm(`Restore snapshot "${snapshot.name}"?`)) return;
    rememberUndo("restore-snapshot", snapshot.name);
    state.vaultData = structuredClone(snapshot.vaultData);
    await refreshTotpCache();
    updateVaultTimestamp();
    markDirty("edited");
    rerender();
    toast(`Restored snapshot "${snapshot.name}".`);
  },
  onUndoLastAction: async () => {
    const snapshot = popHistorySnapshot();
    if (!snapshot) return toast("No undo snapshot available.", true);
    if (restoreUndoSnapshot(snapshot)) {
      await refreshTotpCache();
      markDirty("edited");
      toast(`Undid ${snapshot.action}.`);
    }
  },
  onToggleFavoriteFilter: () => { visibleFilter.favoritesOnly = !visibleFilter.favoritesOnly; rerender(); },
  onToggleArchiveFilter: () => { visibleFilter.showArchived = !visibleFilter.showArchived; rerender(); },
  onToggleWeakFilter: () => { visibleFilter.weakOnly = !visibleFilter.weakOnly; rerender(); },
  onToggleSensitiveFilter: () => { visibleFilter.sensitiveOnly = !visibleFilter.sensitiveOnly; rerender(); },
  onToggleExpiringFilter: () => { visibleFilter.expiringOnly = !visibleFilter.expiringOnly; rerender(); },
  onApplySearch: () => { visibleFilter = { ...visibleFilter, ...getSearchValues() }; currentPage = 1; rerender(); },
  onClearSearch: () => { visibleFilter = defaultFilterState(); currentPage = 1; rerender(); },
  onNextPage: () => {
    const { totalPages } = getPaginationSummary();
    currentPage = Math.min(currentPage + 1, totalPages);
    rerender();
  },
  onPrevPage: () => {
    currentPage = Math.max(currentPage - 1, 1);
    rerender();
  },
  onToggleBulkEntry: (id) => {
    if (bulkSelectedIds.has(id)) bulkSelectedIds.delete(id);
    else bulkSelectedIds.add(id);
    rerender();
  },
  onClearBulkSelection: () => {
    bulkSelectedIds.clear();
    rerender();
  },
  onBulkFavorite: () => {
    rememberUndo("bulk-favorite", `${bulkSelectedIds.size} entries`);
    for (const id of bulkSelectedIds) {
      const entry = getEntryById(id);
      if (entry) entry.isFavorite = true;
    }
    updateVaultTimestamp();
    markDirty("edited", bulkSelectedIds.size);
    rerender();
  },
  onBulkArchive: () => {
    rememberUndo("bulk-archive", `${bulkSelectedIds.size} entries`);
    for (const id of bulkSelectedIds) {
      const entry = getEntryById(id);
      if (entry) entry.archived = true;
    }
    updateVaultTimestamp();
    markDirty("archived", bulkSelectedIds.size);
    bulkSelectedIds.clear();
    rerender();
  },
  onBulkSetCategory: () => {
    const category = prompt("Set category for selected entries (login, card, note, identity, bank, license):", "login");
    if (!category) return;
    rememberUndo("bulk-category", `${bulkSelectedIds.size} entries`);
    for (const id of bulkSelectedIds) {
      const entry = getEntryById(id);
      if (entry) {
        entry.category = category;
        entry.validationIssues = validateEntry(entry);
      }
    }
    updateVaultTimestamp();
    markDirty("edited", bulkSelectedIds.size);
    rerender();
  },
  onBulkAddTag: () => {
    const tag = prompt("Add tag to selected entries:");
    if (!tag) return;
    rememberUndo("bulk-tag", `${bulkSelectedIds.size} entries`);
    for (const id of bulkSelectedIds) {
      const entry = getEntryById(id);
      if (entry && !(entry.tags || []).includes(tag)) entry.tags.push(tag);
    }
    updateVaultTimestamp();
    markDirty("edited", bulkSelectedIds.size);
    rerender();
  },
  onBulkDelete: () => {
    if (!confirm(`Delete ${bulkSelectedIds.size} selected entries permanently?`)) return;
    rememberUndo("bulk-delete", `${bulkSelectedIds.size} entries`);
    state.vaultData.entries = state.vaultData.entries.filter((entry) => !bulkSelectedIds.has(entry.id));
    updateVaultTimestamp();
    markDirty("deleted", bulkSelectedIds.size);
    bulkSelectedIds.clear();
    rerender();
  },
  onToggleAuditPanel: () => {
    auditPanelOpen = !auditPanelOpen;
    rerender();
  },
  onExportAudit: () => {
    const audit = getAudit();
    downloadJson(buildAuditExport(state.vaultData.vaultName, audit), "zerovault-audit-report.json");
    toast("Audit report downloaded.");
  },
  onExportSummary: () => {
    const audit = getAudit();
    downloadJson(buildVaultSummaryExport(state.vaultData, audit), "zerovault-summary.json");
    toast("Vault summary downloaded.");
  },
  onPrintRecoverySheet: () => {
    openPrintableHtml(buildRecoverySheetHtml(state.vaultData));
  },
  onInstallApp: async () => {
    if (!state.pendingInstallPrompt) return toast("Install prompt is not available on this browser.", true);
    await state.pendingInstallPrompt.prompt();
    state.pendingInstallPrompt = null;
    state.pwaStatus = "Install prompt used";
    rerender();
  },
  onRefreshForUpdate: async () => {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    }
  },
  getVisibleEntries,
  getPaginationSummary,
  getFilterState: () => ({ ...visibleFilter }),
  isShowArchived: () => visibleFilter.showArchived,
  getAuditSummary: () => getAudit().totals,
  getAuditReport: () => getAudit(),
  isAuditPanelOpen: () => auditPanelOpen,
  getEntryAudit,
  getEntryTotp: (id) => totpCache.get(id) || { valid: false, label: getEntryById(id)?.totpSecret ? "Calculating TOTP..." : "No TOTP secret set", code: "", expiresIn: 0 },
  getCryptoSummary: () => ({ current: `${state.vaultMeta?.crypto?.kdf || "PBKDF2"} / ${state.vaultMeta?.crypto?.cipher || "AES-GCM"}`, preferred: getSecuritySettings().preferredKdf, upgradeAvailable: state.upgradeAvailable, argon2Available: getArgon2Support().available, argon2Reason: getArgon2Support().reason || "Runtime loaded" }),
  getFileSummary: () => ({ name: state.fileNameHint || "vault.json", lastSaved: state.lastSavedAt ? new Date(state.lastSavedAt).toLocaleString() : "Not downloaded in this session", saveHistory: state.vaultData?.saveHistory || [], snapshots: state.vaultData?.snapshots || [] }),
  getBulkSummary: () => ({ selected: bulkSelectedIds.size, undoAvailable: state.historyStack.length > 0, undoCount: state.historyStack.length }),
  isEntrySelected: (id) => id === selectedEntryId,
  isEntryDeleting: (id) => deletingEntryIds.has(id),
  isBulkSelected: (id) => bulkSelectedIds.has(id),
  getGeneratorSettings: () => ({ ...generatorSettings }),
  isSensitiveRevealed: (id, field = "*") => field === "*" ? isEntryFullyRevealed(id) : isFieldRevealed(id, field),
  getSensitiveSettings: () => ({ revealSeconds: Math.round((getSecuritySettings().sensitiveRevealMs || 30000) / 1000), allowCopy: !!getSecuritySettings().allowSensitiveCopy }),
  getPwaStatus: () => ({ status: state.pwaStatus, installAvailable: !!state.pendingInstallPrompt, updateReady: !!state.updateReady }),
};

function init() {
  try {
    clearHistorySnapshots();
    registerPwaEvents();
    render(appRoot, handlers);
    updateLockButton();
  } catch (error) {
    document.body.innerHTML = `<div style="color:red; padding:20px;"><h3>Error initializing app:</h3><pre>${String(error.stack || error.message)}</pre></div>`;
  }
}

showModeScreen();
init();
