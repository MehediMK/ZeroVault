import { state, isUnlocked } from "./state.js";
import { getDomainColor, getInitials, timeAgo } from "./helpers.js";

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (["checked", "disabled", "selected", "value"].includes(key)) node[key] = value;
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child) node.appendChild(child);
  }
  return node;
}

export function render(appRoot, handlers) {
  appRoot.innerHTML = "";
  appRoot.appendChild(isUnlocked() ? renderUnlocked(handlers) : renderLocked(handlers));
}

function renderLocked(handlers) {
  return el("div", { style: "max-width: 520px; margin: 40px auto; text-align: center;" }, [
    el("div", { style: "font-size: 3rem; margin-bottom: 18px;" }, [el("span", { text: "🔐" })]),
    el("div", { class: "card" }, [
      el("h2", { text: "Welcome to ZeroVault" }),
      el("p", { class: "notice", text: "Offline password storage with local encryption, import tools, audit checks, and TOTP support." }),
      el("div", { class: "actions centered" }, [
        el("button", { text: "Create New Vault", onclick: handlers.onGoCreate, style: "width: 100%" }),
        el("button", { class: "secondary", text: "Open Existing Vault", onclick: handlers.onGoOpen, style: "width: 100%" }),
      ]),
    ]),
    el("div", { class: "card", style: "border: 1px dashed var(--border); background: transparent;" }, [
      el("h3", { text: "Included Now", style: "border:none; margin-bottom: 10px; font-size: 1rem;" }),
      el("ul", { class: "small", style: "text-align: left; padding-left: 20px; color: var(--muted);" }, [
        el("li", { text: "Password generator and vault health audit." }),
        el("li", { text: "Configurable auto-lock saved inside the encrypted vault." }),
        el("li", { text: "CSV/Bitwarden imports and offline TOTP codes." }),
      ]),
    ]),
  ]);
}

function renderSummaryCard(handlers) {
  const audit = handlers.getAuditSummary();
  const cryptoInfo = handlers.getCryptoSummary();
  const fileInfo = handlers.getFileSummary();
  const actions = [
    !state.readOnly ? el("button", { text: "Add Entry", onclick: handlers.onAddEntry }) : null,
    !state.readOnly ? el("button", { class: "secondary", text: "Import", onclick: handlers.onGoImport }) : null,
    !state.readOnly ? el("button", { class: "secondary", text: "Security", onclick: handlers.onGoSecurity }) : null,
    !state.readOnly ? el("button", { class: "secondary", text: "Save & Download", onclick: handlers.onSaveDownload }) : null,
    !state.readOnly ? el("button", { class: "secondary", text: "Change Master Password", onclick: handlers.onGoChangePassword }) : null,
    !state.readOnly ? el("button", { class: "secondary", text: "Mobile Transfer (QR)", onclick: handlers.onGoQR }) : null,
    !state.readOnly ? el("button", { class: "secondary", text: "Switch to Read-Only", onclick: handlers.onSwitchReadOnly }) : null,
  ].filter(Boolean);

  return el("div", { class: "card" }, [
    el("div", { class: "stack-sm" }, [
      el("div", { class: "inline wrap" }, [
        el("span", { class: "badge", text: `Unlocked: ${state.vaultData.vaultName}` }),
        el("span", { class: `badge ${state.hasUnsavedChanges ? "badge-warn" : "badge-ok"}`, text: state.hasUnsavedChanges ? "Unsaved changes" : "Saved state clean" }),
        el("span", { class: "small", text: `Entries: ${state.vaultData.entries.length}` }),
      ]),
      el("div", { class: "small muted" }, [
        document.createTextNode(`File: ${fileInfo.name}`),
      ]),
      el("div", { class: "small muted" }, [
        document.createTextNode(`Last download: ${fileInfo.lastSaved}`),
      ]),
      el("div", { class: "small muted" }, [
        document.createTextNode(`Crypto: ${cryptoInfo.current}`),
      ]),
      el("div", { class: "small muted" }, [
        document.createTextNode(`Audit: ${audit.weak} weak, ${audit.reused} reused, ${audit.old} old, ${audit.noTotp} missing TOTP`),
      ]),
    ]),
    el("div", { class: "actions" }, actions),
  ]);
}

