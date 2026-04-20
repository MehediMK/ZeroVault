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

function categories() {
  return [
    ["login", "Login"],
    ["card", "Card"],
    ["note", "Secure Note"],
    ["identity", "Identity"],
    ["bank", "Bank"],
    ["license", "License"],
  ];
}

function detailFieldSpecs(category) {
  switch (category) {
    case "card":
      return [
        ["cardholderName", "Cardholder Name"],
        ["cardNumber", "Card Number"],
        ["expiry", "Expiry"],
        ["cvv", "CVV"],
      ];
    case "identity":
      return [
        ["fullName", "Full Name"],
        ["documentId", "Document ID"],
        ["issuingCountry", "Issuing Country"],
      ];
    case "bank":
      return [
        ["bankName", "Bank Name"],
        ["accountNumber", "Account Number"],
        ["routingNumber", "Routing / SWIFT"],
      ];
    case "license":
      return [
        ["product", "Product"],
        ["licenseKey", "License Key"],
        ["seatCount", "Seat Count"],
      ];
    case "note":
      return [
        ["topic", "Topic"],
        ["owner", "Owner"],
      ];
    default:
      return [
        ["website", "Website"],
        ["loginHint", "Login Hint"],
      ];
  }
}

function masked(text) {
  if (!text) return "";
  return "Hidden";
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
      el("p", { class: "notice", text: "Offline vault with local encryption, audit tools, TOTP, import preview, bulk actions, and sensitive-entry mode." }),
      el("div", { class: "actions centered" }, [
        el("button", { text: "Create New Vault", onclick: handlers.onGoCreate, style: "width: 100%" }),
        el("button", { class: "secondary", text: "Open Existing Vault", onclick: handlers.onGoOpen, style: "width: 100%" }),
      ]),
    ]),
  ]);
}

function renderSummaryCard(handlers) {
  const audit = handlers.getAuditSummary();
  const cryptoInfo = handlers.getCryptoSummary();
  const fileInfo = handlers.getFileSummary();
  const bulkInfo = handlers.getBulkSummary();
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
        el("span", { class: "badge", text: `${state.vaultData.entries.length} entries` }),
        bulkInfo.selected > 0 ? el("span", { class: "badge badge-warn", text: `${bulkInfo.selected} selected` }) : null,
      ].filter(Boolean)),
      el("div", { class: "small muted", text: `File: ${fileInfo.name}` }),
      el("div", { class: "small muted", text: `Last download: ${fileInfo.lastSaved}` }),
      el("div", { class: "small muted", text: `Crypto: ${cryptoInfo.current}` }),
      el("div", { class: "small muted", text: `Audit: ${audit.weak} weak, ${audit.reused} reused, ${audit.expiring} expiring, ${audit.noTotp} missing TOTP` }),
    ]),
    el("div", { class: "actions wrap" }, actions),
  ]);
}

