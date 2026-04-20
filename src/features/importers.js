function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function splitCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
}

function mapCsvRow(row, source) {
  const title = row.name || row.title || row.site || row.issuer || "";
  const notes = row.notes || row.note || "";
  const category = /card|bank|iban|swift/i.test(notes) ? "card"
    : /license|serial|product key/i.test(notes) ? "license"
    : /identity|passport|ssn/i.test(notes) ? "identity"
    : "login";
  return {
    title,
    url: row.login_uri || row.url || row.website || "",
    username: row.login_username || row.username || row.user || row.email || "",
    password: row.login_password || row.password || row.pass || "",
    notes,
    tags: String(row.folder || row.grouping || row.tags || "")
      .split(/[;,]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
    totpSecret: row.login_totp || row.totp || row.otpsecret || "",
    importedFrom: source,
    category,
    rawPreview: `${title} ${row.login_uri || row.url || ""} ${row.login_username || row.username || ""}`.trim(),
  };
}

function mapBitwardenJson(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((item) => item.type === 1 && item.login)
    .map((item) => ({
      title: item.name || "",
      url: item.login.uris?.[0]?.uri || "",
      username: item.login.username || "",
      password: item.login.password || "",
      notes: item.notes || "",
      tags: Array.isArray(item.collectionIds) ? item.collectionIds : [],
      totpSecret: item.login.totp || "",
      importedFrom: "Bitwarden JSON",
      category: "login",
      rawPreview: `${item.name || ""} ${item.login.username || ""}`.trim(),
    }));
}

export async function importEntriesFromFile(file) {
  const text = await file.text();
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".json")) {
    const parsed = JSON.parse(text);
    const mapped = mapBitwardenJson(parsed);
    if (mapped.length === 0) {
      throw new Error("JSON import supports Bitwarden exports only right now.");
    }
    return mapped;
  }

  if (!lowerName.endsWith(".csv")) {
    throw new Error("Use a CSV export or Bitwarden JSON export.");
  }

  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("CSV file is empty.");

  const source = lowerName.includes("chrome") ? "Chrome CSV" : "CSV Import";
  const mapped = rows.map((row) => mapCsvRow(row, source)).filter((entry) =>
    entry.title || entry.url || entry.username || entry.password
  );
  if (mapped.length === 0) throw new Error("No importable rows found.");
  return mapped;
}
