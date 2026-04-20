import { auditVault, generatePassword } from "../src/features/passwords.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const password = generatePassword({ length: 24, includeUpper: true, includeLower: true, includeNumbers: true, includeSymbols: true });
assert(password.length === 24, "generated password should match requested length");

const audit = auditVault([
  { id: "1", password: "short", title: "A", createdAt: new Date().toISOString() },
  { id: "2", password: "short", title: "B", createdAt: new Date().toISOString() }
]);

assert(audit.totals.reused === 2, "reused password count should be detected");
assert(audit.totals.weak >= 2, "weak passwords should be flagged");
