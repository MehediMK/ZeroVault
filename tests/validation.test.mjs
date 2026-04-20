import { validateEntry } from "../src/features/validation.js";
import { buildAuditExport, buildVaultSummaryExport } from "../src/features/reports.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cardIssues = validateEntry({
  title: "Visa",
  category: "card",
  details: { cardNumber: "1234", expiry: "13/2029", cvv: "12" },
});
assert(cardIssues.length >= 2, "invalid card values should be rejected");

const validBank = validateEntry({
  title: "Bank",
  category: "bank",
  details: { accountNumber: "123456789", routingNumber: "ABCDEFGH" },
});
assert(validBank.length === 0, "valid bank details should pass");

const auditExport = buildAuditExport("Vault", {
  totals: { weak: 1 },
  items: [{ id: "1", title: "Example", score: 2, issues: ["Weak"] }],
});
assert(auditExport.vaultName === "Vault", "audit export should include vault name");

const summary = buildVaultSummaryExport({
  vaultName: "Vault",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  entries: [{ category: "login", isFavorite: true, archived: false, isSensitive: false }],
  saveHistory: [],
}, { totals: { weak: 0, reused: 0, expiring: 0, noTotp: 0 } });
assert(summary.totalEntries === 1, "summary export should include entry totals");