function renderBulkBar(handlers) {
  const bulk = handlers.getBulkSummary();
  if (!bulk.selected || state.readOnly) return null;
  return el("div", { class: "card bulk-bar" }, [
    el("div", { class: "inline wrap" }, [
      el("strong", { text: `${bulk.selected} selected` }),
      el("button", { class: "secondary small", text: "Favorite", onclick: handlers.onBulkFavorite }),
      el("button", { class: "secondary small", text: "Archive", onclick: handlers.onBulkArchive }),
      el("button", { class: "secondary small", text: "Set Category", onclick: handlers.onBulkSetCategory }),
      el("button", { class: "secondary small", text: "Add Tag", onclick: handlers.onBulkAddTag }),
      el("button", { class: "danger small", text: "Delete", onclick: handlers.onBulkDelete }),
      bulk.undoAvailable ? el("button", { class: "secondary small", text: "Undo", onclick: handlers.onUndoLastBulkAction }) : null,
      el("button", { class: "secondary small", text: "Clear", onclick: handlers.onClearBulkSelection }),
    ].filter(Boolean)),
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
      el("div", {}, [
        el("label", { text: "Category" }),
        el("select", { id: "searchCategory", value: filter.category || "" }, [
          el("option", { value: "", text: "All categories" }),
          ...categories().map(([value, label]) => el("option", { value, text: label, selected: filter.category === value })),
        ]),
      ]),
      el("div", {}, [
        el("label", { text: "Sort" }),
        el("select", { id: "searchSort", value: filter.sort || "recent" }, [
          el("option", { value: "recent", text: "Most Recent", selected: filter.sort === "recent" }),
          el("option", { value: "title", text: "Title A-Z", selected: filter.sort === "title" }),
          el("option", { value: "weak", text: "Weak First", selected: filter.sort === "weak" }),
          el("option", { value: "favorites", text: "Favorites First", selected: filter.sort === "favorites" }),
        ]),
      ]),
    ]),
    el("div", { class: "inline wrap filter-checks" }, [
      checkbox("Favorites only", filter.favoritesOnly, handlers.onToggleFavoriteFilter),
      checkbox("Show archived only", filter.showArchived, handlers.onToggleArchiveFilter),
      checkbox("Weak only", filter.weakOnly, handlers.onToggleWeakFilter),
      checkbox("Sensitive only", filter.sensitiveOnly, handlers.onToggleSensitiveFilter),
      checkbox("Expiring only", filter.expiringOnly, handlers.onToggleExpiringFilter),
    ]),
    el("div", { class: "actions" }, [
      el("button", { class: "secondary", text: "Apply", onclick: handlers.onApplySearch }),
      el("button", { class: "secondary", text: "Clear", onclick: handlers.onClearSearch }),
      el("button", { class: "secondary", text: "Open Audit Report", onclick: handlers.onToggleAuditPanel }),
    ]),
  ]);
}

