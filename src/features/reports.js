function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function buildAuditExport(vaultName, audit) {
  return {
    vaultName,
    exportedAt: new Date().toISOString(),
    totals: audit.totals,
    entries: audit.items.map((item) => ({
      id: item.id,
      title: item.title,
      score: item.score,
      issues: item.issues,
    })),
  };
}

export function buildVaultSummaryExport(vaultData, audit) {
  return {
    vaultName: vaultData.vaultName,
    createdAt: vaultData.createdAt,
    updatedAt: vaultData.updatedAt,
    exportedAt: new Date().toISOString(),
    totalEntries: vaultData.entries.length,
    categories: vaultData.entries.reduce((acc, entry) => {
      const key = entry.category || "login";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    favorites: vaultData.entries.filter((entry) => entry.isFavorite).length,
    archived: vaultData.entries.filter((entry) => entry.archived).length,
    sensitive: vaultData.entries.filter((entry) => entry.isSensitive).length,
    audit: audit.totals,
    recentSaves: (vaultData.saveHistory || []).slice(0, 10),
  };
}

export function buildRecoverySheetHtml(vaultData) {
  const rows = vaultData.entries
    .filter((entry) => entry.recoveryCodes?.length || entry.attachmentRefs?.length)
    .map((entry) => `
      <section class="item">
        <h2>${escapeHtml(entry.title || "(Untitled)")}</h2>
        <p><strong>Category:</strong> ${escapeHtml(entry.category || "login")}</p>
        <p><strong>Username:</strong> ${escapeHtml(entry.username || "")}</p>
        <p><strong>Recovery Codes:</strong><br>${entry.recoveryCodes?.map((code) => escapeHtml(code)).join("<br>") || "None"}</p>
        <p><strong>Attachment References:</strong><br>${entry.attachmentRefs?.map((item) => escapeHtml(item)).join("<br>") || "None"}</p>
      </section>
    `)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(vaultData.vaultName)} Recovery Sheet</title>
  <style>
    body { font-family: sans-serif; margin: 24px; color: #111; }
    h1 { margin-bottom: 8px; }
    .meta { color: #555; margin-bottom: 20px; }
    .item { border: 1px solid #ccc; border-radius: 8px; padding: 14px; margin-bottom: 14px; page-break-inside: avoid; }
  </style>
</head>
<body>
  <h1>${escapeHtml(vaultData.vaultName)} Recovery Sheet</h1>
  <p class="meta">Generated ${escapeHtml(new Date().toLocaleString())}. Store this printout securely.</p>
  ${rows || "<p>No recovery codes or attachment references found.</p>"}
</body>
</html>`;
}
