import { state, isUnlocked } from "./state.js";
import { getDomainColor, getInitials, timeAgo } from "./helpers.js";

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "value") n[k] = v;
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
  }
  for (const c of children) {
    if (c) n.appendChild(c);
  }
  return n;
}

export function render(appRoot, handlers) {
  appRoot.innerHTML = "";
  if (!isUnlocked()) {
    appRoot.appendChild(renderLocked(handlers));
  } else {
    appRoot.appendChild(renderUnlocked(handlers));
  }
}

function renderLocked(handlers) {
  const wrapper = el("div", { style: "max-width: 460px; margin: 40px auto; text-align: center;" }, [
    el("div", { style: "font-size: 3rem; margin-bottom: 20px;" }, [
      el("span", { text: "🔐" })
    ]),
    el("div", { class: "card" }, [
      el("h2", { text: "Welcome to ZeroVault" }),
      el("p", { class: "notice", text: "Secure, offline-first password management in your browser." }),
      el("div", { class: "actions centered" }, [
        el("button", { text: "Create New Vault", onclick: handlers.onGoCreate, style: "width: 100%" }),
        el("button", { class: "secondary", text: "Open Existing Vault", onclick: handlers.onGoOpen, style: "width: 100%" }),
      ]),
    ]),

    el("div", { class: "card", style: "border: 1px dashed var(--border); background: transparent;" }, [
      el("h3", { text: "Security & Privacy", style: "border:none; margin-bottom: 10px; font-size: 1rem;" }),
      el("ul", { class: "small", style: "text-align: left; padding-left: 20px; color: var(--muted);" }, [
        el("li", { text: "End-to-end encrypted locally (AES-GCM)." }),
        el("li", { text: "Zero knowledge: We never see your password." }),
        el("li", { text: "No cloud sync: You own your data file." }),
      ]),
    ])
  ]);

  return wrapper;
}

function renderUnlocked(handlers) {
  const { vaultData } = state;

  const banner = state.readOnly
    ? el("div", { class: "card", style: "border-left: 5px solid orange; background: #fff8e1; color: #b7791f;" }, [
      el("strong", { text: "Emergency Read-Only Mode: " }),
      el("span", { text: "Editing & Clipboard are disabled." })
    ])
    : null;

  const actions = [
    !state.readOnly ? el("button", { text: "Add Entry", onclick: handlers.onAddEntry }) : null,
    !state.readOnly ? el("button", { class: "secondary", text: "Save & Download Vault JSON", onclick: handlers.onSaveDownload }) : null,
    !state.readOnly ? el("button", { class: "secondary", text: "Change Master Password", onclick: handlers.onGoChangePassword }) : null,
    !state.readOnly ? el("button", { class: "secondary", text: "Mobile Transfer (QR)", onclick: handlers.onGoQR }) : null,
    !state.readOnly ? el("button", { class: "secondary", text: "Switch to Read-Only", onclick: handlers.onSwitchReadOnly }) : null,
  ].filter(Boolean);

  const top = el("div", { class: "card" }, [
    el("div", { class: "inline" }, [
      el("span", { class: "badge", text: `Unlocked: ${vaultData.vaultName || "Vault"}` }),
      el("span", { class: "small", text: `Entries: ${vaultData.entries?.length ?? 0}` }),
    ]),
    el("div", { class: "actions" }, actions),
  ]);

  const searchRow = el("div", { class: "card" }, [
    el("h3", { text: "Search & Filter" }),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Query" }),
        el("input", { id: "searchQuery", type: "text", placeholder: "title / url / username / tag" }),
      ]),
      el("div", {}, [
        el("label", { text: "Filter by tag (optional)" }),
        el("input", { id: "searchTag", type: "text", placeholder: "e.g. work" }),
      ]),
      el("div", { style: "display:flex; flex-direction: column; gap: 8px; justify-content: flex-end; padding-bottom: 4px;" }, [
        el("label", { style: "cursor:pointer; display:flex; align-items:center; gap:5px;" }, [
          el("input", { type: "checkbox", checked: handlers.isFavoritesFilterOn(), onchange: handlers.onToggleFavoriteFilter }),
          el("span", { text: "Favorites Only" })
        ]),
        el("label", { style: "cursor:pointer; display:flex; align-items:center; gap:5px;" }, [
          el("input", { type: "checkbox", checked: handlers.isShowArchived(), onchange: handlers.onToggleArchiveFilter }),
          el("span", { text: "Show Archived Only" })
        ])
      ]),
    ]),
    el("div", { class: "actions" }, [
      el("button", { class: "secondary", text: "Apply", onclick: () => handlers.onApplySearch() }),
      el("button", { class: "secondary", text: "Clear", onclick: () => handlers.onClearSearch() }),
    ]),
  ]);

  const viewTitle = handlers.isShowArchived() ? "Archived Entries" : "Entries";
  const tableCard = el("div", { class: "card" }, [
    el("h3", { text: viewTitle }),
    renderEntriesTable(handlers),
  ]);

  const editor = el("div", { class: "card" }, [
    el("h3", { text: "Entry Editor" }),
    el("p", { class: "small", text: "Select an entry to view details." }),
    el("div", { id: "editorHost" }),
  ]);

  return el("div", {}, [banner, top, searchRow, tableCard, editor].filter(Boolean));
}

