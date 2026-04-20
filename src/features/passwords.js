const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const NUMBERS = "23456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}:,.?";

function randomIndex(max) {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % max;
}

export function generatePassword(options = {}) {
  const {
    length = 20,
    includeUpper = true,
    includeLower = true,
    includeNumbers = true,
    includeSymbols = true,
  } = options;

  const pools = [];
  if (includeLower) pools.push(LOWER);
  if (includeUpper) pools.push(UPPER);
  if (includeNumbers) pools.push(NUMBERS);
  if (includeSymbols) pools.push(SYMBOLS);
  if (pools.length === 0) throw new Error("Select at least one character set.");

  const chars = [];
  for (const pool of pools) {
    chars.push(pool[randomIndex(pool.length)]);
  }

  const all = pools.join("");
  while (chars.length < Math.max(length, pools.length)) {
    chars.push(all[randomIndex(all.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

export function passwordStrengthHint(pw) {
  const len = pw.length;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasNum = /\d/.test(pw);
  const hasSym = /[^a-zA-Z0-9]/.test(pw);
  const score = [hasLower, hasUpper, hasNum, hasSym].filter(Boolean).length + (len >= 14 ? 1 : 0);

  if (len === 0) return "";
  if (len < 8) return "Weak: too short.";
  if (score <= 2) return "Fair: add length and variety.";
  if (score <= 4) return "Good: consider 16+ characters.";
  return "Strong.";
}

export function auditVault(entries = []) {
  const passwordMap = new Map();
  for (const entry of entries) {
    const pw = entry.password || "";
    if (!pw) continue;
    const normalized = pw.trim();
    if (!passwordMap.has(normalized)) passwordMap.set(normalized, []);
    passwordMap.get(normalized).push(entry.id);
  }

  const now = Date.now();
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  const items = entries.map((entry) => {
    const issues = [];
    const pw = entry.password || "";
    const ageSource = entry.lastPasswordChangeAt || entry.updatedAt || entry.createdAt;
    const ageMs = ageSource ? now - new Date(ageSource).getTime() : 0;
    const expiryDays = Number(entry.passwordExpiryDays || 0);
    const expiresSoon = expiryDays > 0 && ageMs > Math.max(0, expiryDays - 7) * 24 * 60 * 60 * 1000;
    const expired = expiryDays > 0 && ageMs > expiryDays * 24 * 60 * 60 * 1000;

    if (!pw) issues.push("Missing password");
    if (pw && pw.length < 12) issues.push("Short password");
    if (pw && !/[A-Z]/.test(pw)) issues.push("No uppercase");
    if (pw && !/[a-z]/.test(pw)) issues.push("No lowercase");
    if (pw && !/\d/.test(pw)) issues.push("No number");
    if (pw && !/[^a-zA-Z0-9]/.test(pw)) issues.push("No symbol");
    if (pw && (passwordMap.get(pw)?.length || 0) > 1) issues.push("Reused password");
    if (ageMs > yearMs) issues.push("Password older than 1 year");
    if (expired) issues.push("Password expired");
    else if (expiresSoon) issues.push("Password expiring soon");
    if (!entry.totpSecret) issues.push("No TOTP configured");
    if (entry.isSensitive) issues.push("Sensitive entry");

    return {
      id: entry.id,
      title: entry.title || entry.url || "Untitled",
      issues,
      score: issues.length,
    };
  });

  const totals = {
    total: items.length,
    reused: items.filter((item) => item.issues.includes("Reused password")).length,
    weak: items.filter((item) => item.issues.some((issue) => ["Short password", "No uppercase", "No lowercase", "No number", "No symbol"].includes(issue))).length,
    missing: items.filter((item) => item.issues.includes("Missing password")).length,
    old: items.filter((item) => item.issues.includes("Password older than 1 year")).length,
    noTotp: items.filter((item) => item.issues.includes("No TOTP configured")).length,
    expiring: items.filter((item) => item.issues.includes("Password expired") || item.issues.includes("Password expiring soon")).length,
  };

  return { totals, items };
}