function renderAuditCard(handlers) {
  if (!handlers.isAuditPanelOpen()) return null;
  const report = handlers.getAuditReport();
  return el("div", { class: "card" }, [
    el("h3", { text: "Audit Report" }),
    el("div", { class: "stack-sm" }, report.items.slice(0, 12).map((item) =>
      el("div", { class: "history-row inline wrap" }, [
        el("span", { class: "title-text", text: item.title }),
        el("span", { class: `badge ${item.score > 2 ? "badge-danger" : item.score > 0 ? "badge-warn" : "badge-ok"}`, text: item.score > 0 ? item.issues.join(", ") : "Healthy" }),
      ])
    )),
    el("div", { class: "actions" }, [
      el("button", { class: "secondary", text: "Close", onclick: handlers.onToggleAuditPanel }),
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
  const pagination = handlers.getPaginationSummary();
  const table = el("table", { class: "table mobile-cards" });
  const thead = el("thead", {}, [
    el("tr", {}, [
      el("th", { text: "" }),
      el("th", { text: "" }),
      el("th", { text: "Identity" }),
      el("th", { text: "Category" }),
      el("th", { text: "Health" }),
      el("th", { text: "Updated" }),
      el("th", { text: "Actions" }),
    ]),
  ]);
  const tbody = el("tbody");

  for (const entry of entries) {
    const initials = getInitials(entry.title || entry.url || "?");
    const color = getDomainColor(entry.title || entry.url || "entry");
    const audit = handlers.getEntryAudit(entry.id);
    const selected = handlers.isEntrySelected(entry.id);
    const sensitive = !!entry.isSensitive;
    const title = sensitive ? masked(entry.title || "(Sensitive)") : (entry.title || "(No title)");
    const meta = sensitive ? masked(entry.username || entry.url || "") : (entry.username || entry.url || "");
    tbody.appendChild(el("tr", { class: `${selected ? "selected" : ""} ${entry.archived ? "archived" : ""}`.trim() }, [
      el("td", {}, [
        !state.readOnly ? el("input", { type: "checkbox", checked: handlers.isBulkSelected(entry.id), onchange: () => handlers.onToggleBulkEntry(entry.id), style: "width:auto;" }) : null,
      ]),
      el("td", {}, [
        el("span", {
          text: entry.isFavorite ? "★" : "☆",
          style: `cursor:pointer; font-size: 1.2rem; color: ${entry.isFavorite ? "#ffc107" : "#9aa3b2"}`,
          onclick: () => handlers.onToggleFavorite(entry.id),
        }),
      ]),
      el("td", { "data-label": "Identity" }, [
        el("div", { class: "title-cell" }, [
          el("div", { class: `entry-icon ${sensitive ? "sensitive-glow" : ""}`, style: `background-color: ${color}`, text: initials }),
          el("div", { class: "stack-sm" }, [
            el("span", { class: "title-text", text: title }),
            el("span", { class: "meta-text", text: meta }),
          ]),
        ]),
      ]),
      el("td", { "data-label": "Category" }, [
        el("div", { class: "inline wrap" }, [
          el("span", { class: "badge", text: entry.category || "login" }),
          sensitive ? el("span", { class: "badge badge-danger", text: "Sensitive" }) : null,
        ].filter(Boolean)),
      ]),
      el("td", { "data-label": "Health" }, [
        el("span", { class: `badge ${audit.score > 2 ? "badge-danger" : audit.score > 0 ? "badge-warn" : "badge-ok"}`, text: audit.score > 0 ? `${audit.score} issues` : "Healthy" }),
      ]),
      el("td", { class: "small", "data-label": "Updated", text: timeAgo(entry.updatedAt || entry.createdAt) }),
      el("td", { "data-label": "Actions" }, [
        el("div", { class: "inline wrap" }, [
          el("button", { class: "secondary small", text: state.readOnly ? "View" : "Edit", onclick: () => handlers.onEditEntry(entry.id) }),
          !state.readOnly ? el("button", { class: "secondary small", text: sensitive ? "Reveal" : "Copy", onclick: sensitive ? () => handlers.onToggleSensitiveReveal(entry.id) : () => handlers.onCopyPassword(entry.id) }) : null,
          entry.totpSecret && !state.readOnly ? el("button", { class: "secondary small", text: "OTP", onclick: () => handlers.onCopyTotp(entry.id) }) : null,
          entry.archived
            ? !state.readOnly ? el("button", { class: "secondary small", text: "Restore", onclick: () => handlers.onRestoreEntry(entry.id) }) : null
            : !state.readOnly ? el("button", { class: "danger small", text: "Archive", onclick: () => handlers.onArchiveEntry(entry.id) }) : null,
        ].filter(Boolean)),
      ]),
    ]));
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  return el("div", {}, [
    el("div", { class: "table-wrapper" }, [table]),
    el("div", { class: "pagination-bar inline wrap" }, [
      el("span", { class: "small muted", text: pagination.totalItems ? `Showing ${pagination.startItem}-${pagination.endItem} of ${pagination.totalItems}` : "No entries" }),
      el("div", { class: "inline wrap" }, [
        el("button", { class: "secondary small", text: "Previous", onclick: handlers.onPrevPage, disabled: pagination.currentPage <= 1 }),
        el("span", { class: "badge", text: `Page ${pagination.currentPage} / ${pagination.totalPages}` }),
        el("button", { class: "secondary small", text: "Next", onclick: handlers.onNextPage, disabled: pagination.currentPage >= pagination.totalPages }),
      ]),
    ]),
  ]);
}

function renderUnlocked(handlers) {
  return el("div", {}, [
    state.readOnly ? el("div", { class: "card notice" }, [document.createTextNode("Emergency Read-Only Mode is active. Editing and clipboard actions are disabled.")]) : null,
    renderSummaryCard(handlers),
    renderBulkBar(handlers),
    el("div", { class: "dashboard-grid" }, [
      renderSearchCard(handlers),
      el("div", { class: "card" }, [
        el("h3", { text: "Security Overview" }),
        el("div", { class: "stats-grid" }, [
          stat("Weak", String(handlers.getAuditSummary().weak)),
          stat("Reused", String(handlers.getAuditSummary().reused)),
          stat("Expiring", String(handlers.getAuditSummary().expiring)),
          stat("No TOTP", String(handlers.getAuditSummary().noTotp)),
        ]),
      ]),
    ]),
    el("div", { class: "card" }, [
      el("h3", { text: "Entry Editor" }),
      el("div", { id: "editorHost" }, [el("p", { class: "small muted", text: "Select an entry to view or edit it." })]),
    ]),
    renderAuditCard(handlers),
    el("div", { class: "card" }, [
      el("h3", { text: handlers.isShowArchived() ? "Archived Entries" : "Entries" }),
      renderEntriesTable(handlers),
    ]),
  ].filter(Boolean));
}

function stat(label, value) {
  return el("div", { class: "stat-card" }, [
    el("div", { class: "stat-value", text: value }),
    el("div", { class: "small muted", text: label }),
  ]);
}

export function renderEditor(entryOrNull, handlers) {
  const host = document.getElementById("editorHost");
  if (!host) return;
  host.innerHTML = "";
  if (!entryOrNull) {
    host.appendChild(el("p", { class: "small muted", text: "No entry selected." }));
    return;
  }

  const entry = entryOrNull;
  const audit = handlers.getEntryAudit(entry.id);
  const totp = handlers.getEntryTotp(entry.id);
  const generator = handlers.getGeneratorSettings();
  const canShowSensitive = !entry.isSensitive || handlers.isSensitiveRevealed(entry.id);
  const inputAttrs = (attrs) => {
    if (state.readOnly) attrs.disabled = true;
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
        el("input", inputAttrs({ id: "f_title", type: "text", value: canShowSensitive ? (entry.title || "") : "", placeholder: entry.isSensitive ? "Sensitive title hidden" : "", autocomplete: "off" })),
      ]),
      el("div", {}, [
        el("label", { text: "Category" }),
        el("select", inputAttrs({ id: "f_category", value: entry.category || "login" }), categories().map(([value, label]) => el("option", { value, text: label, selected: (entry.category || "login") === value }))),
      ]),
    ]),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "URL" }),
        el("input", inputAttrs({ id: "f_url", type: "text", value: canShowSensitive ? (entry.url || "") : "", placeholder: entry.isSensitive ? "Sensitive URL hidden" : "", autocomplete: "off" })),
      ]),
      el("div", {}, [
        el("label", { text: "Username / Email" }),
        el("input", inputAttrs({ id: "f_username", type: "text", value: canShowSensitive ? (entry.username || "") : "", placeholder: entry.isSensitive ? "Sensitive username hidden" : "", autocomplete: "off" })),
      ]),
    ]),
    el("div", { class: "row" }, detailFieldSpecs(entry.category || "login").map(([key, label]) =>
      el("div", {}, [
        el("label", { text: label }),
        el("input", inputAttrs({
          id: `f_detail_${key}`,
          type: "text",
          value: canShowSensitive ? String(entry.details?.[key] || "") : "",
          placeholder: entry.isSensitive ? "Sensitive field hidden" : "",
          autocomplete: "off"
        })),
      ])
    )),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Password" }),
        el("input", inputAttrs({ id: "f_password", type: "text", value: canShowSensitive ? (entry.password || "") : "", placeholder: entry.isSensitive ? "Sensitive password hidden" : "", autocomplete: "new-password" })),
      ]),
      el("div", {}, [
        el("label", { text: "Password Rotation (days)" }),
        el("input", inputAttrs({ id: "f_passwordExpiryDays", type: "number", value: entry.passwordExpiryDays || 0, min: "0", max: "3650" })),
      ]),
    ]),
    !state.readOnly ? el("div", { class: "card subtle-card" }, [
      el("h4", { text: "Password Generator" }),
      el("div", { class: "row generator-grid" }, [
        el("div", {}, [
          el("label", { text: `Length: ${generator.length}` }),
          el("input", { id: "g_length", type: "range", min: "12", max: "64", value: generator.length, oninput: handlers.onGeneratorSettingsChange }),
        ]),
        el("div", { class: "inline wrap generator-checks" }, [
          el("label", { class: "inline", style: "cursor:pointer; gap:8px;" }, [el("input", { id: "g_upper", type: "checkbox", checked: generator.includeUpper, onchange: handlers.onGeneratorSettingsChange, style: "width:auto;" }), el("span", { text: "Upper" })]),
          el("label", { class: "inline", style: "cursor:pointer; gap:8px;" }, [el("input", { id: "g_lower", type: "checkbox", checked: generator.includeLower, onchange: handlers.onGeneratorSettingsChange, style: "width:auto;" }), el("span", { text: "Lower" })]),
          el("label", { class: "inline", style: "cursor:pointer; gap:8px;" }, [el("input", { id: "g_numbers", type: "checkbox", checked: generator.includeNumbers, onchange: handlers.onGeneratorSettingsChange, style: "width:auto;" }), el("span", { text: "Numbers" })]),
          el("label", { class: "inline", style: "cursor:pointer; gap:8px;" }, [el("input", { id: "g_symbols", type: "checkbox", checked: generator.includeSymbols, onchange: handlers.onGeneratorSettingsChange, style: "width:auto;" }), el("span", { text: "Symbols" })]),
          el("label", { class: "inline", style: "cursor:pointer; gap:8px;" }, [el("input", { id: "g_pronounceable", type: "checkbox", checked: generator.pronounceable, onchange: handlers.onGeneratorSettingsChange, style: "width:auto;" }), el("span", { text: "Pronounceable" })]),
        ]),
      ]),
      el("div", { class: "actions wrap" }, [
        el("button", { class: "secondary small", text: "Generate", onclick: () => handlers.onGeneratePassword(entry.id) }),
        el("button", { class: "secondary small", text: "Fill Generated", onclick: () => handlers.onGeneratePassword(entry.id) }),
        el("button", { class: "secondary small", text: "Copy Password", onclick: () => handlers.onCopyPassword(entry.id) }),
      ]),
    ]) : null,
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Tags (comma-separated)" }),
        el("input", inputAttrs({ id: "f_tags", type: "text", value: (entry.tags || []).join(", "), autocomplete: "off" })),
      ]),
      el("div", { class: "inline wrap editor-toggles" }, [
        el("label", { class: "inline", style: "cursor:pointer; gap:8px;" }, [
          el("input", { id: "f_sensitive", type: "checkbox", checked: entry.isSensitive, onchange: handlers.onSensitiveCheckboxChange, style: "width:auto;" }),
          el("span", { text: "Sensitive mode" }),
        ]),
      ]),
    ]),
    el("div", {}, [
      el("label", { text: "Notes" }),
      el("textarea", inputAttrs({ id: "f_notes", autocomplete: "off", placeholder: entry.isSensitive && !canShowSensitive ? "Sensitive notes hidden until revealed." : "" })),
    ]),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Recovery Codes (one per line)" }),
        el("textarea", inputAttrs({ id: "f_recoveryCodes", autocomplete: "off", placeholder: entry.isSensitive && !canShowSensitive ? "Sensitive recovery codes hidden." : "" })),
      ]),
      el("div", {}, [
        el("label", { text: "Attachment References (one per line)" }),
        el("textarea", inputAttrs({ id: "f_attachmentRefs", autocomplete: "off", placeholder: "File paths or document references only" })),
      ]),
    ]),
    el("div", { class: "card subtle-card" }, [
      el("h4", { text: "TOTP / 2FA" }),
      el("div", { class: "row" }, [
        el("div", {}, [
          el("label", { text: "Base32 Secret" }),
          el("input", inputAttrs({ id: "f_totpSecret", type: "text", value: canShowSensitive ? (entry.totpSecret || "") : "", placeholder: entry.isSensitive ? "Sensitive TOTP secret hidden" : "JBSWY3DPEHPK3PXP", autocomplete: "off" })),
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
        totp.code && !state.readOnly ? el("button", { class: "secondary small", text: "Copy Code", onclick: () => handlers.onCopyTotp(entry.id) }) : null,
      ].filter(Boolean)),
    ]),
    el("div", { class: "inline wrap small muted" }, [
      document.createTextNode(`Imported from: ${entry.importedFrom || "Manual"}`),
      document.createTextNode(`Updated: ${timeAgo(entry.updatedAt || entry.createdAt)}`),
      document.createTextNode(`Password versions: ${(entry.passwordHistory || []).length}`),
    ]),
    el("div", { class: "actions wrap" }, [
      entry.isSensitive && !canShowSensitive && !state.readOnly ? el("button", { class: "secondary", text: "Reveal Sensitive Fields", onclick: () => handlers.onToggleSensitiveReveal(entry.id) }) : null,
      !state.readOnly ? el("button", { text: "Save Entry", onclick: () => handlers.onSaveEntry(entry.id) }) : null,
      el("button", { class: "secondary", text: state.readOnly ? "Close" : "Cancel", onclick: handlers.onCancelEdit }),
    ].filter(Boolean)),
  ].filter(Boolean));

  host.appendChild(form);
  const notes = document.getElementById("f_notes");
  if (notes && canShowSensitive) notes.value = entry.notes || "";
  const recovery = document.getElementById("f_recoveryCodes");
  if (recovery && canShowSensitive) recovery.value = (entry.recoveryCodes || []).join("\n");
  const attachments = document.getElementById("f_attachmentRefs");
  if (attachments) attachments.value = (entry.attachmentRefs || []).join("\n");

  if (entry.history?.length) {
    host.appendChild(el("div", { class: "card subtle-card", style: "margin-top: 16px;" }, [
      el("h4", { text: "Version History" }),
      el("div", { class: "stack-sm" }, entry.history.slice(0, 10).map((item, index) =>
        el("div", { class: "inline wrap history-row" }, [
          el("span", { class: "small muted", text: `${new Date(item.savedAt).toLocaleString()}${item.reason ? ` (${item.reason})` : ""}` }),
          !state.readOnly ? el("button", { class: "secondary small", text: "Restore", onclick: () => handlers.onRestoreHistory(entry.id, index) }) : null,
        ].filter(Boolean))
      )),
    ]));
  }

  if ((entry.passwordHistory || []).length) {
    host.appendChild(el("div", { class: "card subtle-card", style: "margin-top: 16px;" }, [
      el("h4", { text: "Password History" }),
      el("div", { class: "stack-sm" }, entry.passwordHistory.slice(0, 5).map((item) =>
        el("div", { class: "inline wrap history-row" }, [
          el("span", { class: "small muted", text: `${new Date(item.changedAt).toLocaleString()}` }),
          el("span", { class: "badge", text: item.value ? "Stored previous password" : "Empty" }),
        ])
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
    passwordExpiryDays: Number(document.getElementById("f_passwordExpiryDays")?.value ?? 0) || 0,
    category: document.getElementById("f_category")?.value ?? "login",
    isSensitive: !!document.getElementById("f_sensitive")?.checked,
    details: Object.fromEntries(
      Array.from(document.querySelectorAll("[id^='f_detail_']")).map((node) => [node.id.replace("f_detail_", ""), node.value ?? ""])
    ),
    recoveryCodes: (document.getElementById("f_recoveryCodes")?.value ?? "").split("\n").map((line) => line.trim()).filter(Boolean),
    attachmentRefs: (document.getElementById("f_attachmentRefs")?.value ?? "").split("\n").map((line) => line.trim()).filter(Boolean),
  };
}

export function getSearchValues() {
  return {
    q: (document.getElementById("searchQuery")?.value ?? "").trim(),
    tag: (document.getElementById("searchTag")?.value ?? "").trim(),
    category: document.getElementById("searchCategory")?.value ?? "",
    sort: document.getElementById("searchSort")?.value ?? "recent",
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
  overlay.appendChild(el("div", { class: "card", style: "max-width: 520px; text-align:center; background:#fff; color:#111;" }, [
    el("h2", { text: `Mobile Transfer (${index + 1}/${total})` }),
    el("p", { text: "Scan each code in order on another ZeroVault-compatible device." }),
    el("div", { html: qrHtml, style: "margin: 20px 0;" }),
    el("div", { class: "actions centered" }, [
      el("button", { class: "secondary", text: "Previous", onclick: handlers.onPrevQR, disabled: index === 0 }),
      el("button", { text: index === total - 1 ? "Finish" : "Next", onclick: handlers.onNextQR }),
      el("button", { class: "secondary", text: "Close", onclick: handlers.onCloseQR }),
    ]),
    el("p", { class: "small", text: `Chunk size: ${chunkData.length} characters` }),
  ]));
}

export function closeQRModal() {
  document.getElementById("qr-overlay")?.remove();
}