function renderInsightsCard(handlers) {
  const audit = handlers.getAuditSummary();
  const cryptoInfo = handlers.getCryptoSummary();
  const notices = [];
  if (cryptoInfo.upgradeAvailable) notices.push(`Vault is using ${cryptoInfo.current}; preferred target is ${cryptoInfo.preferred}.`);
  if (!cryptoInfo.argon2Available) notices.push("Argon2id migration path is wired, but no Argon2id adapter is bundled yet.");
  if (audit.weak > 0) notices.push(`${audit.weak} entries need stronger passwords.`);
  if (audit.reused > 0) notices.push(`${audit.reused} entries reuse passwords.`);

  return el("div", { class: "card" }, [
    el("h3", { text: "Security Overview" }),
    el("div", { class: "stats-grid" }, [
      stat("Weak", String(audit.weak)),
      stat("Reused", String(audit.reused)),
      stat("Old", String(audit.old)),
      stat("No TOTP", String(audit.noTotp)),
    ]),
    notices.length
      ? el("div", { class: "stack-sm", style: "margin-top: 16px;" }, notices.map((notice) => el("div", { class: "notice" }, [document.createTextNode(notice)])))
      : el("p", { class: "small ok", text: "No immediate audit findings." }),
  ]);
}

function stat(label, value) {
  return el("div", { class: "stat-card" }, [
    el("div", { class: "stat-value", text: value }),
    el("div", { class: "small muted", text: label }),
  ]);
}

function renderSearchCard(handlers) {
  const filter = handlers.getFilterState();
  return el("div", { class: "card" }, [
    el("h3", { text: "Search & Filter" }),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Query" }),
        el("input", { id: "searchQuery", type: "text", value: filter.q, placeholder: "title / url / username / tag" }),
      ]),
      el("div", {}, [
        el("label", { text: "Tag" }),
        el("input", { id: "searchTag", type: "text", value: filter.tag, placeholder: "e.g. work" }),
      ]),
      el("div", { class: "stack-sm", style: "justify-content: end;" }, [
        checkbox("Favorites only", filter.favoritesOnly, handlers.onToggleFavoriteFilter),
        checkbox("Show archived only", filter.showArchived, handlers.onToggleArchiveFilter),
      ]),
    ]),
    el("div", { class: "actions" }, [
      el("button", { class: "secondary", text: "Apply", onclick: handlers.onApplySearch }),
      el("button", { class: "secondary", text: "Clear", onclick: handlers.onClearSearch }),
    ]),
  ]);
}

function checkbox(label, checked, handler) {
  return el("label", { class: "inline", style: "cursor:pointer; gap:8px;" }, [
    el("input", { type: "checkbox", checked, onchange: handler, style: "width:auto;" }),
    el("span", { text: label }),
  ]);
}