function renderEntriesTable(handlers) {
  const entries = handlers.getVisibleEntries();

  const table = el("table", { class: "table" });
  const thead = el("thead", {}, [
    el("tr", {}, [
      el("th", { text: "" }), // Star col
      el("th", { text: "Identity" }),
      el("th", { text: "Username" }),
      el("th", { text: "Password" }),
      el("th", { text: "Tags" }),
      el("th", { text: "Updated" }),
      el("th", { text: "Actions" }),
    ]),
  ]);

  const tbody = el("tbody");
  entries.forEach((e, index) => {
    // Generate Visual Identity
    const initials = getInitials(e.title || e.url || "??");
    const color = getDomainColor(e.title || e.url || "??");

    // Actions
    let actionButtons = [];
    if (e.archived) {
      actionButtons = [
        !state.readOnly ? el("button", { class: "secondary", text: "Restore", onclick: () => handlers.onRestoreEntry(e.id) }) : null,
        !state.readOnly ? el("button", { class: "danger", text: "Delete Permanently", onclick: () => handlers.onInitiateDelete(e.id) }) : null,
      ];
    } else {
      const deleteBtn = handlers.isEntryDeleting(e.id)
        ? [
          el("button", { class: "danger", text: "Confirm", onclick: () => handlers.onDeleteEntry(e.id) }),
          el("button", { class: "secondary", text: "Cancel", onclick: () => handlers.onCancelDelete(e.id) }),
        ]
        : [
          !state.readOnly ? el("button", { class: "danger", text: "Archive", onclick: () => handlers.onArchiveEntry(e.id) }) : null,
        ];

      actionButtons = [
        el("button", { class: "secondary", text: state.readOnly ? "View" : "Edit", onclick: () => handlers.onEditEntry(e.id) }),
        !state.readOnly ? el("button", { class: "secondary", text: "Copy Pass", onclick: () => handlers.onCopyPassword(e.id) }) : null,
        ...deleteBtn
      ];
    }

    const trClass = [
      handlers.isKeyboardSelected(index) ? "selected" : "",
      e.archived ? "archived" : ""
    ].filter(Boolean).join(" ");

    tbody.appendChild(
      el("tr", { class: trClass }, [
        el("td", {}, [
          el("span", {
            text: e.isFavorite ? "★" : "☆",
            style: `cursor:pointer; font-size: 1.2em; color: ${e.isFavorite ? "#ffc107" : "#ccc"}`,
            title: "Toggle Favorite",
            onclick: () => handlers.onToggleFavorite(e.id)
          })
        ]),
        el("td", {}, [
          el("div", { class: "title-cell" }, [
            el("div", { class: "entry-icon", style: `background-color: ${color}`, text: initials }),
            el("div", { style: "display:flex; flex-direction:column;" }, [
              el("span", { class: "title-text", text: e.title || "(No Title)" }),
              el("span", { class: "meta-text", text: e.url || "" })
            ])
          ])
        ]),
        el("td", {}, [
          el("div", { class: "inline" }, [
            el("span", { text: e.username || "" }),
            e.username ? el("button", { class: "small secondary", text: "📋", title: "Copy Username", onclick: () => handlers.onCopyUsername(e.id) }) : null
          ])
        ]),
        el("td", {}, [
          el("div", { style: "display: flex; align-items: center; gap: 8px;" }, [
            el("span", { text: handlers.isPasswordVisible(e.id) ? (e.password || "") : "••••••••" }),
            el("button", {
              class: "small secondary",
              style: "padding: 2px 6px; min-width: auto;",
              text: handlers.isPasswordVisible(e.id) ? "🙈" : "👁️",
              onclick: () => handlers.onTogglePassword(e.id)
            })
          ])
        ]),
        el("td", { text: (e.tags || []).join(", ") }),
        el("td", { class: "small", text: timeAgo(e.updatedAt || e.createdAt) }),
        el("td", {}, [el("div", { class: "inline" }, actionButtons.filter(Boolean))]),
      ])
    );
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  // Wrap table in responsive container
  return el("div", { class: "table-wrapper" }, [table]);
}

export function renderEditor(entryOrNull, handlers) {
  const host = document.getElementById("editorHost");
  if (!host) return;
  host.innerHTML = "";

  if (!entryOrNull) {
    host.appendChild(el("div", { class: "notice", text: "No entry selected." }));
    return;
  }

  const e = entryOrNull;

  const isRO = state.readOnly;
  const inputAttrs = (base) => {
    if (isRO) base.disabled = "true";
    return base;
  };

  const form = el("div", {}, [
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Title" }),
        el("input", inputAttrs({ id: "f_title", type: "text", value: e.title || "", autocomplete: "off" })),
      ]),
      el("div", {}, [
        el("label", { text: "URL" }),
        el("input", inputAttrs({ id: "f_url", type: "text", value: e.url || "", autocomplete: "off" })),
      ]),
    ]),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Username / Email" }),
        el("input", inputAttrs({ id: "f_username", type: "text", value: e.username || "", autocomplete: "off" })),
      ]),
      el("div", {}, [
        el("label", { text: "Password" }),
        el("input", inputAttrs({ id: "f_password", type: "password", value: e.password || "", autocomplete: "new-password" })),

        // Visual Password Timeline
        e.updatedAt ? el("div", { style: "margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 0.85rem;" }, [
          el("div", { style: "display:flex; justify-content:space-between; margin-bottom:5px;" }, [
            el("span", { text: "Time since update:", style: "color:var(--muted);" }),
            el("span", { text: timeAgo(e.updatedAt), style: "font-weight:600; color:var(--text);" })
          ]),
          el("div", { style: "height: 6px; background: #333; border-radius: 3px; overflow: hidden; position: relative;" }, [
            el("div", {
              style: `
                    width: ${Math.min(100, (new Date() - new Date(e.updatedAt)) / (1000 * 60 * 60 * 24 * 365) * 100)}%; 
                    height: 100%; 
                    background: linear-gradient(90deg, #5cffb0, #ff5c7a);
                    opacity: 0.7;
                 `})
          ]),
          el("div", { class: "small", style: "margin-top:4px; text-align:right;" }, [
            el("span", { text: "Secure" }),
            el("span", { text: " • ", style: "margin:0 4px;" }),
            el("span", { text: "Review needed", style: "color:var(--danger);" })
          ])
        ]) : null
      ]),
    ]),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Tags (comma-separated)" }),
        el("input", inputAttrs({ id: "f_tags", type: "text", value: (e.tags || []).join(", "), autocomplete: "off" })),
      ]),
      el("div", {}, [
        el("label", { text: "Notes" }),
        el("textarea", inputAttrs({ id: "f_notes", autocomplete: "off" }), []),
      ]),
    ]),
    el("div", { class: "actions" }, [
      !isRO ? el("button", { text: "Save Entry", onclick: () => handlers.onSaveEntry(e.id) }) : null,
      el("button", { class: "secondary", text: isRO ? "Close" : "Cancel", onclick: handlers.onCancelEdit }),
    ].filter(Boolean)),
    el("div", { class: "hr" }),
    !isRO
      ? el("p", { class: "small", text: "Remember: changes are only stored after “Save & Download Vault JSON”." })
      : el("p", { class: "small", text: "Read-only mode enabled." }),
  ]);

  host.appendChild(form);

  const notes = document.getElementById("f_notes");
  if (notes) notes.value = e.notes || "";

  // History Section
  if (e.history && e.history.length > 0) {
    const historyCard = el("div", { style: "margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc;" }, [
      el("h4", { text: "Version History" }),
      el("ul", { class: "small", style: "list-style: none; padding: 0;" }, e.history.map((h, idx) => {
        const dateStr = new Date(h.savedAt).toLocaleString();
        return el("li", { style: "margin-bottom: 8px; padding: 8px; background: #eee; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;" }, [
          el("span", { text: `${dateStr} ${h.reason ? '(' + h.reason + ')' : ''}` }),
          !isRO ? el("button", {
            class: "small secondary",
            text: "Restore",
            onclick: () => handlers.onRestoreHistory(e.id, idx)
          }) : null
        ]);
      }))
    ]);
    form.appendChild(historyCard);
  }
}

