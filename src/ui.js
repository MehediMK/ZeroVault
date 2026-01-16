import { state, isUnlocked } from "./state.js";

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) n.appendChild(c);
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
  const card = el("div", { class: "card" }, [
    el("h2", { text: "Vault locked" }),
    el("p", { class: "notice", text: "Create a new vault or open an existing encrypted JSON file." }),
    el("div", { class: "actions" }, [
      el("button", { text: "Create New Vault", onclick: handlers.onGoCreate }),
      el("button", { class: "secondary", text: "Open Existing Vault", onclick: handlers.onGoOpen }),
    ]),
  ]);

  const hint = el("div", { class: "card" }, [
    el("h3", { text: "Security Notes" }),
    el("ul", {}, [
      el("li", { text: "All encryption/decryption happens in your browser only." }),
      el("li", { text: "Nothing is stored in localStorage/IndexedDB/cookies." }),
      el("li", { text: "You must download the encrypted JSON to keep changes." }),
    ]),
  ]);

  return el("div", {}, [card, hint]);
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
    el("h3", { text: "Search" }),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("label", { text: "Query" }),
        el("input", { id: "searchQuery", type: "text", placeholder: "title / url / username / tag" }),
      ]),
      el("div", {}, [
        el("label", { text: "Filter by tag (optional)" }),
        el("input", { id: "searchTag", type: "text", placeholder: "e.g. work" }),
      ]),
    ]),
    el("div", { class: "actions" }, [
      el("button", { class: "secondary", text: "Apply", onclick: () => handlers.onApplySearch() }),
      el("button", { class: "secondary", text: "Clear", onclick: () => handlers.onClearSearch() }),
    ]),
  ]);

  const tableCard = el("div", { class: "card" }, [
    el("h3", { text: "Entries" }),
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
      el("th", { text: "Title" }),
      el("th", { text: "URL" }),
      el("th", { text: "Username" }),
      el("th", { text: "Tags" }),
      el("th", { text: "Actions" }),
    ]),
  ]);

  const tbody = el("tbody");
  for (const e of entries) {
    const actions = el("div", { class: "inline" }, [
      el("button", { class: "secondary", text: state.readOnly ? "View" : "Edit", onclick: () => handlers.onEditEntry(e.id) }),
      !state.readOnly ? el("button", { class: "secondary", text: "Copy Password", onclick: () => handlers.onCopyPassword(e.id) }) : null,
      !state.readOnly ? el("button", { class: "danger", text: "Delete", onclick: () => handlers.onDeleteEntry(e.id) }) : null,
    ].filter(Boolean));

    tbody.appendChild(
      el("tr", {}, [
        el("td", { text: e.title || "" }),
        el("td", { text: e.url || "" }),
        el("td", { text: e.username || "" }),
        el("td", { text: (e.tags || []).join(", ") }),
        el("td", {}, [actions]),
      ])
    );
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
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