function renderEntriesTable(handlers) {
  const entries = handlers.getVisibleEntries();
  const table = el("table", { class: "table" });
  const thead = el("thead", {}, [
    el("tr", {}, [
      el("th", { text: "" }),
      el("th", { text: "Identity" }),
      el("th", { text: "Health" }),
      el("th", { text: "TOTP" }),
      el("th", { text: "Updated" }),
      el("th", { text: "Actions" }),
    ]),
  ]);
  const tbody = el("tbody");

  for (const entry of entries) {
    const initials = getInitials(entry.title || entry.url || "?");
    const color = getDomainColor(entry.title || entry.url || "entry");
    const audit = handlers.getEntryAudit(entry.id);
    const totpStatus = entry.totpSecret ? "Ready" : "Missing";
    const row = el("tr", { class: handlers.isEntrySelected(entry.id) ? "selected" : entry.archived ? "archived" : "" }, [
      el("td", {}, [
        el("span", {
          text: entry.isFavorite ? "★" : "☆",
          style: `cursor:pointer; font-size: 1.2rem; color: ${entry.isFavorite ? "#ffc107" : "#9aa3b2"}`,
          onclick: () => handlers.onToggleFavorite(entry.id),
        }),
      ]),
      el("td", {}, [
        el("div", { class: "title-cell" }, [
          el("div", { class: "entry-icon", style: `background-color: ${color}`, text: initials }),
          el("div", { class: "stack-sm" }, [
            el("span", { class: "title-text", text: entry.title || "(No title)" }),
            el("span", { class: "meta-text", text: entry.username || entry.url || "" }),
          ]),
        ]),
      ]),
      el("td", {}, [
        el("span", { class: `badge ${audit.score > 2 ? "badge-danger" : audit.score > 0 ? "badge-warn" : "badge-ok"}`, text: audit.score > 0 ? `${audit.score} issues` : "Healthy" }),
      ]),
      el("td", {}, [el("span", { class: `badge ${entry.totpSecret ? "badge-ok" : ""}`, text: totpStatus })]),
      el("td", { class: "small", text: timeAgo(entry.updatedAt || entry.createdAt) }),
      el("td", {}, [
        el("div", { class: "inline wrap" }, [
          el("button", { class: "secondary small", text: state.readOnly ? "View" : "Edit", onclick: () => handlers.onEditEntry(entry.id) }),
          !state.readOnly ? el("button", { class: "secondary small", text: "Copy", onclick: () => handlers.onCopyPassword(entry.id) }) : null,
          entry.totpSecret && !state.readOnly ? el("button", { class: "secondary small", text: "OTP", onclick: () => handlers.onCopyTotp(entry.id) }) : null,
          entry.archived
            ? !state.readOnly ? el("button", { class: "secondary small", text: "Restore", onclick: () => handlers.onRestoreEntry(entry.id) }) : null
            : !state.readOnly ? el("button", { class: "danger small", text: "Archive", onclick: () => handlers.onArchiveEntry(entry.id) }) : null,
          !state.readOnly && !entry.archived
            ? handlers.isEntryDeleting(entry.id)
              ? el("button", { class: "danger small", text: "Confirm Delete", onclick: () => handlers.onDeleteEntry(entry.id) })
              : el("button", { class: "secondary small", text: "Delete", onclick: () => handlers.onInitiateDelete(entry.id) })
            : null,
          !state.readOnly && handlers.isEntryDeleting(entry.id)
            ? el("button", { class: "secondary small", text: "Cancel", onclick: () => handlers.onCancelDelete(entry.id) })
            : null,
        ].filter(Boolean)),
      ]),
    ]);
    tbody.appendChild(row);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  return el("div", { class: "table-wrapper" }, [table]);
}

function renderUnlocked(handlers) {
  const editor = el("div", { class: "card" }, [
    el("h3", { text: "Entry Editor" }),
    el("div", { id: "editorHost" }, [el("p", { class: "small muted", text: "Select an entry to view or edit it." })]),
  ]);

  return el("div", {}, [
    state.readOnly
      ? el("div", { class: "card notice" }, [document.createTextNode("Emergency Read-Only Mode is active. Editing and clipboard actions are disabled.")])
      : null,
    renderSummaryCard(handlers),
    el("div", { class: "dashboard-grid" }, [
      renderInsightsCard(handlers),
      renderSearchCard(handlers),
    ]),
    el("div", { class: "card" }, [
      el("h3", { text: handlers.isShowArchived() ? "Archived Entries" : "Entries" }),
      renderEntriesTable(handlers),
    ]),
    editor,
  ].filter(Boolean));
}

export function renderEditor(entryOrNull, handlers) {
  const host = document.getElementById("editorHost");
  if (!host) return;
  host.innerHTML = "";

  if (!entryOrNull) {
    host.appendChild(el("p", { class: "small muted", text: "No entry selected." }));
    return;
  }

  const isRO = state.readOnly;
  const entry = entryOrNull;
  const audit = handlers.getEntryAudit(entry.id);
  const totp = handlers.getEntryTotp(entry.id);
  const inputAttrs = (attrs) => {
    if (isRO) attrs.disabled = true;
    return attrs;
  };

  const issues = audit.issues.length
    ? el("div", { class: "inline wrap", style: "margin-bottom: 14px;" }, audit.issues.map((issue) => el("span", { class: "badge badge-warn", text: issue })))
    : el("div", { class: "badge badge-ok", text: "No audit issues on this entry." });

  const form = el("div", { class: "stack-md" }, [
    issues,
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Title" }),
        el("input", inputAttrs({ id: "f_title", type: "text", value: entry.title || "", autocomplete: "off" })),
      ]),
      el("div", {}, [
        el("label", { text: "URL" }),
        el("input", inputAttrs({ id: "f_url", type: "text", value: entry.url || "", autocomplete: "off" })),
      ]),
    ]),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Username / Email" }),
        el("input", inputAttrs({ id: "f_username", type: "text", value: entry.username || "", autocomplete: "off" })),
      ]),
      el("div", {}, [
        el("label", { text: "Password" }),
        el("input", inputAttrs({ id: "f_password", type: "text", value: entry.password || "", autocomplete: "new-password" })),
        !isRO ? el("div", { class: "actions" }, [
          el("button", { class: "secondary small", text: "Generate", onclick: () => handlers.onGeneratePassword(entry.id) }),
          el("button", { class: "secondary small", text: "Copy Password", onclick: () => handlers.onCopyPassword(entry.id) }),
        ]) : null,
      ]),
    ]),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Tags (comma-separated)" }),
        el("input", inputAttrs({ id: "f_tags", type: "text", value: (entry.tags || []).join(", "), autocomplete: "off" })),
      ]),
      el("div", {}, [
        el("label", { text: "Notes" }),
        el("textarea", inputAttrs({ id: "f_notes", autocomplete: "off" })),
      ]),
    ]),
    el("div", { class: "card subtle-card" }, [
      el("h4", { text: "TOTP / 2FA" }),
      el("div", { class: "row" }, [
        el("div", {}, [
          el("label", { text: "Base32 Secret" }),
          el("input", inputAttrs({ id: "f_totpSecret", type: "text", value: entry.totpSecret || "", autocomplete: "off", placeholder: "JBSWY3DPEHPK3PXP" })),
        ]),
        el("div", { class: "row" }, [
          el("div", {}, [
            el("label", { text: "Digits" }),
            el("input", inputAttrs({ id: "f_totpDigits", type: "number", value: entry.totpDigits || 6, min: "6", max: "8" })),
          ]),
          el("div", {}, [
            el("label", { text: "Period (sec)" }),
            el("input", inputAttrs({ id: "f_totpPeriod", type: "number", value: entry.totpPeriod || 30, min: "15", max: "90" })),
          ]),
        ]),
      ]),
      el("div", { class: "inline wrap" }, [
        el("span", { class: `badge ${totp.valid ? "badge-ok" : "badge-warn"}`, text: totp.label }),
        totp.code ? el("span", { class: "badge", text: `Current code: ${totp.code} (${totp.expiresIn}s)` }) : null,
        totp.code && !isRO ? el("button", { class: "secondary small", text: "Copy Code", onclick: () => handlers.onCopyTotp(entry.id) }) : null,
      ].filter(Boolean)),
    ]),
    el("div", { class: "inline wrap small muted" }, [
      document.createTextNode(`Imported from: ${entry.importedFrom || "Manual"}`),
      document.createTextNode(`Updated: ${timeAgo(entry.updatedAt || entry.createdAt)}`),
    ]),
    el("div", { class: "actions" }, [
      !isRO ? el("button", { text: "Save Entry", onclick: () => handlers.onSaveEntry(entry.id) }) : null,
      el("button", { class: "secondary", text: isRO ? "Close" : "Cancel", onclick: handlers.onCancelEdit }),
    ].filter(Boolean)),
  ]);

  host.appendChild(form);
  const notes = document.getElementById("f_notes");
  if (notes) notes.value = entry.notes || "";

  if (entry.history?.length) {
    host.appendChild(el("div", { class: "card subtle-card", style: "margin-top: 16px;" }, [
      el("h4", { text: "Version History" }),
      el("div", { class: "stack-sm" }, entry.history.slice(0, 10).map((item, index) =>
        el("div", { class: "inline wrap history-row" }, [
          el("span", { class: "small muted", text: `${new Date(item.savedAt).toLocaleString()}${item.reason ? ` (${item.reason})` : ""}` }),
          !isRO ? el("button", { class: "secondary small", text: "Restore", onclick: () => handlers.onRestoreHistory(entry.id, index) }) : null,
        ].filter(Boolean))
      )),
    ]));
  }
}