export function getEditorFormValues() {
  const title = document.getElementById("f_title")?.value ?? "";
  const url = document.getElementById("f_url")?.value ?? "";
  const username = document.getElementById("f_username")?.value ?? "";
  const password = document.getElementById("f_password")?.value ?? "";
  const notes = document.getElementById("f_notes")?.value ?? "";
  const tagsRaw = document.getElementById("f_tags")?.value ?? "";
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return { title, url, username, password, notes, tags };
}

export function getSearchValues() {
  const q = document.getElementById("searchQuery")?.value ?? "";
  const tag = document.getElementById("searchTag")?.value ?? "";
  return { q: q.trim(), tag: tag.trim() };
}

export function renderQRModal(chunks, index, total, handlers) {
  // Use existing overlay or create one
  let overlay = document.getElementById("qr-overlay");
  if (!overlay) {
    overlay = el("div", { id: "qr-overlay", style: "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;" });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = "";

  const chunkData = chunks[index];

  // Generate QR
  let qrHtml = "";
  try {
    if (window.qrcode) {
      const typeNumber = 0; // Auto detection
      const errorCorrectionLevel = 'L';
      const qr = window.qrcode(typeNumber, errorCorrectionLevel);
      qr.addData(chunkData);
      qr.make();
      qrHtml = qr.createImgTag(5, 10); // cell size, margin
    } else {
      qrHtml = "<p>QR Library not found. Check src/qrcode.js</p>";
    }
  } catch (e) {
    qrHtml = `<p class='error'>Error: ${e.message}</p>`;
  }

  const card = el("div", { class: "card", style: "max-width: 500px; text-align: center; background: white; color: black;" }, [
    el("h2", { text: `Mobile Transfer (${index + 1}/${total})` }),
    el("p", { text: "Scan this code with the ZeroVault mobile app (or text scanner)." }),
    el("div", { style: "margin: 20px 0;" }, []), // placeholder for QR
    el("div", { class: "actions", style: "justify-content: center;" }, [
      el("button", { class: "secondary", text: "Previous", onclick: handlers.onPrevQR, disabled: index === 0 ? "true" : undefined }),
      el("button", { text: index === total - 1 ? "Finish" : "Next", onclick: handlers.onNextQR }),
      el("button", { class: "secondary", text: "Close", onclick: handlers.onCloseQR }),
    ]),
    el("p", { class: "small", text: `Chunk Size: ${chunkData.length} chars` })
  ]);

  // Inject HTML string for QR image
  card.children[2].innerHTML = qrHtml;

  overlay.appendChild(card);
}

export function closeQRModal() {
  const overlay = document.getElementById("qr-overlay");
  if (overlay) overlay.remove();
}