export function getEditorFormValues() {
  return {
    title: document.getElementById("f_title")?.value ?? "",
    url: document.getElementById("f_url")?.value ?? "",
    username: document.getElementById("f_username")?.value ?? "",
    password: document.getElementById("f_password")?.value ?? "",
    notes: document.getElementById("f_notes")?.value ?? "",
    tags: (document.getElementById("f_tags")?.value ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    totpSecret: document.getElementById("f_totpSecret")?.value ?? "",
    totpDigits: Number(document.getElementById("f_totpDigits")?.value ?? 6) || 6,
    totpPeriod: Number(document.getElementById("f_totpPeriod")?.value ?? 30) || 30,
  };
}

export function getSearchValues() {
  return {
    q: (document.getElementById("searchQuery")?.value ?? "").trim(),
    tag: (document.getElementById("searchTag")?.value ?? "").trim(),
  };
}

export function renderQRModal(chunks, index, total, handlers) {
  let overlay = document.getElementById("qr-overlay");
  if (!overlay) {
    overlay = el("div", { id: "qr-overlay", style: "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;" });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = "";
  const chunkData = chunks[index];
  let qrHtml = "";
  try {
    if (window.qrcode) {
      const qr = window.qrcode(0, "L");
      qr.addData(chunkData);
      qr.make();
      qrHtml = qr.createImgTag(5, 8);
    } else {
      qrHtml = "<p>QR library not available.</p>";
    }
  } catch (error) {
    qrHtml = `<p class="error">${error.message}</p>`;
  }

  const card = el("div", { class: "card", style: "max-width: 520px; text-align:center; background:#fff; color:#111;" }, [
    el("h2", { text: `Mobile Transfer (${index + 1}/${total})` }),
    el("p", { text: "Scan each code in order on another ZeroVault-compatible device." }),
    el("div", { html: qrHtml, style: "margin: 20px 0;" }),
    el("div", { class: "actions centered" }, [
      el("button", { class: "secondary", text: "Previous", onclick: handlers.onPrevQR, disabled: index === 0 }),
      el("button", { text: index === total - 1 ? "Finish" : "Next", onclick: handlers.onNextQR }),
      el("button", { class: "secondary", text: "Close", onclick: handlers.onCloseQR }),
    ]),
    el("p", { class: "small", text: `Chunk size: ${chunkData.length} characters` }),
  ]);
  overlay.appendChild(card);
}

export function closeQRModal() {
  document.getElementById("qr-overlay")?.remove();
}
